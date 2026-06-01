import { describe, expect, it } from "vitest";
import { extractDeterministic, namePlaceholder } from "./company-extractor";

describe("company-extractor", () => {
  it('catches "called X"', () => {
    expect(extractDeterministic("Build a landing page called Mindloop.").companyName).toBe("Mindloop");
  });

  it('catches "X website"', () => {
    expect(extractDeterministic("Make me an Acme Studios website.").companyName).toBe("Acme Studios");
  });

  it('returns null on generic prompts', () => {
    expect(extractDeterministic("A company in Atlanta").companyName).toBe(null);
  });

  it("never returns slop placeholders", () => {
    expect(namePlaceholder("hero-title")).not.toMatch(/A company/i);
    expect(namePlaceholder("hero-title")).toMatch(/\[/);
  });

  it("detects industries", () => {
    expect(extractDeterministic("emergency plumbing service").industry).toBe("home services");
    expect(extractDeterministic("luxury watch brand").industry).toBe("luxury goods");
  });
});
