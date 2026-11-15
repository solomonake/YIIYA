/** Browser-only capability transport; never put credentials in API query strings. */
export function scanAccessHeaders(scanId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const key = `yiiya:scan-access:${scanId}`;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const supplied = fragment.get("scanToken");
  let token = supplied;
  try {
    if (supplied && /^[A-Za-z0-9_-]{43}$/.test(supplied)) window.sessionStorage.setItem(key, supplied);
    else token = window.sessionStorage.getItem(key);
  } catch { /* A blocked tab store still permits the original fragment token. */ }
  if (supplied && token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    // Keep fragment if storage failed so later capture requests retain access.
    try {
      if (window.sessionStorage.getItem(key) === token) {
        fragment.delete("scanToken");
        const rest = fragment.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
      }
    } catch { /* Token stays in fragment, never in request URL. */ }
  }
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? { "x-yiiya-scan-token": token } : {};
}
