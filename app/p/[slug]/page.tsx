import { PublishedProjectView } from "@/components/published-project";

export default function PublishedPage({
  params
}: {
  params: { slug: string };
}) {
  return <PublishedProjectView slug={params.slug} />;
}
