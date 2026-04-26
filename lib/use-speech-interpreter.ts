"use client";

import { useCallback, useEffect, useRef } from "react";
import { captureTimelineSnapshot } from "@/lib/timeline-snapshots";
import { useYiiyaStore, type YiiyaAction } from "@/lib/store";
import { runYiiyaActions } from "@/lib/action-runner";
import type { CreativeBrief } from "@/lib/creative-brief";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognition() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function isTextInputTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;

  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    Boolean(element?.isContentEditable)
  );
}

function isYiiyaActionArray(value: unknown): value is YiiyaAction[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const action = item as { type?: unknown; payload?: unknown };

      return typeof action.type === "string" && typeof action.payload === "object";
    })
  );
}

function getSelectedElementSnapshot(elementId: string | null) {
  if (!elementId) {
    return null;
  }

  const element = document.querySelector<HTMLElement>(
    `[data-yiiya-id="${CSS.escape(elementId)}"]`
  );

  if (!element) {
    return null;
  }

  const styles = window.getComputedStyle(element);

  return {
    id: elementId,
    textContent: element.textContent?.slice(0, 500) ?? "",
    computedStyle: {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      fontSize: styles.fontSize,
      borderRadius: styles.borderRadius,
      padding: styles.padding,
      textAlign: styles.textAlign,
      transform: styles.transform
    }
  };
}

function summarizeActions(actions: YiiyaAction[]) {
  const sectionCount = actions.filter((action) => action.type === "ADD_SECTION").length;
  const objectCount = actions.filter(
    (action) => action.type === "ADD_3D_OBJECT" || action.type === "ADD_SPATIAL_OBJECT"
  ).length;
  const moldCount = actions.filter(
    (action) =>
      action.type === "MOLD_BLOB" ||
      action.type === "MORPH_BLOB" ||
      action.type === "SET_BLOB_FORMATION" ||
      action.type === "SET_MATERIAL" ||
      action.type === "MOVE_OBJECT" ||
      action.type === "SET_OBJECT_TRANSFORM" ||
      action.type === "SET_OBJECT_ANIMATION"
  ).length;
  const editCount = actions.filter((action) => action.type === "MODIFY_ELEMENT").length;

  if (sectionCount > 0 && objectCount > 0) {
    return `Added ${sectionCount} section(s) and ${objectCount} 3D object(s).`;
  }

  if (sectionCount > 0) {
    return `Added ${sectionCount} section(s).`;
  }

  if (objectCount > 0) {
    return `Added ${objectCount} 3D object(s).`;
  }

  if (moldCount > 0) {
    return `Molded ${moldCount} spatial parameter(s).`;
  }

  if (editCount > 0) {
    return `Modified ${editCount} selected element property/properties.`;
  }

  if (actions.some((action) => action.type === "SET_GLOBAL_THEME" || action.type === "CHANGE_THEME")) {
    return "Updated the project theme.";
  }

  return "No visible changes were applied.";
}

function shouldPrimeSpeculativeResearch(transcript: string) {
  const text = transcript.toLowerCase();

  return [
    "luxury",
    "watch",
    "plumbing",
    "restaurant",
    "studio",
    "photography",
    "dental",
    "agency",
    "startup"
  ].some((term) => text.includes(term));
}

