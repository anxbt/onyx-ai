import type { TopUpPack } from "@/types";

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

export async function startRazorpayTopUp({
  accessToken,
  email,
  pack,
}: {
  accessToken: string;
  email?: string;
  pack: TopUpPack;
}) {
  console.log("[payments] Loading Razorpay checkout...");
  await loadRazorpayCheckout();
  console.log("[payments] Razorpay checkout loaded");

  const url = `${workerBaseUrl()}/payments/create-order`;
  console.log("[payments] POST", url, { packId: pack.id });

  const createResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ packId: pack.id }),
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
      description: `${pack.label} credit top-up`,
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
