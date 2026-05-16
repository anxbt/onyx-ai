import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { ensureUserProfile, hasSupabaseEnv, supabase } from "@/lib/supabase";
import type { SessionLike, UserProfile } from "@/types";

WebBrowser.maybeCompleteAuthSession();

function getWebRedirectUrl() {
  const appUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();

  if (appUrl) {
    return new URL("/auth/callback", appUrl).toString();
  }

  return Linking.createURL("/auth/callback");
}

export function useAuth() {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (!hasSupabaseEnv || !supabase) {
      setSession(null);
      setProfile(null);
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    const client = supabase;

    async function loadSession() {
      const { data } = await client.auth.getSession();
      if (!mounted) {
        return;
      }

      const nextSession =
        data.session
          ? {
              user: {
                id: data.session.user.id,
                email: data.session.user.email,
              },
              accessToken: data.session.access_token,
            }
          : null;

      setSession(nextSession);
      if (nextSession) {
        setProfile(await ensureUserProfile(nextSession.user.id, nextSession.user.email));
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    }

    loadSession().catch(() => {
      if (!mounted) {
        return;
      }
      setSession(null);
      setProfile(null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextValue =
        nextSession
          ? {
              user: {
                id: nextSession.user.id,
                email: nextSession.user.email,
              },
              accessToken: nextSession.access_token,
            }
          : null;

      setSession(nextValue);
      if (nextValue) {
        try {
          setProfile(await ensureUserProfile(nextValue.user.id, nextValue.user.email));
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    if (!hasSupabaseEnv || !supabase) {
      throw new Error("Supabase auth is not configured");
    }

    if (typeof window !== "undefined" && Platform.OS === "web") {
      const redirectTo = getWebRedirectUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });
      if (error) {
        throw error;
      }
      return;
    }

    const redirectTo = AuthSession.makeRedirectUri({
      scheme: "onyxai",
      path: "auth/callback",
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error("Supabase did not return an OAuth URL");
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      throw new Error("Google sign-in was cancelled");
    }

    const url = new URL(result.url);
    const code = url.searchParams.get("code");
    const errorDescription = url.searchParams.get("error_description");

    if (errorDescription) {
      throw new Error(errorDescription);
    }

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        throw exchangeError;
      }
      return;
    }

    const hashParams = new URLSearchParams(result.url.split("#")[1] ?? "");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        throw sessionError;
      }
      return;
    }

    throw new Error("Could not complete Google sign-in");
  }

  async function signOut() {
    if (!hasSupabaseEnv || !supabase) return;

    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (!session) {
      setProfile(null);
      return null;
    }

    const nextProfile = await ensureUserProfile(session.user.id, session.user.email);
    setProfile(nextProfile);
    return nextProfile;
  }

  return {
    session,
    profile,
    isLoading,
    signInWithGoogle,
    signOut,
    refreshProfile,
    isPreviewMode: !hasSupabaseEnv,
  };
}
