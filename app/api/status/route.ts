import { NextResponse } from "next/server";
import { canUseSupabasePublish } from "@/lib/supabase-projects";
import { getScanInfraStatus } from "@/lib/scan-job-store";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "FAL_KEY",
  "UNSPLASH_ACCESS_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "SCAN_RECONSTRUCTION_ENDPOINT",
  "SCAN_RECONSTRUCTION_API_KEY",
  "SCAN_RECONSTRUCTION_WEBHOOK_SECRET",
  "SCAN_FAL_WEBHOOK_SECRET"
] as const;

function hasUsableValue(value: string | undefined) {
  return Boolean(
    value &&
      !value.includes("your_") &&
      !value.includes("YOUR_") &&
      value.trim().length > 8
  );
}

export function GET() {
  const env = Object.fromEntries(
    requiredEnv.map((name) => [name, hasUsableValue(process.env[name])])
  ) as Record<(typeof requiredEnv)[number], boolean>;
  const missing = requiredEnv.filter((name) => !env[name]);
  const scanInfra = getScanInfraStatus();

  return NextResponse.json({
    ok: missing.length === 0 && canUseSupabasePublish(),
    missing,
    ai: {
      conductor: {
        model: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
        configured: env.GEMINI_API_KEY
      },
      creativeDirector: {
        model:
          process.env.GEMINI_CREATIVE_MODEL ??
          process.env.GEMINI_3_CREATIVE_MODEL ??
          process.env.GEMINI_FLASH_MODEL ??
          "gemini-2.5-flash",
        configured: env.GEMINI_API_KEY
      },
      researcher: {
        model: process.env.GEMINI_RESEARCH_MODEL ?? process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
        configured: env.GEMINI_API_KEY
      },
      architect: {
        model: process.env.ANTHROPIC_ARCHITECT_MODEL ?? "claude-3-5-sonnet-20241022",
        configured: env.ANTHROPIC_API_KEY
      },
      critic: {
        model: process.env.ANTHROPIC_CRITIC_MODEL ?? "claude-3-5-haiku-20241022",
        configured: env.ANTHROPIC_API_KEY
      },
      alchemist: {
        model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
        configured: env.OPENAI_API_KEY
      },
      trellis: {
        model: process.env.FAL_TRELLIS_MODEL ?? "fal-ai/trellis-2",
        configured: env.FAL_KEY
      },
      unsplashConfigured: env.UNSPLASH_ACCESS_KEY
    },
    supabase: {
      publishConfigured: canUseSupabasePublish(),
      publicUrlConfigured: env.NEXT_PUBLIC_SUPABASE_URL,
      anonKeyConfigured: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleConfigured: env.SUPABASE_SERVICE_ROLE_KEY
    },
    scan: {
      storageConfigured: scanInfra.blobConfigured,
      persistenceConfigured: scanInfra.supabaseConfigured,
      reconstructionConfigured: scanInfra.modalConfigured,
      falFallbackConfigured: scanInfra.falConfigured,
      webhookSecretsConfigured:
        env.SCAN_RECONSTRUCTION_WEBHOOK_SECRET || env.SCAN_FAL_WEBHOOK_SECRET
    }
  });
}
