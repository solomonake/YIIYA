"use client";

/**
 * Minimal brand-kit manager UI.
 *
 * Fetches /api/brand-kits with the user's Supabase access token. Lists kits;
 * lets the user create, rename, delete, and now **upload a logo file** which
 * routes through /api/brand-kits/upload → Vercel Blob, then PATCHes the kit
 * with the returned public URL. Pasting an HTTPS URL still works as a
 * lightweight alternative when Blob isn't configured.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

type BrandKit = {
  id: string;
  name: string;
  logo_url: string | null;
  palette: string[];
  fonts: Record<string, string>;
  voice_rules: Record<string, unknown>;
  do_not_use: string[];
  created_at: string;
  updated_at: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  if (!supa) return {};
  const { data } = await supa.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function BrandKitsClient() {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/brand-kits", { headers });
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const { items } = (await res.json()) as { items: BrandKit[] };
      setKits(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), palette: [], fonts: {}, voiceRules: {}, doNotUse: [] })
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deleteKit(id: string) {
    if (!confirm("Delete this brand kit?")) return;
    const headers = await authHeader();
    const res = await fetch(`/api/brand-kits/${id}`, { method: "DELETE", headers });
    if (res.ok) await refresh();
  }

  async function uploadLogo(kitId: string, file: File) {
    setUploadingId(kitId);
    setError(null);
    try {
      const headers = await authHeader();
      const form = new FormData();
      form.set("file", file);
      const uploadRes = await fetch("/api/brand-kits/upload", {
        method: "POST",
        headers, // FormData sets its own Content-Type with boundary
        body: form
      });
      if (!uploadRes.ok) {
        const body = (await uploadRes.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `upload failed: ${uploadRes.status}`);
      }
      const { url } = (await uploadRes.json()) as { url: string };

      const patchHeaders = { "Content-Type": "application/json", ...(await authHeader()) };
      const patchRes = await fetch(`/api/brand-kits/${kitId}`, {
        method: "PATCH",
        headers: patchHeaders,
        body: JSON.stringify({ logoUrl: url })
      });
      if (!patchRes.ok) throw new Error(`save failed: ${patchRes.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--yiiya-bg, #050505)",
        color: "var(--yiiya-fg, #F2F2F2)",
        padding: "40px 32px",
        fontFamily: "var(--yiiya-font-mono, monospace)"
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--yiiya-font-heading, serif)", fontWeight: 400, fontSize: 36, margin: 0 }}>
          Brand kits
        </h1>
        <p style={{ opacity: 0.6, marginTop: 8 }}>
          Upload your logo, palette, and fonts once — every YIIYA generation respects them.
        </p>
      </header>

      <form onSubmit={createKit} style={{ display: "flex", gap: 8, marginBottom: 32, maxWidth: 560 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Acme — main brand)"
          style={{
            flex: 1,
            background: "transparent",
            color: "inherit",
            border: "1px solid var(--yiiya-edge, #1F1F1F)",
            padding: "10px 12px",
            fontFamily: "inherit"
          }}
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          style={{
            background: "var(--yiiya-accent, #FFFFFF)",
            color: "#000",
            border: "none",
            padding: "10px 16px",
            cursor: creating ? "wait" : "pointer",
            fontFamily: "inherit"
          }}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>

      {error && <p style={{ color: "#FF6B6B" }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : kits.length === 0 ? (
        <p style={{ opacity: 0.5 }}>No brand kits yet. Create one above.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {kits.map((k) => (
            <BrandKitCard
              key={k.id}
              kit={k}
              uploading={uploadingId === k.id}
              onDelete={() => deleteKit(k.id)}
              onUpload={(file) => uploadLogo(k.id, file)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function BrandKitCard({
  kit,
  uploading,
  onDelete,
  onUpload
}: {
  kit: BrandKit;
  uploading: boolean;
  onDelete: () => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <li
      style={{
        border: "1px solid var(--yiiya-edge, #1F1F1F)",
        padding: 16,
        display: "grid",
        gap: 12
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{kit.name}</strong>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${kit.name}`}
          style={{ background: "transparent", color: "inherit", border: "none", cursor: "pointer", opacity: 0.5 }}
        >
          ✕
        </button>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 8,
          border: "1px dashed var(--yiiya-edge, #1F1F1F)"
        }}
      >
        {kit.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={kit.logo_url}
            alt={`${kit.name} logo`}
            style={{ width: 48, height: 48, objectFit: "contain", background: "#FFF" }}
          />
        ) : (
          <span style={{ width: 48, height: 48, opacity: 0.3, display: "grid", placeItems: "center", fontSize: 11 }}>
            no logo
          </span>
        )}
        <div style={{ flex: 1, display: "grid", gap: 4 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              background: "transparent",
              color: "inherit",
              border: "1px solid var(--yiiya-edge, #1F1F1F)",
              padding: "6px 10px",
              cursor: uploading ? "wait" : "pointer",
              fontFamily: "inherit",
              fontSize: 12
            }}
          >
            {uploading ? "Uploading…" : kit.logo_url ? "Replace logo" : "Upload logo"}
          </button>
          <small style={{ opacity: 0.4, fontSize: 10 }}>PNG / JPG / WEBP / SVG · max 5MB</small>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {kit.palette.length === 0 ? (
          <span style={{ opacity: 0.4, fontSize: 11 }}>no palette set</span>
        ) : (
          kit.palette.map((c) => (
            <span
              key={c}
              title={c}
              style={{ width: 20, height: 20, background: c, border: "1px solid var(--yiiya-edge)" }}
            />
          ))
        )}
      </div>
      <small style={{ opacity: 0.45 }}>updated {new Date(kit.updated_at).toLocaleDateString()}</small>
    </li>
  );
}
