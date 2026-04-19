"use client";

import { useYiiyaStore } from "@/lib/store";

export function Toast() {
  const toastMessage = useYiiyaStore((state) => state.toastMessage);

  if (!toastMessage) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full border border-amber/40 bg-[#11110f]/95 px-5 py-3 text-sm font-medium text-bone shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      {toastMessage}
    </div>
  );
}
