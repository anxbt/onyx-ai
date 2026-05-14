// Quick re-test of semantic retrieval on existing conversation
const TOKEN = process.argv[2];
const CONV_ID = process.argv[3] || "081f4b32-0795-42d6-9156-ac29d456cd3a";
const EPHEMERAL_WINDOW = 8;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://tvvgferannivwdltjtjs.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || "";

async function streamChat(messages: Array<{ role: string; content: string }>, convId: string): Promise<string> {
  const res = await fetch("http://localhost:8787/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${convId}:${Date.now()}`,
    },
    body: JSON.stringify({ conversationId: convId, model: "google/gemini-2.5-flash-lite", messages }),
  });
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
      if (!line.startsWith("data: ")) continue;
      try { const p = JSON.parse(line.slice(6)); if (!p.done && !p.error) full += p.choices?.[0]?.delta?.content ?? ""; } catch {}
    }
  }
  return full;
}

async function run() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${CONV_ID}&select=role,content&order=created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  const msgs = await res.json() as Array<{ role: string; content: string }>;
  const history = msgs.map((m) => ({ role: m.role, content: m.content }));

  console.log(`History: ${history.length} messages, ephemeral window: last ${EPHEMERAL_WINDOW}\n`);

  const tests = [
    { q: "What is my blood type?", fact: 1 },
    { q: "What is my beta fish's name?", fact: 2 },
    { q: "How many cups of chai do I drink?", fact: 4 },
    { q: "What happened at the startup event in 2023?", fact: 8 },
  ];

  for (const { q, fact } of tests) {
    const msg = { role: "user" as const, content: q };
    const trimmed = [...history.slice(-(EPHEMERAL_WINDOW - 1)), msg];
    const answer = await streamChat(trimmed, CONV_ID);
    const denied = answer.toLowerCase().includes("i don't") ||
      answer.toLowerCase().includes("i do not") ||
      answer.toLowerCase().includes("no information") ||
      answer.toLowerCase().includes("i cannot");
    console.log(`Fact ${fact}: ${q}`);
    console.log(`  ${answer.slice(0, 200)}`);
    console.log(`  ${denied ? "❌ NOT RECALLED" : "✅ RECALLED"}\n`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

run().catch((e) => { console.error(e.message); process.exit(1); });
