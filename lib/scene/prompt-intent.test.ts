import { describe, expect, it } from "vitest";
import { classifyPromptSubject, objectGenerationPrompt } from "./prompt-intent";

describe("prompt-intent", () => {
  it("treats a simple noun prompt as a physical object", () => {
    const intent = classifyPromptSubject("A car");

    expect(intent.kind).toBe("object");
    expect(intent.subject).toBe("car");
    expect(intent.generationPrompt).toContain("physical 3D object");
    expect(intent.generationPrompt).toContain("not text");
    expect(intent.generationPrompt).toContain("not letters");
  });

  it("keeps explicit word requests as typography", () => {
    const intent = classifyPromptSubject('Make me a 3D image of the word "A car"');

    expect(intent.kind).toBe("typographic");
    expect(intent.subject).toBe("A car");
    expect(intent.generationPrompt).toContain("typography");
  });

  it("does not turn object prompts into word art when generating provider prompts", () => {
    expect(objectGenerationPrompt("make me a 3d model of a red truck")).toContain(
      "real object"
    );
  });
});
