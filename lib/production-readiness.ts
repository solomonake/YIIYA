import manifest from "@/config/production-readiness.json";

export type ProductionReadinessGroup = keyof typeof manifest.required;

export type ProductionReadinessRequirement = {
  name: string;
  label: string;
  reason: string;
};

export type ProductionReadinessIssue = ProductionReadinessRequirement & {
  group: ProductionReadinessGroup;
};

type Environment = Record<string, string | undefined>;

const PLACEHOLDER_PATTERNS = [
  "your_",
  "YOUR_",
  "placeholder",
  "PLACEHOLDER",
  "changeme",
  "CHANGE_ME",
  "example",
  "<your",
  "..."
];

export const productionReadinessManifest = manifest as {
  required: Record<ProductionReadinessGroup, ProductionReadinessRequirement[]>;
};

export function hasUsableEnvValue(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length <= 8) {
    return false;
  }

  return !PLACEHOLDER_PATTERNS.some((pattern) => trimmed.includes(pattern));
}

export function envConfiguredMap(env: Environment = process.env) {
  return Object.fromEntries(
    Object.values(productionReadinessManifest.required)
      .flat()
      .map((requirement) => [requirement.name, hasUsableEnvValue(env[requirement.name])])
  ) as Record<string, boolean>;
}

export function missingProductionRequirements(
  group: ProductionReadinessGroup,
  env: Environment = process.env
) {
  return productionReadinessManifest.required[group].filter(
    (requirement) => !hasUsableEnvValue(env[requirement.name])
  );
}

export function evaluateProductionReadiness(
  env: Environment = process.env,
  options: { supabasePublishConfigured?: boolean } = {}
) {
  const missingCore = missingProductionRequirements("core", env);
  const missingLab = missingProductionRequirements("lab", env);
  const missingDeploy = missingProductionRequirements("deploy", env);
  const supabasePublishConfigured = options.supabasePublishConfigured ?? true;
  const supabasePublishIssue: ProductionReadinessIssue[] = supabasePublishConfigured
    ? []
    : [
        {
          group: "core",
          name: "SUPABASE_SERVICE_ROLE_KEY",
          label: "Supabase publish readiness",
          reason: "Supabase publish helper rejected the configured Supabase service settings."
        }
      ];

  const coreIssues = [
    ...missingCore.map((requirement) => ({ ...requirement, group: "core" as const })),
    ...supabasePublishIssue
  ];

  return {
    productionMode: env.NODE_ENV === "production",
    coreOk: coreIssues.length === 0,
    labOk: missingLab.length === 0,
    deployOk: missingDeploy.length === 0,
    missingCore: coreIssues,
    missingLab: missingLab.map((requirement) => ({ ...requirement, group: "lab" as const })),
    missingDeploy: missingDeploy.map((requirement) => ({
      ...requirement,
      group: "deploy" as const
    })),
    configured: envConfiguredMap(env)
  };
}
