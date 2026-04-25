import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Group, Object3D } from "three";

const exportState: {
  root: Group | null;
  objects: Map<string, Object3D>;
} = {
  root: null,
  objects: new Map<string, Object3D>()
};

export type ExportTarget = "scene" | "latest";

export function registerExportRoot(root: Group | null) {
  exportState.root = root;
}

export function registerExportObject(id: string, object: Object3D | null) {
  if (!object) {
    exportState.objects.delete(id);
    return;
  }

  exportState.objects.set(id, object);
}

function downloadJsonResult(result: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(result)], {
    type: "model/gltf-binary"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function exportSpatialTarget(target: ExportTarget, latestObjectId?: string) {
  const exporter = new GLTFExporter();
  const object =
    target === "latest" && latestObjectId
      ? exportState.objects.get(latestObjectId) ?? null
      : exportState.root;

  if (!object) {
    throw new Error("Nothing is ready to export yet.");
  }

  exporter.parse(
    object,
    (result) => {
      downloadJsonResult(
        result,
        target === "latest" ? "yiiya-object.gltf" : "yiiya-scene.gltf"
      );
    },
    (error) => {
      throw error;
    },
    { binary: false }
  );
}
