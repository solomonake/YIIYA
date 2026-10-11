/* Deep-linkable states: #/<route>?scenario=<id>. Each scenario builds state
 * deterministically (no timers) so the gallery can render it in an iframe.
 * `bp` lists the breakpoints the gallery shows it at: d=1440, t=768, p=390. */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;
  const ago = (s) => Date.now() - s * 1000;

  function base(extra = {}) {
    YI.S.project = YI.freshProject();
    YI.S.brief = YI.freshBrief();
    Object.assign(YI.S, { messages: [], selection: null, gen: null, voice: "idle", partial: "", sheet: null, draft: "", references: [], firstRun: true, quota: "ok", netDrop: false, saveState: "browser", online: true, webgl: true, lowMemory: false, signedIn: false, tab: "chat", inspectorTab: "brief", snap: "half", voiceMode: "normal" }, extra);
  }

  const LAMP_PROMPT = "Make a compact desk lamp with a curved brass neck and a dark green shade.";

  function lampV1({ matte = false } = {}) {
    const s = S();
    const p = s.project;
    p.name = "Desk lamp";
    p.hasObject = true;
    const params = { ...YI.LAMP_V1, ...(matte ? { shadeFinish: "matte" } : {}) };
    p.versions = [{ id: "v1", n: 1, kind: "generated", label: "First draft", params: { ...YI.LAMP_V1 }, createdAt: new Date() }];
    p.currentVersion = "v1";
    p.params = params;
    p.ops = [{ id: "o1", base: true, type: "version", label: "Version 1 created", before: { params: null, currentVersion: null, versions: [] }, after: { params: { ...YI.LAMP_V1 }, currentVersion: "v1", versions: [] } }];
    if (matte) p.ops.push({ id: "o2", type: "local", label: "Shade finish → matte", before: { params: { ...YI.LAMP_V1 }, currentVersion: "v1", versions: p.versions.map((v) => ({ ...v })) }, after: { params: { ...params }, currentVersion: "v1", versions: p.versions.map((v) => ({ ...v })) } });
    p.versions[0].params = { ...params };
    s.brief.object = "Compact desk lamp";
    s.brief.parts = ["shade", "neck", "stem", "base"].map((id) => ({ id, label: YI.PART_LABEL[id] }));
    s.brief.height = { value: 41, unit: "cm", basis: "estimated" };
    s.brief.materials = ["Brass neck (metal)", "Dark green shade", "Dark base"];
    s.brief.style = "Compact, mid-century";
    s.brief.questions = ["Where will you use it? (sets which export checks matter)"];
    s.firstRun = false;
    s.messages = [
      { id: "m1", role: "user", text: LAMP_PROMPT },
      { id: "m2", role: "assistant", kind: "note", text: "Got it — a compact desk lamp with a curved brass neck and a dark green shade, about 40 cm tall (estimated). Making a first draft now; you can refine anything after." },
      { id: "m3", role: "assistant", kind: "note", text: "Version 1 is ready. Drag to orbit, click a part to select it, or try an instant edit below.", suggestions: ["Make it matte", "Select the neck", "Make it 35 cm tall"] }
    ];
    if (matte) {
      s.messages.push({ id: "m4", role: "user", text: "Make the shade matte." });
      s.messages.push({ id: "m5", role: "assistant", kind: "action", action: "local", title: "Finish → matte", body: "Applied instantly. No generation used.", buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }] });
    }
  }

  function withNeckRequest() {
    const s = S();
    s.selection = "neck";
    s.inspectorTab = "part";
    s.brief.preserve = [{ part: "shade", text: "Shade: keep exactly as is" }];
    s.messages.push({ id: "m6", role: "user", text: "Make this thinner, but keep the shade exactly the same.", selection: "Neck" });
  }

  function withV2Pending() {
    const p = S().project;
    p.versions.push({ id: "v2", n: 2, kind: "regenerated", label: "Thinner neck", params: { ...YI.LAMP_V2_REGEN, shadeFinish: "matte" }, createdAt: new Date(), basedOn: "v1" });
    p.pendingVersion = "v2";
  }

  function genState(phase, extra = {}) {
    S().gen = { id: "g1", kind: extra.kind || "new", label: "Desk lamp", prompt: LAMP_PROMPT, resultParams: { ...YI.LAMP_V1 }, startedAt: ago(extra.elapsed || 48), phase, attempts: 1, ...extra };
  }

  function genNew(phase, extra) {
    base();
    S().project.name = "Desk lamp";
    S().firstRun = false;
    S().brief.object = "Compact desk lamp";
    S().messages = [
      { id: "m1", role: "user", text: LAMP_PROMPT },
      { id: "m2", role: "assistant", kind: "note", text: "Got it — a compact desk lamp with a curved brass neck and a dark green shade, about 40 cm tall (estimated). Making a first draft now; you can refine anything after." }
    ];
    genState(phase, extra);
  }

  function failNew(type, phase = "failed") {
    genNew(phase, { error: type, doneAt: Date.now(), elapsed: 96 });
    S().messages.push({ id: "mf", role: "system", kind: "gen-result", text: YI.FAILURES[type].title, tone: "danger" });
  }

  function failRevision(type, phase = "failed") {
    base();
    lampV1({ matte: true });
    withNeckRequest();
    genState(phase, { kind: "revision", error: type, doneAt: Date.now(), elapsed: 140, label: "Thinner neck" });
    S().messages.push({ id: "mf", role: "system", kind: "gen-result", text: YI.FAILURES[type].title, tone: "danger" });
  }

  function restored() {
    base({ signedIn: true, saveState: "account" });
    const s = S();
    const p = s.project;
    p.name = "Desk lamp";
    p.hasObject = true;
    p.versions = [
      { id: "v1", n: 1, kind: "generated", label: "First draft", params: { ...YI.LAMP_V1, shadeFinish: "matte", heightCm: 35, baseColor: "#121212" }, basedOn: null },
      { id: "v2", n: 2, kind: "regenerated", label: "Thinner neck", params: { ...YI.LAMP_V2_REGEN, shadeFinish: "matte" }, basedOn: "v1" },
      { id: "v3", n: 3, kind: "regenerated", label: "Pull-chain switch", params: { ...YI.LAMP_V3_SWITCH }, basedOn: "v1" }
    ];
    p.currentVersion = "v3";
    p.params = { ...YI.LAMP_V3_SWITCH };
    const mk = (type, label) => ({ id: YI.uid(), type, label, before: { params: { ...YI.LAMP_V1 }, currentVersion: "v1", versions: p.versions.map((v) => ({ ...v })) }, after: { params: { ...p.params }, currentVersion: "v3", versions: p.versions.map((v) => ({ ...v })) } });
    p.ops = [{ ...mk("version", "Version 1 created"), base: true }, mk("local", "Shade finish → matte"), mk("version", "Switched to version 2"), mk("version", "Undo: back to version 1"), mk("local", "Height ≈ 35 cm (estimated)"), mk("local", "Base colour → black"), mk("version", "Switched to version 3")];
    p.localEdits = 3;
    s.brief.object = "Compact desk lamp";
    s.brief.parts = ["shade", "neck", "stem", "base"].map((id) => ({ id, label: YI.PART_LABEL[id] }));
    s.brief.height = { value: 35, unit: "cm", basis: "estimated" };
    s.brief.materials = ["Brass neck (metal)", "Dark green shade, matte", "Black base"];
    s.brief.style = "Compact, mid-century";
    s.brief.destination = "Render & portfolio";
    s.brief.preserve = [{ part: "shade", text: "Shade: keep exactly as is" }];
    s.firstRun = false;
    s.messages = YI.RESTORED_TURNS.map((m, i) => ({ id: "r" + i, ...m }));
    s.messages.push({ id: "rr", role: "system", kind: "gen-result", text: "Restored “Desk lamp” from your account — 10 turns, 3 versions. Version 3 is in use.", tone: "neutral" });
  }
  YI.loadRestoredProject = restored;

  const SC = [];
  const add = (id, surface, state, route, bp, setup, notes = "") => SC.push({ id, surface, state, route, bp, setup, notes });

  // Landing & first use
  add("landing", "Landing", "Default", "landing", "dp", () => base());
  add("studio-empty", "Studio empty / first use", "First visit, no account", "studio", "dtp", () => base());
  add("studio-new-sheet", "New project", "Prompt + progressive options", "studio", "dp", () => { base(); S().sheet = { type: "new" }; });
  // Conversation
  add("studio-clarify", "Studio conversation", "Clarifying a consequential ambiguity", "studio", "dp", () => {
    base();
    S().firstRun = false;
    S().messages = [{ id: "c1", role: "user", text: "a lamp" }, { id: "c2", role: "assistant", kind: "action", action: "clarify", title: "Desk lamp or floor lamp?", body: "It changes the proportions a lot. Everything else I can refine later.", buttons: [{ label: "Desk lamp", act: "clarify-answer", arg: "a compact desk lamp", variant: "secondary" }, { label: "Floor lamp", act: "clarify-answer", arg: "a floor lamp", variant: "secondary" }, { label: "Your call", act: "clarify-answer", arg: "a desk lamp", variant: "ghost" }] }];
  });
  add("studio-v1", "Studio conversation", "First draft ready (journey A)", "studio", "dtp", () => { base(); lampV1(); });
  add("studio-local-edit", "Studio editing", "Instant finish edit applied", "studio", "dp", () => { base(); lampV1({ matte: true }); });
  add("studio-typing-preview", "Studio conversation", "Composer previews the action type while typing", "studio", "d", () => { base(); lampV1({ matte: true }); S().selection = "neck"; S().inspectorTab = "part"; S().draft = "Make this thinner, but keep the shade exactly the same."; });
  // Editing / selection
  add("studio-selected", "Studio editing", "Part selected (neck) · part controls", "studio", "dtp", () => { base(); lampV1({ matte: true }); S().selection = "neck"; S().inspectorTab = "part"; S().tab = "part"; });
  add("studio-revision-current", "Studio editing", "“Make this thinner, keep the shade” — current: regenerate with honest limits (journey B)", "studio", "dp", () => {
    base(); lampV1({ matte: true }); withNeckRequest();
    S().messages.push({ id: "m7", role: "assistant", kind: "action", action: "generative", title: "New version: thinner neck", body: "This needs a new generation. Today it rebuilds the whole lamp from your description and your keep-list, so the shade may still change. Version 1 stays, and you'll compare before replacing it.", target: "Neck", preserved: ["Shade: keep exactly as is"], mayChange: ["Whole mesh — including parts you asked to keep"], buttons: [{ label: "Generate new version", act: "confirm-revision", variant: "primary", payload: { label: "Thinner neck", resultParams: { ...YI.LAMP_V2_REGEN, shadeFinish: "matte" }, prompt: "thinner neck", target: "Neck" } }, { label: "Keep current", act: "dismiss-card", variant: "ghost" }], hint: "Exact part edits (only the neck changes) are proposed for P2." });
  });
  add("studio-revision-proposed", "Studio editing", "Same request — proposed P2 exact part edit", "studio", "dp", () => {
    base({ cap: "proposed" }); YI.S.cap = "proposed"; lampV1({ matte: true }); withNeckRequest();
    S().messages.push({ id: "m7", role: "assistant", kind: "action", action: "parametric", future: "Proposed · P2", title: "Neck tube radius 11 mm → 7 mm", body: "Exact edit on the parametric neck. Other parts are locked and verified unchanged.", target: "Neck", changes: ["Neck radius 11 → 7 mm"], preserved: ["Shade (locked, verified identical)", "Base", "Stem", "Height"], buttons: [{ label: "Apply exact edit", act: "apply-param", arg: "7", variant: "primary" }, { label: "Cancel", act: "dismiss-card", variant: "ghost" }] });
  });
  add("studio-compare", "Asset / revisions", "Compare v1 vs regenerated v2 — kept part drifted", "studio", "dp", () => {
    base(); lampV1({ matte: true }); withNeckRequest(); withV2Pending();
    S().messages.push({ id: "m8", role: "assistant", kind: "action", action: "generative", title: "Version 2 is ready — compare before using it", body: "Your current version 1 is unchanged until you choose. Regeneration rebuilt the whole lamp, so check the parts you wanted to keep.", buttons: [{ label: "Compare", act: "open-compare", arg: "v2", variant: "primary", icon: "compare" }, { label: "Use version 2", act: "use-version", arg: "v2", variant: "secondary" }, { label: "Keep version 1", act: "keep-current", arg: "v2", variant: "ghost" }] });
    S().sheet = { type: "compare", b: "v2" };
  });
  add("studio-pending", "Asset / revisions", "New version ready, not in use (canvas banner)", "studio", "dp", () => {
    base(); lampV1({ matte: true }); withNeckRequest(); withV2Pending(); S().selection = null;
    S().messages.push({ id: "m8", role: "assistant", kind: "action", action: "generative", title: "Version 2 is ready — compare before using it", body: "Your current version 1 is unchanged until you choose. Regeneration rebuilt the whole lamp, so check the parts you wanted to keep.", buttons: [{ label: "Compare", act: "open-compare", arg: "v2", variant: "primary", icon: "compare" }, { label: "Use version 2", act: "use-version", arg: "v2", variant: "secondary" }, { label: "Keep version 1", act: "keep-current", arg: "v2", variant: "ghost" }] });
    S().inspectorTab = "versions"; S().tab = "versions";
  });
  add("studio-undo-height", "Studio editing", "“Undo that. Make it 35 cm tall.” — estimated scale + history", "studio", "dp", () => {
    base(); lampV1({ matte: true }); withNeckRequest(); withV2Pending();
    const p = S().project; p.pendingVersion = null; S().selection = null;
    p.params.heightCm = 35;
    p.ops.push({ id: "o9", type: "version", label: "Kept version 1 (version 2 not used)", before: { params: { ...p.params }, currentVersion: "v1", versions: [] }, after: { params: { ...p.params }, currentVersion: "v1", versions: [] } });
    p.ops.push({ id: "o10", type: "local", label: "Height ≈ 35 cm (estimated)", before: { params: { ...p.params, heightCm: 41 }, currentVersion: "v1", versions: p.versions.map((v) => ({ ...v })) }, after: { params: { ...p.params }, currentVersion: "v1", versions: p.versions.map((v) => ({ ...v })) } });
    S().brief.height = { value: 35, unit: "cm", basis: "estimated" };
    S().messages.push({ id: "m9", role: "user", text: "Undo that. Make it 35 centimetres tall." });
    S().messages.push({ id: "m10", role: "assistant", kind: "note", text: "Kept version 1 — version 2 is still in Versions if you want it." });
    S().messages.push({ id: "m11", role: "assistant", kind: "action", action: "local", title: "Display height ≈ 35 cm (estimated)", body: "Scaled the mesh uniformly so its bounding box is about this tall. It isn't a dimensioned CAD constraint, and downloads currently keep the generated file's original scale (see Export).", buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }] });
    S().inspectorTab = "versions"; S().tab = "versions";
  });
  add("studio-height-proposed", "Studio editing", "35 cm as an exact constraint — proposed P2", "studio", "d", () => {
    base(); YI.S.cap = "proposed"; lampV1({ matte: true });
    S().project.params.heightCm = 35; S().brief.height = { value: 35, unit: "cm", basis: "exact" };
    S().messages.push({ id: "m9", role: "user", text: "Make it 35 centimetres tall." });
    S().messages.push({ id: "m10", role: "assistant", kind: "action", action: "parametric", future: "Proposed · P2", title: "Overall height = 350.0 mm", body: "Exact constraint on a parametric model. Validated: bounding-box height 350.0 mm, proportions kept.", changes: ["Overall height 410 mm → 350 mm"], preserved: ["Shade shape", "Neck curve", "Materials"], buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }] });
  });
  add("studio-part-finish", "Studio editing", "Part finish not available (honest limit)", "studio", "d", () => {
    base(); lampV1({ matte: true }); S().selection = "neck"; S().inspectorTab = "part";
    S().messages.push({ id: "m9", role: "user", text: "Make this glossier.", selection: "Neck" });
    S().messages.push({ id: "m10", role: "assistant", kind: "action", action: "unsupported", title: "Part finish isn't available yet", body: "Selected parts can change colour only. Finish (glossy) applies to the whole lamp.", buttons: [{ label: "Make whole lamp glossy", act: "local-whole-finish", arg: "glossy", variant: "secondary" }, { label: "Keep as is", act: "dismiss-card", variant: "ghost" }], future: "Per-part materials · P2" });
  });
  add("studio-unsupported", "Studio conversation", "Unsupported request with next step", "studio", "dp", () => {
    base(); lampV1({ matte: true });
    S().messages.push({ id: "m9", role: "user", text: "Rig it so the neck can animate." });
    S().messages.push({ id: "m10", role: "assistant", kind: "action", action: "unsupported", title: "Rigging and animation aren't available", body: "Export the GLB and rig it in Blender or Mixamo. YIIYA can make a turntable preview video." });
  });
  add("studio-restored", "Projects / return", "Reopened project: 10 turns, 3 versions restored (journey F)", "studio", "dtp", () => restored());
  // Generation
  const phases = [["preparing", 2], ["queued", 34], ["generating", 92], ["validating", 118]];
  for (const [ph, el] of phases) add(`gen-${ph}`, "Generation", YI.STEP_LABELS[ph], "studio", ph === "queued" ? "dp" : "d", () => genNew(ph, { elapsed: el }));
  add("gen-draft", "Generation", "Draft available while finishing — proposed P1", "studio", "d", () => { genNew("draft", { elapsed: 126 }); YI.S.cap = "proposed"; S().project.hasObject = true; S().project.draftOnly = true; S().project.params = { ...YI.LAMP_V1, shadeFinish: "satin" }; });
  add("gen-finishing", "Generation", "Finishing materials & exports", "studio", "d", () => genNew("finishing", { elapsed: 131 }));
  add("gen-revision-queued", "Generation", "Revision queued — keep editing current version", "studio", "dp", () => { base(); lampV1({ matte: true }); withNeckRequest(); genState("queued", { kind: "revision", label: "Thinner neck", elapsed: 22 }); });
  add("gen-completed", "Generation", "Completed (version 1 ready)", "studio", "d", () => { base(); lampV1(); genState("completed", { doneAt: Date.now(), elapsed: 141 }); });
  add("gen-cancel-requested", "Generation", "Cancel requested", "studio", "d", () => genNew("cancel-requested", { elapsed: 40 }));
  add("gen-cancelled", "Generation", "Cancelled", "studio", "d", () => { genNew("cancelled", { elapsed: 41, doneAt: Date.now() }); });
  add("gen-failed-quota", "Generation", "Free GPU capacity unavailable (journey D)", "studio", "dp", () => failRevision("hf-unavailable"));
  add("gen-daily-limit", "Generation", "YIIYA daily limit reached (reset time from server)", "studio", "d", () => failRevision("daily-limit"));
  add("gen-missing-setup", "Generation", "HF not configured on server", "studio", "d", () => failNew("missing-setup"));
  add("gen-asleep", "Generation", "Spaces not responding", "studio", "d", () => failNew("asleep"));
  add("gen-invalid", "Generation", "Result failed validation (not added)", "studio", "d", () => failNew("invalid"));
  add("gen-interrupted", "Generation", "Connection dropped — current: can't resume (journey C)", "studio", "dp", () => failNew("interrupted", "interrupted"));
  add("gen-reconnecting", "Generation", "Connection dropped — proposed durable job reconnecting (P1)", "studio", "dp", () => { genNew("reconnecting", { elapsed: 51 }); YI.S.cap = "proposed"; });
  add("gen-restored", "Generation", "Reconnected — job state restored (P1)", "studio", "d", () => { genNew("queued", { elapsed: 64, restored: true }); YI.S.cap = "proposed"; });
  // Voice
  const voice = [["idle", "Idle"], ["listening", "Listening"], ["partial", "Partial transcript"], ["thinking", "Thinking"], ["speaking", "Speaking — future realtime"], ["interrupted", "Interruption — future realtime"], ["denied", "Mic permission denied"], ["unsupported", "Unsupported browser"], ["reconnecting", "Reconnect — future realtime"]];
  for (const [v, label] of voice) add(`voice-${v}`, "Voice", label, "studio", v === "listening" || v === "denied" ? "dp" : "d", () => { base(); lampV1({ matte: true }); S().voice = v; S().partial = "make the base a bit darker"; });
  // Capture
  add("capture-upload", "Capture", "Desktop: upload a reference", "studio", "d", () => { base(); S().sheet = { type: "capture", tab: "upload" }; });
  add("capture-qr", "Capture", "Desktop: phone pairing QR", "studio", "d", () => { base(); S().sheet = { type: "capture", tab: "phone", phone: "waiting" }; });
  add("capture-received", "Capture", "Desktop: photo received from phone", "studio", "d", () => { base(); S().sheet = { type: "capture", tab: "phone", phone: "received" }; });
  add("capture-qr-expired", "Capture", "Desktop: pairing code expired", "studio", "d", () => { base(); S().sheet = { type: "capture", tab: "phone", phone: "expired" }; });
  add("capture-ref-attached", "Capture", "Reference attached in composer", "studio", "dp", () => { base(); S().references = [{ name: "lamp-photo.jpg" }]; S().draft = ""; });
  for (const [step, label] of [["permission", "Camera permission ask"], ["frame", "Framing a single photo"], ["lowlight", "Poor lighting warning"], ["denied", "Camera denied → upload fallback"], ["review", "Review photo"], ["uploading", "Uploading to laptop"], ["upload-failed", "Upload failed → retry"], ["sent", "Sent to laptop"], ["expired", "Pairing link expired"], ["invalid", "Invalid pairing link"]]) {
    add(`phone-capture-${step}`, "Capture", `Phone: ${label}`, "capture", "p", () => { base(); S().capture = { step, companion: ["uploading", "upload-failed", "sent", "expired", "invalid"].includes(step) }; });
  }
  // Export / readiness
  const exp = (extra) => () => { base(); restored(); S().sheet = { type: "export", ...extra }; };
  add("export-render", "Readiness / export", "Render & portfolio · instant-edit disclosure", "studio", "dp", exp({}));
  add("export-print", "Readiness / export", "3D print · unknown checks + STL units", "studio", "d", exp({ dest: "3D print" }));
  add("export-converting", "Readiness / export", "OBJ converting", "studio", "d", exp({ conv: { obj: "converting" } }));
  add("export-failed", "Readiness / export", "Conversion failed · GLB still available", "studio", "d", exp({ conv: { obj: "failed", glb: "done" } }));
  add("export-unavailable", "Readiness / export", "File unavailable (expired)", "studio", "d", exp({ fileUnavailable: true }));
  add("export-proposed", "Readiness / export", "Proposed: edits baked into exports (P1)", "studio", "d", () => { exp({})(); YI.S.cap = "proposed"; });
  // Share & viewer
  add("share-current", "Shared viewer", "Public-link disclosure before creating", "studio", "dp", () => { base(); restored(); S().sheet = { type: "share" }; });
  add("share-created", "Shared viewer", "Link created", "studio", "d", () => { base(); restored(); S().sheet = { type: "share", created: true, ack: true }; });
  add("share-proposed", "Shared viewer", "Proposed controlled publish (P1)", "studio", "d", () => { base(); restored(); YI.S.cap = "proposed"; S().sheet = { type: "share" }; });
  add("viewer-ready", "Shared viewer", "Read-only orbit/zoom + metadata", "view", "dp", () => { base(); S().view = { state: "ready" }; });
  add("viewer-loading", "Shared viewer", "Loading", "view", "d", () => { base(); S().view = { state: "loading" }; });
  add("viewer-unavailable", "Shared viewer", "Unavailable link", "view", "p", () => { base(); S().view = { state: "unavailable" }; });
  add("viewer-nowebgl", "Shared viewer", "Mobile fallback (no WebGL)", "view", "p", () => { base(); S().view = { state: "nowebgl" }; });
  // Account
  add("account-signin", "Account", "Sign in (email link)", "studio", "dp", () => { base(); lampV1(); S().sheet = { type: "account" }; });
  add("account-error", "Account", "Invalid email", "studio", "d", () => { base(); lampV1(); S().sheet = { type: "account", state: "error" }; });
  add("account-sent", "Account", "Link sent", "studio", "d", () => { base(); lampV1(); S().sheet = { type: "account", state: "sent" }; });
  add("auth-verifying", "Account", "Opening sign-in link", "auth", "d", () => { base(); S().auth = { state: "verifying" }; });
  add("auth-expired", "Account", "Expired sign-in link", "auth", "dp", () => { base(); S().auth = { state: "expired" }; });
  add("auth-success", "Account", "Signed in · move browser projects (P1)", "auth", "d", () => { base(); S().auth = { state: "success" }; });
  add("save-expired", "Account", "Sign-in expired while working (signed-out recovery)", "studio", "d", () => { base(); lampV1({ matte: true }); S().saveState = "expired"; });
  add("save-conflict", "Account", "Save conflict (proposed P1)", "studio", "d", () => { base(); restored(); S().saveState = "conflict"; S().sheet = { type: "conflict" }; });
  add("save-details", "Account", "Save status details (browser-only)", "studio", "d", () => { base(); lampV1({ matte: true }); S().sheet = { type: "save" }; });
  // Settings & help
  add("settings-appearance", "Settings", "Appearance (new: motion, text size)", "studio", "dp", () => { base(); S().sheet = { type: "settings", section: "appearance" }; });
  add("settings-generation", "Settings", "Generation status + personal HF token", "studio", "d", () => { base(); S().sheet = { type: "settings:generation" }; });
  add("settings-privacy", "Settings", "Local data · clear confirmation", "studio", "d", () => { base(); S().sheet = { type: "settings", section: "privacy", confirmClear: true }; });
  add("settings-status", "Settings", "What works today (capability status)", "studio", "d", () => { base(); S().sheet = { type: "settings", section: "status" }; });
  add("help", "Help / recovery", "Tips, shortcuts, troubleshooting, diagnostics", "studio", "dp", () => { base(); lampV1(); S().sheet = { type: "help" }; });
  add("help-feedback", "Help / recovery", "Feedback (never auto-sent)", "studio", "d", () => { base(); S().sheet = { type: "feedback" }; });
  add("help-tech", "Help / recovery", "Technical details after a failure", "studio", "d", () => { failRevision("hf-unavailable"); S().sheet = { type: "tech:quota" }; });
  // Projects
  add("projects", "Projects / library", "Populated, signed in", "projects", "dtp", () => { base({ signedIn: true }); S().library = { state: "populated", query: "", filter: "all" }; });
  add("projects-signed-out", "Projects / library", "Signed out · browser-only notice", "projects", "dp", () => { base(); S().library = { state: "populated", query: "", filter: "all" }; });
  add("projects-empty", "Projects / library", "Empty", "projects", "dp", () => { base({ signedIn: true }); S().library = { state: "empty", query: "", filter: "all" }; });
  add("projects-loading", "Projects / library", "Loading", "projects", "d", () => { base({ signedIn: true }); S().library = { state: "loading", query: "", filter: "all" }; });
  add("projects-error", "Projects / library", "Account load error · browser projects shown", "projects", "d", () => { base({ signedIn: true }); S().library = { state: "error", query: "", filter: "all" }; });
  add("projects-rename", "Projects / library", "Inline rename", "projects", "d", () => { base({ signedIn: true }); S().library = { state: "populated", query: "", filter: "all", renaming: "lamp" }; });
  add("projects-delete", "Projects / library", "Delete confirmation", "projects", "dp", () => { base({ signedIn: true }); S().library = { state: "populated", query: "", filter: "all" }; S().sheet = { type: "delete:lamp" }; });
  add("projects-search-empty", "Projects / library", "Search with no results", "projects", "d", () => { base({ signedIn: true }); S().library = { state: "populated", query: "vase", filter: "all" }; });
  // Global conditions
  add("offline", "Global states", "Offline while editing", "studio", "dp", () => { base(); lampV1({ matte: true }); S().online = false; S().saveState = "offline"; });
  add("webgl-off", "Global states", "WebGL unavailable · static preview", "studio", "dp", () => { base(); lampV1({ matte: true }); S().webgl = false; S().selection = "shade"; });
  add("low-memory", "Global states", "Large asset / low memory · lighter preview", "studio", "d", () => { base(); lampV1({ matte: true }); S().lowMemory = true; });
  add("phone-full", "Studio (phone)", "Bottom sheet expanded", "studio", "p", () => { base(); restored(); S().snap = "full"; });
  add("phone-menu", "Studio (phone)", "Menu sheet", "studio", "p", () => { base(); lampV1(); S().sheet = { type: "menu" }; });

  YI.SCENARIOS = SC;
  YI.applyScenario = (id) => {
    const sc = SC.find((x) => x.id === id);
    if (!sc) return null;
    const cap = YI.S.cap;
    YI.S.cap = "current";
    sc.setup();
    if (YI.S.cap === "current" && cap === "proposed" && !/proposed|reconnecting|restored|draft/.test(id)) YI.S.cap = cap;
    YI.S.route = sc.route;
    return sc;
  };
})();
