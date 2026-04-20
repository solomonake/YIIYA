"use client";

import html2canvas from "html2canvas";
import { useYiiyaStore } from "@/lib/store";
import type { PublishedProject } from "@/lib/published-project-types";

const draftStoragePrefix = "yiiya:draft:";
const storagePrefix = "yiiya:published:";

function getSceneCanvasImage() {
  const canvas = document.querySelector<HTMLCanvasElement>(
    "[data-yiiya-scene-canvas='true']"
  );

  if (!canvas) {
    return null;
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function getSanitizedHtmlSnapshot(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("[data-yiiya-id$='-label']")
    .forEach((element) => element.remove());

  clone.querySelectorAll("[data-yiiya-active]").forEach((element) => {
    element.setAttribute("data-yiiya-active", "false");
  });

  if (useYiiyaStore.getState().isGuest) {
    const watermark = document.createElement("div");
    watermark.textContent = "Built with Yiiya guest mode";
    watermark.setAttribute(
      "style",
      "position:fixed;right:16px;bottom:16px;z-index:9999;background:rgba(5,5,5,.82);color:#ededed;border:1px solid rgba(255,255,255,.18);padding:8px 10px;font:600 11px monospace;letter-spacing:.08em;text-transform:uppercase;"
    );
    clone.append(watermark);
  }

  return clone.outerHTML;
}

async function copyShareUrl(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement("input");
  input.value = url;
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

async function publishToSupabase(project: PublishedProject) {
  const response = await fetch("/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(project)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(payload?.error ?? `Cloud publish failed with ${response.status}`);
  }

  return (await response.json()) as PublishedProject;
}

export async function autosaveToSupabase(project: PublishedProject) {
  const response = await fetch("/api/projects/autosave", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(project)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(payload?.error ?? `Autosave failed with ${response.status}`);
  }
}

export async function createCurrentProjectSnapshot(options?: {
  includeCanvasImage?: boolean;
  requireContent?: boolean;
}) {
  const store = useYiiyaStore.getState();
  const root = document.querySelector<HTMLElement>("[data-yiiya-publish-root]");
  const includeCanvasImage = options?.includeCanvasImage ?? true;
  const requireContent = options?.requireContent ?? true;

  if (!root && requireContent) {
    return null;
  }

  const htmlCanvas =
    includeCanvasImage && root
      ? await html2canvas(root, {
          backgroundColor: null,
          scale: Math.min(window.devicePixelRatio || 1, 2),
          useCORS: true
        })
      : null;

  return {
    slug: store.currentProjectSlug,
    htmlSnapshot: root ? getSanitizedHtmlSnapshot(root) : "",
    htmlCanvasImage: htmlCanvas ? htmlCanvas.toDataURL("image/png") : "",
    sceneState: {
      projectName: store.projectName,
      sections: store.sections,
      sceneObjects: store.sceneObjects,
      themeState: store.themeState,
      layers: store.layers,
      selectedElementId: store.selectedElementId,
      sceneCanvasImage: getSceneCanvasImage()
    },
    createdAt: new Date().toISOString()
  } satisfies PublishedProject;
}

export async function autosaveCurrentProject() {
  const project = await createCurrentProjectSnapshot({
    includeCanvasImage: false,
    requireContent: false
  });

  if (!project) {
    return;
  }

  try {
    await autosaveToSupabase(project);
  } catch {
    localStorage.setItem(
      `${draftStoragePrefix}${project.slug}`,
      JSON.stringify(project)
    );
  }
}

export async function publishCurrentProject() {
  const store = useYiiyaStore.getState();
  const project = await createCurrentProjectSnapshot({
    includeCanvasImage: true,
    requireContent: true
  });

  if (!project) {
    store.addLog("[SYSTEM]: Publish failed: no website content found.");
    return null;
  }

  let publishedProject: PublishedProject = project;
  let publishedToCloud = false;

  if (store.isGuest) {
    localStorage.setItem(`${storagePrefix}${project.slug}`, JSON.stringify(project));
    store.addLog("[SYSTEM]: Guest publish stored locally with watermark.");
  } else {
    try {
      publishedProject = await publishToSupabase(project);
      publishedToCloud = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cloud publish unavailable";
      store.addLog(`[SYSTEM]: Publish cloud fallback active. ${message}`);
      localStorage.setItem(`${storagePrefix}${project.slug}`, JSON.stringify(project));
    }
  }

  const shareUrl = `${window.location.origin}/p/${publishedProject.slug}`;

  try {
    await copyShareUrl(shareUrl);
  } catch {
    store.addLog("[SYSTEM]: Published link could not be copied automatically.");
  }

  store.addLog(
    publishedToCloud
      ? `[EXECUTE]: Stored /p/${publishedProject.slug} in Supabase.`
      : `[EXECUTE]: Stored /p/${publishedProject.slug} in local fallback.`
  );
  store.setToastMessage(`Copied ${shareUrl}`);

  window.setTimeout(() => {
    if (useYiiyaStore.getState().toastMessage === `Copied ${shareUrl}`) {
      useYiiyaStore.getState().setToastMessage(null);
    }
  }, 3200);

  return publishedProject;
}

export function readPublishedProject(slug: string) {
  const raw = localStorage.getItem(`${storagePrefix}${slug}`);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PublishedProject;
  } catch {
    return null;
  }
}
