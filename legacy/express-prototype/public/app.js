const MODELS = [
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    mono: "DS",
    glyph: "g-deepseek",
    provider: "DeepSeek",
    country: "CN",
    license: "OSS · MIT",
    inP: 0.27,
    outP: 0.55,
    ctx: 128,
    speed: 89,
    tag: "Best value",
    blurb: "Balanced coding model with strong reasoning and low output cost."
  },
  {
    id: "qwen-72b",
    name: "Qwen 72B",
    mono: "QW",
    glyph: "g-qwen",
    provider: "Alibaba",
    country: "CN",
    license: "OSS · Apache",
    inP: 0.22,
    outP: 0.49,
    ctx: 128,
    speed: 84,
    tag: "Cheapest",
    blurb: "Fast general-purpose assistant with good multilingual range."
  },
  {
    id: "glm-4.5",
    name: "GLM 4.5",
    mono: "GL",
    glyph: "g-glm",
    provider: "Zhipu",
    country: "CN",
    license: "Hosted",
    inP: 0.38,
    outP: 0.74,
    ctx: 200,
    speed: 80,
    tag: "200K context",
    blurb: "Long-context assistant built for research-heavy prompts."
  },
  {
    id: "kimi-k2",
    name: "Kimi K2",
    mono: "KM",
    glyph: "g-kimi",
    provider: "Moonshot",
    country: "CN",
    license: "Hosted",
    inP: 0.31,
    outP: 0.63,
    ctx: 128,
    speed: 92,
    tag: "Fast",
    blurb: "Snappy responses with strong summarization and retrieval behavior."
  },
  {
    id: "llama-405b",
    name: "Llama 405B",
    mono: "LL",
    glyph: "g-llama",
    provider: "Meta",
    country: "US",
    license: "OSS · Custom",
    inP: 0.47,
    outP: 0.82,
    ctx: 128,
    speed: 73,
    tag: "Open source",
    blurb: "Large open-weight option for detailed answers and drafting."
  },
  {
    id: "mistral-large",
    name: "Mistral Large",
    mono: "MS",
    glyph: "g-mistral",
    provider: "Mistral",
    country: "EU",
    license: "Hosted",
    inP: 0.58,
    outP: 0.98,
    ctx: 128,
    speed: 69,
    blurb: "European-hosted model with reliable formatting and writing quality."
  },
  {
    id: "yi-lightning",
    name: "Yi Lightning",
    mono: "YI",
    glyph: "g-yi",
    provider: "01.AI",
    country: "CN",
    license: "Hosted",
    inP: 0.12,
    outP: 0.14,
    ctx: 131,
    speed: 101,
    tag: "Cheapest",
    blurb: "Ultra-low-cost model for fast drafts, extraction, and retries."
  }
];

const HOME_SUGGESTIONS = [
  ["Refactor our pricing layer", "Work through a safe TypeScript cleanup plan."],
  ["Compare model costs by workload", "Show where DeepSeek beats frontier pricing."],
  ["Draft product positioning", "Turn our notes into a crisp landing page story."],
  ["Plan memory architecture", "Sketch the v1 retrieval and storage boundaries."]
];

const CHATS = [
  {
    id: "p1",
    title: "Refactor pricing helper",
    preview: "Switch the default path to DeepSeek and tighten the formatter.",
    footer: "Just now · 14 msgs · $0.0023",
    pinned: true,
    modelId: "deepseek-v3"
  },
  {
    id: "p2",
    title: "Onboarding value prop",
    preview: "Need a simpler way to explain 10x cheaper without sounding hostile.",
    footer: "2h ago · 9 msgs · $0.0067",
    pinned: true,
    modelId: "qwen-72b"
  },
  {
    id: "r1",
    title: "Memory retrieval notes",
    preview: "Keep extraction async and pull only top-k facts into context.",
    footer: "Yesterday · 23 msgs · $0.0142",
    modelId: "glm-4.5"
  },
  {
    id: "r2",
    title: "Shipping checklist",
    preview: "App shell, picker, history, spend ledger, fake stream demo.",
    footer: "May 5 · 18 msgs · $0.0081",
    modelId: "kimi-k2"
  }
];

