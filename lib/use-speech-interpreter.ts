"use client";

import { useCallback, useEffect, useRef } from "react";
import { useYiiyaStore } from "@/lib/store";
import type { GeneratedAsset, PipelineEvent } from "@/lib/interpret-pipeline";

// ─── Web Speech API types ────────────────────────────────────────────────────

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionErrorEventLike = Event & { readonly error: string };
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

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useSpeechInterpreter() {
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptAccumRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    isListening,
    setIsListening,
    setIsInterpreting,
    setInterimTranscript,
    addLog,
    addGeneratedAsset,
    setActiveBrief,
    setSessionStyleDNA,
    addConversationMessage,
    sessionStyleDNA,
    conversationHistory,
    referenceImage
  } = useYiiyaStore();

  const runTranscriptThroughPipeline = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    const store = useYiiyaStore.getState();
    setIsInterpreting(true);
    addLog(`[USER] ${transcript}`);
    store.addConversationMessage({ role: "user", content: transcript });

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch("/api/interpret/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          referenceImage: store.referenceImage
            ? { base64: store.referenceImage.base64, mediaType: store.referenceImage.mediaType, name: store.referenceImage.name }
            : null,
          sessionStyleDNA: store.sessionStyleDNA,
          history: store.conversationHistory.slice(-4),
          existingAssets: store.generatedAssets.map(a => ({ id: a.id, name: a.name }))
        }),
        signal: abortController.signal
      });

      if (!res.ok || !res.body) {
        addLog(`[ERROR] Pipeline request failed: ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as PipelineEvent;
            handlePipelineEvent(event);
          } catch {
            /* skip malformed events */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addLog(`[ERROR] ${err instanceof Error ? err.message : "Pipeline error"}`);
      }
    } finally {
      setIsInterpreting(false);
      setInterimTranscript("");
    }
  }, [addLog, addGeneratedAsset, setActiveBrief, setSessionStyleDNA, setIsInterpreting, setInterimTranscript]);

  function handlePipelineEvent(event: PipelineEvent) {
    const store = useYiiyaStore.getState();
    switch (event.type) {
      case "director":
        addLog(event.log);
        store.setActiveBrief(event.brief);
        break;
      case "grounding":
        addLog(event.log);
        break;
      case "style_dna":
        addLog(event.log);
        store.setSessionStyleDNA(event.dna);
        break;
      case "generating":
        addLog(event.log);
        break;
      case "asset_ready":
        addLog(event.log);
        store.addGeneratedAsset(event.asset);
        break;
      case "qa":
        event.qa_log.forEach(l => addLog(l));
        break;
      case "done":
        addLog(`[DONE] ${event.assets.length} asset(s) ready.`);
        store.addConversationMessage({ role: "assistant", content: `Generated ${event.assets.length} asset(s): ${event.assets.map(a => a.name).join(", ")}` });
        break;
      case "error":
        addLog(`[ERROR] ${event.message}`);
        break;
    }
  }

  // ─── Voice control ──────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      addLog("[VOICE] Speech recognition not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    transcriptAccumRef.current = "";

    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (final) transcriptAccumRef.current += final;
    };

    rec.onerror = (event) => {
      addLog(`[VOICE] Error: ${event.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      const transcript = transcriptAccumRef.current.trim();
      if (transcript) {
        void runTranscriptThroughPipeline(transcript);
      }
    };

    recRef.current = rec;
    rec.start();
    setIsListening(true);
    addLog("[VOICE] Listening...");
  }, [addLog, setIsListening, setInterimTranscript, runTranscriptThroughPipeline]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setIsListening(false);
  }, [setIsListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const submitManualTranscript = useCallback((text: string) => {
    if (text.trim()) void runTranscriptThroughPipeline(text.trim());
  }, [runTranscriptThroughPipeline]);

  // Hold-Space shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body && !isListening) {
        e.preventDefault();
        startListening();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && isListening) {
        e.preventDefault();
        stopListening();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isListening, startListening, stopListening]);

  return { toggleListening, submitManualTranscript, startListening, stopListening };
}
