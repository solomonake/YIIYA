"use client";

import { useCallback, useEffect, useRef } from "react";
import { useYiiyaStore } from "@/lib/store";
import type { GeneratedAsset, PipelineEvent } from "@/lib/interpret-pipeline";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getSettings } from "@/lib/settings";
import { parseLocalEdit } from "@/lib/scene/local-edit";
import { getRegionEditHandlers } from "@/lib/scene/region-edit-bridge";

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

  const runTranscriptThroughPipeline = useCallback(async (transcript: string, opts?: { forceGenerate?: boolean }) => {
    if (!transcript.trim()) return;

    const store = useYiiyaStore.getState();
    // A new submission supersedes any paused clarify prompt and stale preview.
    store.setPendingClarify(null);
    store.setGroundingPreviewUrl(null);

    // Local material fast-path: recolor / finish / glow / scale edits to the
    // active mesh run in-browser (lib/scene/local-edit.ts) — 0 tokens, instant,
    // no regeneration. Only when there's a real active mesh to edit; structural
    // edits and new objects return null from the parser and fall through to the
    // full pipeline below.
    const activeAsset = store.generatedAssets.find(a => a.id === store.activeAssetId);

    // Part targeting: "make THIS red" while a clicked region is selected on
    // the mesh recolors just that region (vertex colors) — instant, free.
    // Deictic words + an active selection are both required; otherwise the
    // phrase falls through to the normal whole-mesh / pipeline paths.
    const regionHandlers = getRegionEditHandlers();
    if (
      regionHandlers?.hasSelection() &&
      /\b(this|that|here)\b/i.test(transcript)
    ) {
      const edit = parseLocalEdit(transcript.replace(/\b(this|that|here)\b/gi, "it"));
      if (edit?.patch.color) {
        addLog(`[USER] ${transcript}`);
        store.addConversationMessage({ role: "user", content: transcript });
        regionHandlers.applyColor(edit.patch.color);
        addLog(`[EDIT] selected part → ${edit.label} (0 tokens, instant)`);
        store.addConversationMessage({ role: "assistant", content: `Recolored the selected part: ${edit.label}` });
        return;
      }
    }

    if (activeAsset && activeAsset.tier !== "fallback") {
      const edit = parseLocalEdit(transcript);
      if (edit) {
        addLog(`[USER] ${transcript}`);
        store.addConversationMessage({ role: "user", content: transcript });
        store.applyLocalMaterialEdit(activeAsset.id, edit.patch, edit.scaleFactor);
        addLog(`[EDIT] ${edit.label} — applied instantly (0 tokens, no regeneration)`);
        store.addConversationMessage({ role: "assistant", content: `Applied locally: ${edit.label}` });
        return;
      }
    }

    setIsInterpreting(true);
    addLog(`[USER] ${transcript}`);
    store.addConversationMessage({ role: "user", content: transcript });

    // Expectation-setting: an edit-shaped phrase that ISN'T a local
    // color/finish/size edit (those returned above) costs real time and
    // money. Say so up front — the user just saw edits apply in 0s. Since
    // Phase 11 the Director may route texture-only edits to Meshy retexture
    // (same geometry, new skin) when the active mesh has a public URL, so
    // only promise a full re-roll when retexture isn't even possible.
    if (activeAsset && activeAsset.tier !== "fallback" && /^\s*(make|add|remove|change|turn|give|put)\b/i.test(transcript)) {
      addLog(
        activeAsset.glbUrl.startsWith("https://")
          ? "[GENERATOR] Bigger change — texture-only edits restyle this mesh in place (same geometry); structural ones need a fresh generation (≈1 paid gen, 1–4 min). Your current mesh stays in the tray."
          : "[GENERATOR] Structural change — needs a fresh generation (≈1 paid gen, 1–4 min). Your current mesh stays in the tray."
      );
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Signed-in users get their generations saved to /library; anonymous
      // requests still generate normally, they just aren't persisted.
      const client = getSupabaseBrowserClient();
      const accessToken = client ? (await client.auth.getSession()).data.session?.access_token : null;

      const res = await fetch("/api/interpret/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          transcript,
          referenceImage: store.referenceImage
            ? {
                base64: store.referenceImage.base64,
                mediaType: store.referenceImage.mediaType,
                name: store.referenceImage.name,
                additionalViews: store.referenceImage.additionalViews
              }
            : null,
          sessionStyleDNA: store.sessionStyleDNA,
          history: store.conversationHistory.slice(-4),
          existingAssets: store.generatedAssets.map(a => ({ id: a.id, name: a.name })),
          userHfToken: getSettings().hfToken || undefined,
          forceGenerate: opts?.forceGenerate || undefined,
          // Unlocks the Meshy retexture fast path for material edits: same
          // geometry, new textures. Only a public https URL is usable —
          // relative proxy URLs and placeholders can't be fetched by Meshy.
          activeAssetGlbUrl:
            activeAsset && activeAsset.tier !== "fallback" && activeAsset.glbUrl.startsWith("https://")
              ? activeAsset.glbUrl
              : undefined
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
            handlePipelineEvent(event, transcript);
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

  function handlePipelineEvent(event: PipelineEvent, transcript: string) {
    const store = useYiiyaStore.getState();
    switch (event.type) {
      case "director":
        addLog(event.log);
        store.setActiveBrief(event.brief);
        break;
      case "grounding":
        addLog(event.log);
        // Surface the free reference photo the 3D build will follow — catches
        // a misread prompt while there's still time to abort, at zero cost.
        if (event.result.referenceImages[0]) {
          store.setGroundingPreviewUrl(event.result.referenceImages[0]);
        }
        break;
      case "clarify":
        addLog(event.log);
        store.setPendingClarify({
          question: event.question,
          options: event.options,
          previewImage: event.previewImage,
          transcript
        });
        store.addConversationMessage({ role: "assistant", content: event.question });
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
        // A clarify-gated run ends with zero assets — the question card is the
        // real output there, so skip the "0 asset(s)" noise.
        if (event.assets.length > 0) {
          addLog(`[DONE] ${event.assets.length} asset(s) ready.`);
          store.addConversationMessage({ role: "assistant", content: `Generated ${event.assets.length} asset(s): ${event.assets.map(a => a.name).join(", ")}` });
        }
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

  const submitManualTranscript = useCallback((text: string, opts?: { forceGenerate?: boolean }) => {
    if (text.trim()) void runTranscriptThroughPipeline(text.trim(), opts);
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
