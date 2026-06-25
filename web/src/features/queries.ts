import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchConversationsForUser,
  fetchCreditTransactions,
  fetchModelCatalog,
  fetchProfile,
  fetchUsageForCurrentMonth,
} from "@/api/supabase";

export const queryKeys = {
  profile: (userId?: string) => ["profile", userId] as const,
  conversations: (userId?: string, search = "") => ["conversations", userId, search] as const,
  usage: (userId?: string) => ["usage", userId] as const,
  transactions: (userId?: string) => ["transactions", userId] as const,
  modelCatalog: () => ["modelCatalog"] as const,
};

export function useProfileQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => fetchProfile(userId as string),
    enabled: Boolean(userId),
  });
}

export function useConversationsQuery(userId?: string, search = "") {
  return useQuery({
    queryKey: queryKeys.conversations(userId, search),
    queryFn: () => fetchConversationsForUser(userId as string, search),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  });
}

export function useUsageQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.usage(userId),
    queryFn: () => fetchUsageForCurrentMonth(userId as string),
    enabled: Boolean(userId),
  });
}

export function useTransactionsQuery(userId?: string) {
  return useQuery({
    queryKey: queryKeys.transactions(userId),
    queryFn: () => fetchCreditTransactions(userId as string),
    enabled: Boolean(userId),
  });
}

export function useModelCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.modelCatalog(),
    queryFn: fetchModelCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
