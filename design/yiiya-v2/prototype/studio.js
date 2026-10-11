/* Studio view: canvas-first workspace with conversation, composer,
 * canvas overlays and inspector. Layout changes by breakpoint:
 *   desktop ≥1280: conversation | canvas | inspector
 *   tablet 768–1279: canvas | tabbed side panel (composer pinned)
 *   phone <768: canvas + bottom sheet (Chat/Brief/Part/Versions), composer pinned */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;
  const esc = (s) => YI.esc(s);
  const ic = (n, l) => YI.icon(n, l);

  let builtLayout = null;
  let canvas = null;
  let canvasFallback = false;

  YI.resetStudioShell = () => { builtLayout = null; };

  // ─── Shell ────────────────────────────────────────────────────────────────
  YI.renderStudio = (root) => {
    const mode = YI.layoutMode();
    if (builtLayout !== mode || !root.querySelector(".studio")) {
      builtLayout = mode;
      root.innerHTML = shell(mode);
      mountCanvas();
    }
    const studio = root.querySelector(".studio");
    studio.dataset.snap = S().snap;
    studio.classList.toggle("is-empty", !S().project.hasObject && !S().gen && !S().messages.length);
    YI.patch(YI.$("#topbar"), topbar(mode));
    YI.patch(YI.$("#banners"), banners());
    YI.patch(YI.$("#messages"), messages());
    YI.patch(YI.$("#composer-context"), composerContext());
    YI.patch(YI.$("#composer-meta"), composerMeta());
    YI.patch(YI.$("#canvas-overlays"), canvasOverlays(mode));
    const prompt = YI.$("#prompt");
    if (prompt && document.activeElement !== prompt && prompt.value !== S().draft) prompt.value = S().draft;
    if (prompt) {
      prompt.disabled = false;
      prompt.placeholder = placeholder();
    }
    const mic = YI.$("#mic-btn");
    if (mic) {
      const v = S().voice;
      mic.dataset.state = v;
      mic.setAttribute("aria-pressed", String(v === "listening" || v === "partial"));
      mic.setAttribute("aria-label", v === "listening" || v === "partial" ? "Stop listening" : "Start voice input");
    }
    const sendBtn = YI.$("#send-btn");
    if (sendBtn) sendBtn.disabled = !S().draft.trim() && !S().references.length;
    if (mode === "desktop") {
      YI.patch(YI.$("#inspector-tabs"), tabs(["brief", "part", "versions"], S().inspectorTab, "inspector"));
      YI.patch(YI.$("#inspector-body"), inspectorBody(S().inspectorTab));
    } else {
      YI.patch(YI.$("#side-tabs"), tabs(["chat", "brief", "part", "versions"], S().tab, "side"));
      YI.$$(".side-pane").forEach((el) => (el.hidden = el.dataset.pane !== (S().tab === "chat" ? "chat" : "other")));
      if (S().tab !== "chat") YI.patch(YI.$("#side-body"), inspectorBody(S().tab));
    }
    YI.canvasSync();
  };

  function shell(mode) {
    const composer = `
      <form id="composer" class="composer" data-act-submit="send" aria-label="Message YIIYA">
        <div id="composer-context" class="composer-context"></div>
        <div class="composer-row">
          <button type="button" class="btn btn-ghost btn-icon" data-act="open-sheet" data-arg="capture" aria-label="Add a photo or reference" data-fk="attach">${ic("image")}</button>
          <label class="sr-only" for="prompt">Describe an object or a change</label>
          <textarea id="prompt" data-fk="prompt" rows="1" autocomplete="off" enterkeyhint="send"></textarea>
          <button type="button" id="mic-btn" class="btn btn-ghost btn-icon mic" data-act="voice-toggle" data-fk="mic" aria-pressed="false" aria-label="Start voice input">${ic("mic")}</button>
          <button type="submit" id="send-btn" class="btn btn-primary btn-icon" aria-label="Send" data-fk="send">${ic("send")}</button>
        </div>
        <div id="composer-meta" class="composer-meta"></div>
      </form>`;
    const canvasMain = `
      <main class="canvas-wrap" id="main" aria-label="3D canvas">
        <div id="canvas-host" class="canvas-host" tabindex="0" data-fk="canvas" role="group" aria-roledescription="3D viewer" aria-label="3D view" aria-describedby="canvas-help"></div>
        <p id="canvas-help" class="sr-only">Arrow keys rotate, plus and minus zoom, 0 resets the view. Select parts from the Part panel or by clicking the model. Escape clears the selection.</p>
        <div id="canvas-overlays" class="canvas-overlays"></div>
      </main>`;
    const chatPane = `<div id="messages" class="messages" role="log" aria-label="Conversation history" tabindex="0"></div>`;

    if (mode === "desktop") {
      return `<div class="studio layout-desktop">
        <a class="skip" href="#prompt">Skip to message box</a>
        <header id="topbar" class="topbar"></header>
        <div id="banners"></div>
        <div class="studio-grid">
          <section class="chat-panel" aria-label="Conversation">
            <div class="panel-head"><h2 class="panel-title">Conversation</h2><span class="panel-sub">Text and voice do the same things</span></div>
            ${chatPane}
            ${composer}
          </section>
          ${canvasMain}
          <aside class="inspector" aria-label="Inspector">
            <div id="inspector-tabs"></div>
            <div id="inspector-body" class="inspector-body"></div>
          </aside>
        </div>
      </div>`;
    }
    const side = `
      <div id="side-tabs" class="side-tabs"></div>
      <div class="side-pane" data-pane="chat">${chatPane}</div>
      <div class="side-pane" data-pane="other" hidden><div id="side-body" class="inspector-body"></div></div>
      ${composer}`;
    if (mode === "tablet") {
      return `<div class="studio layout-tablet">
        <a class="skip" href="#prompt">Skip to message box</a>
        <header id="topbar" class="topbar"></header>
        <div id="banners"></div>
        <div class="studio-grid">
          ${canvasMain}
          <aside class="side-panel" aria-label="Conversation and inspector">${side}</aside>
        </div>
      </div>`;
    }
    return `<div class="studio layout-phone">
      <a class="skip" href="#prompt">Skip to message box</a>
      <header id="topbar" class="topbar"></header>
      <div id="banners"></div>
      <div class="studio-grid">
        ${canvasMain}
        <section class="mobile-sheet" aria-label="Conversation and inspector">
          <button type="button" class="sheet-handle" data-act="snap-cycle" data-fk="handle" aria-label="Resize panel"><span></span></button>
          ${side}
        </section>
      </div>
    </div>`;
  }

  function placeholder() {
    const s = S();
    if (s.selection) return `Change the ${YI.PART_LABEL[s.selection].toLowerCase()}…`;
    if (s.project.hasObject) return "Describe a change…";
    return "Describe an object…";
  }

  // ─── Top bar ──────────────────────────────────────────────────────────────
  const SAVE = {
    browser: { icon: "check", text: "Saved in this browser", tone: "neutral", detail: "Sign in to keep it across devices" },
    account: { icon: "check", text: "Saved to your account", tone: "success" },
    saving: { icon: "clock", text: "Saving…", tone: "neutral" },
    offline: { icon: "wifiOff", text: "Offline · saved in this browser", tone: "warning" },
    conflict: { icon: "warn", text: "Changed on another device", tone: "danger" },
    error: { icon: "warn", text: "Account save failed · kept in this browser", tone: "warning" },
    expired: { icon: "warn", text: "Sign-in expired · saving in this browser", tone: "warning" }
  };
  YI.SAVE = SAVE;

  function topbar(mode) {
    const s = S();
    const sv = SAVE[s.saveState];
    const name = s.project.hasObject || s.gen ? s.project.name : "New project";
    const save = `<button type="button" class="save-pill tone-${sv.tone}" data-act="open-sheet" data-arg="save" data-fk="save" aria-label="Save status: ${sv.text}. Details">${ic(sv.icon)}<span class="save-text">${sv.text}</span></button>`;
    const nav = (label, icon, act, arg, opts = {}) => YI.btn(label, act, { variant: "ghost", icon, arg, fk: "nav-" + label, iconOnly: opts.iconOnly, size: "sm", title: label });
    const exportBtn = YI.btn("Export", "open-sheet", { variant: s.project.hasObject ? "primary" : "secondary", icon: "download", arg: "export", fk: "nav-export", size: "sm", disabled: !s.project.hasObject, iconOnly: mode === "phone" });
    if (mode === "phone") {
      return `<a class="brand" href="#/" aria-label="YIIYA home">YIIYA</a>
        <button type="button" class="project-name" data-act="open-sheet" data-arg="rename" data-fk="pname" aria-label="Project: ${esc(name)}. Rename">${esc(name)}</button>
        <span class="topbar-spacer"></span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm tone-${sv.tone}" data-act="open-sheet" data-arg="save" aria-label="Save status: ${sv.text}" data-fk="save">${ic(sv.icon)}</button>
        ${exportBtn}
        ${YI.btn("Menu", "open-sheet", { variant: "ghost", icon: "menu", arg: "menu", iconOnly: true, size: "sm", fk: "menu" })}`;
    }
    const compact = mode === "tablet";
    return `<a class="brand" href="#/" aria-label="YIIYA home">YIIYA</a>
      <span class="divider" aria-hidden="true"></span>
      <button type="button" class="project-name" data-act="open-sheet" data-arg="rename" data-fk="pname" title="Rename project">${esc(name)}${ic("pencil")}</button>
      ${save}
      <span class="topbar-spacer"></span>
      <nav class="topnav" aria-label="Studio">
        ${nav("Projects", "folder", "go", "projects", { iconOnly: compact })}
        ${nav("Capture", "camera", "open-sheet", "capture", { iconOnly: compact })}
        ${nav("Help", "help", "open-sheet", "help", { iconOnly: true })}
        ${nav("Settings", "settings", "open-sheet", "settings", { iconOnly: true })}
        ${s.signedIn ? nav("Account", "user", "open-sheet", "account", { iconOnly: true }) : YI.btn("Sign in", "open-sheet", { variant: "ghost", arg: "account", size: "sm", fk: "signin" })}
        ${YI.btn("Share", "open-sheet", { variant: "secondary", icon: "share", arg: "share", size: "sm", fk: "nav-share", disabled: !s.project.hasObject, iconOnly: compact })}
        ${exportBtn}
      </nav>`;
  }

  function banners() {
    const s = S();
    let out = "";
    if (!s.online) out += `<div class="banner banner-warning" role="status">${ic("wifiOff")}<span><strong>You're offline.</strong> Instant edits still work and are saved in this browser. Generation and account saving resume when you reconnect.</span></div>`;
    if (s.saveState === "expired") out += `<div class="banner banner-warning">${ic("warn")}<span><strong>Your sign-in expired.</strong> Changes are kept in this browser until you sign in again.</span>${YI.btn("Sign in", "open-sheet", { arg: "account", size: "sm", variant: "secondary" })}</div>`;
    if (s.saveState === "conflict") out += `<div class="banner banner-danger">${ic("warn")}<span><strong>This project changed on another device.</strong> Choose which version to keep before saving.</span>${YI.btn("Resolve", "open-sheet", { arg: "conflict", size: "sm", variant: "secondary" })}${YI.futureTag("P1")}</div>`;
    return out;
  }

  // ─── Conversation ─────────────────────────────────────────────────────────
  function messages() {
    const s = S();
    if (!s.messages.length) {
      return `<div class="chat-empty">
        <p class="chat-empty-title">Describe an object, or add a photo.</p>
        <p class="muted">I'll ask only if something important is unclear. Then refine it by chatting or by selecting a part on the model.</p>
        <ul class="chat-empty-list">
          <li>${ic("zap")}<span><strong>Instant edits</strong> — colour, finish and size change immediately, no generation.</span></li>
          <li>${ic("layers")}<span><strong>New versions</strong> — shape changes regenerate; your current version is kept.</span></li>
          <li>${ic("download")}<span><strong>Export</strong> GLB, OBJ or STL with an honest checklist.</span></li>
        </ul>
      </div>`;
    }
    return s.messages.map(message).join("");
  }

  function list(label, items, cls = "") {
    if (!items || !items.length) return "";
    return `<div class="card-list ${cls}"><span class="card-list-label">${label}</span><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  }

  function message(m) {
    if (m.role === "user") {
      return `<div class="msg msg-user">
        ${m.selection ? `<span class="on-part">${ic("cube")} On: ${esc(m.selection)}</span>` : ""}
        <div class="bubble">${esc(m.text)}</div>
        ${m.voice ? `<span class="msg-meta">${ic("mic")} Voice · transcribed</span>` : ""}
      </div>`;
    }
    if (m.role === "system") {
      return `<div class="msg msg-system tone-${m.tone}">${ic(m.tone === "danger" ? "warn" : "info")}<span>${esc(m.text)}</span></div>`;
    }
    if (m.kind === "note") {
      return `<div class="msg msg-assistant"><span class="avatar" aria-hidden="true">Y</span><div class="msg-body"><p>${m.text}</p>
        ${m.suggestions ? `<div class="chips" role="group" aria-label="Suggestions">${m.suggestions.map((x) => `<button type="button" class="chip" data-act="suggest" data-arg="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
      </div></div>`;
    }
    const dismissed = m.dismissed;
    const btns = (m.buttons || [])
      .map((b, i) => `<button type="button" class="btn btn-${b.variant || "secondary"} btn-sm" data-act="${b.act}" data-arg="${esc(b.arg ?? "")}" data-msg="${m.id}" data-idx="${i}" ${dismissed ? "disabled" : ""}>${b.icon ? ic(b.icon) : ""}<span>${esc(b.label)}</span></button>`)
      .join("");
    return `<div class="msg msg-assistant"><span class="avatar" aria-hidden="true">Y</span>
      <article class="action-card action-${m.action}${dismissed ? " is-dismissed" : ""}" aria-label="${esc(YI.ACTION_META[m.action].label)}: ${esc(m.title)}">
        <header class="action-head">${YI.actionBadge(m.action)}${m.future ? YI.futureTag(m.future) : ""}${m.action === "generative" && !m.future ? `<span class="action-note">${YI.ACTION_META.generative.note}</span>` : ""}</header>
        <h3 class="action-title">${esc(m.title)}</h3>
        ${m.body ? `<p class="action-body">${esc(m.body)}</p>` : ""}
        ${m.target ? `<div class="card-list"><span class="card-list-label">Target</span><span class="target-chip">${ic("cube")}${esc(m.target)}</span></div>` : ""}
        ${list("Changes", m.changes)}
        ${list("Keep (requested)", m.preserved, "keep")}
        ${list("May change", m.mayChange, "may")}
        ${btns ? `<div class="action-buttons">${btns}</div>` : ""}
        ${m.hint ? `<p class="action-hint">${ic("flask")} ${esc(m.hint)}</p>` : ""}
        ${dismissed ? `<p class="action-hint">${esc(dismissed)}</p>` : ""}
      </article></div>`;
  }

  YI.scrollChat = () => requestAnimationFrame(() => {
    const el = YI.$("#messages");
    if (!el || !S().messages.length) return;
    el.scrollTop = el.scrollHeight;
  });

  // ─── Composer ─────────────────────────────────────────────────────────────
  function composerContext() {
    const s = S();
    let out = "";
    if (s.selection) {
      out += `<span class="context-chip selection-chip">${ic("cube")}<span>Selected: <strong>${YI.PART_LABEL[s.selection]}</strong></span><button type="button" class="chip-x" data-act="clear-selection" aria-label="Clear selection">${ic("x")}</button></span>`;
    }
    for (const r of s.references) {
      out += `<span class="context-chip ref-chip"><span class="ref-thumb" aria-hidden="true"></span><span>${esc(r.name)}</span><button type="button" class="chip-x" data-act="remove-ref" data-arg="${esc(r.name)}" aria-label="Remove ${esc(r.name)}">${ic("x")}</button></span>`;
    }
    return out;
  }

  YI.previewIntent = (text) => {
    const t = text.toLowerCase().trim();
    const s = S();
    if (!t) return null;
    if (!s.project.hasObject) return { type: "generative", text: "Starts a new object · uses the free GPU queue" };
    if (/^(undo|redo)\b/.test(t)) return { type: "local", text: "Undo / redo · instant" };
    if (/\b(rig|animate|step|fbx|split into parts|manufactur)/.test(t)) return { type: "unsupported", text: "Not available yet — I'll suggest a next step" };
    if (/\d+\s*(cm|mm|centimet|millimet|in\b|inch)/.test(t)) return s.cap === "proposed" ? { type: "parametric", text: "Exact size constraint · proposed P2" } : { type: "local", text: "Scales the display size · estimate, not exact" };
    if (/\b(thinner|thicker|add|remove|longer|shorter|wider|switch|chain|handle|shape)\b/.test(t)) {
      if (s.cap === "proposed" && s.selection === "neck" && /thinner|thicker/.test(t)) return { type: "parametric", text: "Exact part edit · proposed P2" };
      return { type: "generative", text: "New version · uses the free GPU queue · current version kept" };
    }
    if (/\b(matte|matt|glossy|satin|black|white|red|green|blue|brass|gold|chrome|walnut|terracotta|bigger|smaller|grey|gray)\b/.test(t)) return { type: "local", text: s.selection ? `Instant edit on ${YI.PART_LABEL[s.selection]} · no generation` : "Instant edit · no generation" };
    return { type: "generative", text: "Probably a new version · I'll confirm first" };
  };

  function composerMeta() {
    const s = S();
    const v = s.voice;
    const voiceLine = {
      listening: `<span class="voice-state is-live" role="status">${ic("mic")} Listening… say what to change. Press the mic or release Space to send.</span>`,
      partial: `<span class="voice-state is-live" role="status">${ic("mic")} “${esc(s.partial)}…” <span class="tag-sim">Simulated transcript</span></span>`,
      thinking: `<span class="voice-state" role="status">${ic("clock")} Got it — working on “${esc(s.partial)}”</span>`,
      denied: `<span class="voice-state tone-warning" role="alert">${ic("warn")} Microphone blocked. Allow it in your browser's site settings, or type instead.</span>`,
      unsupported: `<span class="voice-state" role="status">${ic("info")} Voice input isn't available in this browser. Typing does everything voice can.</span>`,
      speaking: `<span class="voice-state" role="status">${ic("mic")} YIIYA is speaking… start talking to interrupt. ${YI.futureTag("Realtime voice · P2")}</span>`,
      interrupted: `<span class="voice-state" role="status">${ic("mic")} Stopped speaking — listening to you. ${YI.futureTag("Realtime voice · P2")}</span>`,
      reconnecting: `<span class="voice-state tone-warning" role="status">${ic("wifiOff")} Voice connection dropped — reconnecting. Text still works. ${YI.futureTag("Realtime voice · P2")}</span>`
    }[v];
    if (voiceLine) return voiceLine;
    const intent = YI.previewIntent(s.draft);
    if (intent) return `<span class="intent-preview">${YI.actionBadge(intent.type)}<span>${esc(intent.text)}</span></span>`;
    return YI.layoutMode() === "phone"
      ? `<span class="hint">Type, or tap the mic to talk.</span>`
      : `<span class="hint">Enter to send · Shift+Enter for a new line · hold Space (outside the box) to talk</span>`;
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────
  function mountCanvas() {
    lastSyncKey = "";
    if (canvas) { try { canvas.dispose(); } catch {} canvas = null; }
    const host = YI.$("#canvas-host");
    if (!host) return;
    const want3D = S().webgl && !S().lowMemory;
    const tryMount = () => {
      if (!want3D || !YI.Canvas3D || !YI.Canvas3D.available) return false;
      try {
        canvas = YI.Canvas3D.create(host, { onSelect: (part) => YI.selectPart(part) });
        canvasFallback = false;
        return true;
      } catch (e) {
        return false;
      }
    };
    if (!tryMount()) {
      canvasFallback = true;
      if (want3D && !YI.Canvas3D) {
        // Module may still be loading; retry once it is ready.
        window.addEventListener("yi-canvas3d-ready", () => { if (YI.$("#canvas-host") === host && tryMount()) { lastSyncKey = ""; YI.render(); } }, { once: true });
      }
    }
    YI.canvasSync();
  }
  YI.remountCanvas = () => { builtLayout = null; YI.render(); };

  let lastSyncKey = "";
  YI.refreshComposer = () => {
    YI.patch(YI.$("#composer-meta"), composerMeta());
    const sendBtn = YI.$("#send-btn");
    if (sendBtn) sendBtn.disabled = !S().draft.trim() && !S().references.length;
  };

  YI.canvasSync = () => {
    const s = S();
    const host = YI.$("#canvas-host");
    if (!host) return;
    const p = s.project.params;
    const key = JSON.stringify([p, s.selection, canvasFallback, Boolean(canvas), s.theme, s.direction, host.childElementCount]);
    if (key === lastSyncKey && host.dataset.synced === "1") return;
    lastSyncKey = key;
    host.dataset.synced = "1";
    host.setAttribute("aria-label", p ? `3D view of ${s.project.name}${s.selection ? `, ${YI.PART_LABEL[s.selection]} selected` : ""}` : "3D view — empty");
    if (canvas && !canvasFallback) {
      host.classList.remove("is-fallback");
      const svg = host.querySelector(".fallback-svg");
      if (svg) svg.remove();
      if (p) {
        canvas.renderer.domElement.style.visibility = "visible";
        canvas.setParams(p);
        canvas.select(s.selection);
      } else canvas.renderer.domElement.style.visibility = "hidden";
      return;
    }
    host.classList.add("is-fallback");
    let fb = host.querySelector(".fallback-svg");
    if (!fb) { fb = document.createElement("div"); fb.className = "fallback-svg"; host.appendChild(fb); }
    fb.innerHTML = p ? YI.lampSVG(p, { selected: s.selection, interactive: true, idSuffix: "fb" }) : "";
  };

  YI.canvasControl = (cmd) => {
    if (!canvas || canvasFallback) { YI.toast("Static preview: orbit needs 3D (WebGL)."); return; }
    ({ left: () => canvas.rotate(-1), right: () => canvas.rotate(1), up: () => canvas.tilt(1), down: () => canvas.tilt(-1), in: () => canvas.zoom(-1), out: () => canvas.zoom(1), reset: () => canvas.reset() })[cmd]();
  };
  YI.canvasRefreshTheme = () => canvas && canvas.refreshTheme && canvas.refreshTheme();

  YI.selectPart = (part) => {
    const s = S();
    if (!s.project.hasObject) return;
    s.selection = part || null;
    const fromRow = document.activeElement && document.activeElement.classList.contains("part-row");
    if (part) {
      if (YI.layoutMode() === "desktop") s.inspectorTab = "part";
      YI.announce(`${YI.PART_LABEL[part]} selected.`);
    }
    YI.render();
    // Keyboard users selecting from a list keep their place in the Part panel.
    if (fromRow) {
      const target = YI.$(`[data-fk="pp-${part || "shade"}"]`);
      if (target) target.focus();
    }
  };

  function genCard(mode) {
    const s = S();
    const g = s.gen;
    if (!g) return "";
    const elapsed = `<span class="mono" data-elapsed="${g.startedAt}" data-until="${g.doneAt || ""}">${YI.fmtElapsed((g.doneAt || Date.now()) - g.startedAt)}</span>`;
    const final = ["failed", "interrupted", "cancelled", "completed"].includes(g.phase);
    if (g.phase === "failed" || g.phase === "interrupted") {
      const f = YI.FAILURES[g.error];
      const actions = [
        f.retry ? YI.btn(f.retryLabel || "Try again", "gen-retry", { variant: "primary", icon: "refresh", size: "sm", fk: "gen-retry" }) : "",
        f.token ? YI.btn("Use my own Hugging Face token", "open-sheet", { arg: "settings:generation", variant: "secondary", size: "sm" }) : "",
        f.tech ? YI.btn("Technical details", "open-sheet", { arg: "tech:" + f.tech, variant: "ghost", size: "sm" }) : "",
        YI.btn("Dismiss", "gen-dismiss", { variant: "ghost", size: "sm", fk: "gen-dismiss" })
      ].join("");
      return `<section class="gen-card is-failed" aria-labelledby="gen-title">
        <div class="gen-head">${ic("warn")}<h2 id="gen-title" class="gen-title">${f.title}</h2></div>
        <p class="gen-text">${f.body}</p>
        ${f.note ? `<p class="gen-note">${f.note}</p>` : ""}
        <p class="gen-note">YIIYA never switches to a paid service automatically. ${elapsed} elapsed.</p>
        <div class="gen-actions">${actions}</div>
      </section>`;
    }
    if (g.phase === "cancelled") {
      return `<section class="gen-card" aria-labelledby="gen-title"><div class="gen-head">${ic("stop")}<h2 id="gen-title" class="gen-title">Generation cancelled</h2></div>
        <p class="gen-text">${s.cap === "proposed" ? "The GPU job was stopped." : "Stopped waiting. Work already sent to the shared GPU may still finish there, but it won't replace your work."}</p>
        <div class="gen-actions">${YI.btn("Start again", "gen-retry", { variant: "secondary", size: "sm", icon: "refresh" })}${YI.btn("Dismiss", "gen-dismiss", { variant: "ghost", size: "sm" })}</div></section>`;
    }
    const steps = YI.genSteps();
    const phase = g.phase === "reconnecting" || g.phase === "cancel-requested" ? "queued" : g.phase;
    const idx = steps.indexOf(phase);
    const stepper = steps.filter((x) => x !== "completed").map((st, i) => {
      const state = g.phase === "completed" || i < idx ? "done" : i === idx ? "current" : "todo";
      return `<li class="step is-${state}" ${state === "current" ? 'aria-current="step"' : ""}><span class="step-dot" aria-hidden="true">${state === "done" ? ic("check") : ""}</span><span class="step-label">${YI.STEP_LABELS[st]}</span>${st === "draft" ? YI.futureTag("P1") : ""}</li>`;
    }).join("");
    let title = YI.STEP_LABELS[g.phase] || "";
    let text = "";
    if (g.phase === "preparing") text = "Reading your description and setting up the request.";
    if (g.phase === "queued") text = g.restored ? "Reconnected — your job was still waiting in the queue." : "Hugging Face GPUs are shared, so wait times vary. You can keep editing while you wait.";
    if (g.phase === "generating") text = "Building the mesh from the reference. Progress isn't reported by the service, so there's no percentage.";
    if (g.phase === "validating") text = "Making sure the file is a usable mesh before showing it.";
    if (g.phase === "draft") text = "You can inspect the draft now. Materials and export files are still finishing.";
    if (g.phase === "finishing") text = "Preparing materials and the GLB / OBJ / STL downloads.";
    if (g.phase === "reconnecting") { title = "Connection lost — reconnecting"; text = "Your job keeps running on the server. Reconnecting to it…"; }
    if (g.phase === "cancel-requested") { title = "Cancelling…"; text = "If the GPU already started, it may finish, but the result won't replace your work."; }
    if (g.phase === "completed") { title = g.kind === "new" ? "Version 1 is ready" : "New version ready — compare before using it"; text = ""; }
    const indeterminate = !final && g.phase !== "completed";
    return `<section class="gen-card${g.phase === "completed" ? " is-done" : ""}" aria-labelledby="gen-title">
      <div class="gen-head">${indeterminate ? '<span class="spinner" aria-hidden="true"></span>' : ic("check")}<h2 id="gen-title" class="gen-title">${title}</h2><span class="gen-elapsed">${elapsed}</span></div>
      ${text ? `<p class="gen-text">${text}</p>` : ""}
      <ol class="stepper" aria-label="Generation steps">${stepper}</ol>
      ${g.phase === "reconnecting" ? YI.futureTag("Durable jobs · P1") : ""}
      <div class="gen-actions">
        ${indeterminate && g.phase !== "cancel-requested" ? YI.btn(s.cap === "proposed" ? "Cancel" : "Stop", "gen-cancel", { variant: "ghost", size: "sm", icon: "stop", fk: "gen-cancel" }) : ""}
        ${mode !== "phone" && indeterminate ? `<span class="gen-note">${g.kind === "revision" ? `Version ${YI.currentVersionNo()} stays as it is.` : "Free generation on shared GPUs."}</span>` : ""}
      </div>
    </section>`;
  }

  function canvasOverlays(mode) {
    const s = S();
    const p = s.project;
    let out = "";
    if (!p.hasObject && !s.gen) {
      out += `<div class="canvas-empty">
        <h1 class="canvas-empty-title">What would you like to make?</h1>
        <p class="canvas-empty-text">Describe it, pick a starter, or start from one photo.</p>
        <div class="starter-grid" role="group" aria-label="Starter objects">
          ${YI.STARTERS.map((st) => `<button type="button" class="starter" data-act="starter" data-arg="${esc(st.prompt)}">${ic("cube")}<span>${esc(st.label)}</span></button>`).join("")}
        </div>
        <div class="canvas-empty-actions">
          ${YI.btn("Start from a photo", "open-sheet", { arg: "capture", icon: "camera", variant: "secondary" })}
          ${YI.btn("More options", "open-sheet", { arg: "new", icon: "sliders", variant: "ghost" })}
        </div>
        ${s.firstRun ? `<ol class="first-steps" aria-label="How it works"><li><span>1</span>Describe or add a photo</li><li><span>2</span>Refine by chatting or selecting a part</li><li><span>3</span>Check readiness and export</li></ol>` : ""}
        <p class="canvas-empty-note">No account needed. Work is saved in this browser until you sign in.</p>
      </div>`;
    }
    if (p.hasObject) {
      const v = p.versions.find((x) => x.id === p.currentVersion);
      out += `<div class="ov ov-tl">
        <span class="version-chip">${p.draftOnly ? `Draft · finishing` : `Version ${v ? v.n : 1}${p.versions.length > 1 ? ` of ${p.versions.length}` : ""}`}${p.ops.filter((o) => o.type === "local" && o.after.currentVersion === p.currentVersion).length ? ` · ${ic("zap")} edited` : ""}</span>
        ${p.versions.length > 1 ? YI.btn("Compare", "open-compare", { variant: "secondary", size: "sm", icon: "compare", fk: "ov-compare" }) : ""}
        ${p.standIn ? `<span class="tag-sim stand-in" title="The prototype only has a lamp model">Prototype stand-in: shown as the example lamp</span>` : ""}
      </div>`;
      out += `<div class="ov ov-tr view-tools" role="toolbar" aria-label="View controls">
        ${YI.btn("Undo", "undo", { variant: "overlay", icon: "undo", iconOnly: true, size: "sm", disabled: !p.ops.length, title: "Undo (Ctrl/⌘ Z)", fk: "ov-undo" })}
        ${YI.btn("Redo", "redo", { variant: "overlay", icon: "redo", iconOnly: true, size: "sm", disabled: !p.redo.length, title: "Redo (Ctrl/⌘ Shift Z)", fk: "ov-redo" })}
        <span class="tool-sep" aria-hidden="true"></span>
        ${YI.btn("Rotate left", "view", { variant: "overlay", icon: "rotl", iconOnly: true, size: "sm", arg: "left", fk: "ov-rl" })}
        ${YI.btn("Rotate right", "view", { variant: "overlay", icon: "rotr", iconOnly: true, size: "sm", arg: "right", fk: "ov-rr" })}
        ${mode !== "phone" ? YI.btn("Zoom in", "view", { variant: "overlay", icon: "plus", iconOnly: true, size: "sm", arg: "in", fk: "ov-zi" }) + YI.btn("Zoom out", "view", { variant: "overlay", icon: "minus", iconOnly: true, size: "sm", arg: "out", fk: "ov-zo" }) : ""}
        ${YI.btn("Reset view", "view", { variant: "overlay", icon: "fit", iconOnly: true, size: "sm", arg: "reset", fk: "ov-fit" })}
      </div>`;
      const h = p.params ? p.params.heightCm : null;
      out += `<div class="ov ov-bl">
        ${s.selection ? `<span class="selection-label">${ic("cube")} <strong>${YI.PART_LABEL[s.selection]}</strong> selected <button type="button" class="chip-x" data-act="clear-selection" aria-label="Clear selection" data-fk="ov-clear">${ic("x")}</button></span>` : `<span class="hint-pill">${mode === "phone" ? "Tap a part to select it" : "Click a part to select it · drag to orbit"}</span>`}
        ${h ? `<span class="scale-pill mono" title="Estimated from the mesh's bounding box">≈ ${h} cm tall · ${s.brief.height && s.brief.height.basis === "exact" ? "exact" : "estimated"}</span>` : ""}
      </div>`;
      const nv = p.pendingVersion && p.versions.find((x) => x.id === p.pendingVersion);
      if (nv) {
        out += `<div class="ov ov-tc pending-banner" role="status">${ic("layers")}<span>Version ${nv.n} is ready — not in use yet</span>${YI.btn("Compare", "open-compare", { arg: nv.id, size: "sm", variant: "primary", fk: "pending-compare" })}</div>`;
      }
      if (!s.gen && mode !== "phone") {
        out += `<div class="ov ov-bc quick-edits" role="group" aria-label="Instant edits">
          <span class="quick-label">${ic("zap")} Instant${s.selection ? ` · ${YI.PART_LABEL[s.selection]}` : ""}</span>
          ${YI.QUICK_EDITS.filter((q) => !s.selection || !/bigger|smaller/i.test(q)).map((q) => `<button type="button" class="chip chip-local" data-act="quick-edit" data-arg="${q}">${q}</button>`).join("")}
        </div>`;
      }
    }
    if (s.gen) out += `<div class="ov ov-gen">${genCard(mode)}</div>`;
    const unavailable = !s.webgl || s.lowMemory || (YI.Canvas3D && !YI.Canvas3D.available) || YI.moduleFailed;
    if (canvasFallback && unavailable && (p.hasObject || !s.webgl)) {
      out += `<div class="ov ov-fallback">${YI.notice("info", s.lowMemory ? "Showing a lighter preview" : "3D view unavailable — showing a static preview", s.lowMemory ? "This device is low on memory for this model. Editing, versions and export still work." : "WebGL isn't available in this browser. You can still select parts, edit, compare and export.", s.lowMemory ? YI.btn("Load full 3D anyway", "proto", { arg: "lowmem-off", size: "sm", variant: "secondary" }) : "")}</div>`;
    }
    return out;
  }

  // ─── Inspector ────────────────────────────────────────────────────────────
  function tabs(ids, current, group) {
    const labels = { chat: "Chat", brief: "Brief", part: "Part", versions: "Versions" };
    return `<div class="tabs" role="tablist" aria-label="${group === "inspector" ? "Inspector" : "Panels"}">${ids
      .map((id) => `<button type="button" role="tab" class="tab" id="tab-${group}-${id}" aria-selected="${id === current}" tabindex="${id === current ? 0 : -1}" data-act="tab" data-arg="${group}:${id}" data-fk="tab-${group}-${id}">${labels[id]}${id === "part" && S().selection ? ` <span class="tab-dot" aria-label="(selected)"></span>` : ""}${id === "versions" && S().project.pendingVersion ? ` <span class="tab-dot" aria-label="(new)"></span>` : ""}</button>`)
      .join("")}</div>`;
  }

  function inspectorBody(tab) {
    if (tab === "part") return partPanel();
    if (tab === "versions") return versionsPanel();
    return briefPanel();
  }

  function briefPanel() {
    const s = S();
    const b = s.brief;
    const cur = s.cap === "current";
    const hasObj = s.project.hasObject;
    return `<div class="panel-section">
      <div class="section-head"><h2 class="section-title">Design brief</h2>${YI.futureTag("P1")}</div>
      <p class="section-note">${cur ? "Proposed: a brief that's saved with the project and sent with every request. Today the assistant reads only the last 3 messages, so repeat important requirements." : "Saved with the project and sent with every request, so you don't have to repeat requirements."}</p>
    </div>
    <div class="panel-section">
      <label class="field-label" for="brief-object">Object</label>
      <input id="brief-object" class="input" data-bind="brief.object" data-fk="brief-object" value="${esc(b.object)}" placeholder="Describe the object first" ${hasObj ? "" : "disabled"}>
    </div>
    <div class="panel-section">
      <h3 class="field-label">Parts</h3>
      ${b.parts.length ? `<ul class="part-list">${b.parts.map((p) => `<li><button type="button" class="part-row${s.selection === p.id ? " is-selected" : ""}" data-act="select-part" data-arg="${p.id}" aria-pressed="${s.selection === p.id}" data-fk="bp-${p.id}">${ic("cube")}<span>${p.label}</span>${s.brief.preserve.some((x) => x.part === p.id) ? `<span class="keep-flag">${ic("lock")} Keep</span>` : ""}</button></li>`).join("")}</ul><p class="section-note">${cur ? "Named parts are a proposed P2 capability. Today selection is the region around where you click." : ""}</p>` : `<p class="muted small">Parts appear after the first draft.</p>`}
    </div>
    <div class="panel-section">
      <h3 class="field-label">Size</h3>
      ${b.height ? `<p class="kv"><span class="mono">≈ ${s.project.params ? s.project.params.heightCm : b.height.value} cm tall</span> <span class="tag-basis basis-${b.height.basis}">${b.height.basis === "exact" ? "Exact (P2)" : "Estimated from mesh"}</span></p>` : `<p class="muted small">Not set — optional.</p>`}
    </div>
    <div class="panel-section">
      <h3 class="field-label">Materials &amp; style</h3>
      ${b.materials.length ? `<ul class="plain-list">${b.materials.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : `<p class="muted small">—</p>`}
      ${b.style ? `<p class="small">${esc(b.style)}</p>` : ""}
    </div>
    <div class="panel-section">
      <label class="field-label" for="brief-dest">Destination</label>
      <select id="brief-dest" class="input" data-bind="brief.destination" data-fk="brief-dest">
        ${["Not set", "Render & portfolio", "AR & web", "3D print", "Game engine"].map((d) => `<option ${d === b.destination ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <p class="section-note">Sets which export checks matter. It doesn't change the model.</p>
    </div>
    <div class="panel-section">
      <h3 class="field-label">Keep (requirements)</h3>
      ${b.preserve.length ? `<ul class="req-list">${b.preserve.map((r, i) => `<li><span>${ic("lock")}${esc(r.text)}</span><button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="remove-req" data-arg="${i}" aria-label="Remove requirement: ${esc(r.text)}">${ic("x")}</button></li>`).join("")}</ul>` : `<p class="muted small">Say “keep the shade the same”, or use Keep on a part.</p>`}
      <p class="section-note">${cur ? "Sent with regenerations as a request. Regeneration can't guarantee it yet." : "Locked parts are enforced by part-aware edits."}</p>
    </div>
    <div class="panel-section">
      <h3 class="field-label">References</h3>
      ${b.references.length ? `<ul class="plain-list">${b.references.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : `<p class="muted small">None. ${YI.btn("Add photo", "open-sheet", { arg: "capture", variant: "ghost", size: "sm", icon: "image" })}</p>`}
    </div>
    ${b.questions.length ? `<div class="panel-section"><h3 class="field-label">Open questions</h3><ul class="plain-list">${b.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>` : ""}`;
  }

  function partPanel() {
    const s = S();
    if (!s.project.hasObject) return `<div class="panel-section"><p class="muted">Make an object first, then select a part here or on the model.</p></div>`;
    const cur = s.cap === "current";
    const partButtons = ["shade", "neck", "stem", "base"].map((id) => `<button type="button" class="part-row${s.selection === id ? " is-selected" : ""}" data-act="select-part" data-arg="${id}" aria-pressed="${s.selection === id}" data-fk="pp-${id}">${ic("cube")}<span>${YI.PART_LABEL[id]}</span></button>`).join("");
    const head = `<div class="panel-section"><div class="section-head"><h2 class="section-title">Select a part</h2>${cur ? YI.futureTag("Named parts · P2") : ""}</div>
      <div class="part-grid" role="group" aria-label="Parts">${partButtons}</div>
      <p class="section-note">${cur ? "Today: click the model to select the region around that point. This list is the proposed keyboard-friendly version." : "Parts come from the model's structure."}</p></div>`;
    if (!s.selection) return head + `<div class="panel-section"><h3 class="field-label">Whole object</h3>${wholeControls()}</div>`;
    const part = s.selection;
    const key = { shade: "shadeColor", neck: "neckColor", stem: "stemColor", base: "baseColor" }[part];
    const color = s.project.params[key] || s.project.params.neckColor;
    const swatches = [["Black", "black", "#121212"], ["Dark green", "dark green", "#1F3D2C"], ["Brass", "brass", "#B08A3E"], ["Chrome", "chrome", "#D7DADD"], ["White", "white", "#F2F0EB"], ["Terracotta", "terracotta", "#B5583A"], ["Navy", "navy", "#1C2B4A"]];
    const keep = s.brief.preserve.some((x) => x.part === part);
    return head + `<div class="panel-section">
      <div class="section-head"><h2 class="section-title">${YI.PART_LABEL[part]}</h2>${YI.btn("Clear", "clear-selection", { variant: "ghost", size: "sm", fk: "pp-clear" })}</div>
      <h3 class="field-label">Colour ${YI.actionBadge("local")}</h3>
      <div class="swatches" role="group" aria-label="${YI.PART_LABEL[part]} colour">
        ${swatches.map(([label, name, hex]) => `<button type="button" class="swatch${hex.toLowerCase() === String(color).toLowerCase() ? " is-current" : ""}" style="--sw:${hex}" data-act="part-color" data-arg="${name}" aria-label="${label}" aria-pressed="${hex.toLowerCase() === String(color).toLowerCase()}"></button>`).join("")}
      </div>
    </div>
    <div class="panel-section">
      <h3 class="field-label">Finish ${cur ? YI.futureTag("Per part · P2") : YI.actionBadge("local")}</h3>
      <div class="segmented" role="group" aria-label="Finish">
        ${["matte", "satin", "glossy"].map((f) => `<button type="button" class="seg" data-act="part-finish" data-arg="${f}" ${cur ? "disabled" : ""}>${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
      </div>
      ${cur ? `<p class="section-note">Finish applies to the whole lamp today. ${YI.btn("Change whole-lamp finish", "set-tab", { arg: "wholefinish", variant: "ghost", size: "sm" })}</p>` : ""}
    </div>
    <div class="panel-section">
      <h3 class="field-label">Shape</h3>
      ${part === "neck" ? `<label class="field-label small" for="neck-r">Tube radius ${cur ? YI.futureTag("Exact · P2") : ""}</label>
        <div class="range-row"><input id="neck-r" type="range" min="4" max="16" step="1" value="${s.project.params.neckRadius}" ${cur ? "disabled" : 'data-act-input="neck-radius"'} aria-describedby="neck-r-note"><span class="mono">${s.project.params.neckRadius} mm</span></div>
        <p id="neck-r-note" class="section-note">${cur ? "Today, shape changes regenerate the whole lamp. Describe the change in the message box." : "Exact edit: only the neck changes."}</p>` : `<p class="section-note">Describe a shape change in the message box. It creates a new version.</p>`}
      ${YI.btn(`Describe a change to the ${YI.PART_LABEL[part].toLowerCase()}`, "prefill", { arg: "Make this ", variant: "secondary", size: "sm", icon: "message" })}
    </div>
    <div class="panel-section">
      <label class="check-row"><input type="checkbox" data-act-change="toggle-keep" data-arg="${part}" ${keep ? "checked" : ""}> <span>Keep this part in new versions</span></label>
      <p class="section-note">${cur ? "Added to your requirements. Regeneration tries to respect it but can't guarantee it yet." : "Locked: new versions can't change it."}</p>
    </div>`;
  }

  function wholeControls() {
    const s = S();
    const h = s.project.params.heightCm;
    return `<div class="field-row">
        <label class="field-label small" for="height-in">Height</label>
        <div class="num-row"><input id="height-in" class="input input-num" type="number" inputmode="decimal" min="5" max="300" step="0.5" value="${h}" data-fk="height-in"><span class="unit">cm</span>${YI.btn("Set", "set-height", { size: "sm", variant: "secondary", fk: "height-set" })}</div>
        <p class="section-note">${s.cap === "current" ? "Scales the display uniformly — an estimate, not an exact dimension." : "Exact height constraint (proposed P2)."}</p>
      </div>
      <div class="field-row"><span class="field-label small">Size</span><div class="btn-row">${YI.btn("Smaller", "quick-edit", { arg: "Smaller", size: "sm", variant: "secondary", icon: "minus" })}${YI.btn("Bigger", "quick-edit", { arg: "Bigger", size: "sm", variant: "secondary", icon: "plus" })}</div></div>
      <div class="field-row" id="whole-finish"><span class="field-label small">Finish (whole lamp)</span><div class="segmented" role="group" aria-label="Whole lamp finish">${["Matte", "Satin", "Glossy"].map((f) => `<button type="button" class="seg" data-act="quick-edit" data-arg="${f}">${f}</button>`).join("")}</div></div>`;
  }

  function versionsPanel() {
    const s = S();
    const p = s.project;
    if (!p.versions.length) return `<div class="panel-section"><p class="muted">Versions appear here after the first draft. Failed generations are never listed as versions.</p></div>`;
    const kindLabel = { generated: "Generated", regenerated: "Regenerated", parametric: "Exact edit" };
    const vs = [...p.versions].reverse().map((v) => {
      const isCur = v.id === p.currentVersion, isPending = v.id === p.pendingVersion;
      return `<li class="version${isCur ? " is-current" : ""}">
        <div class="version-thumb">${YI.lampSVG(v.params, { idSuffix: "vt" + v.id })}</div>
        <div class="version-info">
          <p class="version-name">Version ${v.n} · ${esc(v.label)}</p>
          <p class="version-meta">${kindLabel[v.kind]}${v.basedOn ? ` from v${v.basedOn.slice(1)}` : ""} · ${isCur ? "<strong>In use</strong>" : isPending ? "<strong>New — not in use</strong>" : "Kept"}</p>
          <div class="btn-row">${isCur ? "" : YI.btn("Use", "use-version", { arg: v.id, size: "sm", variant: "secondary" })}${p.versions.length > 1 ? YI.btn("Compare", "open-compare", { arg: v.id, size: "sm", variant: "ghost", icon: "compare" }) : ""}</div>
        </div></li>`;
    }).join("");
    const opIcon = { local: "zap", generative: "layers", parametric: "ruler", version: "history" };
    const ops = [...p.ops].reverse().slice(0, 12).map((o) => `<li class="op op-${o.type}">${ic(opIcon[o.type] || "history")}<span>${esc(o.label)}</span></li>`).join("");
    return `<div class="panel-section"><div class="section-head"><h2 class="section-title">Versions</h2>${p.versions.length > 1 ? YI.btn("Compare", "open-compare", { size: "sm", variant: "secondary", icon: "compare" }) : ""}</div><ul class="version-list">${vs}</ul></div>
      <div class="panel-section"><div class="section-head"><h2 class="section-title">History</h2><div class="btn-row">${YI.btn("Undo", "undo", { size: "sm", variant: "ghost", icon: "undo", disabled: !p.ops.length })}${YI.btn("Redo", "redo", { size: "sm", variant: "ghost", icon: "redo", disabled: !p.redo.length })}</div></div>
      <ul class="op-list">${ops}</ul>
      <p class="section-note">Undo covers instant edits and version switches. It isn't a full CAD operation history. ${S().cap === "current" ? "Today instant edits are kept only in the viewer and aren't in downloads." : ""}</p></div>`;
  }

  // Live elapsed timers without re-rendering.
  setInterval(() => {
    YI.$$("[data-elapsed]").forEach((el) => {
      if (el.dataset.until) return;
      el.textContent = YI.fmtElapsed(Date.now() - Number(el.dataset.elapsed));
    });
  }, 1000);
})();
