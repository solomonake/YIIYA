function hasUsableValue(value: string | undefined) {
  return Boolean(
    value &&
      !value.includes("your_") &&
      !value.includes("YOUR_") &&
      value.trim().length > 8
  );
}

export type SupabaseRole = "anon" | "service";

export function getSupabaseRestConfig(role: SupabaseRole) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = role === "service" ? serviceRoleKey : anonKey;

  if (!hasUsableValue(url) || !hasUsableValue(key)) {
    return null;
  }

  return {
    url: url!.replace(/\/$/, ""),
    key: key!
  };
}

export function isSupabaseRestConfigured(role: SupabaseRole) {
  return Boolean(getSupabaseRestConfig(role));
}

export async function supabaseRestFetch(
  path: string,
  init: RequestInit = {},
  role: SupabaseRole = "service"
) {
  const config = getSupabaseRestConfig(role);

  if (!config) {
    throw new Error(`Supabase ${role} REST access is not configured`);
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", config.key);
  headers.set("Authorization", `Bearer ${config.key}`);

  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers
  });
}
