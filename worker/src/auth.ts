import type { Context, Next } from "hono";
import type { HonoEnv } from "./index";
import { supabaseAuthUser } from "./supabase";

export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "missing_bearer_token" }, 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return c.json({ error: "empty_bearer_token" }, 401);
  }

  try {
    const user = await supabaseAuthUser(c.env, token);
    c.set("userId", user.id);
    await next();
  } catch (err) {
    return c.json({ error: "invalid_token", detail: String(err) }, 401);
  }
}
