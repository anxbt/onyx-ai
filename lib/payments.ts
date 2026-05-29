import type { CustomTopUp, TopUpPack } from "@/types";

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function workerBaseUrl() {
  const workerUrl = process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787";
  return workerUrl.replace(/\/+$/, "");
}

async function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    throw new Error("Razorpay checkout is only available on web in this build");
  }

  if (window.Razorpay) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

function buildPaymentPayload(
  pack: TopUpPack | null,
  customTopUp: CustomTopUp | null
): { packId?: string; amount?: number } {
  if (customTopUp) {
    return { amount: customTopUp.amountInr };
  }
  if (pack) {
    return { packId: pack.id };
  }
  throw new Error("No payment details provided");
}

function buildDescription(
  pack: TopUpPack | null,
  customTopUp: CustomTopUp | null
): string {
  if (customTopUp) {
    return `₹${customTopUp.amountInr} credit top-up`;
  }
  if (pack) {
    return `${pack.label} credit top-up (₹${pack.amountInr})`;
  }
  return "Credit top-up";
}

export async function startRazorpayTopUp({
  accessToken,
  email,
  pack,
  customTopUp,
}: {
  accessToken: string;
  email?: string;
  pack?: TopUpPack;
  customTopUp?: CustomTopUp;
}) {
  const paymentPack = pack || null;
  const paymentCustom = customTopUp || null;

  console.log("[payments] Loading Razorpay checkout...");
  await loadRazorpayCheckout();
  console.log("[payments] Razorpay checkout loaded");

  const url = `${workerBaseUrl()}/payments/create-order`;
  const payload = buildPaymentPayload(paymentPack, paymentCustom);
  console.log("[payments] POST", url, payload);

  const createResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    console.error("[payments] create-order failed:", createResponse.status, errText);
    throw new Error(errText);
  }

  const order = await createResponse.json();
  console.log("[payments] Order created:", order);

  return await new Promise<RazorpaySuccess>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "OnyxAI",
      description: buildDescription(paymentPack, paymentCustom),
      order_id: order.orderId,
      prefill: { email },
      theme: { color: "#7C3AED" },
      handler: async (response: RazorpaySuccess) => {
        console.log("[payments] Payment completed, verifying...");
        const verifyResponse = await fetch(`${workerBaseUrl()}/payments/verify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(response),
        });

        if (!verifyResponse.ok) {
          const errText = await verifyResponse.text();
          console.error("[payments] verify failed:", verifyResponse.status, errText);
          reject(new Error(errText));
          return;
        }

        console.log("[payments] Payment verified successfully");
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          console.log("[payments] Checkout dismissed");
          reject(new Error("Payment cancelled"));
        },
      },
    });

    console.log("[payments] Opening Razorpay checkout...");
    checkout.open();
  });
}
