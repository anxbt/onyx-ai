import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { authMiddleware } from "./auth";
import { handleChat } from "./chat";
import { handleMemoryExtract } from "./memory";
import { handleCreatePaymentOrder, handlePaymentWebhook, handleVerifyPayment } from "./payments";

export type Variables = { userId: string };
export type HonoEnv = { Bindings: Env; Variables: Variables };

const app = new Hono<HonoEnv>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "onyxai-worker" }));

app.post("/payments/webhook", handlePaymentWebhook);

app.post("/payments/create-order", authMiddleware, handleCreatePaymentOrder);
app.post("/payments/verify", authMiddleware, handleVerifyPayment);
app.post("/chat", authMiddleware, handleChat);
app.post("/memory/extract", authMiddleware, handleMemoryExtract);

export default app;
