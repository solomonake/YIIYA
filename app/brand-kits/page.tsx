import type { Metadata } from "next";
import { BrandKitsClient } from "./brand-kits-client";

export const metadata: Metadata = {
  title: "Brand Kits · YIIYA",
  description: "Upload your logo, palette, and fonts once — every generation will respect it.",
  robots: { index: false, follow: false }
};

export default function BrandKitsPage() {
  return <BrandKitsClient />;
}
