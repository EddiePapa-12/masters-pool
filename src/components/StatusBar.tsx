"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatTime, formatCut } from "@/lib/format";

interface Props {
  projectedCut: number;
}

export default function StatusBar({ projectedCut }: Props) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Mirror the 60s refresh cycle — dot goes amber while router.refresh() runs
  useEffect(() => {
    const id = setInterval(() => {
      setIsUpdating(true);
      router.refresh();
      setTimeout(() => {
        setIsUpdating(false);
        setLastUpdated(new Date());
      }, 2000);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="nav-status-bar">
      <span className="nav-live-dot">
        <span className={`dot${isUpdating ? " updating" : ""}`} />
        {isUpdating ? "Updating…" : "Live"}
      </span>
      <span className="nav-last-updated">
        Updated {formatTime(lastUpdated)}
      </span>
      <span className="nav-cut-badge">
        Cut: {formatCut(projectedCut)}
      </span>
    </div>
  );
}
