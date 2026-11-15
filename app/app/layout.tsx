import type { Metadata } from "next";
import type { ReactNode } from "react";

import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl("/app") },
  openGraph: {
    title: "YIIYA",
    description: "Voice-first 3D asset generation. Say something, get a 3D model.",
    url: absoluteUrl("/app"),
    siteName: "YIIYA",
    type: "website"
  }
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return children;
}
