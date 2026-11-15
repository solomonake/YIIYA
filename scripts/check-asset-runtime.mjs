import { readFile, access } from "node:fs/promises";
import path from "node:path";

// A successful build in a full checkout can conceal a missing decoder in a
// serverless function. Check the actual deployment trace, not node_modules alone.
for (const route of ["3d/convert", "3d/proxy", "interpret", "interpret/stream"]) {
  const trace = path.resolve(`.next/server/app/api/${route}/route.js.nft.json`);
  const { files } = JSON.parse(await readFile(trace, "utf8"));
  for (const dependency of ["draco3dgltf/draco_decoder_gltf.wasm", "gltf-validator/gltf_validator.dart.js"]) {
    const file = files.find(file => file.endsWith(dependency));
    if (!file) throw new Error(`Asset runtime missing ${dependency} in ${route}`);
    await access(path.resolve(path.dirname(trace), file));
  }
}
console.log("Asset runtime traces include the Draco decoder and glTF validator.");
