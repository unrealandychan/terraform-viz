"use client";
import { useState, useEffect } from "react";
import { isApproachingQuota } from "@/lib/plan-store";

export function StorageWarningBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isApproachingQuota());
  }, []);

  if (!show) return null;

  return (
    <div className="storage-warning" role="alert">
      <span>⚠️ Storage is nearly full. Older plans may be removed automatically.</span>
      <button onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}