async function interpretTranscript(
  transcript: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  onPipelineLog?: (log: string) => void,
  partial = false
) {
  const state = useYiiyaStore.getState();
  const currentCanvasJson = {
    projectSlug: state.currentProjectSlug,
    projectId: state.currentProjectId,
    projectName: state.projectName,
    creationGoal: state.creationGoal,
    starterPromptId: state.starterPromptId,
    canvasMode: state.canvasMode,
    scanSessionId: state.scanSession?.id ?? null,
    selectedElementId: state.selectedElementId,
    activeElement: getSelectedElementSnapshot(state.selectedElementId),
    sections: state.sections,
    sceneObjects: state.sceneObjects,
    themeState: state.themeState,
    layers: state.layers
  };
  const cursorTarget = state.cursorTarget
    ? {
        screenX: state.cursorTarget.screenX,
        screenY: state.cursorTarget.screenY,
        domElementId: state.cursorTarget.domElementId,
        domTextContent: state.cursorTarget.domTextContent,
        sceneObjectId: state.cursorTarget.sceneObjectId,
        scenePoint: state.cursorTarget.scenePoint,
        targetKind: state.cursorTarget.targetKind,
        description: state.cursorTarget.description
      }
    : null;
  const referenceImage = state.referenceImage
    ? (() => {
        const { previewUrl: _previewUrl, ...serverReferenceImage } =
          state.referenceImage;

        return serverReferenceImage;
      })()
    : null;

  const requestPayload = {
    transcript,
    activeElementId: state.selectedElementId,
    currentScene: currentCanvasJson,
    current_canvas_json: currentCanvasJson,
    history: history.slice(-5),
    referenceImage,
    creationGoal: state.creationGoal,
    canvasMode: state.canvasMode,
    starterPromptId: state.starterPromptId,
    scanSessionId: state.scanSession?.id ?? null,
    cursorTarget,
    strategyMode: state.strategyMode,
    partial
  };
  const response = await fetch("/api/interpret/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    throw new Error(`Interpret request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Interpret stream was unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let actions: YiiyaAction[] = [];
  const qaLog: string[] = [];
  let brief: CreativeBrief | null = null;
  let confidence = 0;
  let fallbackPath: string | null = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event
        .split("\n")
        .find((item) => item.startsWith("data: "));

      if (!line) {
        continue;
      }

      const payload: unknown = JSON.parse(line.slice(6));

      if (!payload || typeof payload !== "object") {
        continue;
      }

      const record = payload as {
        type?: string;
        log?: string;
        message?: string;
        actions?: unknown;
        qa_log?: unknown;
        brief?: CreativeBrief | null;
        confidence?: number;
        fallbackPath?: string | null;
      };

      if (record.type === "error") {
        throw new Error(record.message ?? "Interpret pipeline failed");
      }

      if (record.log) {
        onPipelineLog?.(record.log);
      }

      if (record.brief) {
        brief = record.brief;
      }

      if (typeof record.confidence === "number") {
        confidence = record.confidence;
      }

      if (typeof record.fallbackPath === "string") {
        fallbackPath = record.fallbackPath;
      }

      if ((record.type === "actions" || record.type === "done") && isYiiyaActionArray(record.actions)) {
        actions = record.actions;
      }

      if (record.type === "qa" && Array.isArray(record.qa_log)) {
        qaLog.push(...record.qa_log.filter((item): item is string => typeof item === "string"));
      }
    }
  }

  return { actions, qaLog, interpreter: "stream", brief, confidence, fallbackPath };
}

