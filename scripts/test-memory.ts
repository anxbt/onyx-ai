/**
 * Wave 1 Memory Test Script (v2)
 *
 * Properly mimics the app: trims to last 8 messages, explicitly triggers
 * summarization every 10 messages, then tests recall with trimmed context.
 *
 * Usage:
 *   npx tsx scripts/test-memory.ts "<bearer-token>"
 */

const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://tvvgferannivwdltjtjs.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || "sb_secret_XPTk9eMuL-pPuFcUWOmr9Q_S0S_bypL";

const BEARER_TOKEN = process.argv[2];
if (!BEARER_TOKEN) {
  console.error("Usage: npx tsx scripts/test-memory.ts \"<bearer-token>\"");
  process.exit(1);
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

const USER_ID = getUserIdFromToken(BEARER_TOKEN);
if (!USER_ID) {
  console.error("Could not extract user ID from token");
  process.exit(1);
}

console.log(`User ID: ${USER_ID}`);

const FACTS = [
  "My favorite color is cobalt blue, specifically hex #0047AB.",
  "I have a dog named Kepler who is a 3-year-old border collie.",
  "I work as a backend engineer at a fintech startup called Ledgerly.",
  "I live in Bangalore, in the Koramangala neighborhood.",
  "I'm allergic to peanuts and carry an EpiPen everywhere.",
  "I play bass guitar in a jazz fusion band called Quantum Sync.",
  "My favorite programming language is Rust, second is TypeScript.",
  "I ran the Mumbai marathon last year in 4 hours 12 minutes.",
  "I'm learning Japanese — currently at N4 level, struggling with kanji.",
  "My coffee order is always a flat white with oat milk, no sugar.",
  "I have a scar on my left knee from a skateboarding accident at 14.",
  "My favorite book is Snow Crash by Neal Stephenson.",
  "I contribute to an open-source WebSocket library called websocat.",
  "I have a twin sister named Anika who is a marine biologist.",
  "I'm terrified of heights but love rock climbing indoors.",
  "My dream is to build a cabin in Himachal and work remotely from there.",
  "I once met the prime minister at a tech conference in Delhi.",
  "My car is a 2019 Mahindra Thar, dark green, named Atlas.",
  "I have a collection of vintage Casio watches — currently 7.",
  "My favorite food is sushi, specifically salmon nigiri from Yuki in Indiranagar.",
];

const MODEL = "google/gemini-2.5-flash-lite";
const EPHEMERAL_WINDOW = 8;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function streamChat(
  messages: ChatMessage[],
  conversationId: string,
): Promise<string> {
  const res = await fetch(`${WORKER_URL}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}:${Date.now()}`,
    },
    body: JSON.stringify({ conversationId, model: MODEL, messages }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat error ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.done || parsed.error) continue;
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) fullContent += delta;
      } catch {}
    }
  }

  return fullContent;
}

async function triggerSummarize(conversationId: string): Promise<void> {
  try {
    const res = await fetch(`${WORKER_URL}/chat/summarize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`       Summarize response: ${res.status} ${JSON.stringify(body).slice(0, 100)}`);
  } catch (err: any) {
    console.log(`       Summarize error: ${err.message}`);
  }
}

async function insertUserMessage(conversationId: string, content: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      user_id: USER_ID,
      role: "user",
      content,
      has_attachment: false,
    }),
  });
}

async function createConversation(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: USER_ID,
      title: "Memory Test v2",
      model: MODEL,
      preview: "",
      token_count: 0,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create conversation failed: ${res.status} ${text}`);
  }

  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0].id;
}

async function checkSummaries(conversationId: string): Promise<Array<{
  message_start_idx: number;
  message_end_idx: number;
  summary_text: string;
  key_facts: string[];
}>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/conversation_summaries?conversation_id=eq.${conversationId}&select=message_start_idx,message_end_idx,summary_text,key_facts&order=message_end_idx.asc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );

  if (!res.ok) return [];
  return (await res.json()) as Array<{
    message_start_idx: number;
    message_end_idx: number;
    summary_text: string;
    key_facts: string[];
  }>;
}

