// @ts-nocheck
import { NextResponse } from "next/server";
import {
  evaluateProductionReadiness,
  productionReadinessManifest
} from "@/lib/production-readiness";
import { canUseSupabasePublish } from "@/lib/supabase-projects";
import { getScanInfraStatus } from "@/lib/scan-job-store";

export function GET() {
  const scanInfra = getScanInfraStatus();
  const readiness = evaluateProductionReadiness(process.env, {
    supabasePublishConfigured: canUseSupabasePublish()
  });
  const env = readiness.configured;
  const missingCore = readiness.missingCore.map((item) => item.name);
  const missingLab = readiness.missingLab.map((item) => item.name);
  const missingDeploy = readiness.missingDeploy.map((item) => item.name);
  const status = readiness.productionMode && !readiness.coreOk ? 503 : 200;

  return NextResponse.json({
    ok: readiness.coreOk,
    productionMode: readiness.productionMode,
    productionReady: readiness.coreOk,
    coreOk: readiness.coreOk,
    labOk: readiness.labOk,
    deployOk: readiness.deployOk,
    missing: [...missingCore, ...missingLab, ...missingDeploy],
    missingCore,
    missingLab,
    missingDeploy,
    issues: {
      core: readiness.missingCore,
      lab: readiness.missingLab,
      deploy: readiness.missingDeploy
    },
    required: productionReadinessManifest.required,
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
      workerArtifactUploadConfigured: env.SCAN_RECONSTRUCTION_APP_URL,
      webhookSecretsConfigured:
        env.SCAN_RECONSTRUCTION_WEBHOOK_SECRET || env.SCAN_FAL_WEBHOOK_SECRET
    },
    cad: {
      workerConfigured: env.CAD_WORKER_ENDPOINT,
      workerAuthConfigured: env.CAD_WORKER_API_KEY
    }
  }, { status });
}
