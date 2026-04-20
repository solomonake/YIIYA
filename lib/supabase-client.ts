"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
      anonKey &&
      !url.includes("your_supabase") &&
      !anonKey.includes("your_supabase")
  );
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient;
}

/*
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own projects" ON projects FOR ALL USING (auth.uid() = user_id);
ALTER TABLE published_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own published" ON published_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "published projects are readable" ON published_projects FOR SELECT USING (true);
*/
