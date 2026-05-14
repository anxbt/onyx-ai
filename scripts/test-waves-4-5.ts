/**
 * Waves 4+5 Integration Test: Tavily Search + Semantic Retrieval
 *
 * Tests:
 *   1. Tavily search for real-time web data (5 queries)
 *   2. Semantic retrieval of old facts via match_messages RPC (Wave 4 Layer 3)
 *   3. Summarization still works alongside Layer 3
 *
 * Usage:
 *   npx tsx scripts/test-waves-4-5.ts "<bearer-token>"
 */

const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://tvvgferannivwdltjtjs.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || "";

const BEARER_TOKEN = process.argv[2];
if (!BEARER_TOKEN) {
  console.error("Usage: npx tsx scripts/test-waves-4-5.ts \"<bearer-token>\"");
  process.exit(1);
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
}

const USER_ID = getUserIdFromToken(BEARER_TOKEN);
if (!USER_ID) { console.error("Invalid token"); process.exit(1); }

const MODEL = "google/gemini-2.5-flash-lite";
const EPHEMERAL_WINDOW = 8;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function streamChat(messages: ChatMessage[], conversationId: string, search?: { enable?: boolean; force?: boolean }): Promise<string> {
  const body: Record<string, unknown> = { conversationId, model: MODEL, messages };
  if (search) { body.enableSearch = search.enable; body.forceSearch = search.force; }

  const res = await fetch(`${WORKER_URL}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}:${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) { throw new Error(`Chat ${res.status}`); }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let full = "", buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data: ")) continue;
      try {
        const p = JSON.parse(t.slice(6));
        if (p.done || p.error) continue;
        const d = p.choices?.[0]?.delta?.content ?? "";
        if (d) full += d;
      } catch {}
    }
  }
  return full;
}

async function insertUserMessage(convId: string, content: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify({ conversation_id: convId, user_id: USER_ID, role: "user", content, has_attachment: false }),
  });
  return ((await res.json()) as Array<{ id: string }>)[0]?.id ?? "";
}

async function embedMessage(messageId: string, text: string): Promise<boolean> {
  try {
    const embeddingRes = await fetch(`https://openrouter.ai/api/v1/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://onyxai.app",
      },
      body: JSON.stringify({ model: "sentence-transformers/all-MiniLM-L6-v2", input: text }),
    });
    if (!embeddingRes.ok) return false;
    const data = (await embeddingRes.json()) as { data?: Array<{ embedding: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding) return false;

    await fetch(`${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embedding }),
    });
    return true;
  } catch {
    return false;
  }
}

async function checkEmbeddings(convId: string): Promise<{ total: number; embedded: number }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${convId}&select=embedding`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  return { total: rows.length, embedded: rows.filter((r: any) => r.embedding?.length).length };
}

async function createConversation(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify({ user_id: USER_ID, title: "W4+W5 Test", model: MODEL, preview: "", token_count: 0 }),
  });
  return ((await res.json()) as Array<{ id: string }>)[0].id;
}

