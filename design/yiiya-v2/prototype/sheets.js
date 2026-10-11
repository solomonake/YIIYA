/* Sheets and dialogs. Every sheet: role=dialog, aria-modal, labelled title,
 * Escape closes, focus trapped and returned (core.js). Bottom sheet on phones. */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;
  const esc = (s) => YI.esc(s);
  const ic = (n, l) => YI.icon(n, l);

  const wrap = (title, body, { size = "md", footer = "", sub = "", tag = "" } = {}) => `
    <div class="sheet-scrim" data-act="close-sheet" aria-hidden="true"></div>
    <div class="sheet sheet-${size}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-head"><div><h2 id="sheet-title" class="sheet-title" tabindex="-1">${title}</h2>${sub ? `<p class="sheet-sub">${sub}</p>` : ""}</div>${tag}<button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="close-sheet" aria-label="Close">${ic("x")}</button></header>
      <div class="sheet-body">${body}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ""}
    </div>`;

  YI.renderSheet = () => {
    const sh = S().sheet;
    if (!sh) return "";
    const [type, arg] = sh.type.split(":");
    const fn = SHEETS[type];
    return fn ? fn(arg, sh) : "";
  };

  const versionName = () => {
    const p = S().project;
    const v = p.versions.find((x) => x.id === p.currentVersion);
    return `${p.name} · version ${v ? v.n : 1}`;
  };

  const SHEETS = {
    // ─── Export ─────────────────────────────────────────────────────────────
    export(arg, sh) {
      const s = S();
      sh.dest = sh.dest || (s.brief.destination !== "Not set" ? s.brief.destination : "Render & portfolio");
      sh.conv = sh.conv || {};
      const cur = s.cap === "current";
      const unavailable = sh.fileUnavailable;
      const dests = [
        ["Render & portfolio", "Blender, KeyShot, portfolio images"],
        ["AR & web", "Phones, AR Quick Look, web viewers"],
        ["3D print", "Slicers — needs extra checks"],
        ["Game engine", "Unity, Unreal, Godot"]
      ];
      const R = YI.READINESS;
      const extraUnknown = sh.dest === "3D print" ? [{ label: "Printable without repair", detail: "Unknown. Run your slicer's repair and check thickness." }] : [];
      const extraWork = sh.dest === "3D print" ? [{ label: "STL units", detail: "STL has no units. This file is in metres, so a 35 cm lamp may import as 0.35 mm.", fix: "Scale ×1000 in your slicer, or set import units to metres." }] : sh.dest === "Game engine" ? [{ label: "Origin for placement", detail: "Origin is 6 cm off the base centre.", fix: "Re-centre before importing." }] : [];
      const checks = `
        <ul class="check-list detailed">
          ${R.verified.map((c) => `<li class="ok">${ic("check")}<div><strong>${c.label}</strong><span>${c.detail}</span></div><span class="check-status">Verified</span></li>`).join("")}
          ${[...R.needsWork.filter(() => sh.dest !== "Game engine"), ...extraWork].map((c) => `<li class="work">${ic("warn")}<div><strong>${c.label}</strong><span>${c.detail}</span>${c.fix ? `<span class="fix">${c.fix}</span>` : ""}</div><span class="check-status">Needs work</span></li>`).join("")}
          ${[...R.unknown, ...extraUnknown].map((c) => `<li class="unknown">${ic("help")}<div><strong>${c.label}</strong><span>${c.detail}</span></div><span class="check-status">Not checked</span></li>`).join("")}
        </ul>`;
      const row = (fmt, desc, size, opts = {}) => {
        const st = sh.conv[fmt] || "idle";
        let action;
        if (opts.disabled) action = `<span class="row-status">${opts.disabled}</span>`;
        else if (unavailable) action = `<span class="row-status">Unavailable</span>`;
        else if (st === "converting") action = `<span class="row-status" role="status"><span class="spinner" aria-hidden="true"></span> Converting…</span>`;
        else if (st === "failed") action = `<span class="row-status tone-danger">Conversion failed</span>${YI.btn("Retry", "export-dl", { arg: fmt, size: "sm", variant: "secondary", icon: "refresh" })}`;
        else if (st === "done") action = `<span class="row-status tone-success">${ic("check")} Downloaded</span>${YI.btn("Again", "export-dl", { arg: fmt, size: "sm", variant: "ghost" })}`;
        else action = YI.btn(`Download ${fmt.toUpperCase()}`, "export-dl", { arg: fmt, size: "sm", variant: fmt === "glb" ? "primary" : "secondary", icon: "download", fk: "dl-" + fmt });
        return `<li class="format-row${opts.disabled ? " is-disabled" : ""}"><div class="format-name"><span class="mono">.${fmt.toUpperCase()}</span><span>${desc}</span>${size ? `<span class="muted small mono">${size}</span>` : ""}
          ${st === "failed" ? `<span class="small tone-danger">The source file couldn't be fetched (502). The GLB is still available.</span>` : ""}</div><div class="format-action">${action}</div></li>`;
      };
      const body = `
        ${unavailable ? YI.notice("danger", "This version's 3D file can't be reached", "Older generated files can expire. Re-generate version 3 to export it — your instant edits and history are kept.", YI.btn("Re-generate version 3", "toast", { arg: "Would start a new generation (simulated)", size: "sm", variant: "secondary", icon: "refresh" }), { role: "alert" }) : ""}
        <fieldset class="field-group"><legend class="field-label">Where will you use it?</legend>
          <div class="dest-grid">${dests.map(([d, hint]) => `<label class="dest-card${sh.dest === d ? " is-on" : ""}"><input type="radio" name="dest" value="${d}" ${sh.dest === d ? "checked" : ""} data-act-change="export-dest"><span class="dest-name">${d}</span><span class="dest-hint">${hint}</span></label>`).join("")}</div>
        </fieldset>
        ${cur && s.project.ops.some((o) => o.type === "local") ? YI.notice("warning", "Instant edits aren't in downloads yet", "The file is the version as generated. The finish, colours and size changes you see in the studio won't be included.", YI.futureTag("Baked exports · P1")) : ""}
        ${!cur ? YI.notice("info", "Instant edits are included", "Finish, colour and size are baked into the exported file.", YI.futureTag("P1")) : ""}
        <h3 class="field-label">Checks for ${esc(sh.dest)}</h3>
        ${checks}
        <h3 class="field-label">Files</h3>
        <ul class="format-list">
          ${row("glb", "Original mesh with materials. Best for Blender, web and AR on Android.", "4.2 MB")}
          ${row("obj", "Converted. Geometry and UVs; materials not included.", "≈ 6 MB")}
          ${row("stl", "Converted. Geometry only, in metres.", "≈ 4 MB")}
          ${row("usdz", "For Apple AR Quick Look.", "", { disabled: "Needs a converter this server doesn't have" })}
        </ul>
        <p class="small muted">Not available: FBX, STEP, BLEND. Import the GLB or OBJ into your tool instead. YIIYA never labels a file print- or manufacturing-ready unless that was checked.</p>
        ${YI.notice("info", "Storage", s.signedIn ? "Files are stored with your account project." : "Downloads go straight to your device. Sign in to keep files with the project.", "")}`;
      return wrap("Export", body, { size: "lg", sub: esc(versionName()), footer: `${YI.btn("Done", "close-sheet", { variant: "secondary" })}` });
    },

    // ─── Share ──────────────────────────────────────────────────────────────
    share(arg, sh) {
      const s = S();
      const cur = s.cap === "current";
      if (!cur) {
        return wrap("Share", `
          <fieldset class="field-group"><legend class="field-label">Who can see it?</legend>
            <label class="radio-row"><input type="radio" name="vis" checked> <span><strong>Only you</strong><br><span class="muted small">Private to your account.</span></span></label>
            <label class="radio-row"><input type="radio" name="vis"> <span><strong>Anyone with the link · view only</strong><br><span class="muted small">Downloads off by default. You can turn the link off any time.</span></span></label>
          </fieldset>
          <label class="check-row"><input type="checkbox"> <span>Allow downloading the GLB</span></label>
          ${YI.notice("future", "Controlled publishing is proposed", "Needs access-controlled share records, link revocation and signed file URLs on the server.", YI.futureTag("P1"))}`, { footer: `${YI.btn("Cancel", "close-sheet", { variant: "ghost" })}${YI.btn("Publish link", "toast", { arg: "Simulated: link published", variant: "primary" })}` });
      }
      const created = sh.created;
      const body = `
        ${YI.notice("warning", "Share links are public", "Anyone with the link can view and download this model. Links can't be turned off yet, and the link contains the file's address.", "")}
        ${created ? `<div class="field-group"><label class="field-label" for="share-url">View link</label><div class="copy-row"><input id="share-url" class="input mono" readonly value="https://yiiya.example/view?model=desk-lamp-v3" data-fk="share-url"><button type="button" class="btn btn-secondary btn-sm" data-act="copy-link" data-autofocus>${ic("copy")}<span>${sh.copied ? "Copied" : "Copy"}</span></button></div><p class="small muted">Example link — the prototype doesn't create real links.</p></div>`
          : `<label class="check-row"><input type="checkbox" data-act-change="share-ack" ${sh.ack ? "checked" : ""} data-autofocus> <span>I understand anyone with this link can view and download the model</span></label>`}
        <details class="disclosure"><summary>Proposed: private sharing ${YI.futureTag("P1")}</summary><p>Private by default, view-only links, optional downloads, and turning links off. Needs server-side share records and access-checked file URLs.</p></details>`;
      return wrap("Share a view link", body, { sub: esc(versionName()), footer: created ? YI.btn("Done", "close-sheet", { variant: "secondary" }) : `${YI.btn("Cancel", "close-sheet", { variant: "ghost" })}${YI.btn("Create public link", "share-create", { variant: "primary", disabled: !sh.ack })}` });
    },

    // ─── Settings ───────────────────────────────────────────────────────────
    settings(arg, sh) {
      const s = S();
      const section = arg || sh.section || "appearance";
      const nav = [["appearance", "Appearance"], ["input", "Voice & input"], ["generation", "Generation"], ["privacy", "Privacy & data"], ["status", "What works today"]];
      const newTag = `<span class="tag-new">New</span>`;
      const bodies = {
        appearance: `
          <fieldset class="field-group"><legend class="field-label">Theme</legend><div class="segmented" role="group" aria-label="Theme">${["System", "Dark", "Light"].map((t) => `<button type="button" class="seg" aria-pressed="${(t === "Dark" && s.theme === "dark") || (t === "Light" && s.theme === "light")}" data-act="set-theme" data-arg="${t.toLowerCase()}">${t}</button>`).join("")}</div></fieldset>
          <fieldset class="field-group"><legend class="field-label">Motion ${newTag}</legend><div class="segmented" role="group" aria-label="Motion"><button type="button" class="seg" aria-pressed="true">Follow system</button><button type="button" class="seg" aria-pressed="false">Reduce</button></div><p class="section-note">Reduce turns off camera easing, the materialise animation and auto-rotation.</p></fieldset>
          <fieldset class="field-group"><legend class="field-label">Text size ${newTag}</legend><div class="segmented" role="group" aria-label="Text size"><button type="button" class="seg" aria-pressed="true">Default</button><button type="button" class="seg" aria-pressed="false">Large</button></div></fieldset>`,
        input: `
          <label class="check-row"><input type="checkbox" checked> <span><strong>Hold Space to talk</strong><br><span class="muted small">Only when the message box isn't focused.</span></span></label>
          <label class="field-label" for="voice-lang">Voice language</label><select id="voice-lang" class="input"><option>English (US)</option><option>English (UK)</option></select>
          <p class="section-note">Voice uses your browser's speech recognition to transcribe. Audio handling depends on your browser.</p>
          <label class="check-row is-disabled"><input type="checkbox" disabled> <span><strong>Read replies aloud</strong> ${YI.futureTag("Realtime voice · P2")}</span></label>`,
        generation: `
          <dl class="meta-list">
            <div><dt>3D generation</dt><dd>Free — Hugging Face models only</dd></div>
            <div><dt>Paid services</dt><dd>Off. YIIYA never switches to them automatically.</dd></div>
            <div><dt>Server access</dt><dd>${s.quota === "missing-setup" ? `<span class="tone-danger">Not configured</span>` : "Configured"} <span class="muted small">(configuration, not a live health check)</span></dd></div>
            <div><dt>Today</dt><dd>7 of 10 free generations left <span class="muted small">(example)</span></dd></div>
          </dl>
          <p class="section-note">Hugging Face GPUs are shared. Waits vary and capacity can run out; that's outside YIIYA's control.</p>
          <details class="disclosure" ${arg === "generation" ? "open" : ""}><summary>Advanced: use your own Hugging Face token</summary>
            <p>Your token uses your Hugging Face account's quota and billing settings instead of the shared server allowance.</p>
            <ul class="plain-list small"><li>Stored only in this browser.</li><li>Sent over HTTPS with each generation request so YIIYA's server can call Hugging Face for you.</li><li>Remove it any time below. Never share tokens with other people.</li></ul>
            <label class="field-label" for="hf-token">Hugging Face token</label>
            <input id="hf-token" class="input mono" type="password" autocomplete="off" placeholder="hf_…" data-fk="hf-token" ${arg === "generation" ? "data-autofocus" : ""}>
            <p class="small muted">Prototype: anything typed here is discarded and never stored.</p>
            <div class="btn-row">${YI.btn("Save token", "toast", { arg: "Prototype: token discarded, not stored", variant: "secondary", size: "sm" })}${YI.btn("Remove token", "toast", { arg: "No token saved", variant: "ghost", size: "sm" })}</div>
          </details>`,
        privacy: `
          <p>Saved in this browser:</p>
          <ul class="plain-list"><li>Projects you haven't saved to an account, with conversation and versions</li><li>Thumbnails and settings</li><li>Your Hugging Face token, if you added one</li></ul>
          ${s.signedIn ? "<p>Projects saved to your account are stored with YIIYA and aren't affected by clearing this browser.</p>" : ""}
          ${sh.confirmClear ? YI.notice("danger", "Clear everything saved in this browser?", "This removes browser-only projects and your token. It can't be undone.", `${YI.btn("Clear browser data", "toast", { arg: "Simulated: browser data cleared", variant: "danger", size: "sm" })}${YI.btn("Cancel", "settings-clear", { arg: "0", variant: "ghost", size: "sm" })}`, { role: "alert" }) : YI.btn("Clear browser data…", "settings-clear", { arg: "1", variant: "secondary" })}`,
        status: `
          <ul class="cap-list">
            ${[
              ["Instant colour, finish and size edits", "working"],
              ["Typed and spoken prompts (browser transcription)", "working"],
              ["One-photo and text-to-3D generation", "working", "Depends on shared Hugging Face capacity"],
              ["GLB, OBJ, STL downloads", "working"],
              ["USDZ for Apple AR", "server", "Only when a converter is configured"],
              ["Instant edits included in downloads", "proposed", "P1"],
              ["Resume a generation after a dropped connection", "proposed", "P1"],
              ["Saved design brief the assistant always reads", "proposed", "P1"],
              ["Exact part edits and dimensions", "proposed", "P2"],
              ["Conversational realtime voice", "proposed", "P2"],
              ["Walk-around scans", "off", "Not available in free mode"]
            ].map(([l, st, n]) => `<li class="cap cap-${st}"><span class="cap-state">${{ working: "Works", server: "Depends", proposed: "Proposed", off: "Off" }[st]}</span><span>${l}${n ? `<span class="muted small"> — ${n}</span>` : ""}</span></li>`).join("")}
          </ul>`
      };
      const body = `<div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections">${nav.map(([k, l]) => `<button type="button" class="settings-link" aria-current="${k === section ? "page" : "false"}" data-act="settings-section" data-arg="${k}">${l}</button>`).join("")}</nav><div class="settings-body">${bodies[section]}</div></div>`;
      sh.section = section;
      return wrap("Settings", body, { size: "lg" });
    },

    // ─── Account ────────────────────────────────────────────────────────────
    account(arg, sh) {
      const s = S();
      if (!s.authConfigured) return wrap("Sign in", YI.notice("info", "Accounts aren't set up on this server", "Your work is saved in this browser. Export files to keep copies.", ""));
      if (s.signedIn) {
        return wrap("Account", `<dl class="meta-list"><div><dt>Signed in as</dt><dd>maker@example.com <span class="muted small">(example)</span></dd></div><div><dt>Saving</dt><dd>New work saves to your account automatically.</dd></div></dl>`, { footer: YI.btn("Sign out", "sign-out", { variant: "secondary" }) });
      }
      const st = sh.state || "idle";
      const body = st === "sent"
        ? `<div role="status">${YI.notice("success", "Check your email", "We sent a sign-in link to maker@example.com. It works once. You can close this and keep working.", "")}</div>${YI.btn("Simulate: open the link", "auth-sim", { variant: "ghost", size: "sm" })}`
        : `<p>Sign in to save projects to your account and open them on any device. No password — we email you a link.</p>
          <label class="field-label" for="email">Email</label>
          <input id="email" class="input" type="email" autocomplete="email" placeholder="you@example.com" data-autofocus data-fk="email" value="${st === "error" ? "maker@example" : ""}" ${st === "error" ? 'aria-invalid="true" aria-describedby="email-err"' : ""}>
          ${st === "error" ? `<p id="email-err" class="field-error">${ic("warn")} Enter a full email address, like name@example.com.</p>` : ""}
          <p class="small muted">Until you sign in, work is saved in this browser only.</p>`;
      return wrap("Sign in", body, { footer: st === "sent" ? YI.btn("Done", "close-sheet", { variant: "secondary" }) : `${YI.btn("Not now", "close-sheet", { variant: "ghost" })}${YI.btn(st === "sending" ? "Sending…" : "Email me a link", "auth-send", { variant: "primary", disabled: st === "sending" })}` });
    },

    // ─── Capture (desktop) ──────────────────────────────────────────────────
    capture(arg, sh) {
      const tab = sh.tab || "upload";
      const phone = sh.phone || "waiting";
      const upload = `
        <button type="button" class="dropzone" data-act="add-ref" data-autofocus>${ic("upload")}<span><strong>Choose a photo</strong> or drop it here</span><span class="muted small">JPG, PNG or HEIC · one object, plain background</span></button>
        ${YI.notice("info", "YIIYA uses one photo", "In free mode the 3D models read a single image. Sides the camera can't see are estimated, so a clear front-three-quarter view works best.", "")}`;
      const phones = {
        waiting: `<div class="qr-wrap"><div class="qr" role="img" aria-label="QR code (example)">${fakeQR()}</div><div><p><strong>Scan with your phone's camera</strong></p><p class="muted small">Opens YIIYA's camera on your phone. Take one photo and it appears here. The code works for about 10 minutes.</p><p class="small" role="status"><span class="spinner" aria-hidden="true"></span> Waiting for your phone…</p>
          <div class="btn-row proto-inline"><span class="tag-sim">Prototype</span>${YI.btn("Photo arrives", "cap-phone", { arg: "received", size: "sm", variant: "ghost" })}${YI.btn("Code expires", "cap-phone", { arg: "expired", size: "sm", variant: "ghost" })}</div></div></div>`,
        received: `${YI.notice("success", "Photo received from your phone", "lamp-photo.jpg · 1 photo", "")}<div class="btn-row">${YI.btn("Use this photo", "add-ref", { variant: "primary", icon: "check", fk: "use-phone" })}${YI.btn("Wait for another", "cap-phone", { arg: "waiting", variant: "ghost" })}</div>`,
        expired: `${YI.notice("warning", "This code expired", "Show a new code and scan again. Nothing was uploaded.", "", { role: "alert" })}${YI.btn("Show a new code", "cap-phone", { arg: "waiting", variant: "primary", icon: "refresh" })}`
      };
      const body = `<div class="tabs" role="tablist" aria-label="Add a photo">${[["upload", "Upload a photo"], ["phone", "Use your phone"]].map(([k, l]) => `<button type="button" role="tab" class="tab" aria-selected="${tab === k}" data-act="cap-tab" data-arg="${k}">${l}</button>`).join("")}</div>
        <div class="tab-panel">${tab === "upload" ? upload : phones[phone]}</div>`;
      return wrap("Start from a photo", body, { size: "md" });
    },

    // ─── New project ────────────────────────────────────────────────────────
    new() {
      return wrap("New project", `
        <label class="field-label" for="np-prompt">What do you want to make?</label>
        <textarea id="np-prompt" class="input" rows="3" placeholder="A compact desk lamp with a curved brass neck and a dark green shade" data-autofocus data-fk="np-prompt"></textarea>
        <div class="btn-row">${YI.btn("Add a reference photo", "open-sheet", { arg: "capture", variant: "secondary", icon: "image", size: "sm" })}</div>
        <details class="disclosure"><summary>More options</summary>
          <label class="field-label" for="np-dest">Where will you use it? <span class="muted small">(optional)</span></label>
          <select id="np-dest" class="input"><option>Not sure yet</option><option>Render & portfolio</option><option>AR & web</option><option>3D print</option><option>Game engine</option></select>
          <label class="field-label" for="np-h">Target height <span class="muted small">(optional)</span></label>
          <div class="num-row"><input id="np-h" class="input input-num" type="number" inputmode="decimal" placeholder="40"><span class="unit">cm</span></div>
          <p class="section-note">Used to scale the draft. Generated meshes are visual approximations, not dimensioned CAD.</p>
        </details>`, { footer: `${YI.btn("Cancel", "close-sheet", { variant: "ghost" })}${YI.btn("Create draft", "np-create", { variant: "primary" })}` });
    },

    // ─── Compare ────────────────────────────────────────────────────────────
    compare(arg, sh) {
      const p = S().project;
      if (p.versions.length < 2) return wrap("Compare versions", `<p class="muted">You need at least two versions to compare.</p>`);
      const b = p.versions.find((v) => v.id === (sh.b || p.pendingVersion || arg)) || p.versions[p.versions.length - 1];
      let a = p.versions.find((v) => v.id === (sh.a || p.currentVersion));
      if (!a || a.id === b.id) a = p.versions.find((v) => v.id !== b.id);
      sh.a = a.id; sh.b = b.id;
      const diffs = [];
      const pa = a.params, pb = b.params;
      if (pa.neckRadius !== pb.neckRadius) diffs.push(["Neck", `thickness ${pa.neckRadius} → ${pb.neckRadius} mm`, "changed"]);
      if (pa.shadeFlare !== pb.shadeFlare || pa.shadeDepth !== pb.shadeDepth) diffs.push(["Shade", `shape changed (flare ${Math.round((pb.shadeFlare / pa.shadeFlare - 1) * 100)}%)`, S().brief.preserve.some((x) => x.part === "shade") ? "conflict" : "changed"]);
      if (pa.shadeColor !== pb.shadeColor) diffs.push(["Shade", "colour changed", "changed"]);
      if (pa.baseColor !== pb.baseColor) diffs.push(["Base", "colour changed", "changed"]);
      if (pa.shadeFinish !== pb.shadeFinish) diffs.push(["Finish", `${pa.shadeFinish} → ${pb.shadeFinish}`, "changed"]);
      if (pa.heightCm !== pb.heightCm) diffs.push(["Height", `≈${pa.heightCm} → ≈${pb.heightCm} cm`, "changed"]);
      if (Boolean(pa.pullChain) !== Boolean(pb.pullChain)) diffs.push(["Pull-chain", pb.pullChain ? "added" : "removed", "changed"]);
      const asked = b.request ? `<div class="requested">${ic("message")}<div><p><strong>You asked (version ${b.n}):</strong> “${esc(b.request)}”</p>
          <p class="small muted">YIIYA can't confirm a requested change automatically yet — check it in the views above before using this version.${b.unmodelled ? "" : ""}</p>
          ${b.unmodelled ? `<p class="small"><span class="tag-sim">Prototype</span> This request isn't simulated, so nothing matching it appears — only neck thickness and a pull-chain are modelled.</p>` : ""}</div></div>` : "";
      const sel = (side, v) => `<label class="sr-only" for="cmp-${side}">Version on the ${side === "a" ? "left" : "right"}</label><select id="cmp-${side}" class="input input-sm" data-act-change="cmp-pick" data-arg="${side}">${p.versions.map((x) => `<option value="${x.id}" ${x.id === v.id ? "selected" : ""}>Version ${x.n}${x.id === p.currentVersion ? " (in use)" : x.id === p.pendingVersion ? " (new)" : ""}</option>`).join("")}</select>`;
      const body = `<div class="compare-grid">
          <figure class="compare-pane">${sel("a", a)}<div class="compare-canvas">${YI.lampSVG(a.params, { idSuffix: "ca", title: `Version ${a.n}` })}</div><figcaption>${esc(a.label)}</figcaption></figure>
          <figure class="compare-pane">${sel("b", b)}<div class="compare-canvas">${YI.lampSVG(b.params, { idSuffix: "cb", title: `Version ${b.n}` })}</div><figcaption>${esc(b.label)}</figcaption></figure>
        </div>
        ${asked}
        <h3 class="field-label">Differences</h3>
        <ul class="diff-list">${diffs.length ? diffs.map(([part, d, kind]) => `<li class="diff diff-${kind}">${ic(kind === "conflict" ? "warn" : "info")}<span><strong>${part}</strong> ${d}${kind === "conflict" ? " — you asked to keep this" : ""}</span></li>`).join("") : `<li class="diff">${ic("check")}<span>No differences in tracked properties.</span></li>`}</ul>
        <p class="small muted">Front views from the same camera. Differences come from the version records; mesh-level diffing is proposed (P2).</p>`;
      const usingB = b.id === p.currentVersion;
      return wrap("Compare versions", body, { size: "xl", footer: `${YI.btn("Close", "close-sheet", { variant: "ghost" })}${usingB ? "" : YI.btn(`Keep version ${a.n}`, "keep-current", { arg: b.id, variant: "secondary" })}${usingB ? "" : YI.btn(`Use version ${b.n}`, "use-version", { arg: b.id, variant: "primary", fk: "cmp-use" })}` });
    },

    // ─── Help ───────────────────────────────────────────────────────────────
    help(arg, sh) {
      const keys = [["Enter", "Send message"], ["Shift + Enter", "New line"], ["Space (hold)", "Talk, when the message box isn't focused"], ["Ctrl/⌘ + Z", "Undo instant edit or version switch"], ["Ctrl/⌘ + Shift + Z", "Redo"], ["Arrow keys", "Rotate the view (canvas focused)"], ["+ / −", "Zoom (canvas focused)"], ["0", "Reset view"], ["Esc", "Clear selection or close a panel"], ["/", "Focus the message box"]];
      const body = `
        <h3 class="field-label">Tips</h3>
        <ul class="plain-list"><li>Colour, finish and size edits are instant and free. Shape changes create a new version.</li><li>Select a part first, then say “make this black”.</li><li>Say what to keep — “keep the shade the same” — and it's added to the brief.</li></ul>
        <h3 class="field-label">Keyboard shortcuts</h3>
        <table class="kbd-table"><tbody>${keys.map(([k, d]) => `<tr><th scope="row"><kbd>${k}</kbd></th><td>${d}</td></tr>`).join("")}</tbody></table>
        <h3 class="field-label">If something goes wrong</h3>
        <details class="disclosure"><summary>Generation is slow or waiting</summary><p>Free GPUs are shared. Waits vary and there's no reliable estimate. Instant edits keep working while you wait.</p></details>
        <details class="disclosure"><summary>Generation failed</summary><p>Your work is never replaced by a failed result. Try again later, or add your own Hugging Face token in Settings › Generation.</p></details>
        <details class="disclosure"><summary>Voice doesn't work</summary><p>Allow the microphone in your browser's site settings, or type — everything works by text.</p></details>
        <details class="disclosure"><summary>The 3D view is blank</summary><p>Your browser may not support WebGL. YIIYA shows a static preview; editing and export still work.</p></details>
        <h3 class="field-label">Diagnostic info</h3>
        <pre class="diag mono" aria-label="Diagnostic information">app: yiiya-v2 prototype
browser: ${esc(navigator.userAgent.split(") ")[0].slice(0, 60))})
webgl: ${S().webgl ? "available" : "unavailable"}
last error: ${S().gen && S().gen.error ? S().gen.error : "none"}
mode: free-only</pre>
        <p class="small muted">Contains no prompts, tokens or account details.</p>
        <div class="btn-row">${YI.btn("Copy diagnostic info", "toast", { arg: "Copied (simulated)", variant: "secondary", size: "sm", icon: "copy" })}${YI.btn("Send feedback", "open-sheet", { arg: "feedback", variant: "secondary", size: "sm", icon: "message" })}</div>`;
      return wrap("Help", body, { size: "lg" });
    },

    feedback() {
      return wrap("Send feedback", `
        <label class="field-label" for="fb">What happened?</label><textarea id="fb" class="input" rows="4" data-autofocus></textarea>
        <label class="check-row"><input type="checkbox"> <span>Include diagnostic info (no prompts or tokens)</span></label>
        <p class="small muted">Nothing is sent until you press Send. In this prototype, Send does nothing.</p>`, { footer: `${YI.btn("Cancel", "close-sheet", { variant: "ghost" })}${YI.btn("Send", "toast", { arg: "Prototype: feedback not sent", variant: "primary" })}` });
    },

    tech(arg) {
      const rows = YI.TECH_ATTEMPTS[arg] || [];
      return wrap("Technical details", `<p class="muted small">For troubleshooting. Model names are shown here only.</p>
        <table class="kbd-table"><thead><tr><th scope="col">Service</th><th scope="col">Result</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="mono">${r.provider}</td><td>${r.result}</td></tr>`).join("")}</tbody></table>
        <p class="small muted">No paid fallback was attempted (free-only mode). Times and errors are simulated examples.</p>`, { footer: YI.btn("Copy details", "toast", { arg: "Copied (simulated)", variant: "secondary" }) });
    },

    // ─── Small confirmations ────────────────────────────────────────────────
    delete(id) {
      const p = YI.PROJECTS.find((x) => x.id === id) || { name: "this project", versions: 0, storage: "browser" };
      return wrap(`Delete “${esc(p.name)}”?`, `<p>This removes the project, its conversation and ${p.versions} version${p.versions === 1 ? "" : "s"} ${p.storage === "account" ? "from your account" : "from this browser"}. It can't be undone.</p><p class="muted small">Files you already downloaded aren't affected.</p>`, { size: "sm", footer: `${YI.btn("Cancel", "close-sheet", { variant: "secondary", fk: "del-cancel" })}${YI.btn("Delete project", "lib-delete", { arg: id, variant: "danger" })}` });
    },
    rename() {
      return wrap("Rename project", `<label class="field-label" for="rn">Name</label><input id="rn" class="input" value="${esc(S().project.name)}" data-autofocus data-fk="rn">`, { size: "sm", footer: `${YI.btn("Cancel", "close-sheet", { variant: "ghost" })}${YI.btn("Save", "rename-save", { variant: "primary" })}` });
    },
    save() {
      const s = S();
      const sv = YI.SAVE[s.saveState];
      return wrap("Where your work is saved", `${YI.notice(sv.tone === "success" ? "success" : sv.tone === "danger" ? "danger" : sv.tone === "warning" ? "warning" : "info", sv.text, s.signedIn ? "Your conversation, versions and instant edits are saved to your account and this browser." : "Your conversation, versions and instant edits are saved in this browser. Clearing browser data removes them.", "")}
        ${s.signedIn ? "" : `<p>Sign in to save to your account and open this project on other devices.</p>`}
        <p class="small muted">Saved: conversation, versions, selection, instant edits and the design brief. Generated files are stored by YIIYA; older files can expire.</p>`, { size: "sm", footer: s.signedIn ? YI.btn("Done", "close-sheet", { variant: "secondary" }) : `${YI.btn("Not now", "close-sheet", { variant: "ghost" })}${YI.btn("Sign in", "open-sheet", { arg: "account", variant: "primary" })}` });
    },
    conflict() {
      return wrap("This project changed on another device", `<p>Version 3 was edited in another tab or device after you opened it here.</p>
        <ul class="plain-list"><li><strong>Here:</strong> base colour black, height ≈35 cm</li><li><strong>Other device:</strong> new version 4 · “walnut base”</li></ul>
        ${YI.notice("future", "Save conflicts are proposed", "Needs project revision numbers on the server so YIIYA can detect conflicts instead of overwriting.", YI.futureTag("P1"))}`, { footer: `${YI.btn("Save mine as a copy", "conflict-resolve", { variant: "ghost" })}${YI.btn("Load the other", "conflict-resolve", { variant: "secondary" })}${YI.btn("Keep mine", "conflict-resolve", { variant: "primary" })}` });
    },
    menu() {
      const s = S();
      const item = (label, icon, act, arg, disabled) => `<li><button type="button" class="menu-item" data-act="${act}" data-arg="${arg}" ${disabled ? "disabled" : ""}>${ic(icon)}<span>${label}</span></button></li>`;
      return wrap("Menu", `<ul class="menu-list">
        ${item("Projects", "folder", "go", "projects")}
        ${item("Start from a photo", "camera", "open-sheet", "capture")}
        ${item("Share", "share", "open-sheet", "share", !s.project.hasObject)}
        ${item("Help & shortcuts", "help", "open-sheet", "help")}
        ${item("Settings", "settings", "open-sheet", "settings")}
        ${item(s.signedIn ? "Account" : "Sign in", "user", "open-sheet", "account")}
      </ul>`, { size: "sm" });
    }
  };

  function fakeQR() {
    // Deterministic decorative pattern — NOT a scannable code.
    let cells = "";
    let seed = 7;
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      let on;
      if (finder) {
        const fx = x > 13 ? x - 14 : x, fy = y > 13 ? y - 14 : y;
        on = fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5);
      } else { seed = (seed * 9301 + 49297) % 233280; on = seed / 233280 > 0.52; }
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `<svg viewBox="-1 -1 23 23" aria-hidden="true"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/><g fill="#111">${cells}</g></svg>`;
  }
})();
