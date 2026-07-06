#!/usr/bin/env node
import { readFileSync } from "node:fs";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const manifest = JSON.parse(
  readFileSync(new URL("../config/production-readiness.json", import.meta.url), "utf8")
);

const placeholderPatterns = [
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

const args = new Set(process.argv.slice(2));
const strictLab = args.has("--strict-lab");
const includeDeploy = args.has("--include-deploy");

function hasUsableEnvValue(value) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length <= 8) {
    return false;
  }

  return !placeholderPatterns.some((pattern) => trimmed.includes(pattern));
}

function missing(group) {
  return manifest.required[group].filter((requirement) => !hasUsableEnvValue(process.env[requirement.name]));
}

function printGroup(title, items) {
  if (items.length === 0) {
    console.log(`${title}: ok`);
    return;
  }

  console.log(`${title}: missing ${items.length}`);
  for (const item of items) {
    console.log(`- ${item.name}: ${item.reason}`);
  }
}

const missingCore = missing("core");
const missingLab = missing("lab");
const missingDeploy = missing("deploy");

printGroup("Production core", missingCore);
printGroup("Production lab stack", missingLab);

if (includeDeploy) {
  printGroup("Production deploy metadata", missingDeploy);
}

const shouldFail =
  missingCore.length > 0 ||
  (strictLab && missingLab.length > 0) ||
  (includeDeploy && missingDeploy.length > 0);

if (shouldFail) {
  console.error(
    strictLab
      ? "Production readiness failed."
      : "Production core readiness failed. Use --strict-lab to require the full 3D/scan/CAD lab stack."
  );
  process.exit(1);
}

console.log("Production readiness passed.");
