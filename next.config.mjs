import path from "node:path";
import { fileURLToPath } from "node:url";

let withSentryConfig = (config) => config;
try {
  const sentry = await import("@sentry/nextjs");
  withSentryConfig = sentry.withSentryConfig;
} catch { /* Sentry not installed or corrupted — run without it */ }

const dirname = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), xr-spatial-tracking=(self)" },
  {
    key: "Content-Security-Policy",
    // 'unsafe-eval' required by Three.js WASM shaders.
    // blob: required for Vercel Blob GLB streaming.
    // *.hf.space + *.tripo3d.ai = our 3D providers.
    // *.supabase.co = realtime + storage.
    // *.sentry.io = telemetry. plausible.io = analytics.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io https://*.sentry.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com https://*.fontsource.org",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "connect-src 'self' data: blob: https: wss://*.supabase.co https://*.hf.space https://*.tripo3d.ai https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com https://*.sentry.io https://plausible.io",
      "frame-src 'self' https://huggingface.co",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests"
    ].join("; ")
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: true,
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "@gltf-transform/core",
      "@gltf-transform/functions",
      "@opentelemetry/sdk-node",
      "@opentelemetry/api",
      "@opentelemetry/resources",
      "@opentelemetry/semantic-conventions",
      "@opentelemetry/exporter-trace-otlp-http"
    ]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.hf.space" },
      { protocol: "https", hostname: "huggingface.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.tripo-data.cdn.bcebos.com" },
      { protocol: "https", hostname: "*.supabase.co" }
    ]
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "three$": path.join(dirname, "node_modules/three/build/three.module.js")
    };
    config.module.rules.push({ test: /\.(glsl|vs|fs|vert|frag)$/, type: "asset/source" });
    return config;
  }
};

const sentryWebpackPluginOptions = {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  reactComponentAnnotation: { enabled: true },
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
