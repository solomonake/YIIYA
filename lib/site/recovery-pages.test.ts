import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RouteError from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound, { metadata as notFoundMetadata } from "@/app/not-found";
import { indexablePages } from "@/lib/seo/site";

import { recoveryLinks } from "./recovery-links";

const EM_DASH = String.fromCharCode(0x2014);

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function failure(message: string, digest?: string): Error & { digest?: string } {
  const error: Error & { digest?: string } = new Error(message);
  if (digest) error.digest = digest;
  return error;
}

describe("recovery links", () => {
  it("only point at real public pages", () => {
    const real = new Set(indexablePages.map((page) => page.path));
    for (const link of recoveryLinks) {
      expect(real.has(link.href), `${link.href} is not a listed public page`).toBe(true);
      expect(link.label.trim()).not.toBe("");
      expect(link.description.trim()).not.toBe("");
    }
  });

  it("offer the home page and both creation paths once each", () => {
    const hrefs = recoveryLinks.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/app", "/photo-studio"]));
  });
});

describe("not-found page", () => {
  const html = renderToStaticMarkup(createElement(NotFound));

  it("has one main landmark, one top heading and a way to every recovery link", () => {
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain("This page is not here.");
    for (const link of recoveryLinks) {
      expect(html).toContain(`<a href="${link.href}"`);
      expect(html).toContain(link.label);
    }
  });

  it("names itself in the tab title and uses no em dash", () => {
    expect(String(notFoundMetadata.title)).toMatch(/not found/i);
    expect(html).not.toContain(EM_DASH);
  });
});

describe("route error boundary", () => {
  it("announces the failure, offers a retry and hides the error message", () => {
    const html = renderToStaticMarkup(
      createElement(RouteError, {
        error: failure("secret upstream detail at /internal/path", "digest-1234"),
        reset: () => undefined
      })
    );
    expect(html).toContain('role="alert"');
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<button type="button"[^>]*>Try again<\/button>/);
    expect(html).toContain("digest-1234");
    expect(html).not.toContain("secret upstream detail");
    expect(html).not.toContain("/internal/path");
    expect(html).not.toContain(EM_DASH);
    for (const link of recoveryLinks) {
      expect(html).toContain(`<a href="${link.href}"`);
    }
  });

  it("omits the reference line when the framework gives no digest", () => {
    const html = renderToStaticMarkup(
      createElement(RouteError, { error: failure("boom"), reset: () => undefined })
    );
    expect(html).not.toContain("Reference:");
    expect(html).not.toContain("boom");
  });
});

describe("global error boundary", () => {
  it("renders a complete document with a retry and a link home", () => {
    const html = renderToStaticMarkup(
      createElement(GlobalError, {
        error: failure("layout exploded: token abc", "digest-9"),
        reset: () => undefined
      })
    );
    expect(html.startsWith('<html lang="en">')).toBe(true);
    expect(html).toContain("<body");
    expect(html).toContain('role="alert"');
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<button type="button"[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<a href="\/"[^>]*>Reload the home page<\/a>/);
    expect(html).toContain("digest-9");
    expect(html).not.toContain("layout exploded");
    expect(html).not.toContain(EM_DASH);
  });
});
