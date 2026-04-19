"use client";

import { useEffect, useRef, useState } from "react";
import { useYiiyaStore } from "@/lib/store";

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function readImageAsReference(file: File) {
  return new Promise<{ base64: string; mediaType: string; name: string }>(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;

        if (typeof result !== "string") {
          reject(new Error("Unable to read image"));
          return;
        }

        const [, base64 = ""] = result.split(",");
        resolve({
          base64,
          mediaType: file.type || "image/png",
          name: file.name
        });
      };

      reader.onerror = () => reject(new Error("Unable to read image"));
      reader.readAsDataURL(file);
    }
  );
}

export function ReferenceImageDropzone() {
  const [isDraggingImage, setDraggingImage] = useState(false);
  const dragDepthRef = useRef(0);
  const setReferenceImage = useYiiyaStore((state) => state.setReferenceImage);
  const addLog = useYiiyaStore((state) => state.addLog);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setDraggingImage(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

      if (dragDepthRef.current === 0) {
        setDraggingImage(false);
      }
    };

    const handleDrop = async (event: DragEvent) => {
      if (!hasDraggedFiles(event)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setDraggingImage(false);

      const image = Array.from(event.dataTransfer?.files ?? []).find((file) =>
        file.type.startsWith("image/")
      );

      if (!image) {
        addLog("Drop ignored: no image file found");
        return;
      }

      try {
        const referenceImage = await readImageAsReference(image);
        setReferenceImage(referenceImage);
        addLog(`Reference image attached: ${image.name}`);
      } catch (error) {
        addLog(error instanceof Error ? error.message : "Unable to read image");
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [addLog, setReferenceImage]);

  if (!isDraggingImage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/88 text-bone backdrop-blur-xl">
      <div className="rounded-full border border-amber/50 bg-[#11110f]/90 px-7 py-4 text-lg font-semibold shadow-[0_24px_90px_rgba(0,0,0,0.48)]">
        Drop your reference image.
      </div>
    </div>
  );
}
