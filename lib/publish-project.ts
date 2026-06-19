// @ts-nocheck
"use client";

import html2canvas from "html2canvas";
import JSZip from "jszip";
import { getCurrentSupabaseUserId } from "@/lib/project-persistence";
import { createProjectSlug } from "@/lib/project-slug";
import { useYiiyaStore } from "@/lib/store";
import type { PublishedProject } from "@/lib/published-project-types";

const draftStoragePrefix = "yiiya:draft:";
const storagePrefix = "yiiya_pub_";

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

  const store = useYiiyaStore.getState();
  const shouldWatermark = store.isGuest || !store.isPro;

  if (shouldWatermark) {
    const watermark = document.createElement("div");
    watermark.textContent = "Built with Yiiya";
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  return url;
}

function generateReactExport(project: PublishedProject) {
  const sectionJson = JSON.stringify(project.sceneState.sections, null, 2);
  const sceneJson = JSON.stringify(project.sceneState.sceneObjects, null, 2);
  const themeJson = JSON.stringify(project.sceneState.themeState, null, 2);

  return `import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const sections = ${sectionJson};
const sceneObjects = ${sceneJson};
const theme = ${themeJson};

function SceneComponent() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 60 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <pointLight position={[-3, 2.4, 3]} intensity={1.4} />
      {sceneObjects.map((object: any) => (
        <mesh key={object.id} position={object.position ?? [0, 0, 0]} scale={object.scale ?? [1, 1, 1]}>
          {object.shape === "box" ? <boxGeometry args={[1.4, 1.4, 1.4]} /> : <sphereGeometry args={[0.72, 48, 48]} />}
          <meshStandardMaterial color={object.color ?? "#EF9F27"} metalness={0.35} roughness={0.32} />
        </mesh>
      ))}
      <OrbitControls enablePan={false} maxDistance={12} />
    </Canvas>
  );
}

export default function YiiyaExport() {
  return (
    <main
      className="min-h-screen"
      style={{
        "--yiiya-bg": theme.background,
        "--yiiya-fg": theme.foreground,
        "--yiiya-accent": theme.primaryAccent,
        background: theme.background,
        color: theme.foreground
      } as React.CSSProperties}
    >
      <div className="fixed inset-0 pointer-events-none">
        <SceneComponent />
      </div>
      <div className="relative z-10">
        {sections.map((section: any) => (
          <section key={section.id} className="px-10 py-20">
            <h1 className="text-6xl font-bold leading-none">{section.content?.heading ?? section.content?.title ?? section.sectionType}</h1>
            <p className="mt-6 max-w-2xl text-lg opacity-70">{section.content?.subtext ?? section.content?.description ?? ""}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
`;
}

async function generateZip(project: PublishedProject, reactCode: string) {
  const zip = new JSZip();
  zip.file("app/page.tsx", reactCode);
  zip.file(
    "package.json",
    JSON.stringify(
      {
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start"
        },
        dependencies: {
          "@react-three/drei": "^9.122.0",
          "@react-three/fiber": "^8.17.10",
          next: "^14.2.24",
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          three: "^0.171.0",
          tailwindcss: "^3.4.17"
        }
      },
      null,
      2
    )
  );
  zip.file(
    "tailwind.config.js",
    'module.exports = { content: ["./app/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };\n'
  );
  zip.file(
    "README.md",
    `# Yiiya Export: ${project.slug}\n\n1. Run \`npm install\`.\n2. Run \`npm run dev\` to preview locally.\n3. Push to GitHub and import the repo into Vercel.\n`
  );

  return zip.generateAsync({ type: "blob" });
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
    userId: null,
    isPro: store.isPro,
    htmlSnapshot: root ? getSanitizedHtmlSnapshot(root) : "",
    htmlCanvasImage: htmlCanvas ? htmlCanvas.toDataURL("image/png") : "",
    sceneState: {
      projectName: store.projectName,
      sections: store.sections,
      sceneObjects: store.sceneObjects,
      themeState: store.themeState,
      layers: store.layers,
      selectedElementId: store.selectedElementId,
      sceneCanvasImage: getSceneCanvasImage(),
      showWatermark: store.isGuest || !store.isPro
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
  const snapshot = await createCurrentProjectSnapshot({
    includeCanvasImage: true,
    requireContent: true
  });

  if (!snapshot) {
    store.addLog("[SYSTEM]: Publish failed: no website content found.");
    return null;
  }

  const project: PublishedProject = {
    ...snapshot,
    slug: createProjectSlug(),
    userId: store.isGuest ? null : await getCurrentSupabaseUserId(),
    isPro: store.isPro,
    sceneState: {
      ...snapshot.sceneState,
      showWatermark: store.isGuest || !store.isPro
    }
  };
  const reactCode = generateReactExport(project);
  const zipBlob = await generateZip(project, reactCode);
  const zipUrl = downloadBlob(zipBlob, `yiiya-${project.slug}.zip`);
  project.reactCode = reactCode;
  project.zipUrl = zipUrl;

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
  store.setPublishResult(project);

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
