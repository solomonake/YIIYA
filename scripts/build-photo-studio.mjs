import { build } from "esbuild";

await build({
  entryPoints: ["features/photo-studio/studio.mjs", "features/photo-studio/mug.mjs"],
  outdir: "public/photo-lab",
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  legalComments: "inline",
});
