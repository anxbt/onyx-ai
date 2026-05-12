import { mkdir, readFile, writeFile } from "node:fs/promises";

function parseEnv(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key) {
      env[key] = value;
    }
  }

  return env;
}

const rootEnv = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const workerEnv = {
  OPENROUTER_API_KEY: rootEnv.OPENROUTER_API_KEY ?? "",
  SUPABASE_URL: rootEnv.SUPABASE_URL ?? rootEnv.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_SECRET_KEY:
    rootEnv.SUPABASE_SECRET_KEY ??
    rootEnv.SupabaseSecretKey ??
    rootEnv.SUPABASE_SERVICE_ROLE_KEY ??
    "",
  RAZORPAY_KEY_ID: rootEnv.RAZORPAY_KEY_ID ?? rootEnv.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? "",
  RAZORPAY_KEY_SECRET: rootEnv.RAZORPAY_KEY_SECRET ?? "",
  OPENAI_API_KEY: rootEnv.OPENAI_API_KEY ?? "",
};

await mkdir(new URL("../worker", import.meta.url), { recursive: true });
await writeFile(
  new URL("../worker/.dev.vars", import.meta.url),
  Object.entries(workerEnv).map(([key, value]) => `${key}=${value}`).join("\n") + "\n",
);

console.log("Synced root .env values into worker/.dev.vars for local demo.");
