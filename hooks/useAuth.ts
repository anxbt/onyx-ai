import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import { ensureUserProfile, hasSupabaseEnv, supabase } from "@/lib/supabase";
import type { SessionLike, UserProfile } from "@/types";

WebBrowser.maybeCompleteAuthSession();

// Google "Web application" OAuth client ID (the one configured as the Google
// provider in Supabase). Native Google Sign-In mints an ID token with this as
// its audience, which Supabase then verifies via signInWithIdToken.
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  "1067028491300-moe4lqe7ued9oa66mqcf5ku3l4qgf7lc.apps.googleusercontent.com";

const authUrlCompletions = new Map<string, Promise<boolean>>();

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

function getAuthParamsFromUrl(url: string) {
  const [urlWithoutHash, hash = ""] = url.split("#");
  const queryStart = urlWithoutHash.indexOf("?");
  const query = queryStart >= 0 ? urlWithoutHash.slice(queryStart + 1) : "";
  const queryParams = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);

  const getParam = (key: string) => queryParams.get(key) ?? hashParams.get(key);

  return {
    error: getParam("error"),
    errorDescription: getParam("error_description"),
    code: getParam("code"),
    accessToken: getParam("access_token"),
    refreshToken: getParam("refresh_token"),
  };
}

function isAuthCallbackUrl(url: string) {
  return url.includes("/auth/callback") || url.startsWith("closedai://auth/callback");
}

async function completeAuthFromUrl(url: string, client: NonNullable<typeof supabase>) {
  const { error, errorDescription, code, accessToken, refreshToken } = getAuthParamsFromUrl(url);

  if (errorDescription || error) {
    throw new Error(errorDescription ?? error ?? "Could not complete sign-in");
  }

  if (code) {
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      throw exchangeError;
    }
    return true;
  }

  if (accessToken && refreshToken) {
    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      throw sessionError;
    }
    return true;
  }

  return false;
}

async function completeAuthFromUrlOnce(url: string, client: NonNullable<typeof supabase>) {
  const existing = authUrlCompletions.get(url);
  if (existing) {
    return existing;
  }

  const completion = completeAuthFromUrl(url, client).catch((error) => {
    authUrlCompletions.delete(url);
    throw error;
  });
  authUrlCompletions.set(url, completion);
  return completion;
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

      const completed = await completeAuthFromUrl(window.location.href, client);
      if (completed) {
        clearWebAuthUrl();
      }
    }

    async function completePendingNativeAuth(url: string) {
      if (!isAuthCallbackUrl(url)) {
        return false;
      }

      setAuthError(null);
      const completed = await completeAuthFromUrlOnce(url, client);
      if (!completed) {
        return false;
      }

      const { data, error } = await client.auth.getSession();
      if (error) {
        throw error;
      }

      if (!mounted) {
        return true;
      }

      const nextSession = data.session ? toSessionLike(data.session) : null;
      setSession(nextSession);
      setIsLoading(false);
      return true;
    }

    async function loadSession() {
      setAuthError(null);
      if (Platform.OS === "web") {
        await completePendingWebAuth();
      } else {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await completePendingNativeAuth(initialUrl);
        }
      }

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

    const linkingSubscription =
      Platform.OS === "web"
        ? null
        : Linking.addEventListener("url", ({ url }) => {
            completePendingNativeAuth(url).catch((error) => {
              if (!mounted) {
                return;
              }
              setSession(null);
              setProfile(null);
              setIsProfileLoading(false);
              setAuthError(error instanceof Error ? error.message : "Could not complete sign-in");
              setIsLoading(false);
            });
          });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      linkingSubscription?.remove();
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
        },
      });
      if (error) {
        throw error;
      }
      return;
    }

    // Native (Android/iOS): use the native Google account picker via Play
    // Services instead of a browser-based OAuth flow. The Custom Tab web flow
    // renders a blank page in emulators and is fragile on device; native
    // sign-in + signInWithIdToken is Supabase's recommended path for React Native.
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ["profile", "email"],
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    let response;
    try {
      response = await GoogleSignin.signIn();
    } catch (signInError) {
      if (isErrorWithCode(signInError) && signInError.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error("Google sign-in was cancelled");
      }
      throw signInError;
    }

    if (!isSuccessResponse(response)) {
      throw new Error("Google sign-in was cancelled");
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error("Google did not return an ID token");
    }

    const { error: idTokenError } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (idTokenError) {
      throw idTokenError;
    }
    // onAuthStateChange picks up the new session and routes into the app.
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
    if (Platform.OS !== "web") {
      try {
        await GoogleSignin.signOut();
      } catch {
        // ignore — user may not have signed in via Google
      }
    }
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
