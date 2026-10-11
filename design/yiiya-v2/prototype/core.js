/* YIIYA v2 prototype — core: state, routing, rendering helpers, focus and
 * announcements. Vanilla JS so it runs from any static server with no build.
 * All outcomes are SIMULATED; see fixtures.js. */
(function () {
  const YI = (window.YI = window.YI || {});

  // ─── Icons (24px stroke, currentColor; decorative unless labelled) ────────
  const P = {
    mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    warn: '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    zap: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    ruler: '<path d="M4 16L16 4l4 4L8 20z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M14 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M12 20h.01"/>',
    chevDown: '<path d="M6 9l6 6 6-6"/>',
    chevRight: '<path d="M9 6l6 6-6 6"/>',
    chevLeft: '<path d="M15 6l-6 6 6 6"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
    upload: '<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    flask: '<path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'
  };
  YI.icon = (name, label) =>
    `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'}>${P[name] || ""}</svg>`;

  // ─── Small helpers ─────────────────────────────────────────────────────────
  YI.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  YI.$ = (sel, root = document) => root.querySelector(sel);
  YI.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  YI.uid = () => Math.random().toString(36).slice(2, 9);
  YI.fmtElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };

  YI.layoutMode = () => {
    const w = window.innerWidth;
    return w < 768 ? "phone" : w < 1280 ? "tablet" : "desktop";
  };

  /** Replace an element's HTML while keeping keyboard focus on the same logical control. */
  YI.patch = (el, html) => {
    if (!el) return;
    const active = document.activeElement;
    const fk = active && el.contains(active) ? active.getAttribute("data-fk") : null;
    el.innerHTML = html;
    if (fk) {
      const next = el.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (next) next.focus({ preventScroll: true });
    }
  };

  // Throttled, meaningful screen-reader status. Never per-tick progress.
  let lastAnnounce = { text: "", at: 0 };
  YI.announce = (text, { assertive = false } = {}) => {
    const now = Date.now();
    if (text === lastAnnounce.text && now - lastAnnounce.at < 4000) return;
    lastAnnounce = { text, at: now };
    const el = document.getElementById(assertive ? "sr-alert" : "sr-status");
    if (!el) return;
    el.textContent = "";
    setTimeout(() => (el.textContent = text), 40);
  };

  // ─── State ────────────────────────────────────────────────────────────────
  YI.freshProject = () => ({
    name: "Untitled object",
    hasObject: false,
    params: null,
    versions: [],
    currentVersion: null,
    pendingVersion: null,
    ops: [],
    redo: [],
    localEdits: 0
  });

  YI.freshBrief = () => ({
    object: "",
    parts: [],
    height: null, // { value, unit, basis: "estimated" | "exact" }
    materials: [],
    style: "",
    destination: "Not set",
    references: [],
    preserve: [],
    questions: []
  });

  YI.S = {
    route: "landing",
    theme: "dark",
    direction: "workshop",
    cap: "current",
    frame: false,
    signedIn: false,
    authConfigured: true,
    saveState: "browser",
    online: true,
    webgl: true,
    lowMemory: false,
    project: YI.freshProject(),
    brief: YI.freshBrief(),
    messages: [],
    selection: null,
    gen: null,
    voice: "idle",
    partial: "",
    quota: "ok",
    netDrop: false,
    sheet: null,
    tab: "chat",
    inspectorTab: "brief",
    snap: "half",
    firstRun: true,
    draft: "",
    references: [],
    library: { state: "populated", query: "", filter: "all", renaming: null },
    capture: { step: "frame" },
    view: { state: "ready" },
    auth: { state: "idle" },
    protoOpen: false
  };

  YI.setState = (patch) => {
    Object.assign(YI.S, typeof patch === "function" ? patch(YI.S) : patch);
    YI.render();
  };

  // ─── Routing (hash: #/route?key=value) ─────────────────────────────────────
  YI.parseHash = () => {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, query] = raw.split("?");
    const params = Object.fromEntries(new URLSearchParams(query || ""));
    return { path: path.replace(/^\//, "") || "landing", params };
  };

  YI.go = (route, extra = {}) => {
    const q = new URLSearchParams();
    if (YI.S.frame) q.set("frame", "1");
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const qs = q.toString();
    location.hash = `#/${route}${qs ? "?" + qs : ""}`;
  };

  // ─── Sheets with focus trap + focus return ─────────────────────────────────
  let returnFocus = null;
  YI.openSheet = (type, opts = {}) => {
    if (!YI.S.sheet) returnFocus = document.activeElement;
    YI.S.sheet = { type, ...opts };
    YI.render();
    requestAnimationFrame(() => {
      const sheet = document.querySelector(".sheet");
      const target = sheet && (sheet.querySelector("[data-autofocus]") || sheet.querySelector("h2"));
      if (target) {
        if (!target.hasAttribute("tabindex") && target.tagName === "H2") target.setAttribute("tabindex", "-1");
        target.focus();
      }
    });
  };
  YI.closeSheet = () => {
    YI.S.sheet = null;
    YI.render();
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    else {
      const fk = returnFocus && returnFocus.getAttribute && returnFocus.getAttribute("data-fk");
      const again = (fk && document.querySelector(`[data-fk="${CSS.escape(fk)}"]`)) || document.querySelector("#prompt") || document.querySelector("main");
      if (again) again.focus();
    }
    returnFocus = null;
  };

  document.addEventListener("keydown", (e) => {
    const sheet = document.querySelector(".sheet");
    if (!sheet) return;
    if (e.key === "Escape") {
      e.preventDefault();
      YI.closeSheet();
      return;
    }
    if (e.key !== "Tab") return;
    const f = [...sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!f.includes(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ─── Reusable markup ──────────────────────────────────────────────────────
  YI.btn = (label, act, { variant = "secondary", icon, arg, disabled, fk, size, title, extra = "", iconOnly } = {}) =>
    `<button type="button" class="btn btn-${variant}${size ? " btn-" + size : ""}${iconOnly ? " btn-icon" : ""}" ${act ? `data-act="${act}"` : ""} ${arg !== undefined ? `data-arg="${YI.esc(arg)}"` : ""} ${disabled ? "disabled" : ""} ${fk ? `data-fk="${fk}"` : ""} ${title ? `title="${YI.esc(title)}"` : ""} ${iconOnly ? `aria-label="${YI.esc(label)}"` : ""} ${extra}>${icon ? YI.icon(icon) : ""}${iconOnly ? "" : `<span>${label}</span>`}</button>`;

  const ACTION_META = {
    local: { label: "Instant edit", icon: "zap", note: "No generation" },
    generative: { label: "New version", icon: "layers", note: "Uses the free GPU queue" },
    parametric: { label: "Exact edit", icon: "ruler", note: "Validated by code" },
    unsupported: { label: "Not available yet", icon: "ban", note: "" },
    clarify: { label: "Question", icon: "help", note: "" },
    readiness: { label: "Readiness", icon: "check", note: "" }
  };
  YI.ACTION_META = ACTION_META;
  YI.actionBadge = (type, { future } = {}) => {
    const m = ACTION_META[type];
    return `<span class="badge badge-${type}">${YI.icon(m.icon)}<span>${m.label}</span>${future ? `<span class="badge-future">${future}</span>` : ""}</span>`;
  };
  YI.futureTag = (phase = "Proposed") => `<span class="tag-future" title="Not built yet — proposed capability">${YI.icon("flask")}${phase}</span>`;
  YI.simTag = (text = "Simulated") => `<span class="tag-sim">${text}</span>`;

  YI.notice = (tone, title, body, actions = "", { role } = {}) => {
    const ic = { danger: "warn", warning: "warn", info: "info", success: "check", unknown: "help", future: "flask" }[tone] || "info";
    return `<div class="notice notice-${tone}" ${role ? `role="${role}"` : ""}>
      <span class="notice-icon">${YI.icon(ic)}</span>
      <div class="notice-body"><p class="notice-title">${title}</p>${body ? `<p class="notice-text">${body}</p>` : ""}${actions ? `<div class="notice-actions">${actions}</div>` : ""}</div>
    </div>`;
  };
})();
