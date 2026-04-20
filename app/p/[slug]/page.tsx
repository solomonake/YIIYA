import { PublishedProjectView } from "@/components/published-project";
import { readPublishedProjectFromSupabase } from "@/lib/supabase-projects";

export default async function PublishedPage({
  params
}: {
  params: { slug: string };
}) {
  const project = await readPublishedProjectFromSupabase(params.slug);

  return <PublishedProjectView slug={params.slug} initialProject={project} />;
}
