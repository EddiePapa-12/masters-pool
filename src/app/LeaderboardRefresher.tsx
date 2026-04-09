"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible client component that triggers router.refresh() every 60 seconds,
 * causing the Server Component leaderboard to re-fetch without a full page reload.
 * Also manages the "Scores updating…" banner and amber dot state.
 */
export default function LeaderboardRefresher() {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setIsUpdating(true);
      router.refresh();
      // Clear the updating banner after 3 seconds
      setTimeout(() => setIsUpdating(false), 3000);
    }, 60_000);

    return () => clearInterval(id);
  }, [router]);

  if (!isUpdating) return null;

  return (
    <div className="updating-banner">
      Scores updating…
    </div>
  );
}
