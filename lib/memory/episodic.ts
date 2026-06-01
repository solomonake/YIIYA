/**
 * Episodic memory — per-user timeline of meaningful interactions.
 *
 * Each row stores a (prompt, resolved_intent, outcome, embedding). On a new
 * prompt the system retrieves the top-K most similar past episodes for this
 * user and injects them as exemplars into the Architect prompt.
 *
 * Table: public.episodic_memory (see migration 0003_production_foundation.sql)
 * RLS: enforced — service role bypasses for system writes.
 */
import { serviceClient } from "@/lib/supabase-server";
import { embedText } from "./embed";

export type EventKind = "prompt" | "rejection" | "lock_in" | "undo" | "export" | "publish" | "edit";
export type Outcome = "accepted" | "undone" | "edited" | "exported" | "published" | "rejected";

export type EpisodicEntry = {
  userId: string;
  sessionId?: string;
  eventKind: EventKind;
  promptText?: string;
  resolvedIntent?: Record<string, unknown>;
  outcome?: Outcome;
  context?: Record<string, unknown>;
};

export async function recordEpisode(entry: EpisodicEntry): Promise<void> {
  const client = serviceClient();
  if (!client) return;
  const embedding = entry.promptText ? await embedText(entry.promptText) : null;
  try {
    await client.from("episodic_memory").insert({
      user_id: entry.userId,
      session_id: entry.sessionId ?? null,
      event_kind: entry.eventKind,
      prompt_text: entry.promptText ?? null,
      resolved_intent: entry.resolvedIntent ?? null,
      outcome: entry.outcome ?? null,
      context: entry.context ?? {},
      embedding
    });
  } catch {
    // best-effort; never block the request on memory writes
  }
}

export type RetrievedEpisode = {
  id: string;
  occurredAt: string;
  eventKind: EventKind;
  promptText: string | null;
  resolvedIntent: Record<string, unknown> | null;
  outcome: Outcome | null;
  similarity: number;
};

/**
 * Top-K cosine-similar past episodes for this user.
 * Returns [] if pgvector isn't available or embeddings fail.
 */
export async function retrieveSimilar(
  userId: string,
  query: string,
  k = 5
): Promise<RetrievedEpisode[]> {
  const client = serviceClient();
  if (!client) return [];
  const embedding = await embedText(query);
  if (!embedding) return [];

  // pgvector cosine distance: 1 - (embedding <=> :query)
  // We expose this via an RPC to keep the SQL inside Postgres.
  const { data, error } = await client.rpc("episodic_match", {
    p_user: userId,
    p_query: embedding,
    p_limit: k
  });
  if (error || !data) return [];
  return (data as RawMatch[]).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    eventKind: row.event_kind as EventKind,
    promptText: row.prompt_text,
    resolvedIntent: row.resolved_intent,
    outcome: row.outcome as Outcome | null,
    similarity: row.similarity
  }));
}

type RawMatch = {
  id: string;
  occurred_at: string;
  event_kind: string;
  prompt_text: string | null;
  resolved_intent: Record<string, unknown> | null;
  outcome: string | null;
  similarity: number;
};
