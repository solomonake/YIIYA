declare module "gltf-validator" {
  export function version(): string;
  export function validateBytes(bytes: Uint8Array, options: {
    format: string; maxIssues: number; writeTimestamp: boolean;
    externalResourceFunction: (uri: string) => Promise<Uint8Array>;
  }): Promise<{ issues: { numErrors: number; numWarnings: number; messages: { code: string; severity: number }[] } }>;
}
