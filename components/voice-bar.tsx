"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useYiiyaStore } from "@/lib/store";
import { useSpeechInterpreter } from "@/lib/use-speech-interpreter";
import { rotatingStarterPrompts } from "@/lib/creation-pathways";

const bars = [0, 1, 2, 3, 4];

export function VoiceBar() {
  const isListening = useYiiyaStore((state) => state.isListening);
  const isInterpreting = useYiiyaStore((state) => state.isInterpreting);
  const interimTranscript = useYiiyaStore((state) => state.interimTranscript);
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);
  const publishResult = useYiiyaStore((state) => state.publishResult);
  const setPublishResult = useYiiyaStore((state) => state.setPublishResult);
  const setToastMessage = useYiiyaStore((state) => state.setToastMessage);
  const creationPathways = useYiiyaStore((state) => state.creationPathways);
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const setCanvasMode = useYiiyaStore((state) => state.setCanvasMode);
  const setStarterPromptId = useYiiyaStore((state) => state.setStarterPromptId);
  const { toggleListening, submitManualTranscript } = useSpeechInterpreter();
  const [manualCommand, setManualCommand] = useState("");
  const [starterPromptIndex, setStarterPromptIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStarterPromptIndex((current) => (current + 1) % rotatingStarterPrompts.length);
    }, 2400);

    return () => window.clearInterval(intervalId);
  }, []);

  const status = isInterpreting
    ? "processing..."
    : isListening
      ? "Listening..."
      : "Idle";
  const promptText =
    interimTranscript ||
    (selectedElementId
      ? `// ${selectedElementId} selected — speak to modify`
      : "Hold Space or click mic to speak");
  const shellStateClass = isInterpreting
    ? "border-signalAmber/70 shadow-[0_0_34px_rgba(255,177,0,0.26),0_20px_70px_rgba(0,0,0,0.6)]"
    : isListening
      ? "border-signalGreen/70 shadow-[0_0_38px_rgba(57,255,20,0.22),0_20px_70px_rgba(0,0,0,0.58)]"
      : "border-terminalBorder shadow-[0_20px_70px_rgba(0,0,0,0.52)]";
  const dotClass = isInterpreting
    ? "animate-pulseDot bg-signalAmber shadow-[0_0_20px_rgba(255,177,0,0.86)]"
    : isListening
      ? "animate-pulseDot bg-signalGreen shadow-[0_0_22px_rgba(57,255,20,0.82)]"
      : "bg-white/20";
  const canSubmitManualCommand =
    manualCommand.trim().length > 0 && !isInterpreting;

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmitManualCommand) {
      return;
    }

    const command = manualCommand;
    setManualCommand("");
    void submitManualTranscript(command);
  };

  const liveUrl =
    typeof window !== "undefined" && publishResult
      ? `${window.location.origin}/p/${publishResult.slug}`
      : "";

  if (publishResult) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex justify-center px-3 sm:px-6">
        <div className="pointer-events-auto flex min-h-16 w-[min(760px,calc(100vw-24px))] flex-wrap items-center justify-center gap-3 rounded-full border border-terminalBorder bg-[#070707]/94 px-4 py-2 text-xs text-bone backdrop-blur-xl">
          <span className="font-bold text-amber">{"// Published"}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(liveUrl);
              setToastMessage("Copied live URL");
            }}
            className="max-w-[220px] truncate text-white/62 underline decoration-white/20 underline-offset-4 transition hover:text-amber"
          >
            {liveUrl}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(publishResult.reactCode ?? "");
              setToastMessage("Copied React code");
            }}
            className="h-8 rounded-full border border-terminalBorder px-3 text-[11px] uppercase tracking-[0.12em] text-white/62 transition hover:border-amber/70 hover:text-amber"
          >
            Copy Production Code
          </button>
          <a
            href={publishResult.zipUrl}
            download={`yiiya-${publishResult.slug}.zip`}
            className="grid h-8 place-items-center rounded-full border border-terminalBorder px-3 text-[11px] uppercase tracking-[0.12em] text-white/62 transition hover:border-amber/70 hover:text-amber"
          >
            Download ZIP
          </a>
          <button
            type="button"
            onClick={() => setPublishResult(null)}
            className="text-[11px] text-white/42 transition hover:text-bone"
          >
            Continue editing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex justify-center px-3 sm:px-6">
      <div
        className={`pointer-events-auto flex min-h-16 w-[min(760px,calc(100vw-24px))] items-center justify-center gap-3 rounded-full border bg-[#070707]/94 px-4 py-2 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 sm:gap-4 sm:px-5 ${shellStateClass}`}
      >
        <button
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          title={isListening ? "Stop voice input" : "Start voice input"}
          onClick={toggleListening}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-terminalBorder text-white/70 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 18v3" />
          </svg>
        </button>

        <div className="hidden h-7 w-10 items-center justify-center gap-1 sm:flex">
          {bars.map((bar) => (
            <span
              key={bar}
              className={`h-6 w-1 rounded-full ${
                isListening ? "bg-signalGreen" : "bg-amber"
              }`}
              style={{
                animation: "wave 980ms ease-in-out infinite",
                animationDelay: `${bar * 115}ms`,
                opacity: isListening || isInterpreting ? 1 : 0.36
              }}
            />
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <div className="flex min-w-0 max-w-[96px] items-baseline gap-2 whitespace-nowrap text-[11px] sm:max-w-[180px] sm:text-xs lg:max-w-[260px]">
            <span className="font-bold uppercase tracking-[0.12em] text-bone">
              {status}
            </span>
            <span className="hidden truncate text-white/45 sm:inline">
              {promptText}
            </span>
          </div>
        </div>

        <form
          className="flex min-w-0 flex-1 items-center gap-2 border-l border-terminalBorder pl-3"
          onSubmit={handleManualSubmit}
        >
          <label className="sr-only" htmlFor="yiiya-manual-command">
            Type a Yiiya command
          </label>
          <input
            id="yiiya-manual-command"
            value={manualCommand}
            disabled={isInterpreting}
            onChange={(event) => setManualCommand(event.target.value)}
            placeholder={
              selectedElementId
                ? `// ${selectedElementId} selected - type to modify`
                : rotatingStarterPrompts[starterPromptIndex] ?? "Type a command for demo safety"
            }
            className="min-w-0 flex-1 border-none bg-transparent text-[11px] text-bone outline-none placeholder:text-white/32 disabled:cursor-not-allowed disabled:text-white/35 sm:text-xs"
          />
          <button
            type="submit"
            aria-label="Submit typed command"
            disabled={!canSubmitManualCommand}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-terminalBorder text-white/60 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/20"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="m5 12 14-7-7 14-2-5-5-2Z" />
            </svg>
          </button>
        </form>
      </div>
      <div className="pointer-events-auto absolute inset-x-0 -top-14 flex justify-center px-2">
        <div className="flex w-[min(760px,calc(100vw-24px))] gap-2 overflow-x-auto">
          {creationPathways.map((pathway) => (
            <button
              key={pathway.id}
              type="button"
              onClick={() => {
                setCreationGoal(pathway.creationGoal);
                setCanvasMode(pathway.mode);
                setStarterPromptId(pathway.id);
                void submitManualTranscript(pathway.prompt);
              }}
              className="shrink-0 border border-terminalBorder bg-[#070707]/92 px-3 py-2 text-left font-mono transition hover:border-amber/70"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
                {pathway.label}
              </p>
              <p className="mt-1 text-[11px] text-white/72">{pathway.subtitle}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
