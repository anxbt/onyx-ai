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

type PaymentOrderBody = {
  packId?: keyof typeof TOP_UP_PACKS;
  amount?: number;
  amountPaise?: number;
  currency?: string;
  receipt?: string;
};

type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};

function requireRazorpay(env: HonoEnv["Bindings"]) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("missing_razorpay_credentials");
  }

  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
  };
}

function getServerConfigError() {
  return json({ error: "missing_razorpay_credentials" }, 500);
}

function getRazorpayApiError(status: number, detail: string) {
  if (status === 401) {
    return json({ error: "razorpay_auth_failed", detail }, 401);
  }
  return json({ error: "razorpay_order_failed", detail }, 500);
}

function createReceipt(...parts: string[]) {
  return parts.filter(Boolean).join(":").slice(0, 40);
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

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

async function createRazorpayOrder(
  credentials: RazorpayCredentials,
  payload: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  },
) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${credentials.keyId}:${credentials.keySecret}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return {
      error: getRazorpayApiError(response.status, await response.text().catch(() => "")),
      order: null,
    };
  }

  return {
    error: null,
    order: (await response.json()) as RazorpayOrder,
  };
}

function buildOrderResponse(credentials: RazorpayCredentials, order: RazorpayOrder) {
  return json({
    keyId: credentials.keyId,
    orderId: order.id,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}

export async function handleCreatePaymentOrder(c: Context<HonoEnv>) {
  const env = c.env;
  const userId = c.get("userId");

  const body = (await c.req.json().catch(() => null)) as PaymentOrderBody | null;

  if (!body) {
    return json({ error: "invalid_request" }, 400);
  }

  let credentials: ReturnType<typeof requireRazorpay>;
  try {
    credentials = requireRazorpay(env);
  } catch {
    return getServerConfigError();
  }

  const isGenericOrder = body.amountPaise != null || (body.amount != null && (body.currency != null || body.receipt != null));
  if (isGenericOrder) {
    const amountPaise = Math.floor(Number(body.amountPaise ?? body.amount));
    const currency = (body.currency ?? "INR").toUpperCase();
    const receipt = createReceipt(body.receipt?.trim() || "", userId, "generic", String(Date.now()));

    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      return json({ error: "minimum_amount", detail: "Minimum amount is 100 paise" }, 400);
    }
    if (currency.length !== 3) {
      return json({ error: "invalid_currency", detail: "Currency must be a 3-letter code" }, 400);
    }

    const { error, order } = await createRazorpayOrder(credentials, {
      amount: amountPaise,
      currency,
      receipt,
      notes: {
        userId,
        creditsInr: String(amountPaise / 100),
        source: "standard_checkout",
      },
    });

    if (error) return error;
    if (!order) return json({ error: "razorpay_order_failed" }, 500);

    try {
      await insertTopUpOrder(env, {
        userId,
        packId: "custom",
        amountInr: amountPaise / 100,
        creditsInr: amountPaise / 100,
        razorpayOrderId: order.id,
      });
    } catch (error) {
      return json({ error: "top_up_order_record_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
    }

    return buildOrderResponse(credentials, order);
  }

  // Custom amount path (1:1 credits, no bonus)
  if (body.amount != null) {
    const amountInr = Math.floor(body.amount);
    if (amountInr < 10) {
      return json({ error: "minimum_amount", detail: "Minimum top-up is ₹10" }, 400);
    }
    if (amountInr > 10000) {
      return json({ error: "maximum_amount", detail: "Maximum top-up is ₹10,000" }, 400);
    }

    const { error, order } = await createRazorpayOrder(credentials, {
      amount: amountInr * 100,
      currency: "INR",
      receipt: createReceipt(userId, "custom", String(Date.now())),
      notes: {
        userId,
        customAmount: "true",
        creditsInr: String(amountInr),
      },
    });

    if (error) return error;
    if (!order) return json({ error: "razorpay_order_failed" }, 500);

    try {
      await insertTopUpOrder(env, {
        userId,
        packId: "custom",
        amountInr,
        creditsInr: amountInr, // 1:1 for custom amounts
        razorpayOrderId: order.id,
      });
    } catch (error) {
      return json({ error: "top_up_order_record_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
    }

    return buildOrderResponse(credentials, order);
  }

  // Fixed pack path (with bonus credits)
  if (!body.packId || !TOP_UP_PACKS[body.packId]) {
    return json({ error: "invalid_pack" }, 400);
  }

  const pack = TOP_UP_PACKS[body.packId];
  const { error, order } = await createRazorpayOrder(credentials, {
    amount: pack.amountInr * 100,
    currency: "INR",
    receipt: createReceipt(userId, body.packId, String(Date.now())),
    notes: {
      userId,
      packId: body.packId,
      creditsInr: String(pack.creditsInr),
    },
  });

  if (error) return error;
  if (!order) return json({ error: "razorpay_order_failed" }, 500);

  try {
    await insertTopUpOrder(env, {
      userId,
      packId: body.packId,
      amountInr: pack.amountInr,
      creditsInr: pack.creditsInr,
      razorpayOrderId: order.id,
    });
  } catch (error) {
    return json({ error: "top_up_order_record_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }

  return buildOrderResponse(credentials, order);
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
    return getServerConfigError();
  }

  const expected = await signRazorpayPayload(
    `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
    credentials.keySecret,
  );
  if (!constantTimeEqual(expected, body.razorpay_signature)) {
    return json({ error: "invalid_payment_signature" }, 400);
  }

  const completed = await callRpc<boolean>(env, "complete_top_up_order", {
    p_user_id: userId,
    p_order_id: body.razorpay_order_id,
    p_payment_id: body.razorpay_payment_id,
    p_signature: body.razorpay_signature,
  });

  if (!completed) {
    return json({ error: "invalid_payment_order" }, 400);
  }

  return json({ ok: true });
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
