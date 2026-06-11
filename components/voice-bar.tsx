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
  const latestQuestion = useYiiyaStore((state) => state.latestQuestion);
  const guidedIntake = useYiiyaStore((state) => state.guidedIntake);
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);
  const cursorTarget = useYiiyaStore((state) => state.cursorTarget);
  const activeLane = useYiiyaStore((state) => state.activeLane);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const timelineSnapshots = useYiiyaStore((state) => state.timelineSnapshots);
  const referenceImage = useYiiyaStore((state) => state.referenceImage);
  const assetBrief = useYiiyaStore((state) => state.assetBrief);
  const assetSummary = useYiiyaStore((state) => state.assetSummary);
  const routePlan = useYiiyaStore((state) => state.routePlan);
  const creationPathways = useYiiyaStore((state) => state.creationPathways);
  const setCreationGoal = useYiiyaStore((state) => state.setCreationGoal);
  const setActiveLane = useYiiyaStore((state) => state.setActiveLane);
  const setStarterPromptId = useYiiyaStore((state) => state.setStarterPromptId);
  const { toggleListening, submitManualTranscript } = useSpeechInterpreter();
  const [manualCommand, setManualCommand] = useState("");
  const [starterPromptIndex, setStarterPromptIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStarterPromptIndex(
        (current) => (current + 1) % rotatingStarterPrompts.length,
      );
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
    latestQuestion ||
    (selectedElementId
      ? `// ${selectedElementId} selected — speak to modify`
      : activeLane === "scan"
        ? "Speak the object you want to capture, then continue in the scan panel"
        : activeLane === "cad"
          ? "Describe a bounded hard-surface concept with parts, dimensions, or features"
          : "Speak an object, upload a reference, or ask for a mesh preview");
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
  const showPathways =
    sceneObjects.length === 0 &&
    timelineSnapshots.length === 0 &&
    !referenceImage;
  const modeLabel = activeLane.toUpperCase();
  const modeHint =
    assetBrief
      ? `${assetBrief.destination.toUpperCase()} · ${assetBrief.readiness.score}% handoff`
      : activeLane === "scan"
        ? "Scan lane · phone capture and reconstruction"
        : activeLane === "cad"
          ? "CAD lane · bounded hard-surface generation"
          : "Mesh lane · preview-first spatial asset generation";
  const guidedIntakeProgress = guidedIntake
    ? `${Object.values(guidedIntake.answers).filter(Boolean).length + 1}/4`
    : null;
  const targetLabel =
    selectedElementId ??
    cursorTarget?.domElementId ??
    cursorTarget?.sceneObjectId ??
    null;

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmitManualCommand) {
      return;
    }

    const command = manualCommand;
    setManualCommand("");
    void submitManualTranscript(command);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex justify-center px-3 sm:px-6">
      <div className="pointer-events-auto flex w-[min(820px,calc(100vw-24px))] flex-col gap-3">
        {guidedIntake ? (
          <div className="mx-auto flex max-w-[780px] flex-wrap items-center justify-center gap-2 border border-amber/35 bg-[#070707]/94 px-3 py-2 text-[11px] text-white/58 backdrop-blur-xl">
            <span className="font-bold uppercase tracking-[0.16em] text-amber">
              Guided brief {guidedIntakeProgress}
            </span>
            <span className="max-w-[560px] text-center text-white/70">
              {latestQuestion}
            </span>
            <span className="text-white/34">
              Type generate now to skip ahead.
            </span>
          </div>
        ) : showPathways ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {creationPathways.map((pathway) => (
              <button
                key={pathway.id}
                type="button"
                onClick={() => {
                  setCreationGoal(pathway.creationGoal);
                  setActiveLane(pathway.lane);
                  setStarterPromptId(pathway.id);
                  void submitManualTranscript(pathway.prompt);
                }}
                className="border border-terminalBorder bg-[#070707]/92 px-3 py-2 text-left font-mono transition hover:border-amber/70"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
                  {pathway.label}
                </p>
                <p className="mt-1 text-[11px] text-white/60">
                  {pathway.subtitle}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <div className="border border-terminalBorder bg-[#070707]/92 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/46 backdrop-blur-xl">
              {modeLabel} · {modeHint}
              {assetBrief ? ` · ${assetBrief.objectName}` : ""}
              {assetSummary ? ` · ${assetSummary.concise}` : ""}
              {routePlan?.preview ? ` · ${routePlan.preview.provider}` : ""}
              {targetLabel ? ` · target ${targetLabel}` : ""}
            </div>
          </div>
        )}

        <div
          className={`flex min-h-16 items-center justify-center gap-3 rounded-full border bg-[#070707]/94 px-4 py-2 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 sm:gap-4 sm:px-5 ${shellStateClass}`}
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
                  opacity: isListening || isInterpreting ? 1 : 0.36,
                }}
              />
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <div className="flex min-w-0 max-w-[110px] items-baseline gap-2 whitespace-nowrap text-[11px] sm:max-w-[220px] sm:text-xs lg:max-w-[300px]">
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
                latestQuestion
                  ? `// AI: ${latestQuestion}`
                  : targetLabel
                    ? `// ${targetLabel} targeted - type or speak to modify`
                    : (rotatingStarterPrompts[starterPromptIndex] ??
                      "Type a command for demo safety")
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
      </div>
    </div>
  );
}
