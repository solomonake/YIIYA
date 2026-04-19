"use client";

import { useYiiyaStore } from "@/lib/store";
import { useSpeechInterpreter } from "@/lib/use-speech-interpreter";

const bars = [0, 1, 2, 3, 4];

export function VoiceBar() {
  const isListening = useYiiyaStore((state) => state.isListening);
  const isInterpreting = useYiiyaStore((state) => state.isInterpreting);
  const interimTranscript = useYiiyaStore((state) => state.interimTranscript);
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);
  const { toggleListening } = useSpeechInterpreter();

  const status = isInterpreting
    ? "Interpreting..."
    : isListening
      ? "Listening..."
      : "Idle";
  const promptText =
    interimTranscript ||
    (selectedElementId
      ? `Pointing at: ${selectedElementId} — speak to modify.`
      : "Hold Space or click mic to speak");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex justify-center px-3 sm:px-6">
      <div className="pointer-events-auto flex h-14 w-[min(560px,calc(100vw-24px))] items-center justify-center gap-3 rounded-full border border-white/10 bg-[#11110f]/90 px-4 shadow-[0_20px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl sm:gap-4 sm:px-5">
        <button
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          title={isListening ? "Stop voice input" : "Start voice input"}
          onClick={toggleListening}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/70 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-2 focus:ring-amber/60"
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

        <div className="flex h-7 w-10 items-center justify-center gap-1">
          {bars.map((bar) => (
            <span
              key={bar}
              className="h-6 w-1 rounded-full bg-amber"
              style={{
                animation: "wave 980ms ease-in-out infinite",
                animationDelay: `${bar * 115}ms`,
                opacity: isListening ? 1 : 0.48
              }}
            />
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isListening
                ? "animate-pulseDot bg-[#5fd39a] shadow-[0_0_18px_rgba(95,211,154,0.75)]"
                : "bg-white/25"
            }`}
          />
          <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap text-xs sm:text-sm">
            <span className="font-semibold text-bone">
              {status}
            </span>
            <span className="truncate text-white/45">{promptText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