const ASSISTANT_REPLY = `Here’s a safe way to refactor \`pricing.ts\` without changing behavior.

1. Pull the formatter and model-price map into small pure helpers.
2. Keep \`costFor(model, inTok, outTok)\` as the only public calculation entrypoint.
3. Switch the default model to **DeepSeek V3** so the UI and estimates stay aligned.

I’d also separate presentation formatting from math so we can reuse the same values in the composer ribbon, message footers, and history ledger without drifting.`;

const COMPARE_COPY = [
  "DeepSeek V3 keeps the answer compact, prioritizes the refactor boundary, and uses lower output cost to stay efficient for iterative coding work.",
  "Llama 405B expands with more architectural framing and tradeoffs, but it costs more per output token and tends to over-explain for quick implementation loops."
];

const state = {
  screen: "onboarding",
  previousScreen: "home",
  modelId: "deepseek-v3",
  draft: "",
  thread: [
    { role: "user", text: "Switch us to DeepSeek and help refactor pricing.ts." },
    {
      role: "assistant",
      text: "DeepSeek is the best cost-to-quality default here. I’d keep the cost math isolated and make the formatter reusable across every pricing surface.",
      inTok: 22,
      outTok: 61,
      dur: "2.8s"
    },
    { role: "user", text: "Make the response shorter and focused on safe steps." }
  ],
  streaming: false,
  streamText: "",
  streamTok: 0,
  sessionCost: 0.0247,
  compareModelId: "llama-405b",
  pickerFilter: "All",
  pickerSort: "cheapest",
  settings: {
    autoReload: true,
    monthlyCap: true,
    privacyTraining: false,
    memory: true,
    streaming: true
  }
};

let streamTimer = null;

const app = document.getElementById("app");

function currentModel() {
  return MODELS.find((model) => model.id === state.modelId) || MODELS[0];
}

function compareModel() {
  return MODELS.find((model) => model.id === state.compareModelId) || MODELS[4];
}

function costFor(model, inTok, outTok) {
  return (model.inP * inTok + model.outP * outTok) / 1_000_000;
}

function fmtCost(cost) {
  if (cost < 0.00001) return `$${cost.toFixed(6)}`;
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function esc(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMd(text) {
  const safe = esc(text);
  const blocks = safe.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    if (/^\d+\./.test(block)) {
      const items = block.split("\n").map((line) => line.replace(/^\d+\.\s*/, "").trim());
      return `<ol>${items.map((item) => `<li>${inlineMd(item)}</li>`).join("")}</ol>`;
    }
    return `<p>${inlineMd(block.replace(/\n/g, "<br />"))}</p>`;
  }).join("");
}

function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function tokenEstimate(text) {
  return Math.max(1, Math.floor(text.trim().length / 4) || 1);
}

function modelGlyph(model, size = 20, radius = Math.round(size / 4)) {
  return `<span class="glyph ${model.glyph}" style="width:${size}px;height:${size}px;border-radius:${radius}px;font-size:${Math.max(10, Math.floor(size * 0.42))}px;">${model.mono}</span>`;
}

function icon(symbol) {
  return `<span aria-hidden="true">${symbol}</span>`;
}

function setScreen(screen, previous = state.screen) {
  state.previousScreen = previous;
  state.screen = screen;
  render();
}

function topChrome({ title, showMenu = true }) {
  const model = currentModel();
  const center = title
    ? `<div class="title-static">${title}</div>`
    : `<button class="picker-pill" data-action="open-models">
        <span class="pill-left">
          ${modelGlyph(model, 20)}
          <span class="pill-name">${model.name}</span>
        </span>
        <span class="pill-chevron">⌄</span>
      </button>`;

  return `<div class="top-chrome">
    <button class="icon-btn" data-action="${showMenu ? "open-history" : "go-back"}">${showMenu ? "☰" : "✕"}</button>
    ${center}
    <button class="icon-btn" data-action="${title === "Compare" ? "noop" : "open-settings"}">${title === "Compare" ? "+" : "⋯"}</button>
  </div>`;
}

