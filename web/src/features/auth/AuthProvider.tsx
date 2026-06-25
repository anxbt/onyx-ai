import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ensureUserProfile, hasSupabaseEnv, supabase } from "@/api/supabase";
import type { SessionLike, UserProfile } from "@/types";

type AuthContextValue = {
  session: SessionLike | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  authError: string | null;
  isPreviewMode: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  completeAuthCallback: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toSessionLike(session: Session): SessionLike {
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

async function ensureProfileForSession(session: SessionLike | null) {
  if (!session) return null;
  return ensureUserProfile(session.user.id, {
    email: session.user.email,
    displayName: session.user.displayName,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  async function refreshProfile() {
    if (!session) {
      setProfile(null);
      return null;
    }

    setIsProfileLoading(true);
    try {
      const nextProfile = await ensureProfileForSession(session);
      setProfile(nextProfile);
      return nextProfile;
    } finally {
      setIsProfileLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    if (!hasSupabaseEnv || !supabase) {
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function loadSession() {
      setAuthError(null);
      const { data, error } = await supabase!.auth.getSession();
      if (error) {
        if (mounted) {
          setAuthError(error.message);
          setIsLoading(false);
        }
        return;
      }

      const nextSession = data.session ? toSessionLike(data.session) : null;
      const nextProfile = await ensureProfileForSession(nextSession).catch((profileError) => {
        if (mounted) {
          setAuthError(profileError instanceof Error ? profileError.message : "Could not load profile");
        }
        return null;
      });

      if (mounted) {
        setSession(nextSession);
        setProfile(nextProfile);
        setIsLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const next = nextSession ? toSessionLike(nextSession) : null;
      setSession(next);
      if (!next) {
        setProfile(null);
        return;
      }

      setIsProfileLoading(true);
      ensureProfileForSession(next)
        .then((nextProfile) => {
          setProfile(nextProfile);
        })
        .catch((error) => {
          setAuthError(error instanceof Error ? error.message : "Could not load profile");
        })
        .finally(() => {
          setIsProfileLoading(false);
        });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      isProfileLoading,
      authError,
      isPreviewMode: !hasSupabaseEnv,
      async signInWithGoogle() {
        if (!supabase) {
          throw new Error("Supabase is not configured");
        }
        setAuthError(null);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      async signInWithEmail(email: string, password: string) {
        if (!supabase) {
          throw new Error("Supabase is not configured");
        }
        setAuthError(null);
        const { error } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password,
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      async signInWithMagicLink(email: string) {
        if (!supabase) {
          throw new Error("Supabase is not configured");
        }
        setAuthError(null);
        const { error } = await supabase.auth.signInWithOtp({
          email: email.toLowerCase(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      async signUpWithEmail(email: string, password: string) {
        if (!supabase) {
          throw new Error("Supabase is not configured");
        }
        setAuthError(null);
        const { data, error } = await supabase.auth.signUp({
          email: email.toLowerCase(),
          password,
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
        return { needsEmailConfirmation: !data.session };
      },
      async signOut() {
        if (!supabase) return;
        setAuthError(null);
        const { error } = await supabase.auth.signOut();
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      async completeAuthCallback() {
        if (!supabase) {
          throw new Error("Supabase is not configured");
        }
        setAuthError(null);
        const current = await supabase.auth.getSession();
        if (current.error) {
          setAuthError(current.error.message);
          throw current.error;
        }
        if (current.data.session) {
          const next = toSessionLike(current.data.session);
          setSession(next);
          setProfile(await ensureProfileForSession(next));
          return;
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setAuthError(error.message);
            throw error;
          }
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setAuthError(error.message);
          throw error;
        }
        const next = data.session ? toSessionLike(data.session) : null;
        setSession(next);
        setProfile(await ensureProfileForSession(next));
      },
      refreshProfile,
    }),
    [authError, isLoading, isProfileLoading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
