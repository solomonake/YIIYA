/** Verified against stabilityai/stable-fast-3d revision 1b61bd1, 2026-11-06.
 * requires_bg_remove initializes session state; run_button actually generates.
 * Full positional inputs include the hidden button and state omitted by /info.
 */
type Predict = (endpoint: string, data: Record<string, unknown> | unknown[]) => Promise<{ data: unknown }>;

function action(data: unknown): "Run" | "Remove Background" {
  const button = Array.isArray(data) ? data[0] : null;
  const value = typeof button === "string" ? button : button && typeof button === "object" && "value" in button ? button.value : null;
  if (value === "Run" || value === "Remove Background") return value;
  throw new Error("Stable Fast 3D returned an unsupported preparation state");
}

export async function generateStableFast3d(predict: Predict, image: Blob, foregroundRatio = 0.85): Promise<{ data: unknown }> {
  if (!Number.isFinite(foregroundRatio) || foregroundRatio < 0.5 || foregroundRatio > 1) {
    throw new Error("Stable Fast 3D foreground ratio must be between 0.5 and 1");
  }
  const prepared = await predict("/requires_bg_remove", { image, fr: foregroundRatio });
  let next = action(prepared.data);
  // Keep one Gradio client/session across all three steps so background_state survives.
  const args = (button: string) => [button, image, null, foregroundRatio, "None", -1, 1024];
  if (next === "Remove Background") {
    next = action((await predict("/run_button", args("Remove Background"))).data);
    if (next !== "Run") throw new Error("Stable Fast 3D did not finish background preparation");
  }
  return predict("/run_button", args("Run"));
}
