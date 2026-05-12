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
  await loadRazorpayCheckout();

  const createResponse = await fetch(`${workerBaseUrl()}/payments/create-order`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ packId: pack.id }),
  });

  if (!createResponse.ok) {
    throw new Error(await createResponse.text());
  }

  const order = await createResponse.json();

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
        const verifyResponse = await fetch(`${workerBaseUrl()}/payments/verify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(response),
        });

        if (!verifyResponse.ok) {
          reject(new Error(await verifyResponse.text()));
          return;
        }

        resolve(response);
      },
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled")),
      },
    });

    checkout.open();
  });
}
