/**
 * Builds the export-format URL map for a generated GLB. Shared between the
 * live pipeline (lib/interpret-pipeline.ts) and the /library screen, which
 * reconstructs the same links for assets loaded back out of Supabase — so a
 * past product downloads exactly the same way a fresh one does.
 */
export type ExportUrls = Partial<Record<"glb" | "obj" | "usd" | "fbx" | "stl", string>>;

export function buildExportUrls(glbUrl: string, opts: { usdzConfigured?: boolean } = {}): ExportUrls {
  if (!glbUrl || glbUrl.includes("placeholder")) return {};

  const enc = encodeURIComponent(glbUrl);
  const urls: ExportUrls = {
    glb: glbUrl,
    obj: `/api/3d/convert?from=${enc}&to=obj`,
    stl: `/api/3d/convert?from=${enc}&to=stl`
  };
  if (opts.usdzConfigured) {
    urls.usd = `/api/3d/convert?from=${enc}&to=usdz`;
  }
  return urls;
}
