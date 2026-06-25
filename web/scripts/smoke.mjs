import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:5174";
const authStatePath = process.env.SMOKE_AUTH_STATE ?? new URL("../tmp/smoke-auth-state.json", import.meta.url).pathname;
const runRender = args.has("--render") || !args.has("--live");
const runLive = args.has("--live");
const headed = args.has("--headed");
const clearAuth = args.has("--clear-auth");

function fail(message, detail) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function isPageClosedError(error) {
  return error instanceof Error && /target page|context|browser has been closed/i.test(error.message);
}

async function checkRenderRoute(page) {
  await page.goto(`${baseUrl}/render-smoke`, { waitUntil: "networkidle" });
  await page.waitForSelector(".markdown-body", { timeout: 15_000 });
  await page.waitForTimeout(1_200);

  const result = {
    katex: await page.locator(".katex").count(),
    code: await page.locator(".md-code").count(),
    lineNumbers: await page.locator(".linenumber, .react-syntax-highlighter-line-number").count(),
    mermaid: await page.locator(".mermaid-frame svg").count(),
    chart: await page.locator(".chart-frame").count(),
    plot: await page.locator(".plot-frame svg path").count(),
    molecule: await page.locator(".molecule-frame svg").count(),
    geometry: await page.locator(".geometry-frame").count(),
    html3d: await page.locator(".html-frame").count(),
    citations: await page.locator(".citation-pill").count(),
    verification: await page.locator(".verification-chip.is-valid").count(),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  };

  const missing = Object.entries(result)
    .filter(([key, value]) => key !== "overflow" && value < 1)
    .map(([key]) => key);
  if (missing.length || result.overflow) {
    fail("Render smoke failed", { missing, result });
  }

  return result;
}

async function waitForManualLogin(page) {
  await page.goto(`${baseUrl}/live-smoke`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname !== "/auth/sign-in") {
    return true;
  }

  if (!headed) {
    return false;
  }

  console.log("Sign in through the opened browser window. The script will continue when /live-smoke is reachable.");
  console.log(`Authenticated browser storage will be saved to ${authStatePath}`);
  const appOrigin = new URL(baseUrl).origin;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    try {
      if (page.isClosed()) {
        return false;
      }
      await page.waitForTimeout(1_000);

      const currentUrl = new URL(page.url());
      if (currentUrl.origin !== appOrigin) {
        continue;
      }

      if (currentUrl.pathname === "/live-smoke") {
        return true;
      }

      if (currentUrl.pathname === "/auth/sign-in" || currentUrl.pathname === "/auth/callback") {
        continue;
      }

      await page.goto(`${baseUrl}/live-smoke`, { waitUntil: "networkidle" }).catch(() => {});
      if (new URL(page.url()).pathname === "/live-smoke") {
        return true;
      }
    } catch (error) {
      if (isPageClosedError(error)) {
        return false;
      }
      throw error;
    }
  }

  return false;
}

async function checkLiveRoute(page) {
  const signedIn = await waitForManualLogin(page);
  if (!signedIn) {
    return {
      signedIn: false,
      detail: "Live smoke requires Google sign-in. Re-run with --headed or sign in manually first.",
    };
  }

  const chatRequests = [];
  const recordChatRequest = (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/chat") {
      chatRequests.push({
        url: request.url(),
        idempotencyKey: request.headers()["idempotency-key"] ?? "",
      });
    }
  };
  page.on("request", recordChatRequest);

  await page.getByRole("button", { name: /run live smoke/i }).click();
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll(".live-smoke-card"));
      return cards.length > 0 && cards.every((card) => !card.classList.contains("is-pending"));
    },
    null,
    { timeout: 120_000 },
  );

  const rows = await page.locator(".live-smoke-card").evaluateAll((cards) =>
    cards.map((card) => ({
      label: card.querySelector("strong")?.textContent?.trim() ?? "",
      status: card.querySelector("span")?.textContent?.trim() ?? "",
      detail: card.querySelector("p")?.textContent?.trim() ?? "",
    })),
  );
  page.off("request", recordChatRequest);

  const chatRequest = chatRequests.find((request) => request.idempotencyKey);
  rows.push({
    label: "Chat idempotency header",
    status: chatRequest ? "pass" : "fail",
    detail: chatRequest
      ? `Observed Idempotency-Key on ${new URL(chatRequest.url).pathname}`
      : "No Idempotency-Key header observed on POST /chat",
  });

  const failed = rows.filter((row) => row.status.toLowerCase() !== "pass");
  if (failed.length) {
    fail("Live smoke failed", { rows, failed });
  }

  return { signedIn: true, rows };
}

if (clearAuth) {
  await rm(authStatePath, { force: true });
}

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  ...(existsSync(authStatePath) ? { storageState: authStatePath } : {}),
});
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

try {
  const output = {};
  if (runRender) {
    output.render = await checkRenderRoute(page);
  }
  if (runLive) {
    output.live = await checkLiveRoute(page);
    if (output.live?.signedIn) {
      await mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
      await context.storageState({ path: authStatePath });
      output.authStatePath = authStatePath;
    }
  }
  output.consoleErrors = consoleErrors;
  if (consoleErrors.length) {
    fail("Browser console errors detected", output);
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, detail: error.detail, consoleErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
