import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { buildPublishedMetadata } from "@/lib/seo/metadata";
import { projectJsonLd } from "@/lib/seo/schema-jsonld";

import {
  DEFAULT_SITE_URL,
  absoluteUrl,
  indexablePages,
  siteUrl,
  upsertCanonicalTags
} from "./site-url.mjs";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("siteUrl", () => {
  it("defaults to the live deployment when the setting is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    expect(absoluteUrl("/")).toBe("https://yiiya.vercel.app");
    expect(absoluteUrl("/app")).toBe("https://yiiya.vercel.app/app");
  });

  it("uses a configured origin and ignores a trailing slash or path", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://studio.example/ignored/";
    expect(siteUrl()).toBe("https://studio.example");
    expect(absoluteUrl("/photo-studio")).toBe("https://studio.example/photo-studio");
  });

  it("ignores a malformed setting", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
  });
});

describe("search documents", () => {
  it("lists only the real public pages and omits the Host directive", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const robot = robots();
    expect(robot.host).toBeUndefined();
    expect(robot.sitemap).toBe("https://yiiya.vercel.app/sitemap.xml");
    expect(JSON.stringify(robot)).not.toContain("gallery");

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      "https://yiiya.vercel.app",
      "https://yiiya.vercel.app/app",
      "https://yiiya.vercel.app/photo-studio",
      "https://yiiya.vercel.app/photo-studio/mug",
      "https://yiiya.vercel.app/research/mug"
    ]);
  });

  it("points published-project metadata at the same origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const project = {
      slug: "mug",
      title: "Mug",
      description: null,
      companyName: null,
      industry: null,
      publishedAt: null
    };
    const meta = buildPublishedMetadata(project);
    expect(meta.alternates?.canonical).toBe("https://yiiya.vercel.app/p/mug");
    expect(projectJsonLd(project)[2]).toMatchObject({
      itemListElement: [
        { item: "https://yiiya.vercel.app" },
        { item: "https://yiiya.vercel.app/p/mug" }
      ]
    });
  });

  it("keeps canonical tags in the static photo documents on the default origin", () => {
    for (const page of indexablePages) {
      if (!page.document) continue;
      const html = readFileSync(page.document, "utf8");
      const canonical = `${DEFAULT_SITE_URL}${page.path}`;
      expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(html).toContain(`<meta property="og:url" content="${canonical}">`);
      expect(html.indexOf('rel="canonical"')).toBeLessThan(html.toLowerCase().indexOf("</head>"));
    }
  });

  it("rewrites a static document from the site setting", () => {
    const next = upsertCanonicalTags(
      "<head><link rel=\"canonical\" href=\"https://old.example/photo-studio\"><meta property=\"og:url\" content=\"https://old.example/photo-studio\"></head>",
      "https://studio.example/photo-studio"
    );
    expect(next).toContain('href="https://studio.example/photo-studio"');
    expect(next).not.toContain("old.example");
    expect(upsertCanonicalTags(next, "https://studio.example/photo-studio")).toBe(next);
  });
});

describe("dead host", () => {
  it("is not hardcoded in the site, config, or public documents", () => {
    const needle = Buffer.from("yiiya" + ".app");
    const hits: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        const stat = statSync(path);
        if (stat.isDirectory()) {
          walk(path);
          continue;
        }
        if (stat.size > 1_000_000) continue;
        if (readFileSync(path).includes(needle)) hits.push(path);
      }
    }

    for (const root of ["app", "lib", "public", "scripts", "components", "config", ".github"]) {
      walk(root);
    }
    for (const file of [".env.example", "package.json", "next.config.mjs", "middleware.ts"]) {
      if (readFileSync(file).includes(needle)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
