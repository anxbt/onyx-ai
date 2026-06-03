import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchConversationsForUser } from "@/lib/supabase";
import type { Conversation } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;

export function useConversations(userId?: string, authReady: boolean = true) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this triggers a re-fetch from the user-facing retry button.
  const [refetchCounter, setRefetchCounter] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId || !authReady) {
      // No user or auth still resolving — clear state, don't fire a fetch.
      setConversations([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Couldn't load chats. Tap to retry.")),
        FETCH_TIMEOUT_MS,
      );
    });

    Promise.race([fetchConversationsForUser(userId), timeoutPromise])
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;
        setConversations(rows as Conversation[]);
      })
      .catch((nextError: unknown) => {
        if (cancelled || !mountedRef.current) return;
        setError(
          nextError instanceof Error ? nextError.message : "Could not load history",
        );
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, authReady, refetchCounter]);

  const refetch = useCallback(() => {
    setRefetchCounter((n) => n + 1);
  }, []);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      return [conversation.title, conversation.preview].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [conversations, searchQuery]);

  return {
    conversations: filteredConversations,
    searchQuery,
    setSearchQuery,
    setConversations,
    isLoading,
    error,
    refetch,
  };
}