async function countMessages(conversationId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conversationId}&select=count`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact",
      },
    },
  );

  if (!res.ok) return 0;
  const header = res.headers.get("content-range");
  if (header) {
    const match = header.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function run() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Wave 1 Memory System Test v2      ║");
  console.log("║   (Mimics app: 8-msg window +       ║");
  console.log("║    summarization every 10 msgs)      ║");
  console.log("╚══════════════════════════════════════╝\n");

  console.log("[1] Creating test conversation...");
  const conversationId = await createConversation();
  console.log(`    Conversation ID: ${conversationId}\n`);

  const fullHistory: ChatMessage[] = [];

  for (let i = 0; i < FACTS.length; i++) {
    const n = i + 1;
    const fact = FACTS[i];
    const userMsg: ChatMessage = {
      role: "user",
      content: `Remember this fact about me: ${fact}. Just reply "OK."`,
    };

    // Mimic app: send only last 8 messages (prepending the new user message)
    const trimmed = [...fullHistory.slice(-(EPHEMERAL_WINDOW - 1)), userMsg];

    console.log(`[2.${n}] Sending fact ${n} (context: ${trimmed.length} msgs)...`);
    const content = await streamChat(trimmed, conversationId);

    // Insert user message into DB so messageCount matches the app
    await insertUserMessage(conversationId, userMsg.content);

    fullHistory.push(userMsg);
    fullHistory.push({ role: "assistant", content: content || "OK." });

    console.log(`       Full history: ${fullHistory.length} messages`);

    // Explicitly trigger summarization at 10 and 20
    if (n === 10 || n === 20) {
      const dbCount = await countMessages(conversationId);
      console.log(`    → ${n} messages sent (DB count: ${dbCount}), triggering summarization...`);
      await triggerSummarize(conversationId);
      await sleep(6000);

      const summaries = await checkSummaries(conversationId);
      console.log(`       Summaries found: ${summaries.length}`);
      if (summaries.length > 0) {
        for (const s of summaries) {
          console.log(`       [${s.message_start_idx}-${s.message_end_idx}]: ${s.summary_text.slice(0, 120)}...`);
        }
      }
      console.log("");
    }

    await sleep(1500);
  }

  // At 20 messages, explain the layout
  console.log("═══════════════════════════════════════");
  console.log("Context window layout at 20 messages:");
  console.log("  Summarized:  [0, 10) — stored in DB, injected as system prompt");
  console.log("  🔴 GAP:      [10, 12) — LOST (between chunk and window)");
  console.log("  Ephemeral:   [12, 20) — sent verbatim (last 8 messages)");
  console.log("");
  console.log("Facts in each zone:");
  console.log("  Summarized:   facts 1-5 (dog, color, job, location, allergy)");
  console.log("  🔴 Gap:       facts 6 (band)");
  console.log("  Ephemeral:    facts 7-10 (Rust, marathon, Japanese, coffee)");
  console.log("═══════════════════════════════════════\n");

  // Test: send a query with ONLY last 8 messages (app-like behavior)
  console.log("[3] Recall test — sending queries with trimmed context\n");

  const recallQueries = [
    { q: "What is my dog's name and breed?", zone: "summarized (fact 2)", shouldRemember: true },
    { q: "Where do I live?", zone: "summarized (fact 4)", shouldRemember: true },
    { q: "What band do I play in?", zone: "gap (fact 6)", shouldRemember: false },
    { q: "What's my favorite programming language?", zone: "ephemeral (fact 7)", shouldRemember: true },
    { q: "What coffee do I order?", zone: "ephemeral (fact 10)", shouldRemember: true },
  ];

  for (const { q, zone, shouldRemember } of recallQueries) {
    const queryMsg: ChatMessage = { role: "user", content: q };
    const trimmed = [...fullHistory.slice(-(EPHEMERAL_WINDOW - 1)), queryMsg];
    console.log(`    Q: ${q}`);
    console.log(`       Zone: ${zone} | Expected: ${shouldRemember ? "REMEMBERED ✅" : "FORGOTTEN ❌"}`);
    const answer = await streamChat(trimmed, conversationId);
    console.log(`    A: ${answer.slice(0, 200)}...\n`);
    await sleep(2000);
  }

  // Final summary check
  console.log("═══════════════════════════════════════");
  const finalSummaries = await checkSummaries(conversationId);
  console.log(`[4] Final state:`);
  console.log(`    Summaries in DB: ${finalSummaries.length}`);
  console.log(`    Conversation ID: ${conversationId}`);
}

run().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
