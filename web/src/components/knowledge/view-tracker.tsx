"use client";

import { useEffect } from "react";
import { markViewedAction } from "@/app/actions";

/** 頁面真的被打開（不是被預先抓取）時記一次瀏覽 */
export function ViewTracker({ nodeId }: { nodeId: string }) {
  useEffect(() => {
    void markViewedAction(nodeId);
  }, [nodeId]);
  return null;
}
