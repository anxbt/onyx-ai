import { useEffect, useMemo, useState } from "react";

import { fetchConversationsForUser } from "@/lib/supabase";
import type { Conversation } from "@/types";

export function useConversations(userId?: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);
    fetchConversationsForUser(userId)
      .then((rows) => {
        if (mounted) {
          setConversations(rows);
        }
      })
      .catch((nextError) => {
        if (mounted) {
          setError(nextError instanceof Error ? nextError.message : "Could not load history");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

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
  };
}
