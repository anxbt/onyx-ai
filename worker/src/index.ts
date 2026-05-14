import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { authMiddleware } from "./auth";
import { handleChat, handleSummarize } from "./chat";
import { handleEmbed } from "./embed";
import { handleMemoryExtract } from "./memory";
import { handleSearch } from "./search";
import { handleCreatePaymentOrder, handlePaymentWebhook, handleVerifyPayment } from "./payments";
import { handleUploadAnalyze } from "./upload";

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
app.post("/chat/summarize", authMiddleware, handleSummarize);
app.post("/upload/analyze", authMiddleware, handleUploadAnalyze);
app.post("/embed", authMiddleware, handleEmbed);
app.post("/memory/extract", authMiddleware, handleMemoryExtract);
app.post("/search", authMiddleware, handleSearch);

export default app;
