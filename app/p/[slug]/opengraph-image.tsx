/**
 * Dynamic OG card for /p/[slug].
 * 1200×630 PNG generated at request time via @vercel/og (built into Next 14+).
 *
 * Reference:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */
import { ImageResponse } from "next/og";
import { serviceClient } from "@/lib/supabase-server";

export const runtime = "edge";
export const alt = "YIIYA project";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const client = serviceClient();
  let title = "YIIYA";
  let subtitle = "3D-first design";
  let bg = "#0A0A0A";
  let fg = "#F2F2F2";

  if (client) {
    const { data } = await client
      .from("projects")
      .select("content_json, theme_json")
      .eq("slug", params.slug)
      .maybeSingle();
    const content = (data as { content_json?: { title?: string; description?: string } } | null)?.content_json;
    const theme = (data as { theme_json?: { bg?: string; fg?: string } } | null)?.theme_json;
    if (content?.title) title = String(content.title).slice(0, 60);
    if (content?.description) subtitle = String(content.description).slice(0, 90);
    if (theme?.bg) bg = String(theme.bg);
    if (theme?.fg) fg = String(theme.fg);
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: bg,
          color: fg,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "Inter, system-ui, sans-serif",
          justifyContent: "space-between"
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.6, letterSpacing: 2, textTransform: "uppercase" }}>
          YIIYA
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 28, opacity: 0.75, lineHeight: 1.3 }}>{subtitle}</div>
        </div>
      </div>
    ),
    size
  );
}
