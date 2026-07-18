/**
 * Server wrapper for the public 3D viewer. Its only job is to emit per-share
 * OpenGraph/Twitter metadata so a pasted /view link unfurls with the asset's
 * name and a preview card in iMessage/Discord/Slack (the OG image is inherited
 * from the root app/opengraph-image). The interactive model-viewer lives in the
 * client component below.
 */
import type { Metadata } from "next";
import ViewerRoot from "./viewer";

type SearchParams = Record<string, string | string[] | undefined>;

export function generateMetadata({
  searchParams
}: {
  searchParams: SearchParams;
}): Metadata {
  const raw = searchParams.name;
  const name = (typeof raw === "string" ? raw : "3D asset").slice(0, 80);
  const title = `${name} · YIIYA`;
  const description =
    "Spin it, drop it into your space in AR — a 3D asset made just by saying it. Make your own with YIIYA.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description }
  };
}

export default function ViewPage() {
  return <ViewerRoot />;
}
