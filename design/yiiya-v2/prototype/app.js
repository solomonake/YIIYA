/* Bootstrap, render dispatch, event delegation, keyboard and the
 * prototype-only control drawer (clearly separated from product UI). */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;
  const $ = YI.$;

  // ─── Render ───────────────────────────────────────────────────────────────
  let lastRoute = null;
  YI.render = () => {
    const s = S();
    const html = document.documentElement;
    html.dataset.theme = s.theme;
    html.dataset.direction = s.direction;
    html.dataset.cap = s.cap;
    html.dataset.frame = s.frame ? "1" : "0";
    const root = $("#app");
    if (lastRoute !== s.route) {
      YI.resetStudioShell();
      lastRoute = s.route;
    }
    if (s.route === "studio") YI.renderStudio(root);
    else if (s.route === "projects") YI.renderProjects(root);
    else if (s.route === "capture") YI.renderCapture(root);
    else if (s.route === "view") { if (root.dataset.rendered !== "view:" + s.view.state) { YI.renderViewer(root); root.dataset.rendered = "view:" + s.view.state; } }
    else if (s.route === "auth") YI.renderAuth(root);
    else YI.renderLanding(root);
    if (s.route !== "view") root.dataset.rendered = "";
    YI.patch($("#sheet-root"), YI.renderSheet());
    document.body.classList.toggle("has-sheet", Boolean(s.sheet));
    // Background is inert while a dialog is open: no focus or clicks escape it.
    $("#app").inert = Boolean(s.sheet);
    $("#proto-root").inert = Boolean(s.sheet);
    renderProto();
  };

  YI.toast = (text) => {
    const el = $("#toast-root");
    el.innerHTML = `<div class="toast" role="status">${YI.esc(text)}</div>`;
    clearTimeout(YI.toast.t);
    YI.toast.t = setTimeout(() => (el.innerHTML = ""), 2800);
  };

  // ─── Routing ──────────────────────────────────────────────────────────────
  function onHash() {
    const { path, params } = YI.parseHash();
    const s = S();
    s.frame = params.frame === "1";
    let sc = null;
    if (params.scenario) sc = YI.applyScenario(params.scenario);
    if (params.theme) s.theme = params.theme;
    if (params.cap) s.cap = params.cap;
    if (params.direction) s.direction = params.direction;
    if (!sc) {
      const map = { landing: "landing", "": "landing", studio: "studio", projects: "projects", capture: "capture", view: "view", auth: "auth" };
      s.route = map[path] ?? "landing";
      if (s.route === "capture" && params.session) s.capture = { step: params.session === "expired" ? "expired" : "frame", companion: true };
    }
    if (s.sheet === null) document.title = titleFor(s.route);
    YI.render();
    if (s.route === "studio") YI.scrollChat();
  }
  function titleFor(r) {
    return { landing: "YIIYA — describe it, refine it, export it", studio: "Studio · YIIYA", projects: "Projects · YIIYA", capture: "Capture · YIIYA", view: "Shared model · YIIYA", auth: "Sign in · YIIYA" }[r] || "YIIYA";
  }
  window.addEventListener("hashchange", onHash);

  let lastMode = YI.layoutMode();
  window.addEventListener("resize", () => {
    const m = YI.layoutMode();
    if (m !== lastMode) { lastMode = m; YI.render(); }
  });

  // ─── Actions ──────────────────────────────────────────────────────────────
  function findMsg(id) { return S().messages.find((m) => m.id === id); }
  function dismissCard(btn, note) {
    const m = btn && findMsg(btn.dataset.msg);
    if (m) m.dismissed = note || "Dismissed.";
  }

  function quickEditText(label) {
    const s = S();
    const l = label.toLowerCase();
    if (s.selection && !/bigger|smaller/.test(l)) return `Make this ${l}`;
    return `Make it ${l}`;
  }

  const ACTIONS = {
    go: (arg) => { if (arg === "studio" && !S().project.hasObject && !S().messages.length) {} YI.closeSheetSilently(); YI.go(arg || ""); },
    "go-new": () => { YI.resetProject(); YI.go("studio"); setTimeout(() => $("#prompt") && $("#prompt").focus(), 50); },
    "open-sheet": (arg) => YI.openSheet(arg),
    "close-sheet": () => YI.closeSheet(),
    starter: (arg) => YI.submit(arg),
    suggest: (arg) => (arg === "Select the neck" ? YI.selectPart("neck") : YI.submit(arg)),
    "quick-edit": (arg) => YI.submit(quickEditText(arg)),
    send: () => sendPrompt(),
    "clear-selection": () => { S().selection = null; YI.render(); YI.announce("Selection cleared."); },
    "remove-ref": (arg) => { S().references = S().references.filter((r) => r.name !== arg); YI.render(); },
    "select-part": (arg) => {
      if (S().sheet) YI.closeSheetSilently();
      YI.selectPart(S().selection === arg ? null : arg);
    },
    tab: (arg) => {
      const [group, id] = arg.split(":");
      if (group === "inspector") S().inspectorTab = id; else { S().tab = id; if (S().snap === "peek") S().snap = "half"; }
      YI.render();
      const t = document.getElementById(`tab-${group}-${id}`);
      if (t) t.focus();
    },
    undo: () => { YI.undo(); YI.render(); },
    redo: () => { YI.redo(); YI.render(); },
    view: (arg) => YI.canvasControl(arg),
    "gen-cancel": () => YI.cancelGeneration(),
    "gen-retry": () => YI.retryGeneration(),
    "gen-dismiss": () => { S().gen = null; YI.render(); $("#prompt") && $("#prompt").focus(); },
    "confirm-revision": (arg, btn) => {
      const m = findMsg(btn.dataset.msg);
      const pl = m.buttons[Number(btn.dataset.idx)].payload;
      m.dismissed = "Generating a new version…";
      YI.startGeneration({ kind: "revision", label: pl.label, prompt: pl.prompt, resultParams: pl.resultParams, target: pl.target });
    },
    "dismiss-card": (arg, btn) => { dismissCard(btn, "Kept as is."); YI.render(); },
    "apply-param": (arg, btn) => { dismissCard(btn, "Applied."); YI.applyParametricNeck(arg); YI.render(); },
    "use-version": (arg, btn) => { dismissCard(btn, "Choice made."); YI.useVersion(arg); YI.closeSheetSilently(); YI.say({ role: "assistant", kind: "note", text: `Now using version ${S().project.versions.find((v) => v.id === arg).n}. The previous version is still in Versions — undo switches back.` }); YI.render(); YI.scrollChat(); },
    "keep-current": (arg, btn) => { dismissCard(btn, "Choice made."); S().project.pendingVersion = null; YI.closeSheetSilently(); YI.say({ role: "assistant", kind: "note", text: `Kept version ${YI.currentVersionNo()}. The new version stays in Versions if you change your mind.` }); YI.render(); YI.scrollChat(); },
    "open-compare": (arg) => YI.openSheet("compare", { b: arg || undefined }),
    "local-whole-finish": (arg, btn) => { dismissCard(btn, "Applied to the whole lamp."); YI.applyLocal({ finish: arg }, { part: null }); YI.render(); },
    "local-whole-color": (arg, btn) => { dismissCard(btn, "Recoloured the whole lamp."); YI.applyLocal({ color: { black: "#121212", white: "#F2F0EB", brass: "#B08A3E" }[arg] || "#121212", colorName: arg }, { part: null }); YI.render(); },
    "clarify-answer": (arg, btn) => { dismissCard(btn, `Answered: ${btn.textContent.trim()}`); YI.submit(`Make ${arg} with a curved brass neck and a dark green shade.`); },
    "part-color": (arg) => YI.submit(`Make this ${arg}`),
    "part-finish": (arg) => YI.submit(`Make this ${arg}`),
    prefill: (arg) => { S().draft = arg; YI.render(); const p = $("#prompt"); if (p) { p.value = arg; p.focus(); p.setSelectionRange(arg.length, arg.length); } },
    "set-height": () => { const v = parseFloat($("#height-in").value); if (v > 0) { YI.say({ role: "user", text: `Set height to ${v} cm` }); YI.setHeight(v, "cm"); YI.render(); YI.scrollChat(); } },
    "remove-req": (arg) => { S().brief.preserve.splice(Number(arg), 1); YI.render(); },
    "set-tab": () => { S().selection = null; YI.render(); const w = $("#whole-finish button"); if (w) w.focus(); },
    "snap-cycle": () => { S().snap = { peek: "half", half: "full", full: "peek" }[S().snap]; YI.render(); YI.announce(`Panel ${S().snap === "peek" ? "collapsed" : S().snap === "full" ? "expanded" : "half height"}.`); },
    "landing-starter": (arg) => { YI.resetProject(); YI.go("studio"); setTimeout(() => YI.submit(arg), 30); },
    "landing-photo": () => { YI.resetProject(); if (YI.layoutMode() === "phone") { S().capture = { step: "permission" }; YI.go("capture"); } else { YI.go("studio"); setTimeout(() => YI.openSheet("capture"), 30); } },
    "lib-open": (arg) => {
      if (arg === "lamp") { YI.loadRestoredProject(); YI.go("studio"); setTimeout(() => YI.announce("Restored Desk lamp: conversation, 3 versions."), 100); }
      else if (arg === "stand") { YI.resetProject(); S().project.name = "Walnut headphone stand"; S().project.standIn = true; YI.say({ role: "user", text: "A minimal walnut headphone stand" }); YI.say({ role: "system", kind: "gen-result", text: "The last generation failed (no usable model). Nothing was saved as a version.", tone: "danger" }); S().draft = "A minimal walnut headphone stand"; YI.go("studio"); }
      else { YI.loadRestoredProject(); S().project.name = YI.PROJECTS.find((p) => p.id === arg).name; YI.go("studio"); }
    },
    "lib-rename": (arg) => { S().library.renaming = arg; YI.render(); const i = $(`#rn-${arg}`); if (i) { i.focus(); i.select(); } },
    "lib-rename-cancel": () => { const id = S().library.renaming; S().library.renaming = null; YI.render(); const b = $(`[data-fk="rn-btn-${id}"]`); if (b) b.focus(); },
    "lib-dup": () => YI.toast("Duplicate is proposed (P1) — simulated."),
    "lib-delete": (arg) => { const i = YI.PROJECTS.findIndex((p) => p.id === arg); const name = YI.PROJECTS[i].name; YI.PROJECTS.splice(i, 1); YI.closeSheetSilently(); YI.render(); YI.toast(`Deleted “${name}” (simulated).`); const n = $("#lib-search"); if (n) n.focus(); },
    "lib-filter": (arg) => { S().library.filter = arg; YI.render(); },
    "lib-retry": () => { S().library.state = "loading"; YI.render(); setTimeout(() => { S().library.state = "populated"; YI.render(); }, 900); },
    "lib-clear": () => { S().library.query = ""; YI.render(); $("#lib-search").focus(); },
    cap: (arg) => {
      if (arg === "use") { S().references = [{ name: "lamp-photo.jpg" }]; YI.go("studio"); setTimeout(() => YI.toast("Photo attached. Add a description or press Send."), 50); return; }
      S().capture.step = arg; YI.render();
      const f = document.querySelector("[data-fk^='cap-'], .shutter"); if (f) f.focus();
    },
    "cap-standalone": () => { S().capture = { step: "frame", companion: false }; YI.render(); },
    "viewer-ar": () => YI.toast("Would open AR on supported phones (simulated)."),
    "viewer-view": (arg) => YI.viewerControl(arg),
    "auth-send": () => {
      const v = ($("#email") || {}).value || "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { S().sheet.state = "error"; YI.render(); $("#email").focus(); return; }
      S().sheet.state = "sending"; YI.render();
      setTimeout(() => { if (S().sheet) { S().sheet.state = "sent"; YI.render(); } }, 900);
    },
    "auth-sim": () => { YI.closeSheetSilently(); S().auth = { state: "verifying" }; YI.go("auth"); setTimeout(() => { S().auth = { state: "success" }; S().signedIn = true; S().saveState = "account"; YI.render(); }, 1200); },
    "sign-out": () => { S().signedIn = false; S().saveState = "browser"; YI.closeSheet(); YI.toast("Signed out. Work continues in this browser."); },
    "export-dl": (arg) => {
      const sh = S().sheet;
      sh.conv = sh.conv || {};
      if (arg === "glb") { sh.conv.glb = "done"; YI.toast("Simulated download: desk-lamp-v3.glb (4.2 MB)"); YI.render(); return; }
      sh.conv[arg] = "converting"; YI.render();
      YI.announce(`Converting to ${arg.toUpperCase()}.`);
      setTimeout(() => { if (!S().sheet) return; sh.conv[arg] = "done"; YI.render(); YI.announce(`${arg.toUpperCase()} ready.`); YI.toast(`Simulated download: desk-lamp-v3.${arg}`); }, 1600);
    },
    "share-create": () => { S().sheet.created = true; YI.render(); },
    "copy-link": () => { S().sheet.copied = true; YI.render(); YI.announce("Link copied."); },
    "settings-section": (arg) => { S().sheet.section = arg; S().sheet.type = "settings"; YI.render(); const b = document.querySelector(`.settings-link[data-arg="${arg}"]`); if (b) b.focus(); },
    "settings-clear": (arg) => { S().sheet.confirmClear = arg === "1"; YI.render(); },
    "set-theme": (arg) => { S().theme = arg === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : arg; YI.render(); YI.canvasRefreshTheme(); },
    "cap-tab": (arg) => { S().sheet.tab = arg; YI.render(); },
    "cap-phone": (arg) => { S().sheet.phone = arg; YI.render(); },
    "add-ref": () => { S().references = [{ name: "lamp-photo.jpg" }]; YI.closeSheet(); YI.toast("Photo attached (example). Add a description, or press Send to use the photo."); },
    "np-create": () => { const v = $("#np-prompt").value.trim() || "Make a compact desk lamp with a curved brass neck and a dark green shade."; YI.closeSheetSilently(); YI.submit(v); },
    "rename-save": () => { const v = $("#rn").value.trim(); if (v) S().project.name = v; YI.closeSheet(); },
    "conflict-resolve": () => { S().saveState = "account"; YI.closeSheet(); YI.toast("Resolved (simulated)."); },
    toast: (arg) => YI.toast(arg),
    proto: (arg) => protoAction(arg),
    "proto-toggle": () => { S().protoOpen = !S().protoOpen; renderProto(); const f = $("#proto-panel button, #proto-panel select"); if (S().protoOpen && f) f.focus(); },
    "voice-toggle": () => voiceToggle()
  };

  YI.closeSheetSilently = () => { S().sheet = null; };
  YI.resetProject = () => {
    const s = S();
    s.project = YI.freshProject(); s.brief = YI.freshBrief(); s.messages = []; s.selection = null; s.gen = null; s.draft = ""; s.references = []; s.firstRun = true;
  };

  function sendPrompt() {
    const p = $("#prompt");
    const text = (p ? p.value : S().draft).trim();
    if (!text && S().references.length) { YI.submit("Make a 3D model of the object in this photo."); return; }
    if (!text) return;
    if (p) p.value = "";
    S().draft = "";
    YI.submit(text);
    if (p) { p.style.height = ""; p.focus(); }
  }

  document.addEventListener("click", (e) => {
    const part = e.target.closest(".svg-part");
    if (part && part.closest(".canvas-host")) { YI.selectPart(S().selection === part.dataset.part ? null : part.dataset.part); return; }
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset.arg, el); }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-act-submit]");
    if (!f) return;
    e.preventDefault();
    const act = f.dataset.actSubmit;
    if (act === "send") sendPrompt();
    if (act === "landing-start") { const v = $("#landing-prompt").value.trim(); if (!v) { $("#landing-prompt").focus(); return; } YI.resetProject(); YI.go("studio"); setTimeout(() => YI.submit(v), 30); }
    if (act === "lib-rename-save") { const id = f.dataset.arg; const pr = YI.PROJECTS.find((p) => p.id === id); pr.name = $(`#rn-${id}`).value.trim() || pr.name; S().library.renaming = null; YI.render(); YI.toast("Renamed (simulated)."); const b = $(`[data-fk="rn-btn-${id}"]`); if (b) b.focus(); }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "prompt") {
      S().draft = t.value;
      t.style.height = "";
      t.style.height = Math.min(160, t.scrollHeight) + "px";
      YI.refreshComposer();
      return;
    }
    if (t.dataset.actInput === "lib-search") { S().library.query = t.value; YI.render(); return; }
    if (t.dataset.actInput === "neck-radius") { S().project.params.neckRadius = Number(t.value); YI.canvasSync(); t.nextElementSibling.textContent = t.value + " mm"; }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    const act = t.dataset.actChange;
    if (act === "export-dest") { S().sheet.dest = t.value; S().brief.destination = t.value; YI.render(); const r = document.querySelector(`input[name="dest"][value="${t.value}"]`); if (r) r.focus(); }
    if (act === "share-ack") { S().sheet.ack = t.checked; YI.render(); const c = document.querySelector('[data-act-change="share-ack"]'); if (c) c.focus(); }
    if (act === "toggle-keep") {
      const part = t.dataset.arg; const b = S().brief;
      if (t.checked) b.preserve.push({ part, text: `${YI.PART_LABEL[part]}: keep exactly as is` }); else b.preserve = b.preserve.filter((x) => x.part !== part);
      YI.render(); const c = document.querySelector('[data-act-change="toggle-keep"]'); if (c) c.focus();
    }
    if (act === "cmp-pick") { S().sheet[t.dataset.arg] = t.value; YI.render(); const c = $(`#cmp-${t.dataset.arg}`); if (c) c.focus(); }
    if (t.dataset.bind) { const key = t.dataset.bind.split(".")[1]; S().brief[key] = t.value; if (key === "object") S().project.name = t.value || S().project.name; YI.markDirty(); YI.render(); }
    if (t.id && t.id.startsWith("proto-")) protoAction(`${t.id.slice(6)}=${t.value}`);
  });

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (t.id === "prompt" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendPrompt(); return; }
    if (S().sheet) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing && S().route === "studio") { e.preventDefault(); e.shiftKey ? YI.redo() : YI.undo(); YI.render(); return; }
    if (e.key === "/" && !typing && S().route === "studio") { e.preventDefault(); $("#prompt").focus(); return; }
    if (e.key === "Escape" && S().selection && S().route === "studio") { S().selection = null; YI.render(); YI.announce("Selection cleared."); return; }
    if (t.id === "canvas-host") {
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", "+": "in", "=": "in", "-": "out", "0": "reset" };
      if (map[e.key]) { e.preventDefault(); YI.canvasControl(map[e.key]); }
    }
    if (t.classList && t.classList.contains("svg-part") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); YI.selectPart(S().selection === t.dataset.part ? null : t.dataset.part); }
    if (t.getAttribute && t.getAttribute("role") === "tab" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const tabs = [...t.parentElement.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
      const next = tabs[(i + tabs.length) % tabs.length];
      e.preventDefault(); next.click();
    }
    if (e.code === "Space" && t === document.body && !e.repeat && S().route === "studio" && S().voice === "idle") { e.preventDefault(); voiceToggle(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && e.target === document.body && (S().voice === "listening" || S().voice === "partial")) { e.preventDefault(); voiceToggle(); }
  });

  // ─── Voice (simulated transcription; real product uses browser speech) ────
  let vt = [];
  function voiceToggle() {
    const s = S();
    vt.forEach(clearTimeout); vt = [];
    if (s.voiceMode === "denied") { s.voice = "denied"; YI.render(); YI.announce("Microphone blocked. You can type instead.", { assertive: true }); return; }
    if (s.voiceMode === "unsupported") { s.voice = "unsupported"; YI.render(); return; }
    if (s.voice === "listening" || s.voice === "partial") return finishVoice();
    const full = !s.project.hasObject ? "Make a compact desk lamp with a curved brass neck and a dark green shade." : s.selection === "neck" ? "Make this thinner, but keep the shade exactly the same." : s.selection ? "Make this black." : "Make it matte.";
    s.voiceFull = full;
    s.voice = "listening"; s.partial = ""; YI.render(); YI.announce("Listening.");
    const words = full.replace(/\.$/, "").split(" ");
    vt.push(setTimeout(() => { s.voice = "partial"; s.partial = words.slice(0, Math.ceil(words.length / 2)).join(" "); YI.render(); }, 900));
    vt.push(setTimeout(() => { s.partial = words.join(" "); YI.render(); }, 1900));
    vt.push(setTimeout(finishVoice, 3000));
  }
  function finishVoice() {
    const s = S();
    vt.forEach(clearTimeout); vt = [];
    const text = s.voiceFull || s.partial;
    s.voice = "thinking"; s.partial = text.replace(/\.$/, ""); YI.render();
    vt.push(setTimeout(() => { s.voice = "idle"; s.partial = ""; YI.submit(text, { voice: true }); }, 600));
  }

  // ─── Prototype controls (not product UI) ──────────────────────────────────
  function protoAction(arg) {
    const s = S();
    const [k, v] = arg.split("=");
    if (k === "cap") s.cap = v;
    if (k === "theme") { s.theme = v; setTimeout(YI.canvasRefreshTheme, 0); }
    if (k === "direction") { s.direction = v; setTimeout(YI.canvasRefreshTheme, 0); }
    if (k === "quota") s.quota = v;
    if (k === "netdrop") s.netDrop = v === "on";
    if (k === "online") { s.online = v === "on"; s.saveState = s.online ? (s.signedIn ? "account" : "browser") : "offline"; }
    if (k === "webgl") { s.webgl = v === "on"; YI.remountCanvas(); }
    if (k === "lowmem") { s.lowMemory = v === "on"; YI.remountCanvas(); }
    if (arg === "lowmem-off") { s.lowMemory = false; YI.remountCanvas(); }
    if (k === "signed") { s.signedIn = v === "in"; s.saveState = s.signedIn ? "account" : "browser"; }
    if (k === "save") s.saveState = v === "normal" ? (s.signedIn ? "account" : "browser") : v;
    if (k === "voice") { s.voiceMode = v; s.voice = "idle"; }
    if (arg === "restart") { YI.resetProject(); s.cap = "current"; location.hash = "#/studio"; }
    if (arg === "restore") { YI.loadRestoredProject(); location.hash = "#/studio"; }
    YI.render();
  }

  function renderProto() {
    const el = $("#proto-root");
    const s = S();
    if (s.frame) { el.innerHTML = ""; return; }
    const sel = (id, label, opts, cur) => `<label class="proto-field"><span>${label}</span><select id="proto-${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
    el.innerHTML = `
      <button type="button" class="proto-fab" data-act="proto-toggle" aria-expanded="${s.protoOpen}" aria-controls="proto-panel">${YI.icon("flask")}<span>Prototype</span></button>
      ${s.protoOpen ? `<section id="proto-panel" class="proto-panel" aria-label="Prototype controls">
        <p class="proto-head"><strong>Prototype controls</strong><br>Simulated outcomes for review. Not part of the product UI.</p>
        ${sel("cap", "Capability view", [["current", "Current (what works today)"], ["proposed", "Proposed (P1/P2 features)"]], s.cap)}
        ${sel("theme", "Theme", [["dark", "Dark"], ["light", "Light"]], s.theme)}
        ${sel("direction", "Visual direction (exploration)", [["workshop", "Warm workshop (chosen)"], ["drafting", "Light drafting desk"], ["quiet", "Quiet dark studio"]], s.direction)}
        ${sel("quota", "Next generation result", [["ok", "Succeeds"], ["hf-unavailable", "Free GPU capacity unavailable"], ["daily-limit", "YIIYA daily limit"], ["missing-setup", "HF not configured"], ["asleep", "Spaces not responding"], ["invalid", "Invalid mesh"]], s.quota)}
        ${sel("netdrop", "Connection drop while queued", [["off", "No"], ["on", "Yes"]], s.netDrop ? "on" : "off")}
        ${sel("online", "Network", [["on", "Online"], ["off", "Offline"]], s.online ? "on" : "off")}
        ${sel("webgl", "WebGL", [["on", "Available"], ["off", "Unavailable"]], s.webgl ? "on" : "off")}
        ${sel("lowmem", "Low memory", [["off", "No"], ["on", "Yes"]], s.lowMemory ? "on" : "off")}
        ${sel("signed", "Account", [["out", "Signed out"], ["in", "Signed in"]], s.signedIn ? "in" : "out")}
        ${sel("save", "Save condition", [["normal", "Normal"], ["expired", "Sign-in expired"], ["conflict", "Conflict"], ["error", "Account save error"]], ["expired", "conflict", "error"].includes(s.saveState) ? s.saveState : "normal")}
        ${sel("voice", "Microphone", [["normal", "Works"], ["denied", "Permission denied"], ["unsupported", "Unsupported browser"]], s.voiceMode || "normal")}
        <div class="proto-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="proto" data-arg="restart">Restart empty</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="proto" data-arg="restore">Load 10-turn project</button>
          <a class="btn btn-ghost btn-sm" href="../screens/index.html">Screen gallery</a>
        </div>
      </section>` : ""}`;
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (matchMedia("(prefers-color-scheme: light)").matches) S().theme = "light";
  // ES modules don't load from file:// — fall back to the static SVG view and say so.
  setTimeout(() => { if (!YI.Canvas3D) { YI.moduleFailed = true; YI.render(); } }, 4000);
  onHash();
})();
