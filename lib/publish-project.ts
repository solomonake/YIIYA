"use client";

import html2canvas from "html2canvas";
import { useYiiyaStore } from "@/lib/store";
import type { PublishedProject } from "@/lib/published-project-types";

const storagePrefix = "yiiya:published:";

function createSlug() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

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

export async function publishCurrentProject() {
  const store = useYiiyaStore.getState();
  const root = document.querySelector<HTMLElement>("[data-yiiya-publish-root]");

  if (!root) {
    store.addLog("Publish failed: no website content found");
    return null;
  }

  const slug = createSlug();
  const htmlCanvas = await html2canvas(root, {
    backgroundColor: null,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true
  });
  const project: PublishedProject = {
    slug,
    htmlSnapshot: getSanitizedHtmlSnapshot(root),
    htmlCanvasImage: htmlCanvas.toDataURL("image/png"),
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
  };

  let publishedProject = project;
  let publishedToCloud = false;

  try {
    publishedProject = await publishToSupabase(project);
    publishedToCloud = true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud publish unavailable";
    store.addLog(`PUBLISH: Cloud fallback active. ${message}`);
    localStorage.setItem(`${storagePrefix}${slug}`, JSON.stringify(project));
  }

  const shareUrl = `${window.location.origin}/p/${publishedProject.slug}`;

  try {
    await copyShareUrl(shareUrl);
  } catch {
    store.addLog("Published link could not be copied automatically");
  }

  store.addLog(
    publishedToCloud
      ? `PUBLISH: Stored /p/${publishedProject.slug} in Supabase.`
      : `PUBLISH: Stored /p/${publishedProject.slug} in local fallback.`
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
