import type { Metadata } from "next";

import LandingPage from "./landing-page";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: "YIIYA",
    description: "Voice-first 3D asset generation. Say something, get a 3D model.",
    url: absoluteUrl("/"),
    siteName: "YIIYA",
    type: "website"
  }
};

export default function Page() {
  return <LandingPage />;
}
