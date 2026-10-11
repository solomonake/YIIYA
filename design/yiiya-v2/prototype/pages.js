/* Non-studio pages: landing, projects, phone capture, shared viewer, sign-in link. */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;
  const esc = (s) => YI.esc(s);
  const ic = (n, l) => YI.icon(n, l);

  const pageHeader = (title, extra = "") => `<header class="page-header">
    <a class="brand" href="#/" aria-label="YIIYA home">YIIYA</a>
    ${title ? `<span class="divider" aria-hidden="true"></span><span class="page-header-title">${title}</span>` : ""}
    <span class="topbar-spacer"></span>
    ${extra}
  </header>`;

  // ─── Landing ──────────────────────────────────────────────────────────────
  YI.renderLanding = (root) => {
    const s = S();
    root.innerHTML = `<div class="page landing">
      ${pageHeader("", `<nav class="topnav" aria-label="Site">${YI.btn("Projects", "go", { arg: "projects", variant: "ghost", size: "sm", icon: "folder" })}${s.signedIn ? "" : YI.btn("Sign in", "open-sheet", { arg: "account", variant: "ghost", size: "sm", icon: "user" })}</nav>`)}
      <main id="main">
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">3D creation studio</p>
            <h1 class="display">Describe an object. Refine it in conversation. Export it.</h1>
            <p class="lead">YIIYA turns a description or one photo into an editable 3D draft. Change colour and finish instantly, ask for new versions, and download GLB, OBJ or STL with an honest readiness check.</p>
            <form class="hero-form" data-act-submit="landing-start">
              <label class="sr-only" for="landing-prompt">Describe an object</label>
              <input id="landing-prompt" class="input input-lg" placeholder="A compact desk lamp with a curved brass neck" autocomplete="off" data-fk="landing-prompt">
              <button type="submit" class="btn btn-primary btn-lg">${ic("send")}<span>Start</span></button>
            </form>
            <div class="hero-alt">
              ${YI.btn("Start from a photo", "landing-photo", { variant: "secondary", icon: "camera" })}
              <span class="muted small">No account needed — work is saved in your browser.</span>
            </div>
            <div class="chips" role="group" aria-label="Starter objects">
              ${YI.STARTERS.slice(0, 5).map((st) => `<button type="button" class="chip" data-act="landing-starter" data-arg="${esc(st.prompt)}">${esc(st.label)}</button>`).join("")}
            </div>
          </div>
          <figure class="hero-example">
            <div class="example-canvas">${YI.lampSVG(YI.LAMP_V3_SWITCH, { title: "Example desk lamp", idSuffix: "hero" })}</div>
            <figcaption>
              <span class="tag-sim">Example</span>
              <span>Desk lamp, version 3 after ten conversational turns: matte shade, black base, ≈35 cm (estimated). Illustrative render made for this design prototype, not a generated asset.</span>
            </figcaption>
          </figure>
        </section>
        <section class="how" aria-labelledby="how-title">
          <h2 id="how-title" class="section-heading">How it works</h2>
          <ol class="how-steps">
            <li><span class="how-num">1</span><h3>Describe or show it</h3><p>Type, speak, or use one photo. YIIYA asks only when something important is unclear.</p></li>
            <li><span class="how-num">2</span><h3>Refine it</h3><p>Colour, finish and size change instantly. Shape changes make a new version, and you compare before replacing.</p></li>
            <li><span class="how-num">3</span><h3>Check and export</h3><p>See what's verified and what isn't, then download GLB, OBJ or STL.</p></li>
          </ol>
        </section>
        <section class="limits" aria-labelledby="limits-title">
          <h2 id="limits-title" class="section-heading">What to expect</h2>
          <div class="limits-grid">
            <div class="limits-col"><h3>${ic("check")} Good for</h3><ul>
              <li>Desk objects, props and simple product concepts</li>
              <li>Fast colour, finish and size exploration</li>
              <li>Visual drafts for renders, AR and portfolios</li>
              <li>GLB, OBJ and STL downloads</li></ul></div>
            <div class="limits-col"><h3>${ic("info")} Current limits</h3><ul>
              <li>One photo is used; unseen sides are estimated</li>
              <li>Shape changes regenerate the whole object</li>
              <li>Sizes are estimates, not CAD dimensions</li>
              <li>3D-print and manufacturing readiness aren't verified</li>
              <li>Generation uses shared free GPUs — waits vary and capacity can run out</li>
              <li>Characters, rigging and animation aren't supported</li></ul></div>
          </div>
        </section>
      </main>
      <footer class="page-footer"><span>YIIYA generates 3D with open models on Hugging Face Spaces. It never switches to a paid service automatically.</span></footer>
    </div>`;
  };

  // ─── Projects ─────────────────────────────────────────────────────────────
  YI.renderProjects = (root) => {
    const s = S();
    const L = s.library;
    const q = L.query.toLowerCase();
    const items = YI.PROJECTS.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (L.filter === "all" || (L.filter === "account" ? p.storage === "account" : p.storage === "browser")));
    const visible = s.signedIn ? items : items.filter((p) => p.storage === "browser");
    let body = "";
    if (L.state === "loading") {
      body = `<div class="project-grid" aria-busy="true" aria-label="Loading projects">${[1, 2, 3].map(() => `<div class="project-card is-skeleton"><div class="thumb"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`).join("")}</div><p class="sr-only" role="status">Loading projects…</p>`;
    } else if (L.state === "empty") {
      body = `<div class="empty-state"><h2>No projects yet</h2><p class="muted">Start with a description or one photo. Projects appear here automatically.</p>
        <div class="btn-row">${YI.btn("New project", "go-new", { variant: "primary", icon: "plus" })}${YI.btn("Start from a photo", "landing-photo", { variant: "secondary", icon: "camera" })}</div></div>`;
    } else {
      if (L.state === "error") body += YI.notice("danger", "Couldn't load your account projects", "Projects saved in this browser are shown below. Your account projects aren't deleted.", YI.btn("Retry", "lib-retry", { size: "sm", variant: "secondary", icon: "refresh" }), { role: "alert" });
      const list = L.state === "error" ? visible.filter((p) => p.storage === "browser") : visible;
      body += list.length ? `<ul class="project-grid" aria-label="Projects">${list.map(card).join("")}</ul>` : `<div class="empty-state"><h2>No matches</h2><p class="muted">No projects match “${esc(L.query)}”.</p>${YI.btn("Clear search", "lib-clear", { variant: "secondary" })}</div>`;
    }
    root.innerHTML = `<div class="page projects">
      ${pageHeader("Projects", `${YI.btn("Studio", "go", { arg: "studio", variant: "ghost", size: "sm", icon: "cube" })}${s.signedIn ? YI.btn("Account", "open-sheet", { arg: "account", variant: "ghost", size: "sm", icon: "user" }) : YI.btn("Sign in", "open-sheet", { arg: "account", variant: "ghost", size: "sm", icon: "user" })}`)}
      <main id="main" class="page-main">
        <div class="projects-head">
          <h1 class="page-title">Projects</h1>
          ${YI.btn("New project", "go-new", { variant: "primary", icon: "plus", fk: "lib-new" })}
        </div>
        ${s.signedIn ? "" : YI.notice("info", "These projects are saved in this browser only", "Clearing browser data removes them. Sign in to save projects to your account and open them on other devices.", YI.btn("Sign in", "open-sheet", { arg: "account", size: "sm", variant: "secondary" }))}
        <div class="projects-tools">
          <div class="search"><label class="sr-only" for="lib-search">Search projects</label>${ic("search")}<input id="lib-search" class="input" type="search" placeholder="Search projects" value="${esc(L.query)}" data-act-input="lib-search" data-fk="lib-search"></div>
          ${s.signedIn ? `<div class="segmented" role="group" aria-label="Filter">${[["all", "All"], ["account", "Account"], ["browser", "This browser"]].map(([k, l]) => `<button type="button" class="seg" aria-pressed="${L.filter === k}" data-act="lib-filter" data-arg="${k}">${l}</button>`).join("")}</div>` : ""}
          ${YI.futureTag("Search, rename, duplicate, delete · P1")}
        </div>
        ${body}
      </main>
    </div>`;
  };

  function card(p) {
    const L = S().library;
    const renaming = L.renaming === p.id;
    const thumb = p.status === "failed"
      ? `<div class="thumb thumb-failed">${ic("warn")}<span>No model</span></div>`
      : `<div class="thumb">${YI.lampSVG(p.params, { idSuffix: "pc" + p.id })}</div>`;
    return `<li class="project-card${p.status === "failed" ? " is-failed" : ""}">
      ${thumb}
      <div class="project-info">
        ${renaming ? `<form class="rename-form" data-act-submit="lib-rename-save" data-arg="${p.id}"><label class="sr-only" for="rn-${p.id}">Project name</label><input id="rn-${p.id}" class="input" value="${esc(p.name)}" data-autofocus data-fk="rn-${p.id}"><button class="btn btn-primary btn-sm" type="submit">Save</button>${YI.btn("Cancel", "lib-rename-cancel", { size: "sm", variant: "ghost" })}</form>` : `<h2 class="project-name-lg">${esc(p.name)}</h2>`}
        <p class="project-meta">${p.status === "failed" ? `<span class="tone-danger">${esc(p.note)}</span>` : `${p.versions} version${p.versions === 1 ? "" : "s"} · ${p.turns} turns · ${esc(p.updated)}`}</p>
        <span class="storage-badge storage-${p.storage}">${ic(p.storage === "account" ? "user" : "folder")}${p.storage === "account" ? "Saved to account" : "This browser only"}</span>
      </div>
      <div class="project-actions">
        ${YI.btn(p.status === "failed" ? "Open & retry" : "Open", "lib-open", { arg: p.id, variant: "primary", size: "sm", fk: "open-" + p.id })}
        ${YI.btn("Rename", "lib-rename", { arg: p.id, variant: "ghost", size: "sm", icon: "pencil", iconOnly: true, fk: "rn-btn-" + p.id })}
        ${YI.btn("Duplicate", "lib-dup", { arg: p.id, variant: "ghost", size: "sm", icon: "copy", iconOnly: true })}
        ${YI.btn(`Delete ${p.name}`, "open-sheet", { arg: "delete:" + p.id, variant: "ghost", size: "sm", icon: "trash", iconOnly: true, fk: "del-" + p.id })}
      </div>
    </li>`;
  }

  // Prototype-only controls inside a page: dashed, labelled, hidden in gallery frames.
  const protoStrip = (inner) => `<div class="btn-row proto-inline"><span class="tag-sim">Prototype</span>${inner}</div>`;

  // ─── Phone capture ────────────────────────────────────────────────────────
  YI.renderCapture = (root) => {
    const s = S();
    const c = s.capture;
    const companion = c.companion;
    const back = companion ? "" : YI.btn("Back to studio", "go", { arg: "studio", variant: "ghost", size: "sm", icon: "chevLeft" });
    const viewfinder = (overlay = "") => `<div class="viewfinder" aria-hidden="${overlay ? "false" : "true"}"><div class="vf-guide"></div><div class="vf-object"></div>${overlay}</div>`;
    const singleNote = `<details class="disclosure"><summary>Why only one photo?</summary><p>In free mode YIIYA's 3D models use a single image. Sides it can't see are estimated. Walk-around scans aren't available here, and extra angles wouldn't be used — so we don't ask for them.</p></details>`;
    const views = {
      permission: `<div class="capture-panel"><h1 class="capture-title">Take a photo of your object</h1><p class="muted">YIIYA needs your camera for this. You can upload a photo instead.</p>
        <div class="btn-col">${YI.btn("Allow camera", "cap", { arg: "frame", variant: "primary", icon: "camera", fk: "cap-allow" })}${YI.btn("Upload a photo instead", "cap", { arg: "review", variant: "secondary", icon: "upload" })}</div>${singleNote}</div>`,
      denied: `<div class="capture-panel">${YI.notice("warning", "Camera access is blocked", "To use the camera, allow it in your browser's site settings (the icon next to the address), then try again. Or upload a photo — it works the same.", "", { role: "alert" })}
        <div class="btn-col">${YI.btn("Upload a photo instead", "cap", { arg: "review", variant: "primary", icon: "upload", fk: "cap-upload" })}${YI.btn("Try camera again", "cap", { arg: "frame", variant: "secondary", icon: "refresh" })}</div></div>`,
      frame: `${viewfinder()}<div class="capture-panel compact"><p class="capture-tip">${ic("info")} One object · plain background · even light. Fill most of the frame.</p>
        <div class="shutter-row">${YI.btn("Upload", "cap", { arg: "review", variant: "ghost", icon: "upload" })}<button type="button" class="shutter" data-act="cap" data-arg="review" aria-label="Take photo" data-fk="shutter"></button><span class="shutter-spacer" aria-hidden="true"></span></div>${singleNote}${protoStrip(YI.btn("Simulate low light", "cap", { arg: "lowlight", variant: "ghost", size: "sm" }))}</div>`,
      lowlight: `${viewfinder(`<div class="vf-warning" role="status">${ic("warn")} It's quite dark. Detail and colour may be lost — move to brighter, even light if you can.</div>`)}<div class="capture-panel compact"><div class="shutter-row">${YI.btn("Upload", "cap", { arg: "review", variant: "ghost", icon: "upload" })}<button type="button" class="shutter" data-act="cap" data-arg="review" aria-label="Take photo anyway" data-fk="shutter"></button><span class="small muted">Take anyway</span></div></div>`,
      review: `<div class="review-photo" role="img" aria-label="Your photo: desk lamp on a plain table (example)"><div class="vf-object"></div><span class="tag-sim">Example photo</span></div>
        <div class="capture-panel compact"><ul class="check-list">
          <li class="ok">${ic("check")} One object, centred</li>
          <li class="ok">${ic("check")} Light looks even</li>
          <li class="info">${ic("info")} Unseen sides will be estimated</li></ul>
          <div class="btn-col">${YI.btn(companion ? "Send to laptop" : "Use this photo", "cap", { arg: companion ? "uploading" : "use", variant: "primary", icon: companion ? "send" : "check", fk: "cap-use" })}${YI.btn("Retake", "cap", { arg: "frame", variant: "secondary", icon: "camera" })}</div></div>`,
      uploading: `<div class="capture-panel center" role="status"><span class="spinner lg" aria-hidden="true"></span><h1 class="capture-title">Sending to your laptop…</h1><p class="muted">Keep this page open.</p>${protoStrip(YI.btn("Simulate failure", "cap", { arg: "upload-failed", variant: "ghost", size: "sm" }) + YI.btn("Simulate success", "cap", { arg: "sent", variant: "ghost", size: "sm" }))}</div>`,
      "upload-failed": `<div class="capture-panel">${YI.notice("danger", "Upload failed", "Your photo is still on this page. Check your connection and try again.", "", { role: "alert" })}<div class="btn-col">${YI.btn("Retry upload", "cap", { arg: "uploading", variant: "primary", icon: "refresh", fk: "cap-retry" })}${YI.btn("Retake photo", "cap", { arg: "frame", variant: "secondary" })}</div></div>`,
      sent: `<div class="capture-panel center" role="status">${ic("check")}<h1 class="capture-title">Sent to your laptop</h1><p class="muted">Check your computer — it's ready to generate from this photo. You can close this page.</p>${YI.btn("Take another photo", "cap", { arg: "frame", variant: "secondary" })}</div>`,
      expired: `<div class="capture-panel">${YI.notice("warning", "This link has expired", "Pairing links last a short time. On your laptop, open Capture › Use your phone to show a new QR code, then scan it again.", "", { role: "alert" })}${YI.btn("Use this phone on its own instead", "cap-standalone", { variant: "secondary" })}</div>`,
      invalid: `<div class="capture-panel">${YI.notice("danger", "This pairing link isn't valid", "It may be incomplete or already used. Scan a new QR code from your laptop.", "", { role: "alert" })}${YI.btn("Use this phone on its own instead", "cap-standalone", { variant: "secondary" })}</div>`
    };
    root.innerHTML = `<div class="page capture-page">
      ${pageHeader("Capture", `${companion ? `<span class="linked-badge">${ic("phone")} Linked to your laptop</span>` : ""}${back}`)}
      <main id="main" class="capture-main">${views[c.step] || views.frame}</main>
    </div>`;
  };

  // ─── Shared viewer ────────────────────────────────────────────────────────
  let viewerCanvas = null;
  YI.renderViewer = (root) => {
    const s = S();
    const v = s.view.state;
    if (viewerCanvas) { try { viewerCanvas.dispose(); } catch {} viewerCanvas = null; }
    let main = "";
    if (v === "unavailable") {
      main = `<div class="viewer-empty">${ic("cube")}<h1>This model isn't available</h1><p class="muted">The link may be incomplete, or the owner stopped sharing it.</p>${YI.btn("Make your own in YIIYA", "go", { arg: "", variant: "primary" })}</div>`;
    } else {
      const loading = v === "loading";
      main = `<div class="viewer-layout">
        <div class="viewer-stage${loading ? " is-loading" : ""}" id="viewer-host" role="group" aria-roledescription="3D viewer" aria-label="Desk lamp, read-only 3D view" tabindex="0">
          ${loading ? `<div class="viewer-loading" role="status"><span class="spinner lg" aria-hidden="true"></span><span>Loading 3D model…</span></div>` : ""}
          ${v === "nowebgl" ? `<div class="viewer-poster">${YI.lampSVG(YI.LAMP_V3_SWITCH, { title: "Desk lamp preview image", idSuffix: "vp" })}<p class="small muted">3D preview isn't supported on this device. Showing an image instead.</p></div>` : ""}
        </div>
        <aside class="viewer-meta" aria-label="Model details">
          <h1 class="viewer-title">Desk lamp</h1>
          <p class="muted">Shared from YIIYA · version 3</p>
          <dl class="meta-list">
            <div><dt>Height</dt><dd class="mono">≈ 35 cm (estimated)</dd></div>
            <div><dt>Triangles</dt><dd class="mono">84.2k</dd></div>
            <div><dt>File</dt><dd class="mono">GLB · 4.2 MB</dd></div>
          </dl>
          <div class="btn-col">
            ${YI.btn("View in your space (AR)", "viewer-ar", { variant: "primary", icon: "cube", disabled: loading })}
            ${YI.btn("Download GLB", "toast", { arg: "Simulated download: desk-lamp-v3.glb", variant: "secondary", icon: "download", disabled: loading })}
          </div>
          <p class="small muted">Read-only. Drag or use the buttons to look around.</p>
          <div class="btn-row viewer-tools">${["left", "right", "in", "out", "reset"].map((c) => YI.btn({ left: "Rotate left", right: "Rotate right", in: "Zoom in", out: "Zoom out", reset: "Reset view" }[c], "viewer-view", { arg: c, variant: "secondary", size: "sm", iconOnly: true, icon: { left: "rotl", right: "rotr", in: "plus", out: "minus", reset: "fit" }[c] })).join("")}</div>
          <hr class="sep">
          ${YI.btn("Make your own", "go", { arg: "", variant: "ghost", icon: "chevRight" })}
        </aside>
      </div>`;
    }
    root.innerHTML = `<div class="page viewer-page">${pageHeader("Shared model")}<main id="main" class="viewer-main">${main}</main></div>`;
    if (v === "ready") {
      const host = YI.$("#viewer-host");
      const mount = () => {
        if (YI.Canvas3D && YI.Canvas3D.available && S().webgl) {
          viewerCanvas = YI.Canvas3D.create(host, { onSelect: () => {} });
          viewerCanvas.setParams(YI.LAMP_V3_SWITCH);
        } else host.innerHTML = `<div class="viewer-poster">${YI.lampSVG(YI.LAMP_V3_SWITCH, { title: "Desk lamp", idSuffix: "vp2" })}</div>`;
      };
      if (YI.Canvas3D) mount(); else window.addEventListener("yi-canvas3d-ready", mount, { once: true });
    }
  };
  YI.viewerControl = (cmd) => {
    if (!viewerCanvas) return;
    ({ left: () => viewerCanvas.rotate(-1), right: () => viewerCanvas.rotate(1), in: () => viewerCanvas.zoom(-1), out: () => viewerCanvas.zoom(1), reset: () => viewerCanvas.reset() })[cmd]();
  };

  // ─── Sign-in link landing ─────────────────────────────────────────────────
  YI.renderAuth = (root) => {
    const a = S().auth.state;
    const body = {
      verifying: `<div class="auth-card" role="status"><span class="spinner lg" aria-hidden="true"></span><h1>Signing you in…</h1></div>`,
      expired: `<div class="auth-card">${YI.notice("warning", "This sign-in link has expired or was already used", "Links work once. Send a new one to the same email.", "", { role: "alert" })}${YI.btn("Send a new link", "open-sheet", { arg: "account", variant: "primary", fk: "auth-resend" })}${YI.btn("Continue without signing in", "go", { arg: "studio", variant: "ghost" })}<p class="small muted">Your work in this browser is still here.</p></div>`,
      success: `<div class="auth-card">${ic("check")}<h1>You're signed in</h1><p class="muted">New work saves to your account. You have 2 projects saved only in this browser.</p>${YI.btn("Save them to my account", "toast", { arg: "Simulated: 2 projects saved to your account", variant: "primary" })}${YI.futureTag("Move browser projects · P1")}${YI.btn("Go to studio", "go", { arg: "studio", variant: "secondary" })}</div>`
    }[a] || "";
    root.innerHTML = `<div class="page auth-page">${pageHeader("Sign in")}<main id="main" class="auth-main">${body}</main></div>`;
  };
})();