function composer() {
  const model = currentModel();
  const tok = tokenEstimate(state.draft);
  const running = state.streaming ? costFor(model, 24, state.streamTok) : costFor(model, tok, 36);
  const ribbon = state.streaming
    ? `<span class="live-dot"></span> streaming · this turn ${fmtCost(running)} ··· session ${fmtCost(state.sessionCost)}`
    : `● est ${fmtCost(costFor(model, tok, 18))} · ${model.inP.toFixed(2)}/${model.outP.toFixed(2)} per 1M ··· session ${fmtCost(state.sessionCost)}`;

  return `<div class="composer-wrap">
    <div class="composer">
      <div class="cost-ribbon">${ribbon}</div>
      <div class="composer-input">
        <textarea class="draft-area" rows="1" placeholder="Message ${model.name}…" data-role="draft">${state.draft}</textarea>
        <div class="composer-tools">
          <button class="ghost-btn" data-action="noop">📎</button>
          <button class="ghost-btn" data-action="noop">◌</button>
          <span class="spacer"></span>
          <span class="mono subtle">${tok} tok</span>
          <button class="send-btn ${state.draft.trim() ? "ready" : ""}" data-action="${state.streaming ? "stop-stream" : "send"}">
            ${state.streaming ? '<span class="send-stop"></span>' : "↑"}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function homeScreen() {
  return `<div class="screen">
    ${topChrome({})}
    <div class="screen-body">
      <section class="hero">
        <div class="eyebrow mono">morning, alex</div>
        <h1 class="hero-title">What are we<br /><span class="muted-line">thinking through today?</span></h1>
      </section>

      <section class="group">
        ${HOME_SUGGESTIONS.map(([title, sub], index) => `
          <button class="suggestion-row" data-action="prefill" data-index="${index}">
            <span>
              <div class="suggestion-title">${title}</div>
              <div class="suggestion-sub">${sub}</div>
            </span>
            <span class="row-arrow">›</span>
          </button>
        `).join("")}
      </section>

      <section style="margin-top:22px;">
        <div class="strip-head">
          <div class="section-label mono">Quick switch</div>
          <button class="link-btn" data-action="open-models">browse all →</button>
        </div>
        <div class="model-strip">
          ${MODELS.slice(0, 5).map((model) => `
            <button class="model-card ${model.id === state.modelId ? "active" : ""}" data-action="pick-model" data-id="${model.id}">
              <div class="model-card-top">
                ${modelGlyph(model, 24, 6)}
                ${model.id === state.modelId ? '<span class="active-dot"></span>' : '<span></span>'}
              </div>
              <div class="model-card-name">${model.name}</div>
              <div class="model-card-meta">${fmtCost(model.outP / 1_000_000)} out · ${model.outP.toFixed(2)}/M out</div>
            </button>
          `).join("")}
        </div>
      </section>
    </div>
    ${composer()}
  </div>`;
}

function chatScreen() {
  const model = currentModel();
  const thread = [...state.thread];
  if (state.streaming) {
    thread.push({ role: "assistant", text: state.streamText, streaming: true });
  }

  return `<div class="screen">
    ${topChrome({})}
    <div class="screen-body" id="chat-scroll">
      <div class="thread">
        ${thread.map((message) => {
          if (message.role === "user") {
            return `<div class="user-msg"><div class="message-text">${renderMd(message.text)}</div></div>`;
          }

          return `<div class="assistant-msg">
            <div class="assistant-head">
              ${modelGlyph(model, 18, 5)}
              <span>${model.name}</span>
              ${message.streaming ? '<span class="live-dot"></span>' : ""}
            </div>
            <div class="message-text">${renderMd(message.text)}${message.streaming ? '<span class="caret"></span>' : ""}</div>
            ${message.streaming ? "" : `
              <div class="message-meta">
                <span class="price">${fmtCost(costFor(model, message.inTok || 24, message.outTok || tokenEstimate(message.text)))}</span>
                <span>${message.outTok || tokenEstimate(message.text)} tok</span>
                <span>${message.dur || "3.1s"}</span>
                <span>··· [copy] [refresh] [swap]</span>
              </div>
            `}
          </div>`;
        }).join("")}
      </div>
    </div>
    ${composer()}
  </div>`;
}

function modelPickerScreen() {
  const filtered = MODELS
    .filter((model) => {
      if (state.pickerFilter === "All") return true;
      if (state.pickerFilter === "Open source") return model.license.startsWith("OSS");
      if (state.pickerFilter === "China-hosted") return model.country === "CN";
      if (state.pickerFilter === "Fast") return model.speed >= 80;
      return true;
    })
    .sort((a, b) => state.pickerSort === "cheapest" ? a.outP - b.outP : b.speed - a.speed);

  return `<div class="screen">
    ${topChrome({ title: "Choose a model", showMenu: false })}
    <div class="screen-body">
      <section class="screen-subhead">
        <div class="header-row">
          <h2 class="hero-title-compact">7 models, all configured.</h2>
          <button class="accent-link" data-action="open-compare">Compare</button>
        </div>
        <div class="row-sub" style="margin-top:8px;">Switch instantly across cost, speed, and context without leaving the thread.</div>
      </section>

      <div class="chips">
        ${["All", "Open source", "China-hosted", "Fast"].map((filter) => `
          <button class="chip ${state.pickerFilter === filter ? "active" : ""}" data-action="set-filter" data-filter="${filter}">${filter}</button>
        `).join("")}
      </div>

      <div class="sort-row">
        <button class="sort-btn ${state.pickerSort === "cheapest" ? "active" : ""}" data-action="set-sort" data-sort="cheapest">↓ cheapest</button>
        <button class="sort-btn ${state.pickerSort === "fastest" ? "active" : ""}" data-action="set-sort" data-sort="fastest">↓ fastest</button>
      </div>

      <section class="picker-list">
        ${filtered.map((model) => `
          <button class="model-row" data-action="pick-model-return" data-id="${model.id}">
            ${modelGlyph(model, 36, 8)}
            <span class="model-row-main">
              <span class="row-line">
                <span class="row-title">${model.name}</span>
                ${model.tag ? `<span class="tag">${model.tag}</span>` : ""}
              </span>
              <div class="row-subline">${model.country} · ${model.provider} · ${model.license}</div>
              <div class="blurb">${model.blurb}</div>
              <div class="picker-meta"><span style="color:var(--accent)">${model.outP.toFixed(2)}/M out</span> · ${model.speed} tok/s · ${model.ctx}K ctx</div>
            </span>
            <span class="check">${model.id === state.modelId ? "✓" : ""}</span>
          </button>
        `).join("")}
      </section>

      <section class="reference-card">
        <div class="section-label mono">For reference</div>
        <div class="reference-grid mono">
          <div class="reference-row"><span>GPT-4o</span><span>$10/M · 18× DS</span></div>
          <div class="reference-row"><span>Claude 3.5</span><span>$15/M · 27× DS</span></div>
        </div>
      </section>
    </div>
  </div>`;
}

function historyScreen() {
  const pinned = CHATS.filter((chat) => chat.pinned);
  const recent = CHATS.filter((chat) => !chat.pinned);

  return `<div class="screen">
    ${topChrome({ title: "Chats", showMenu: false })}
    <div class="screen-body">
      <section class="ledger-card">
        <div class="ledger-grid">
          <div class="ledger-col">
            <div class="section-label mono">This month</div>
            <div class="ledger-num">$0.4128</div>
          </div>
          <div class="ledger-divider"></div>
          <div class="ledger-col">
            <div class="section-label mono">Saved vs frontier</div>
            <div class="ledger-num accent">$5.84</div>
          </div>
        </div>
      </section>

      <div class="section-label mono">Pinned</div>
      <section class="chat-list">
        ${pinned.map(chatRow).join("")}
      </section>

      <div class="section-label mono">Recent</div>
      <section class="chat-list">
        ${recent.map(chatRow).join("")}
      </section>
    </div>
  </div>`;
}

function chatRow(chat) {
  const model = MODELS.find((item) => item.id === chat.modelId) || MODELS[0];
  return `<button class="chat-row" data-action="open-chat" data-id="${chat.id}" data-model="${model.id}">
    ${modelGlyph(model, 28, 7)}
    <span>
      <div class="row-title">${chat.title}</div>
      <div class="row-sub">${chat.preview}</div>
      <div class="chat-footer">${chat.footer}</div>
    </span>
  </button>`;
}

function settingsScreen() {
  return `<div class="screen">
    ${topChrome({ title: "Settings", showMenu: false })}
    <div class="screen-body">
      <section class="settings-section">
        <div class="group">
          <button class="set-row">
            <span class="left" style="display:flex;align-items:center;gap:12px;">
              <span class="glyph g-deepseek" style="width:38px;height:38px;border-radius:10px;font-size:14px;">AR</span>
              <span>
                <div class="row-title">Alex R.</div>
                <div class="row-sub">alex@onyx.ai · Pay-as-you-go</div>
              </span>
            </span>
            <span class="detail">›</span>
          </button>
        </div>
      </section>

      ${settingsGroup("Spend", [
        rowDetail("Balance", "$8.42", true),
        rowToggle("Auto-reload", "autoReload"),
        rowToggle("Monthly cap", "monthlyCap"),
        rowDetail("Receipts", "Email")
      ])}

      ${settingsGroup("Models", [
        rowDetail("Default", currentModel().name),
        rowDetail("Routing", "Manual"),
        rowDetail("Region", "Global"),
        rowToggle("Streaming toggle", "streaming")
      ])}

      ${settingsGroup("Privacy", [
        rowToggle("Save memories", "memory", "Use cross-chat memory retrieval in v1."),
        rowToggle("Training opt out", "privacyTraining"),
        rowDetail("Data export", "Request")
      ])}

      ${settingsGroup("About", [
        rowDetail("Version", "v0.1.0"),
        rowDetail("Help", "Docs"),
        rowDetail("Sign out", "", false, true)
      ])}
    </div>
  </div>`;
}

function settingsGroup(title, rows) {
  return `<section class="settings-section">
    <div class="section-label mono">${title}</div>
    <div class="group">${rows.join("")}</div>
  </section>`;
}

function rowDetail(title, detail, mono = false, danger = false) {
  return `<button class="set-row" ${title === "Default" ? 'data-action="open-models"' : 'data-action="noop"'}>
    <span class="left">
      <div class="row-title ${danger ? "danger" : ""}">${title}</div>
    </span>
    <span class="detail ${mono ? "mono" : ""}">${detail || "›"}</span>
  </button>`;
}

function rowToggle(title, key, sub = "") {
  return `<button class="set-row" data-action="toggle-setting" data-key="${key}">
    <span class="left">
      <div class="row-title">${title}</div>
      ${sub ? `<div class="row-sub">${sub}</div>` : ""}
    </span>
    <span class="toggle ${state.settings[key] ? "on" : ""}"></span>
  </button>`;
}

function compareScreen() {
  const left = currentModel();
  const right = compareModel();
  return `<div class="screen">
    ${topChrome({ title: "Compare", showMenu: false })}
    <div class="screen-body">
      <div class="compare-top">
        <div class="section-label mono">Prompt</div>
        <button class="accent-link" data-action="swap-compare">+ add 3rd</button>
      </div>
      <div class="prompt-bubble">Switch us to DeepSeek and help refactor pricing.ts.</div>

      <section class="compare-grid">
        ${compareColumn(left, COMPARE_COPY[0], true)}
        <div class="compare-divider"></div>
        ${compareColumn(right, COMPARE_COPY[1], false)}
      </section>
    </div>
  </div>`;
}

function compareColumn(model, text, useCurrent) {
  return `<div class="compare-col">
    <div class="compare-stick">
      <div class="assistant-head">${modelGlyph(model, 18, 5)}<span>${model.name}</span></div>
    </div>
    <div class="compare-body">${text}</div>
    <div class="compare-footer">
      <span><span style="color:var(--accent)">${fmtCost(costFor(model, 58, 142))}</span> · 4.0s</span>
      <button class="accent-link" data-action="use-compare" data-id="${model.id}">use →</button>
    </div>
  </div>`;
}

function onboardingScreen() {
  return `<div class="screen onboarding">
    <div class="logo">
      <div class="logo-mark">O</div>
      <div class="logo-word">onyxai</div>
    </div>

    <h1 class="hero-title" style="font-size:32px;">
      Seven AI models.<br />
      <span class="muted-line">One chat.</span><br />
      <span class="accent-line">10× cheaper.</span>
    </h1>

    <section class="onboarding-ledger">
      <div class="section-label mono">Comparison ledger</div>
      <table class="onboarding-table">
        <tr><td>Yi Lightning</td><td style="color:var(--accent)">$0.00014</td><td style="color:var(--accent)">cheapest</td></tr>
        <tr><td>DeepSeek V3</td><td>$0.00055</td><td>best value</td></tr>
        <tr><td>Llama 405B</td><td>$0.00082</td><td>open weight</td></tr>
        <tr><td>GPT-4o</td><td style="color:var(--txt-3)">$0.0100</td><td style="color:var(--txt-3)">frontier</td></tr>
        <tr><td>Claude 3.5</td><td style="color:var(--txt-3)">$0.0150</td><td style="color:var(--txt-3)">frontier</td></tr>
      </table>
    </section>

    <button class="cta" data-action="start">Start free · $0.50 included</button>
    <button class="secondary-link" data-action="start">I already have an account</button>
  </div>`;
}

function render() {
  if (state.screen === "onboarding") app.innerHTML = onboardingScreen();
  if (state.screen === "home") app.innerHTML = homeScreen();
  if (state.screen === "chat") app.innerHTML = chatScreen();
  if (state.screen === "models") app.innerHTML = modelPickerScreen();
  if (state.screen === "history") app.innerHTML = historyScreen();
  if (state.screen === "settings") app.innerHTML = settingsScreen();
  if (state.screen === "compare") app.innerHTML = compareScreen();

  const draft = app.querySelector("[data-role='draft']");
  if (draft) {
    draft.focus({ preventScroll: true });
    draft.setSelectionRange(draft.value.length, draft.value.length);
  }

  const chatScroll = app.querySelector("#chat-scroll");
  if (chatScroll) {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }
}

function beginStream() {
  if (state.streaming) return;
  const draft = state.draft.trim();
  if (draft) {
    state.thread.push({ role: "user", text: draft });
    state.draft = "";
  }

  state.screen = "chat";
  state.streaming = true;
  state.streamText = "";
  state.streamTok = 0;
  render();

  let index = 0;
  const tick = () => {
    const step = 2 + Math.floor(Math.random() * 4);
    index = Math.min(ASSISTANT_REPLY.length, index + step);
    state.streamText = ASSISTANT_REPLY.slice(0, index);
    state.streamTok = Math.max(1, Math.floor(state.streamText.length / 4.2));
    render();

    if (index >= ASSISTANT_REPLY.length) {
      state.streaming = false;
      state.thread.push({
        role: "assistant",
        text: ASSISTANT_REPLY,
        inTok: 24,
        outTok: state.streamTok,
        dur: "3.1s"
      });
      state.sessionCost += costFor(currentModel(), 24, state.streamTok);
      state.streamText = "";
      render();
      return;
    }

    streamTimer = window.setTimeout(tick, 28 + Math.floor(Math.random() * 30));
  };

  streamTimer = window.setTimeout(tick, 280);
}

function stopStream() {
  if (!state.streaming) return;
  window.clearTimeout(streamTimer);
  state.streaming = false;
  state.thread.push({
    role: "assistant",
    text: state.streamText || "Stopped.",
    inTok: 24,
    outTok: state.streamTok || 1,
    dur: "1.4s"
  });
  state.streamText = "";
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const { action } = target.dataset;

  if (action === "start") setScreen("home");
  if (action === "open-history") setScreen("history");
  if (action === "open-settings") setScreen("settings");
  if (action === "open-models") setScreen("models");
  if (action === "open-compare") setScreen("compare", "models");
  if (action === "go-back") setScreen(state.previousScreen || "home", state.screen);
  if (action === "prefill") {
    state.draft = HOME_SUGGESTIONS[Number(target.dataset.index)][0];
    setScreen("home");
  }
  if (action === "pick-model") {
    state.modelId = target.dataset.id;
    render();
  }
  if (action === "pick-model-return") {
    state.modelId = target.dataset.id;
    setScreen("chat", "models");
  }
  if (action === "set-filter") {
    state.pickerFilter = target.dataset.filter;
    render();
  }
  if (action === "set-sort") {
    state.pickerSort = target.dataset.sort;
    render();
  }
  if (action === "open-chat") {
    state.modelId = target.dataset.model;
    setScreen("chat", "history");
  }
  if (action === "toggle-setting") {
    const key = target.dataset.key;
    state.settings[key] = !state.settings[key];
    render();
  }
  if (action === "use-compare") {
    state.modelId = target.dataset.id;
    setScreen("chat", "compare");
  }
  if (action === "swap-compare") {
    state.compareModelId = state.compareModelId === "llama-405b" ? "qwen-72b" : "llama-405b";
    render();
  }
  if (action === "send") beginStream();
  if (action === "stop-stream") stopStream();
});

document.addEventListener("input", (event) => {
  const target = event.target.closest("[data-role='draft']");
  if (!target) return;
  state.draft = target.value;
  render();
});

render();
