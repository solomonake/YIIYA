/* Simulated behaviour: assistant routing, generation phases, edits, undo,
 * versions. Mirrors the CURRENT routing in lib/scene/local-edit.ts
 * (local vs regen vs contentless vs new) and adds PROPOSED behaviour behind
 * the "capability view" switch. Nothing here calls a model or provider. */
(function () {
  const YI = (window.YI = window.YI || {});
  const S = () => YI.S;

  const PART_LABEL = { shade: "Shade", neck: "Neck", stem: "Stem", base: "Base" };
  YI.PART_LABEL = PART_LABEL;
  const COLORS = {
    "dark green": "#1F3D2C", black: "#121212", white: "#F2F0EB", red: "#B3352F", green: "#2F6B45",
    blue: "#2A5FB8", navy: "#1C2B4A", brass: "#B08A3E", gold: "#C9A23A", chrome: "#D7DADD",
    silver: "#C8CCD0", terracotta: "#B5583A", walnut: "#5A3A22", grey: "#7D776D", gray: "#7D776D", orange: "#D9772B", yellow: "#E3C04F"
  };
  const FINISHES = [
    { re: /\b(matte|matt|flat)\b/, v: "matte" },
    { re: /\b(glossy|glossier|shiny|polished)\b/, v: "glossy" },
    { re: /\b(satin|semi.?gloss)\b/, v: "satin" }
  ];
  const STRUCTURAL = /\b(thinner|thicker|longer|shorter|wider|narrower|rounder|taller neck|add|remove|attach|switch|chain|handle|hole|slot|curve|straighten|bend|shape|reshape)\b/;
  const UNSUPPORTED = [
    { re: /\b(rig|rigged|animate|animation|walk|pose)\b/, title: "Rigging and animation aren't available", next: "Export the GLB and rig it in Blender or Mixamo. YIIYA can make a turntable preview video." },
    { re: /\b(step|stp|iges|fbx|\.blend|blend file|solidworks|fusion)\b/, title: "That format isn't supported", next: "YIIYA exports GLB, OBJ and STL. Import the OBJ or GLB into your CAD or DCC tool." },
    { re: /\b(split|separate) (it )?(into )?parts\b|\bseparate objects\b/, title: "Splitting into separate parts isn't available", next: "The model is one fused mesh. Select a region to recolour it, or separate parts in Blender after export." },
    { re: /\b(put|place|set|stand|sit)s? (it|this|that)? ?(on|in|next to|beside|onto) (a |an |the |my )?(desk|table|shelf|room|scene|floor|wall)\b|\b(in a scene|background|environment)\b/, title: "Placing it in a scene isn't available", next: "YIIYA makes one object at a time and doesn't build scenes. Make the desk as its own project, then arrange both in Blender. Setting the destination to “Render & portfolio” picks the right export checks." },
    { re: /\b(manufactur|tolerance|injection)\b/, title: "Manufacturing checks aren't available", next: "YIIYA can't verify manufacturability. Export STL and check it in your slicer or CAD tool." }
  ];

  YI.STEP_LABELS = {
    preparing: "Preparing",
    queued: "Waiting for a free GPU",
    generating: "Generating 3D model",
    validating: "Checking the file",
    draft: "Draft ready",
    finishing: "Finishing materials & exports",
    completed: "Done"
  };
  YI.genSteps = () => (S().cap === "proposed" ? ["preparing", "queued", "generating", "validating", "draft", "finishing", "completed"] : ["preparing", "queued", "generating", "validating", "finishing", "completed"]);

  function say(msg) {
    S().messages.push({ id: YI.uid(), ...msg });
  }
  YI.say = say;

  function snapshot() {
    const p = S().project;
    return { params: p.params ? { ...p.params } : null, currentVersion: p.currentVersion, versions: p.versions.map((v) => ({ ...v, params: { ...v.params } })) };
  }
  // Versions are append-only: undo restores what's on screen and which version
  // is in use, but never deletes a generated version.
  function restore(snap) {
    const p = S().project;
    p.params = snap.params ? { ...snap.params } : null;
    p.currentVersion = snap.currentVersion;
    for (const sv of snap.versions) {
      const v = p.versions.find((x) => x.id === sv.id);
      if (v) v.params = { ...sv.params };
    }
  }
  function record(type, label, before) {
    const p = S().project;
    p.ops.push({ id: YI.uid(), type, label, before, after: snapshot(), at: new Date() });
    p.redo = [];
    if (type === "local") p.localEdits++;
    markDirty();
  }
  function syncVersion() {
    const p = S().project;
    const v = p.versions.find((x) => x.id === p.currentVersion);
    if (v) v.params = { ...p.params };
  }
  function markDirty() {
    const s = S();
    if (!s.online) { s.saveState = "offline"; return; }
    s.saveState = "saving";
    clearTimeout(markDirty.t);
    markDirty.t = setTimeout(() => {
      if (S().saveState === "saving") { S().saveState = S().signedIn ? "account" : "browser"; YI.render(); }
    }, 700);
  }
  YI.markDirty = markDirty;

  // ─── Undo / redo: instant edits and version switches only ─────────────────
  YI.undo = () => {
    const p = S().project;
    const last = p.ops[p.ops.length - 1];
    if (!last || last.base) { YI.toast("Nothing to undo."); return; }
    const op = p.ops.pop();
    p.redo.push(op);
    restore(op.before);
    YI.canvasSync();
    YI.announce(`Undid: ${op.label}`);
    return op;
  };
  YI.redo = () => {
    const p = S().project;
    const op = p.redo.pop();
    if (!op) { YI.toast("Nothing to redo."); return; }
    p.ops.push(op);
    restore(op.after);
    YI.canvasSync();
    YI.announce(`Redid: ${op.label}`);
  };

  // ─── Local edits ──────────────────────────────────────────────────────────
  function parseLocal(t) {
    let color = null, colorName = null, finish = null, scale = null;
    for (const [name, hex] of Object.entries(COLORS)) {
      if (new RegExp(`\\b${name}\\b`).test(t)) { color = hex; colorName = name; break; }
    }
    for (const f of FINISHES) if (f.re.test(t)) { finish = f.v; break; }
    if (/\b(bigger|larger|scale up)\b/.test(t)) scale = 1.15;
    if (/\b(smaller|scale down)\b/.test(t)) scale = 0.87;
    if (!color && !finish && !scale) return null;
    return { color, colorName, finish, scale };
  }

  YI.applyLocal = (edit, { part = S().selection, silentMsg } = {}) => {
    const p = S().project;
    const before = snapshot();
    const q = p.params;
    const bits = [];
    if (edit.scale) {
      q.heightCm = Math.round(q.heightCm * edit.scale);
      bits.push(`display size ×${edit.scale} (≈${q.heightCm} cm, estimated)`);
    }
    if (edit.color) {
      if (part) {
        const key = { shade: "shadeColor", neck: "neckColor", stem: "stemColor", base: "baseColor" }[part];
        q[key] = edit.color;
        bits.push(`${PART_LABEL[part]} colour → ${edit.colorName}`);
      } else {
        q.shadeColor = q.neckColor = q.baseColor = q.stemColor = edit.color;
        bits.push(`whole lamp colour → ${edit.colorName}`);
      }
    }
    if (edit.finish) {
      if (part && S().cap === "current") {
        // Current capability: finish overrides apply to the whole mesh only.
        say({ role: "assistant", kind: "action", action: "unsupported", title: "Part finish isn't available yet", body: `Selected parts can change colour only. Finish (${edit.finish}) applies to the whole lamp.`, buttons: [{ label: `Make whole lamp ${edit.finish}`, act: "local-whole-finish", arg: edit.finish, variant: "secondary" }, { label: "Keep as is", act: "dismiss-card", variant: "ghost" }], future: "Per-part materials · P2" });
        if (!bits.length) return;
      } else {
        if (part === "shade" || !part) q.shadeFinish = edit.finish;
        if (part === "neck" || part === "stem" || !part) q.neckFinish = edit.finish;
        if (part === "base") q.baseFinish = edit.finish;
        bits.push(`${part ? PART_LABEL[part] + " " : ""}finish → ${edit.finish}`);
      }
    }
    if (!bits.length) return;
    syncVersion();
    const label = bits.join(", ");
    record("local", label, before);
    YI.canvasSync();
    if (!silentMsg) {
      say({
        role: "assistant", kind: "action", action: "local",
        title: label.charAt(0).toUpperCase() + label.slice(1),
        body: edit.color && !part ? "Applied instantly. The model is one mesh, so colour without a selection changes everything — select a part to target it." : "Applied instantly. No generation used.",
        buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }]
      });
    }
    YI.announce(`Instant edit applied: ${label}`);
  };

  YI.setHeight = (value, unit) => {
    const p = S().project;
    const cm = unit === "mm" ? value / 10 : unit === "m" ? value * 100 : unit === "in" ? value * 2.54 : value;
    const before = snapshot();
    p.params.heightCm = Math.round(cm * 10) / 10;
    syncVersion();
    const exact = S().cap === "proposed";
    S().brief.height = { value: p.params.heightCm, unit: "cm", basis: exact ? "exact" : "estimated" };
    record(exact ? "parametric" : "local", `Height ${exact ? "=" : "≈"} ${p.params.heightCm} cm${exact ? "" : " (estimated)"}`, before);
    YI.canvasSync();
    if (exact) {
      say({ role: "assistant", kind: "action", action: "parametric", future: "Proposed · P2", title: `Overall height = ${(p.params.heightCm * 10).toFixed(1)} mm`, body: "Exact constraint on a parametric model. Validated: bounding-box height 350.0 mm, proportions kept.", changes: ["Overall height 410 mm → 350 mm"], preserved: ["Shade shape", "Neck curve", "Materials"], buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }] });
    } else {
      say({ role: "assistant", kind: "action", action: "local", title: `Display height ≈ ${p.params.heightCm} cm (estimated)`, body: "Scaled the mesh uniformly so its bounding box is about this tall. It isn't a dimensioned CAD constraint, and downloads currently keep the generated file's original scale (see Export).", buttons: [{ label: "Undo", act: "undo", icon: "undo", variant: "ghost" }] });
    }
  };

  // ─── Assistant routing ────────────────────────────────────────────────────
  YI.submit = (text, { voice } = {}) => {
    const s = S();
    text = text.trim();
    if (!text) return;
    if (s.sheet) YI.closeSheet();
    say({ role: "user", text, selection: s.selection ? PART_LABEL[s.selection] : null, voice });
    // Handle "Undo that. Make it 35 centimetres tall." as two commands.
    const parts = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    for (const sentence of parts) route(sentence);
    s.draft = "";
    YI.render();
    YI.scrollChat();
  };

  function route(text) {
    const s = S();
    const t = text.toLowerCase();
    const has = s.project.hasObject;

    if (/^(undo|undo that|go back)\b/.test(t)) {
      // "Undo that" right after a revision means: don't take the new version.
      if (s.project.pendingVersion) {
        const nv = s.project.versions.find((v) => v.id === s.project.pendingVersion);
        s.project.pendingVersion = null;
        s.messages.forEach((m) => { if (m.buttons && m.buttons.some((b) => b.act === "keep-current")) m.dismissed = "Choice made."; });
        say({ role: "assistant", kind: "note", text: `Kept version ${currentVersionNo()} — version ${nv.n} wasn't used and stays in Versions.` });
        return;
      }
      const op = YI.undo();
      if (op) say({ role: "assistant", kind: "note", text: `Undid “${op.label}”. ${op.type === "version" ? "" : "The previous state is back on the canvas."}`.trim() });
      return;
    }
    if (/^redo\b/.test(t)) { YI.redo(); return; }
    if (/\bexport|download\b/.test(t)) {
      if (!has) { say({ role: "assistant", kind: "note", text: "There's nothing to export yet. Describe an object or add a photo first." }); return; }
      if (/portfolio|render/.test(t)) s.brief.destination = "Render & portfolio";
      say({ role: "assistant", kind: "note", text: "Opening Export." });
      setTimeout(() => YI.openSheet("export"), 60);
      return;
    }
    if (/\bshare\b/.test(t) && has) { setTimeout(() => YI.openSheet("share"), 60); return; }
    for (const u of UNSUPPORTED) {
      if (u.re.test(t)) {
        say({ role: "assistant", kind: "action", action: "unsupported", title: u.title, body: u.next });
        return;
      }
    }
    if (/\b(3d )?print(ed|able|ing)?\b/.test(t) && /\b(can|could|is|will)\b/.test(t)) {
      say({ role: "assistant", kind: "action", action: "readiness", title: "3D-print readiness: unknown", body: "Watertightness and wall thickness aren't checked, and the size is an estimate. Export shows exactly what's verified.", buttons: [{ label: "Open export checks", act: "open-sheet", arg: "export", variant: "secondary" }] });
      return;
    }

    if (!has) return startNew(text);

    const height = /(\d+(?:\.\d+)?)\s*(cm|centimet\w*|mm|millimet\w*|m\b|met(?:er|re)s?\b|in\b|inch\w*)/.exec(t);
    if (height && /\b(tall|high|height)\b/.test(t)) {
      const unit = /^mm|millimet/.test(height[2]) ? "mm" : /^cm|centimet/.test(height[2]) ? "cm" : /^in/.test(height[2]) ? "in" : "m";
      YI.setHeight(parseFloat(height[1]), unit);
      return;
    }

    if (/\bkeep (the )?(\w+)( exactly)?( the same)?\b/.test(t)) {
      const m = /\bkeep (?:the )?(shade|neck|base|stem)\b/.exec(t);
      if (m && !s.brief.preserve.some((x) => x.part === m[1])) s.brief.preserve.push({ part: m[1], text: `${PART_LABEL[m[1]]}: keep exactly as is` });
    }

    if (STRUCTURAL.test(t)) return proposeRevision(text);

    const local = parseLocal(t);
    if (local) {
      // Text that names a part with no selection: current routing can't target by name.
      const named = /\b(shade|neck|base|stem)\b/.exec(t);
      if (named && !s.selection && s.cap === "current" && local.color) {
        say({ role: "assistant", kind: "action", action: "clarify", title: `Recolour just the ${named[1]}?`, body: `Naming a part in text doesn't target it yet. Select the ${named[1]} on the model or in Parts, then send again — or recolour the whole lamp.`, buttons: [{ label: `Select ${named[1]}`, act: "select-part", arg: named[1], variant: "secondary" }, { label: "Recolour whole lamp", act: "local-whole-color", arg: local.colorName, variant: "ghost" }] });
        return;
      }
      if (named && !s.selection && s.cap === "proposed") return YI.applyLocal(local, { part: named[1] });
      return YI.applyLocal(local);
    }
    if (/^(make|turn|change|now)\s*(it|this|that)?\s*$/.test(t)) {
      say({ role: "assistant", kind: "note", text: "I didn't catch what to change — try “make it matte”, “bigger”, or select a part and say “make this black”." });
      return;
    }
    return proposeRevision(text);
  }

  function startNew(text) {
    const s = S();
    const t = text.toLowerCase();
    const vague = t.split(/\s+/).length <= 3 && /\blamp\b/.test(t);
    if (vague) {
      say({ role: "assistant", kind: "action", action: "clarify", title: "Desk lamp or floor lamp?", body: "It changes the proportions a lot. Everything else I can refine later.", buttons: [{ label: "Desk lamp", act: "clarify-answer", arg: "a compact desk lamp", variant: "secondary" }, { label: "Floor lamp", act: "clarify-answer", arg: "a floor lamp", variant: "secondary" }, { label: "Your call", act: "clarify-answer", arg: "a desk lamp", variant: "ghost" }] });
      return;
    }
    const isLamp = /\blamp\b/.test(t);
    const name = isLamp ? "Compact desk lamp" : text.replace(/^(make|create|a|an)\s+/i, "").replace(/\.$/, "");
    s.project.name = isLamp ? "Desk lamp" : name.charAt(0).toUpperCase() + name.slice(1, 40);
    s.project.standIn = !isLamp;
    s.brief.object = isLamp ? "Compact desk lamp" : s.project.name;
    s.brief.materials = isLamp ? ["Brass neck (metal)", "Dark green shade", "Dark base"] : [];
    s.brief.style = isLamp ? "Compact, mid-century" : "";
    s.brief.references = s.references.map((r) => r.name);
    say({
      role: "assistant", kind: "note",
      text: isLamp
        ? "Got it — a compact desk lamp with a curved brass neck and a dark green shade, about 40 cm tall (estimated). Making a first draft now; you can refine anything after."
        : `Making a first draft of “${YI.esc(s.project.name)}”.${isLamp ? "" : " (Prototype stand-in: the example lamp is shown for every object.)"}`
    });
    YI.startGeneration({ kind: "new", prompt: text, label: s.project.name, resultParams: { ...YI.LAMP_V1 } });
  }

  function proposeRevision(text) {
    const s = S();
    const t = text.toLowerCase();
    const part = s.selection;
    const thinner = /\bthinner|slimmer\b/.test(t), thicker = /\bthicker\b/.test(t);
    const preserve = s.brief.preserve.map((x) => x.text);
    if (s.cap === "proposed" && part === "neck" && (thinner || thicker)) {
      const from = s.project.params.neckRadius, to = thinner ? Math.max(4, from - 4) : from + 4;
      say({
        role: "assistant", kind: "action", action: "parametric", future: "Proposed · P2",
        title: `Neck tube radius ${from} mm → ${to} mm`,
        body: "Exact edit on the parametric neck. Other parts are locked and verified unchanged.",
        target: "Neck", changes: [`Neck radius ${from} → ${to} mm`], preserved: ["Shade (locked, verified identical)", "Base", "Stem", "Height"],
        buttons: [{ label: "Apply exact edit", act: "apply-param", arg: String(to), variant: "primary" }, { label: "Cancel", act: "dismiss-card", variant: "ghost" }]
      });
      return;
    }
    const target = part ? PART_LABEL[part] : "Whole lamp";
    const resultParams = { ...s.project.params };
    let label = text.replace(/\.$/, "");
    if (part === "neck" && thinner) { resultParams.neckRadius = Math.max(4, resultParams.neckRadius - 4); label = "Thinner neck"; }
    if (part === "neck" && thicker) { resultParams.neckRadius += 4; label = "Thicker neck"; }
    let modelled = false;
    if (part === "neck" && (thinner || thicker)) modelled = true;
    if (/chain|switch/.test(t)) { label = "Pull-chain switch"; resultParams.pullChain = true; modelled = true; }
    resultParams.unmodelled = !modelled;
    // Regeneration rebuilds the whole mesh: the shade drifts a little.
    resultParams.shadeFlare = Math.round((resultParams.shadeFlare + 0.1) * 100) / 100;
    resultParams.shadeDepth = 0.94;
    say({
      role: "assistant", kind: "action", action: "generative",
      title: `New version: ${label.toLowerCase()}`,
      body: part
        ? `This needs a new generation. Today it rebuilds the whole lamp from your description${preserve.length ? " and your keep-list" : ""}, so the ${s.brief.preserve.length ? s.brief.preserve.map((p) => PART_LABEL[p.part].toLowerCase()).join(" and ") : "other parts"} may still change. Version ${currentVersionNo()} stays, and you'll compare before replacing it.`
        : `This needs a new generation of the whole lamp. Version ${currentVersionNo()} stays, and you'll compare before replacing it.`,
      target, preserved: preserve, mayChange: ["Whole mesh — including parts you asked to keep"],
      buttons: [
        { label: "Generate new version", act: "confirm-revision", variant: "primary", payload: { label, resultParams, prompt: text, target } },
        { label: "Keep current", act: "dismiss-card", variant: "ghost" }
      ],
      hint: part ? "Exact part edits (only the neck changes) are proposed for P2." : ""
    });
  }

  function currentVersionNo() {
    const p = S().project;
    return (p.versions.find((v) => v.id === p.currentVersion) || { n: 1 }).n;
  }
  YI.currentVersionNo = currentVersionNo;

  YI.applyParametricNeck = (to) => {
    const p = S().project;
    const before = snapshot();
    const from = p.params.neckRadius;
    p.params.neckRadius = Number(to);
    syncVersion();
    record("parametric", `Neck radius ${from} → ${to} mm`, before);
    YI.canvasSync();
    say({ role: "assistant", kind: "note", text: `Applied. Neck radius is now ${to} mm; shade verified unchanged. (Proposed P2 behaviour.)` });
  };

  // ─── Generation simulator ─────────────────────────────────────────────────
  const DUR = { preparing: 1200, queued: 3600, generating: 3000, validating: 1000, draft: 1400, finishing: 1600 };
  let timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  function setPhase(phase, extra = {}) {
    const g = S().gen;
    if (!g) return;
    Object.assign(g, { phase, phaseAt: Date.now(), ...extra });
    const spoken = {
      preparing: "Preparing your request.",
      queued: "Waiting for a free GPU. Wait times vary.",
      generating: "Generating the 3D model.",
      validating: "Checking the file.",
      draft: "Draft ready to inspect while materials finish.",
      finishing: "Finishing materials and exports.",
      reconnecting: "Connection lost. Reconnecting to your job.",
      "cancel-requested": "Cancel requested."
    }[phase];
    if (spoken) YI.announce(spoken);
    YI.render();
  }

  YI.startGeneration = (opts) => {
    const s = S();
    clear();
    if (!s.online) {
      say({ role: "assistant", kind: "note", text: "You're offline, so I can't start a generation. Instant edits still work; try again when you're back online." });
      YI.render();
      return;
    }
    s.gen = { id: YI.uid(), kind: opts.kind, label: opts.label, prompt: opts.prompt, resultParams: opts.resultParams, target: opts.target, startedAt: Date.now(), phase: "preparing", attempts: 1 };
    if (s.quota === "daily-limit") return fail("daily-limit", 0);
    if (s.quota === "missing-setup") return fail("missing-setup", 400);
    setPhase("preparing");
    later(DUR.preparing, queued);
  };

  function queued(restored) {
    setPhase("queued", restored ? { restored: true } : {});
    const s = S();
    if (s.netDrop && !restored) {
      later(1600, () => {
        S().netDrop = false;
        if (S().cap === "proposed") {
          setPhase("reconnecting");
          later(2400, () => {
            YI.announce("Reconnected. Your job is still queued.");
            queued(true);
          });
        } else fail("interrupted", 0);
      });
      return;
    }
    later(DUR.queued, () => {
      const q = S().quota;
      if (q === "hf-unavailable" || q === "asleep") return fail(q, 0);
      setPhase("generating");
      later(DUR.generating, () => {
        setPhase("validating");
        later(DUR.validating, () => {
          if (S().quota === "invalid") return fail("invalid", 0);
          if (S().cap === "proposed") {
            setPhase("draft");
            if (S().gen.kind === "new") showDraft();
            later(DUR.draft, finishing);
          } else finishing();
        });
      });
    });
  }

  function finishing() {
    setPhase("finishing");
    later(DUR.finishing, complete);
  }

  function showDraft() {
    const p = S().project;
    p.params = { ...S().gen.resultParams, shadeFinish: "satin" };
    p.hasObject = true;
    p.draftOnly = true;
    YI.canvasSync();
  }

  function complete() {
    const s = S();
    const g = s.gen;
    const p = s.project;
    const n = p.versions.length + 1;
    const v = { id: "v" + n, n, kind: g.kind === "new" ? "generated" : "regenerated", label: g.kind === "new" ? "First draft" : g.label, params: { ...g.resultParams }, createdAt: new Date(), basedOn: p.currentVersion, request: g.kind === "new" ? null : g.prompt, unmodelled: Boolean(g.resultParams && g.resultParams.unmodelled) };
    p.versions.push(v);
    p.draftOnly = false;
    g.phase = "completed";
    g.doneAt = Date.now();
    if (g.kind === "new") {
      const before = snapshot();
      p.hasObject = true;
      p.params = { ...v.params };
      p.currentVersion = v.id;
      s.brief.parts = ["shade", "neck", "stem", "base"].map((id) => ({ id, label: PART_LABEL[id] }));
      s.brief.height = { value: v.params.heightCm, unit: "cm", basis: "estimated" };
      s.brief.questions = ["Where will you use it? (sets which export checks matter)"];
      s.firstRun = false;
      record("version", "Version 1 created", before);
      p.ops[p.ops.length - 1].base = true; // the first version can't be undone into an empty canvas
      say({ role: "assistant", kind: "note", text: "Version 1 is ready. Drag to orbit, click a part to select it, or try an instant edit below.", suggestions: ["Make it matte", "Select the neck", "Make it 35 cm tall"] });
      YI.announce("Version 1 is ready.");
      YI.canvasSync();
      setTimeout(() => { if (S().gen && S().gen.id === g.id) { S().gen = null; YI.render(); } }, 2200);
    } else {
      p.pendingVersion = v.id;
      say({ role: "assistant", kind: "action", action: "generative", title: `Version ${n} is ready — compare before using it`, body: `Your current version ${currentVersionNo()} is unchanged until you choose. Regeneration rebuilt the whole lamp, so check that your change is there and that the parts you wanted to keep didn't move.${v.unmodelled ? " (Prototype: this particular change isn't simulated, so it won't be visible — only neck thickness and a pull-chain are modelled.)" : ""}`, buttons: [{ label: "Compare", act: "open-compare", arg: v.id, variant: "primary", icon: "compare" }, { label: `Use version ${n}`, act: "use-version", arg: v.id, variant: "secondary" }, { label: `Keep version ${currentVersionNo()}`, act: "keep-current", arg: v.id, variant: "ghost" }] });
      YI.announce(`Version ${n} is ready. Compare before using it.`);
      setTimeout(() => { if (S().gen && S().gen.id === g.id) { S().gen = null; YI.render(); } }, 2200);
    }
    YI.render();
    YI.scrollChat();
  }

  function fail(type, delay) {
    later(delay, () => {
      const g = S().gen;
      if (!g) return;
      g.phase = type === "interrupted" ? "interrupted" : "failed";
      g.error = type;
      g.doneAt = Date.now();
      if (S().project.draftOnly) { S().project.hasObject = false; S().project.params = null; S().project.draftOnly = false; YI.canvasSync(); }
      const title = YI.FAILURES[type].title;
      YI.announce(`Generation stopped: ${title}`, { assertive: true });
      say({ role: "system", kind: "gen-result", text: title, tone: "danger" });
      YI.render();
      YI.scrollChat();
    });
  }

  YI.FAILURES = {
    "hf-unavailable": { title: "Free GPU capacity isn't available right now", body: "The shared Hugging Face GPUs YIIYA uses are busy or out of quota. Your work is unchanged and instant edits still work.", note: "Hugging Face didn't say when capacity will return.", retry: true, token: true, tech: "quota" },
    "daily-limit": { title: "You've used today's free generations (10 of 10)", body: "YIIYA's daily limit resets in about 6 hours. Instant edits, versions and export still work.", note: "Reset time supplied by YIIYA's server.", retry: false, token: false },
    "missing-setup": { title: "3D generation isn't set up on this server", body: "This server has no Hugging Face access configured, so it can't create new models. Paid services are off.", retry: false, token: true, tech: null },
    asleep: { title: "The 3D model services didn't respond", body: "The Hugging Face Spaces may be starting up or paused. Your work is unchanged.", retry: true, token: false, tech: "asleep" },
    invalid: { title: "The result wasn't a usable 3D model", body: "A file came back but failed validation (no geometry). It wasn't added to your versions.", retry: true, token: false, tech: "invalid" },
    interrupted: { title: "Connection lost — this generation can't be resumed", body: "Generation currently runs inside your open connection, so it stopped when the connection dropped. Your previous version is safe.", retry: true, retryLabel: "Start again", token: false, tech: null }
  };

  YI.cancelGeneration = () => {
    const g = S().gen;
    if (!g) return;
    clear();
    setPhase("cancel-requested");
    later(1200, () => {
      const gg = S().gen;
      if (!gg) return;
      gg.phase = "cancelled";
      gg.doneAt = Date.now();
      if (S().project.draftOnly) { S().project.hasObject = false; S().project.params = null; S().project.draftOnly = false; YI.canvasSync(); }
      say({ role: "system", kind: "gen-result", text: S().cap === "proposed" ? "Generation cancelled. The GPU job was stopped." : "Stopped waiting. Work already sent to the shared GPU may finish there, but it won't replace your lamp.", tone: "neutral" });
      YI.announce("Generation cancelled.");
      YI.render();
    });
  };

  YI.retryGeneration = () => {
    const g = S().gen;
    if (!g) return;
    if (S().quota !== "ok") { S().quota = "ok"; YI.toast("Prototype: capacity is available on retry (simulated)."); }
    YI.startGeneration({ kind: g.kind, label: g.label, prompt: g.prompt, resultParams: g.resultParams, target: g.target });
  };

  YI.useVersion = (id) => {
    const p = S().project;
    const v = p.versions.find((x) => x.id === id);
    if (!v) return;
    const before = snapshot();
    p.currentVersion = id;
    p.params = { ...v.params };
    p.pendingVersion = null;
    record("version", `Switched to version ${v.n}`, before);
    YI.canvasSync();
    YI.announce(`Now showing version ${v.n}.`);
  };
})();
