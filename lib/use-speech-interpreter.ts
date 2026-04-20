"use client";

import { useCallback, useEffect, useRef } from "react";
import { useYiiyaStore, type YiiyaAction } from "@/lib/store";
import { runYiiyaActions } from "@/lib/action-runner";

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

function isInterpretPayload(
  value: unknown
): value is { actions: YiiyaAction[]; qa_log?: string[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { actions?: unknown; qa_log?: unknown };

  return (
    isYiiyaActionArray(payload.actions) &&
    (payload.qa_log === undefined ||
      (Array.isArray(payload.qa_log) &&
        payload.qa_log.every((item) => typeof item === "string")))
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

  if (editCount > 0) {
    return `Modified ${editCount} selected element property/properties.`;
  }

  if (actions.some((action) => action.type === "SET_GLOBAL_THEME" || action.type === "CHANGE_THEME")) {
    return "Updated the project theme.";
  }

  return "No visible changes were applied.";
}

async function interpretTranscript(
  transcript: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  const state = useYiiyaStore.getState();
  const currentCanvasJson = {
    projectSlug: state.currentProjectSlug,
    projectId: state.currentProjectId,
    projectName: state.projectName,
    selectedElementId: state.selectedElementId,
    activeElement: getSelectedElementSnapshot(state.selectedElementId),
    sections: state.sections,
    sceneObjects: state.sceneObjects,
    themeState: state.themeState,
    layers: state.layers
  };

  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transcript,
      activeElementId: state.selectedElementId,
      currentScene: currentCanvasJson,
      current_canvas_json: currentCanvasJson,
      history: history.slice(-5),
      referenceImage: state.referenceImage
    })
  });

  if (!response.ok) {
    throw new Error(`Interpret request failed with ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (isYiiyaActionArray(payload)) {
    return {
      actions: payload,
      qaLog: [],
      interpreter: response.headers.get("x-yiiya-interpreter")
    };
  }

  if (!isInterpretPayload(payload)) {
    throw new Error("Interpret response was not an action array");
  }

  return {
    actions: payload.actions,
    qaLog: payload.qa_log ?? [],
    interpreter: response.headers.get("x-yiiya-interpreter")
  };
}

export function useSpeechInterpreter() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const isRecognitionActiveRef = useRef(false);
  const submittedTranscriptRef = useRef("");

  const setListening = useYiiyaStore((state) => state.setListening);
  const setInterpreting = useYiiyaStore((state) => state.setInterpreting);
  const setTranscript = useYiiyaStore((state) => state.setTranscript);
  const setInterimTranscript = useYiiyaStore(
    (state) => state.setInterimTranscript
  );
  const addLog = useYiiyaStore((state) => state.addLog);
  const addActionLogs = useYiiyaStore((state) => state.addActionLogs);
  const addMessage = useYiiyaStore((state) => state.addMessage);

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
      const previousHistory = useYiiyaStore.getState().conversationHistory;

      setTranscript(normalizedTranscript);
      addMessage({ role: "user", content: normalizedTranscript });
      addLog(`[INTERPRET]: Intent = '${normalizedTranscript.slice(0, 52)}'.`);
      setInterpreting(true);

      try {
        const { actions, qaLog, interpreter } =
          await interpretTranscript(normalizedTranscript, previousHistory);

        if (interpreter === "local-fallback") {
          addLog("[INTERPRET]: Fast local compiler fallback.");
        }

        runYiiyaActions(actions);
        addActionLogs(actions);
        qaLog.forEach((log) => addLog(log));
        addMessage({
          role: "assistant",
          content: summarizeActions(actions)
        });

        if (actions.length === 0) {
          addLog("[SYSTEM]: No action detected.");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Interpret request failed";
        addLog(`[SYSTEM]: ${message}`);
      } finally {
        setInterpreting(false);
      }
    },
    [addActionLogs, addLog, addMessage, setInterpreting, setTranscript]
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
        setInterimTranscript(
          `${finalTranscriptRef.current} ${interimTranscript}`.trim()
        );
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
  }, [addLog, setInterimTranscript, setListening, submitTranscript]);

  const startListening = useCallback(() => {
    if (isRecognitionActiveRef.current) {
      return;
    }

    const recognition = getRecognition();

    if (!recognition) {
      return;
    }

    finalTranscriptRef.current = "";
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