export async function runTranscriptThroughYiiya(transcript: string) {
  const normalizedTranscript = transcript.trim();

  if (!normalizedTranscript) {
    return;
  }

  const state = useYiiyaStore.getState();
  const previousHistory = state.conversationHistory;

  state.setTranscript(normalizedTranscript);
  state.addMessage({ role: "user", content: normalizedTranscript });
  state.addLog(`[INTERPRET]: Intent = '${normalizedTranscript.slice(0, 52)}'.`);
  state.setInterpreting(true);

  try {
    const { actions, qaLog, interpreter, brief, confidence, fallbackPath } =
      await interpretTranscript(normalizedTranscript, previousHistory, state.addLog);

    if (interpreter === "stream") {
      state.addLog("[INTERPRET]: Streaming agent pipeline completed.");
    }

    state.setActiveBrief(brief, fallbackPath);
    if (brief) {
      state.addLog(
        `[BRIEF]: ${brief.summary} | ${Math.round(confidence * 100)}% | ${fallbackPath ?? brief.fallbackPath}`
      );
    }

    runYiiyaActions(actions);
    state.addActionLogs(actions);
    qaLog.forEach((log) => state.addLog(log));
    state.addMessage({
      role: "assistant",
      content: summarizeActions(actions)
    });

    if (actions.length === 0) {
      state.addLog("[SYSTEM]: No action detected.");
    } else {
      await captureTimelineSnapshot(
        normalizedTranscript.slice(0, 42),
        brief?.summary ?? summarizeActions(actions)
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interpret request failed";
    state.addLog(`[SYSTEM]: ${message}`);
  } finally {
    state.setStarterPromptId(null);
    state.setInterpreting(false);
  }
}

export function useSpeechInterpreter() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const isRecognitionActiveRef = useRef(false);
  const submittedTranscriptRef = useRef("");
  const speculativeTranscriptRef = useRef("");

  const setListening = useYiiyaStore((state) => state.setListening);
  const setInterimTranscript = useYiiyaStore(
    (state) => state.setInterimTranscript
  );
  const addLog = useYiiyaStore((state) => state.addLog);

  const submitTranscript = useCallback(
    async (transcript: string, options?: { allowRepeat?: boolean }) => {
      const normalizedTranscript = transcript.trim();

      if (
        !normalizedTranscript ||
        (!options?.allowRepeat &&
          normalizedTranscript === submittedTranscriptRef.current)
      ) {
        return;
      }

      submittedTranscriptRef.current = normalizedTranscript;
      await runTranscriptThroughYiiya(normalizedTranscript);
    },
    []
  );

  const submitManualTranscript = useCallback(
    async (transcript: string) => {
      const normalizedTranscript = transcript.trim();

      if (!normalizedTranscript) {
        return;
      }

      setInterimTranscript(normalizedTranscript);
      await submitTranscript(normalizedTranscript, { allowRepeat: true });
      setInterimTranscript("");
    },
    [setInterimTranscript, submitTranscript]
  );

  const primeSpeculativeResearch = useCallback(
    async (partialTranscript: string) => {
      const normalized = partialTranscript.trim();

      if (
        normalized.length < 12 ||
        speculativeTranscriptRef.current === normalized ||
        !shouldPrimeSpeculativeResearch(normalized)
      ) {
        return;
      }

      speculativeTranscriptRef.current = normalized;
      addLog("[CONDUCTOR]: Speculative intent detected — priming research.");

      try {
        await interpretTranscript(
          normalized,
          useYiiyaStore.getState().conversationHistory,
          (log) => {
            if (log.startsWith("[ROUTER]") || log.startsWith("[RESEARCH]")) {
              addLog(log);
            }
          },
          true
        );
      } catch (error) {
        addLog(
          `[CONDUCTOR]: Speculative pass unavailable — ${
            error instanceof Error ? error.message : "unknown"
          }`
        );
      }
    },
    [addLog]
  );

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    const Recognition = getSpeechRecognition();

    if (!Recognition) {
      addLog("[SYSTEM]: SpeechRecognition unavailable in this browser.");
      return null;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalTranscript}`.trim();
        setInterimTranscript(finalTranscriptRef.current);
        void submitTranscript(finalTranscriptRef.current);
      } else {
        const partialTranscript = `${finalTranscriptRef.current} ${interimTranscript}`.trim();
        setInterimTranscript(partialTranscript);
        void primeSpeculativeResearch(partialTranscript);
      }
    };

    recognition.onerror = (event) => {
      isRecognitionActiveRef.current = false;
      setListening(false);
      addLog(`[SYSTEM]: Voice input error: ${event.error}`);
    };

    recognition.onend = () => {
      isRecognitionActiveRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [
    addLog,
    primeSpeculativeResearch,
    setInterimTranscript,
    setListening,
    submitTranscript
  ]);

  const startListening = useCallback(() => {
    if (isRecognitionActiveRef.current) {
      return;
    }

    const recognition = getRecognition();

    if (!recognition) {
      return;
    }

    finalTranscriptRef.current = "";
    speculativeTranscriptRef.current = "";
    submittedTranscriptRef.current = "";
    setInterimTranscript("");
    setListening(true);

    try {
      recognition.start();
      isRecognitionActiveRef.current = true;
    } catch (error) {
      setListening(false);
      const message =
        error instanceof Error ? error.message : "Unable to start voice input";
      addLog(`[SYSTEM]: ${message}`);
    }
  }, [addLog, getRecognition, setInterimTranscript, setListening]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition || !isRecognitionActiveRef.current) {
      return;
    }

    recognition.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (isRecognitionActiveRef.current) {
      stopListening();
      return;
    }

    startListening();
  }, [startListening, stopListening]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTextInputTarget(event.target)) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            useYiiyaStore.getState().popRedo();
          } else {
            useYiiyaStore.getState().popUndo();
          }
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
          event.preventDefault();
          useYiiyaStore.getState().popRedo();
        }
        return;
      }

      event.preventDefault();
      startListening();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTextInputTarget(event.target)) {
        return;
      }

      event.preventDefault();
      stopListening();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      recognitionRef.current?.abort();
    };
  }, [startListening, stopListening]);

  return {
    startListening,
    stopListening,
    toggleListening,
    submitManualTranscript
  };
}
