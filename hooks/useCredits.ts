import { useEffect, useState } from "react";

import { TOP_UP_PACKS } from "@/constants/models";
import { fetchCreditTransactions, fetchProfile } from "@/lib/supabase";
import type { CreditTransaction } from "@/types";

export function useCredits(userId?: string) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!userId) {
      setBalance(0);
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [profile, nextTransactions] = await Promise.all([
        fetchProfile(userId),
        fetchCreditTransactions(userId),
      ]);
      setBalance(profile?.creditBalance ?? 0);
      setTransactions(nextTransactions);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load credits");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  return {
    balance,
    transactions,
    packages: TOP_UP_PACKS,
    isLoading,
    error,
    refresh,
  };
}
