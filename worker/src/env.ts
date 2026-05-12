import type { Env } from "./types";

export function supabaseUrl(env: Env) {
  return env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
}

export function supabaseAdminKey(env: Env) {
  return env.SUPABASE_SECRET_KEY ?? env.SupabaseSecretKey ?? env.SUPABASE_SERVICE_ROLE_KEY;
}

export function isSupabaseSecretKey(key: string) {
  return key.startsWith("sb_secret_");
}
