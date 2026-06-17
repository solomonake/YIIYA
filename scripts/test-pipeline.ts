import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { runInterpretPipeline } from "./lib/interpret-pipeline";

async function runTest() {
  console.log("Starting pipeline test...");
  
  const generator = runInterpretPipeline({
    transcript: "a cool retro car",
    activeElementId: null,
    image_mode: "3d", // Forces SPATIAL intent
  });

  for await (const event of generator) {
    if (event.type === "router" || event.type === "qa" || event.type === "error" || event.type === "actions") {
      console.log(JSON.stringify(event, null, 2));
    }
  }
}

runTest().catch(console.error);
