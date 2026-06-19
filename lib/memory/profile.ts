// @ts-nocheck
/**
 * Semantic memory — one row per user containing learned preferences and
 * free-text "notes to self" that the nightly learning job maintains.
 *
 * Table: public.user_profile (see migration 0003_production_foundation.sql)
 * Schema: keep stable; bump schema_version when the JSON shape changes.
 */
import { serviceClient } from "@/lib/supabase-server";
import type { Stake } from "@/lib/brief/stake-matrix";

export type Note = {
  text: string;
  evidenceCount: number;        // how many episodes back this note
  createdAt: string;
  lastReinforcedAt: string;
};

export type ProfilePreferences = {
  typographyVoice?: Stake["typographyVoice"];
  colorStory?: Stake["colorStory"];
  motionPersonality?: Stake["motionPersonality"];
  preferredProviders?: { text3d?: string; image3d?: string };
  rejectedDefaults?: string[];  // e.g. ["Inter", "purple→blue gradient"]
  voiceShorthand?: Record<string, string>;  // user's personal vocabulary
};

export type UserProfile = {
  userId: string;
  preferences: ProfilePreferences;
  notes: Note[];
  lastUpdatedAt: string;
  schemaVersion: number;
};

export async function readProfile(userId: string): Promise<UserProfile | null> {
  const client = serviceClient();
  if (!client) return null;
  const { data, error } = await client
    .from("user_profile")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return {
    userId: data.user_id as string,
    preferences: (data.preferences as ProfilePreferences) ?? {},
    notes: (data.notes as Note[]) ?? [],
    lastUpdatedAt: data.last_updated_at as string,
    schemaVersion: data.schema_version as number
  };
}

export async function upsertPreferences(
  userId: string,
  patch: Partial<ProfilePreferences>
): Promise<void> {
  const client = serviceClient();
  if (!client) return;
  const current = (await readProfile(userId))?.preferences ?? {};
  await client
    .from("user_profile")
    .upsert(
      {
        user_id: userId,
        preferences: { ...current, ...patch },
        last_updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
}

/**
 * Append a learned note. De-dupes against existing notes (case-insensitive
 * substring) and reinforces matches instead of duplicating.
 */
export async function appendNote(userId: string, text: string): Promise<void> {
  const client = serviceClient();
  if (!client) return;
  const profile = await readProfile(userId);
  const notes = profile?.notes ?? [];
  const lower = text.trim().toLowerCase();
  const existingIdx = notes.findIndex((n) => n.text.toLowerCase().includes(lower) || lower.includes(n.text.toLowerCase()));
  const nowIso = new Date().toISOString();
  if (existingIdx >= 0) {
    notes[existingIdx] = {
      ...notes[existingIdx],
      evidenceCount: notes[existingIdx].evidenceCount + 1,
      lastReinforcedAt: nowIso
    };
  } else {
    notes.push({
      text: text.trim(),
      evidenceCount: 1,
      createdAt: nowIso,
      lastReinforcedAt: nowIso
    });
  }
  // Keep at most 20 notes; drop weakest (lowest evidence × age penalty).
  const trimmed = trimNotes(notes, 20);
  await client
    .from("user_profile")
    .upsert(
      {
        user_id: userId,
        notes: trimmed,
        last_updated_at: nowIso
      },
      { onConflict: "user_id" }
    );
}

function trimNotes(notes: Note[], max: number): Note[] {
  if (notes.length <= max) return notes;
  const now = Date.now();
  return notes
    .map((n) => ({
      n,
      score: n.evidenceCount * Math.exp(-(now - Date.parse(n.lastReinforcedAt)) / (1000 * 60 * 60 * 24 * 30))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.n);
}

/**
 * Compile preferences + notes into a system-prompt fragment for the Architect.
 * Returns the empty string if the profile is empty.
 */
export function compileSystemPromptPrefix(profile: UserProfile | null): string {
  if (!profile) return "";
  const lines: string[] = [];
  const p = profile.preferences;
  if (p.typographyVoice || p.colorStory || p.motionPersonality) {
    lines.push("USER STAKE PREFERENCES (respect by default):");
    if (p.typographyVoice) lines.push(`  - typography_voice = ${p.typographyVoice}`);
    if (p.colorStory) lines.push(`  - color_story = ${p.colorStory}`);
    if (p.motionPersonality) lines.push(`  - motion_personality = ${p.motionPersonality}`);
  }
  if (p.rejectedDefaults?.length) {
    lines.push(`AVOID: ${p.rejectedDefaults.join(", ")}`);
  }
  if (profile.notes.length) {
    lines.push("NOTES FROM PAST INTERACTIONS:");
    for (const n of profile.notes.slice(0, 10)) {
      lines.push(`  - ${n.text}`);
    }
  }
  return lines.length ? `\n${lines.join("\n")}\n` : "";
}
