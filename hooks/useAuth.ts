import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import { ensureUserProfile, hasSupabaseEnv, supabase } from "@/lib/supabase";
import type { SessionLike, UserProfile } from "@/types";

WebBrowser.maybeCompleteAuthSession();

function getWebRedirectUrl() {
  // On web, construct the callback URL directly from the current origin
  // This avoids relying on Linking.createURL which may not work correctly in all web contexts
  if (typeof window !== "undefined" && window.location) {
    return new URL("/auth/callback", window.location.origin).toString();
  }

  const appUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();
  if (appUrl) {
    return new URL("/auth/callback", appUrl).toString();
  }

  return "http://localhost:8081/auth/callback";
}

function clearWebAuthUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, "", nextUrl);
}

function toSessionLike(session: NonNullable<Awaited<ReturnType<NonNullable<typeof supabase>["auth"]["getSession"]>>["data"]["session"]>): SessionLike {
  const metadata = session.user.user_metadata as Record<string, unknown>;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName:
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : undefined,
      avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined,
    },
    accessToken: session.access_token,
  };
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

interface AuthContextValue {
  session: SessionLike | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  isPreviewMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useProvideAuth(): AuthContextValue {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!hasSupabaseEnv || !supabase) {
        setSession(null);
        setProfile(null);
        setIsProfileLoading(false);
        setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    const client = supabase;

    async function completePendingWebAuth() {
      if (typeof window === "undefined") {
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const errorDescription =
        searchParams.get("error_description") ??
        searchParams.get("error") ??
        new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_description");

      if (errorDescription) {
        setAuthError(errorDescription);
        clearWebAuthUrl();
        return;
      }

      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          throw error;
        }
        clearWebAuthUrl();
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          throw error;
        }
        clearWebAuthUrl();
      }
    }

    async function loadSession() {
      setAuthError(null);
      await completePendingWebAuth();

      const { data, error } = await client.auth.getSession();
      if (error) {
        throw error;
      }

      if (!mounted) {
        return;
      }

      const nextSession = data.session ? toSessionLike(data.session) : null;

      setSession(nextSession);
      setIsLoading(false);
      if (nextSession) {
        setIsProfileLoading(true);
        ensureUserProfile(nextSession.user.id, {
          email: nextSession.user.email,
          displayName: nextSession.user.displayName,
        })
          .then((nextProfile) => {
            if (mounted) setProfile(nextProfile);
          })
          .catch((nextError) => {
            console.warn("Could not load auth profile", nextError);
            if (mounted) setProfile(null);
          })
          .finally(() => {
            if (mounted) setIsProfileLoading(false);
          });
      } else {
        setProfile(null);
        setIsProfileLoading(false);
      }
    }

    loadSession().catch(() => {
      if (!mounted) {
        return;
      }
      setSession(null);
      setProfile(null);
      setIsProfileLoading(false);
      setAuthError("Could not complete sign-in");
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextValue = nextSession ? toSessionLike(nextSession) : null;

      setSession(nextValue);
      setIsLoading(false);
      if (nextValue) {
        try {
          setIsProfileLoading(true);
          setAuthError(null);
          setProfile(
            await ensureUserProfile(nextValue.user.id, {
              email: nextValue.user.email,
              displayName: nextValue.user.displayName,
            }),
          );
        } catch {
          setProfile(null);
        } finally {
          setIsProfileLoading(false);
        }
      } else {
        setProfile(null);
        setIsProfileLoading(false);
      }
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

    setAuthError(null);

    if (typeof window !== "undefined" && Platform.OS === "web") {
      const redirectTo = getWebRedirectUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        throw error;
      }
      return;
    }

    const redirectTo = AuthSession.makeRedirectUri({
      scheme: "closedai",
      path: "auth/callback",
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
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

  async function signInWithEmail(email: string, password: string) {
    if (!hasSupabaseEnv || !supabase) {
      throw new Error("Supabase auth is not configured");
    }
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      throw error;
    }
  }

  async function signUpWithEmail(email: string, password: string) {
    if (!hasSupabaseEnv || !supabase) {
      throw new Error("Supabase auth is not configured");
    }
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      throw error;
    }
    // If email confirmation is on in Supabase, session will be null until verified
    return { needsEmailConfirmation: !data.session };
  }

  async function signOut() {
    if (!hasSupabaseEnv || !supabase) return;

    await supabase.auth.signOut();
    setProfile(null);
    setIsProfileLoading(false);
  }

  async function refreshProfile() {
    if (!session) {
      setProfile(null);
      return null;
    }

    setIsProfileLoading(true);
    try {
      const nextProfile = await ensureUserProfile(session.user.id, {
        email: session.user.email,
        displayName: session.user.displayName,
      });
      setProfile(nextProfile);
      return nextProfile;
    } finally {
      setIsProfileLoading(false);
    }
  }

  return {
    session,
    profile,
    isLoading,
    isProfileLoading,
    authError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
    isPreviewMode: !hasSupabaseEnv,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return createElement(AuthContext.Provider, { value }, children);
}
