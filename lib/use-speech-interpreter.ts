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

async function interpretTranscript(transcript: string) {
  const state = useYiiyaStore.getState();

  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transcript,
      activeElementId: state.selectedElementId,
      currentScene: {
        projectName: state.projectName,
        selectedElementId: state.selectedElementId,
        sections: state.sections,
        sceneObjects: state.sceneObjects,
        themeState: state.themeState,
        layers: state.layers
      },
      referenceImage: state.referenceImage
    })
  });

  if (!response.ok) {
    throw new Error(`Interpret request failed with ${response.status}`);
  }

  const actions: unknown = await response.json();

  if (!isYiiyaActionArray(actions)) {
    throw new Error("Interpret response was not an action array");
  }

  return actions;
}

export function useSpeechInterpreter() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const isRecognitionActiveRef = useRef(false);
  const submittedTranscriptRef = useRef("");

  const setListening = useYiiyaStore((state) => state.setListening);
  const setInterpreting = useYiiyaStore((state) => state.setInterpreting);
  const setInterimTranscript = useYiiyaStore(
    (state) => state.setInterimTranscript
  );
  const addLog = useYiiyaStore((state) => state.addLog);
  const addActionLogs = useYiiyaStore((state) => state.addActionLogs);

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
      addLog(`INTERPRET: Intent = '${normalizedTranscript.slice(0, 52)}'.`);
      setInterpreting(true);

      try {
        const actions = await interpretTranscript(normalizedTranscript);
        runYiiyaActions(actions);
        addActionLogs(actions);

        if (actions.length === 0) {
          addLog("No action detected");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Interpret request failed";
        addLog(message);
      } finally {
        setInterpreting(false);
      }
    },
    [addActionLogs, addLog, setInterpreting]
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
      addLog("SpeechRecognition unavailable in this browser");
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
      addLog(`Voice input error: ${event.error}`);
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
      addLog(message);
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
