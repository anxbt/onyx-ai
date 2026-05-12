import type { Context } from "hono";
import type { HonoEnv } from "./index";
import { TOP_UP_PACKS } from "./config";
import { callRpc, insertTopUpOrder } from "./supabase";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    },
  });
}

function requireRazorpay(env: HonoEnv["Bindings"]) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("missing_razorpay_credentials");
  }

  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
  };
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signRazorpayPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

export async function handleCreatePaymentOrder(c: Context<HonoEnv>) {
  const env = c.env;
  const userId = c.get("userId");

  const body = (await c.req.json().catch(() => null)) as { packId?: keyof typeof TOP_UP_PACKS } | null;
  if (!body?.packId || !TOP_UP_PACKS[body.packId]) {
    return json({ error: "invalid_pack" }, 400);
  }

  let credentials: ReturnType<typeof requireRazorpay>;
  try {
    credentials = requireRazorpay(env);
  } catch {
    return json({ error: "missing_razorpay_credentials" }, 501);
  }

  const pack = TOP_UP_PACKS[body.packId];
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${credentials.keyId}:${credentials.keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: pack.amountInr * 100,
      currency: "INR",
      receipt: `${userId}:${body.packId}:${Date.now()}`.slice(0, 40),
      notes: {
        userId,
        packId: body.packId,
        creditsInr: String(pack.creditsInr),
      },
    }),
  });

  if (!response.ok) {
    return json({ error: "razorpay_order_failed", detail: await response.text() }, 502);
  }

  const order = (await response.json()) as { id: string; amount: number; currency: string };
  await insertTopUpOrder(env, {
    userId,
    packId: body.packId,
    amountInr: pack.amountInr,
    creditsInr: pack.creditsInr,
    razorpayOrderId: order.id,
  });

  return json({
    keyId: credentials.keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}

export async function handleVerifyPayment(c: Context<HonoEnv>) {
  const env = c.env;
  const userId = c.get("userId");

  const body = (await c.req.json().catch(() => null)) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;

  if (!body?.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return json({ error: "invalid_payment_payload" }, 400);
  }

  let credentials: ReturnType<typeof requireRazorpay>;
  try {
    credentials = requireRazorpay(env);
  } catch {
    return json({ error: "missing_razorpay_credentials" }, 501);
  }

  const expected = await signRazorpayPayload(
    `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
    credentials.keySecret,
  );
  if (expected !== body.razorpay_signature) {
    return json({ error: "invalid_payment_signature" }, 400);
  }

  const completed = await callRpc<boolean>(env, "complete_top_up_order", {
    p_user_id: userId,
    p_order_id: body.razorpay_order_id,
    p_payment_id: body.razorpay_payment_id,
    p_signature: body.razorpay_signature,
  });

  return json({ ok: completed });
}

export async function handlePaymentWebhook(c: Context<HonoEnv>) {
  const env = c.env;

  if (!env.RAZORPAY_KEY_SECRET) {
    return json(
      {
        error: "missing_razorpay_secret",
        note: "Set RAZORPAY_KEY_SECRET in worker/.dev.vars before testing webhooks.",
      },
      501,
    );
  }

  return json({ ok: true, route: "/payments/webhook" });
}
