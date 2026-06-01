/**
 * Deictic resolver — binds "this/that/it/here/there/these/those" in voice
 * transcripts to component IDs by sampling the cursor track at the time the
 * word was spoken.
 *
 * The Web Speech API surface SpeechRecognitionResult includes timing on some
 * platforms (Chrome desktop). Where timings are missing, we evenly distribute
 * word times across the utterance interval (start, end).
 *
 * Returns the rewritten transcript + a binding map for downstream Architect
 * prompts:
 *
 *   "make this red"
 *     + cursor over hero-title at t=1234
 *   → { rewritten: "make hero-title red", bindings: { "this@1234": "hero-title" } }
 */
import type { CursorTrack } from "./cursor-track";

export type DeicticWord = {
  word: string;
  /** Absolute timestamp in ms since epoch when the word was spoken. */
  t: number;
};

const PRONOUNS: ReadonlyArray<RegExp> = [
  /\bthis\b/gi,
  /\bthat\b/gi,
  /\bit\b/gi,
  /\bhere\b/gi,
  /\bthere\b/gi,
  /\bthese\b/gi,
  /\bthose\b/gi
];

export type ResolveOptions = {
  /** Cursor track to consult. */
  track: CursorTrack;
  /** Selected component IDs, used to resolve "these" / "those" to the lasso set. */
  selectionIds?: string[];
  /** Tolerance in ms when picking the cursor sample for a word. */
  toleranceMs?: number;
};

export type Resolved = {
  rewritten: string;
  bindings: Array<{ pronoun: string; resolvedTo: string | string[]; t: number }>;
  unresolved: number;
};

/**
 * Resolve pronouns to component IDs. If the transcript has no per-word
 * timings, callers may pass a single `words` entry that spans the utterance
 * — the resolver falls back to the cursor's dominant component over that
 * interval.
 */
export function resolveDeictic(
  transcript: string,
  words: ReadonlyArray<DeicticWord>,
  options: ResolveOptions
): Resolved {
  const { track, selectionIds = [], toleranceMs = 200 } = options;
  const bindings: Resolved["bindings"] = [];
  let rewritten = transcript;
  let unresolved = 0;

  // Build a small index of words by lowercase token for fast lookups.
  const wordIndex = words.map((w) => ({ ...w, lower: w.word.toLowerCase() }));

  function resolveOne(pronoun: string, occurrenceIndex: number): { id: string | string[] | null; t: number } {
    // Find the n-th matching word in the utterance, get its timestamp.
    const matches = wordIndex.filter((w) => w.lower === pronoun.toLowerCase());
    const word = matches[occurrenceIndex] ?? matches[matches.length - 1];
    const t = word?.t ?? Date.now();

    // Plural pronouns → lasso selection if present.
    if (pronoun.toLowerCase() === "these" || pronoun.toLowerCase() === "those") {
      if (selectionIds.length) return { id: selectionIds, t };
    }

    // Singular pronouns → cursor sample at word time ± tolerance.
    const sample = track.sampleAt(t);
    if (sample?.componentId) return { id: sample.componentId, t };

    // Fallback: dominant component over [t-tolerance, t+tolerance].
    const dom = track.dominantComponent(t - toleranceMs, t + toleranceMs);
    return { id: dom, t };
  }

  for (const re of PRONOUNS) {
    let occurrence = 0;
    rewritten = rewritten.replace(re, (match) => {
      const { id, t } = resolveOne(match, occurrence++);
      if (!id) {
        unresolved += 1;
        return match;
      }
      const resolvedText = Array.isArray(id) ? `[${id.join(", ")}]` : `[${id}]`;
      bindings.push({ pronoun: match, resolvedTo: id, t });
      return resolvedText;
    });
  }

  return { rewritten, bindings, unresolved };
}

/**
 * Convenience helper for the common case where Web Speech only gives you the
 * full transcript + utterance window (no per-word timings).
 */
export function resolveSpan(
  transcript: string,
  utteranceStart: number,
  utteranceEnd: number,
  options: ResolveOptions
): Resolved {
  // Distribute timestamps evenly across detected tokens.
  const tokens = transcript.match(/\S+/g) ?? [];
  const step = tokens.length > 0 ? (utteranceEnd - utteranceStart) / tokens.length : 0;
  const words: DeicticWord[] = tokens.map((tok, i) => ({ word: tok, t: utteranceStart + step * i }));
  return resolveDeictic(transcript, words, options);
}