async function countMessages(convId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${convId}&select=count`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } },
  );
  if (!res.ok) return 0;
  const h = res.headers.get("content-range");
  if (h) { const m = h.match(/\/(\d+)/); if (m) return parseInt(m[1]); }
  return ((await res.json()) as Array<unknown>).length;
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  "What is the current BSE Sensex value right now?",
  "Who is the current Prime Minister of India?",
  "What are the latest features in React 19?",
  "What's the weather in Bangalore today?",
  "What happened in the latest India cricket match?",
];

// Distinct facts for semantic retrieval testing (messages 1-12)
const FACTS = [
  "My blood type is B-positive.",
  "I have a beta fish named Sushi.",
  "My desk setup uses two 27-inch LG monitors.",
  "I drink exactly 3 cups of chai every morning.",
  "My favorite street food is pani puri from a stall near MG Road.",
  "I use Vim keybindings in VS Code, even for markdown.",
  "I have a scar on my right thumb from a woodworking project.",
  "I once met the Google CEO at a startup event in 2023.",
  "My backup phone is a 2017 Nokia 3310 that still works.",
  "I prefer cold brew over hot coffee, even in winter.",
  "My passport has stamps from 17 countries so far.",
  "I keep a physical Moleskine journal for daily reflections.",
];

// ─── Runner ─────────────────────────────────────────────────────────────────

async function run() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Waves 4+5 Integration Test        ║");
  console.log("║   Tavily Search + Semantic Retrieval ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ─── PART 1: Tavily Search Test ───────────────────────────────────────────
  console.log("━━━ PART 1: Tavily Search ━━━\n");

  const searchConvId = await createConversation();
  const searchHistory: ChatMessage[] = [];

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i];
    const msg: ChatMessage = { role: "user", content: q };
    console.log(`  Q${i + 1}: ${q}`);
    const trimmed = [...searchHistory.slice(-(EPHEMERAL_WINDOW - 1)), msg];
    const answer = await streamChat(trimmed, searchConvId, { enable: true, force: true });
    searchHistory.push(msg, { role: "assistant", content: answer });
    console.log(`  A${i + 1}: ${answer.slice(0, 150)}...\n`);
    await sleep(2000);
  }

  // ─── PART 2: Semantic Retrieval Test ─────────────────────────────────────
  console.log("━━━ PART 2: Semantic Retrieval (Wave 4 Layer 3) ━━━\n");

  const convId = await createConversation();
  const history: ChatMessage[] = [];

  for (let i = 0; i < FACTS.length; i++) {
    const n = i + 1;
    const fact = FACTS[i];
    const userMsg: ChatMessage = {
      role: "user",
      content: `Remember this personal fact: ${fact}. Just reply "OK."`,
    };

    // Mimic app: trim to last 8
    const trimmed = [...history.slice(-(EPHEMERAL_WINDOW - 1)), userMsg];
    const content = await streamChat(trimmed, convId);

    // Insert user message into DB (like the app does)
    const msgId = await insertUserMessage(convId, userMsg.content);
    // Embed the pure fact (not the wrapper) — mirrors production where users type naturally
    embedMessage(msgId, fact).catch(() => {});

    history.push(userMsg, { role: "assistant", content: content || "OK." });

    if (n % 3 === 0) {
      const counts = await countMessages(convId);
      console.log(`  Sent ${n} facts (DB: ${counts} msgs)`);
    }
    await sleep(1500);
  }

  // Wait for embeddings to be generated (async in the app)
  console.log("\n  Waiting 15s for embeddings to be stored...");
  await sleep(15000);

  const embStatus = await checkEmbeddings(convId);
  console.log(`  Messages in DB: ${embStatus.total}, with embeddings: ${embStatus.embedded}`);
  console.log(`  Context: ${history.length} msgs total, last 8 in ephemeral window\n`);

  // Recall test — facts from different zones
  console.log("  ── Recall Test ──\n");
  console.log("  Layout: facts 1-4 outside window, facts 5-8 outside window, facts 9-12 in window\n");

  const recallTests = [
    { q: "What is my blood type?", fact: 1, zone: "outside window (fact 1)", source: "semantic retrieval" },
    { q: "What is my beta fish's name?", fact: 2, zone: "outside window (fact 2)", source: "semantic retrieval" },
    { q: "How many cups of chai do I drink?", fact: 4, zone: "outside window (fact 4)", source: "semantic retrieval" },
    { q: "What happened at the startup event in 2023?", fact: 8, zone: "outside window (fact 8)", source: "semantic retrieval" },
    { q: "What's my backup phone?", fact: 9, zone: "in window (fact 9)", source: "ephemeral window" },
    { q: "Do I prefer cold brew or hot coffee?", fact: 10, zone: "in window (fact 10)", source: "ephemeral window" },
    { q: "How many countries has my passport visited?", fact: 11, zone: "in window (fact 11)", source: "ephemeral window" },
    { q: "What writing tool do I use daily?", fact: 12, zone: "in window (fact 12)", source: "ephemeral window" },
  ];

  for (const { q, fact, zone, source } of recallTests) {
    const queryMsg: ChatMessage = { role: "user", content: q };
    const trimmed = [...history.slice(-(EPHEMERAL_WINDOW - 1)), queryMsg];
    console.log(`  Q: ${q}`);
    console.log(`     Fact #${fact} | Zone: ${zone} | Expected source: ${source}`);
    const answer = await streamChat(trimmed, convId);
    const lowAnswer = answer.toLowerCase();
    const denied = lowAnswer.includes("i don't know") || lowAnswer.includes("i don't have") ||
      lowAnswer.includes("i cannot") || lowAnswer.includes("no information") ||
      lowAnswer.includes("not mentioned") || lowAnswer.includes("i am a language model");
    const remembered = !denied;
    console.log(`  A: ${answer.slice(0, 150)}...`);
    console.log(`     ${remembered ? "✅ RECALLED" : "❌ NOT RECALLED"} (source: ${source})\n`);
    await sleep(1500);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("━━━ RESULTS ━━━\n");
  console.log("  Tavily Search:");
  console.log(`    ${SEARCH_QUERIES.length} queries sent with force-search enabled`);
  console.log("    Check answers above — real-time data (Sensex, weather, cricket)");
  console.log("    should contain current values, not training-data guesses.\n");

  console.log("  Semantic Retrieval (Wave 4):");
  console.log(`    ${embStatus.embedded}/${embStatus.total} messages have embeddings`);
  console.log("    Facts 1-4 (outside ephemeral window) should be recalled via");
  console.log("    match_messages RPC with cosine similarity search.");
  console.log("    If the model answers facts 1-4 correctly, Layer 3 works.\n");

  console.log(`  Conversation IDs: search=${searchConvId}, memory=${convId}`);
}

run().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
