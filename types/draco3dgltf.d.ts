/**
 * Ambient module declaration for `draco3dgltf`.
 *
 * Upstream ships no .d.ts files. We use it via @gltf-transform/extensions'
 * DracoMeshCompression which only needs a runtime handle (the encoder/decoder
 * module factory). Declaring it as a black-box module is enough for the
 * compile to succeed; the actual API surface stays untyped.
 *
 * Reference: https://www.npmjs.com/package/draco3dgltf
 */
declare module "draco3dgltf" {
  type DracoModule = unknown;
  export function createEncoderModule(): Promise<DracoModule>;
  export function createDecoderModule(): Promise<DracoModule>;
  const _default: {
    createEncoderModule: () => Promise<DracoModule>;
    createDecoderModule: () => Promise<DracoModule>;
  };
  export default _default;
}
