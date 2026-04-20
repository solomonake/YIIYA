import { NextResponse } from "next/server";
import { canUseSupabasePublish } from "@/lib/supabase-projects";

function hasUsableValue(value: string | undefined, placeholder: string) {
  return Boolean(value && !value.includes(placeholder));
}

export function GET() {
  const provider = process.env.AI_PROVIDER === "gemini" ? "gemini" : "anthropic";
  const anthropicConfigured = hasUsableValue(
    process.env.ANTHROPIC_API_KEY,
    "your_anthropic"
  );
  const geminiConfigured = hasUsableValue(
    process.env.GEMINI_API_KEY,
    "your_gemini"
  );
  const selectedProviderConfigured =
    provider === "gemini" ? geminiConfigured : anthropicConfigured;

  return NextResponse.json({
    ok: true,
    ai: {
      provider,
      selectedProviderConfigured,
      anthropicConfigured,
      geminiConfigured,
      localFallbackEnabled: true
    },
    supabase: {
      publishConfigured: canUseSupabasePublish(),
      publicUrlConfigured: hasUsableValue(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        "your_supabase"
      ),
      anonKeyConfigured: hasUsableValue(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        "your_supabase"
      )
    }
  });
}
