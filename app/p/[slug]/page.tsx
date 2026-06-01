import { PublishedProjectView } from "@/components/published-project";
import { readPublishedProjectFromSupabase } from "@/lib/supabase-projects";
import { buildPublishedMetadata, type PublishedProjectSummary } from "@/lib/seo/metadata";
import { projectJsonLd } from "@/lib/seo/schema-jsonld";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PageParams = { params: { slug: string } };

async function loadSummary(slug: string): Promise<PublishedProjectSummary | null> {
  const project = await readPublishedProjectFromSupabase(slug);
  if (!project) return null;
  // Extract SEO surface from PublishedProject.sceneState — the actual published
  // shape carries name + sections + themeState rather than separate
  // content_json / theme_json columns.
  const sceneState = project.sceneState ?? {
    projectName: "",
    sections: [],
    sceneObjects: [],
    themeState: {},
    layers: [],
    selectedElementId: null,
    sceneCanvasImage: null
  };
  const projectName =
    typeof sceneState.projectName === "string" && sceneState.projectName.trim().length > 0
      ? sceneState.projectName
      : null;
  const sections = Array.isArray(sceneState.sections) ? sceneState.sections : [];
  const hero = sections.find((s): s is Record<string, unknown> => {
    if (!s || typeof s !== "object") return false;
    const sectionType = (s as Record<string, unknown>).sectionType;
    return sectionType === "HERO";
  });
  const heroContent =
    hero && typeof (hero as { content?: unknown }).content === "object"
      ? ((hero as { content: Record<string, unknown> }).content)
      : ({} as Record<string, unknown>);
  const theme =
    sceneState.themeState && typeof sceneState.themeState === "object"
      ? (sceneState.themeState as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return {
    slug,
    title: projectName ?? (heroContent.heading as string | undefined) ?? null,
    description:
      (heroContent.subheading as string | undefined) ??
      (heroContent.description as string | undefined) ??
      null,
    companyName: projectName,
    industry: (heroContent.industry as string | undefined) ?? null,
    primaryColor:
      (theme.primaryAccent as string | undefined) ??
      (theme.accent as string | undefined) ??
      undefined,
    heroImageUrl:
      (heroContent.heroImageUrl as string | undefined) ??
      project.htmlCanvasImage ??
      undefined,
    publishedAt: project.createdAt ?? null
  };
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const summary = await loadSummary(params.slug);
  if (!summary) {
    return { title: "Not found · YIIYA", robots: { index: false, follow: false } };
  }
  return buildPublishedMetadata(summary);
}

export default async function PublishedPage({ params }: PageParams) {
  const project = await readPublishedProjectFromSupabase(params.slug);
  if (!project) notFound();
  const summary = await loadSummary(params.slug);
  const jsonLd = summary ? projectJsonLd(summary) : [];

  return (
    <>
      {jsonLd.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify is safe — schema.org JSON-LD never contains script content.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
      <PublishedProjectView slug={params.slug} initialProject={project} />
    </>
  );
}
