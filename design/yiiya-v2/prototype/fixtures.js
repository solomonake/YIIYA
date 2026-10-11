/* Prototype fixtures. EVERYTHING here is example content: no live AI calls,
 * no provider requests, no real credentials. Provider names appear only in
 * the optional technical details panel, mirroring lib/generation-policy.ts. */
(function () {
  const YI = (window.YI = window.YI || {});

  YI.LAMP_V1 = {
    neckRadius: 11, // mm, tube radius
    neckColor: "#B08A3E",
    neckFinish: "satin",
    shadeColor: "#1F3D2C",
    shadeFinish: "glossy",
    shadeFlare: 1.0,
    shadeDepth: 1.0,
    baseColor: "#2E2B27",
    heightCm: 41 // estimated from mesh bounds; not a CAD dimension
  };

  // Regeneration of "thinner neck": the neck is thinner, but the whole mesh is
  // new, so the shade drifted slightly. This is the honest current behaviour.
  YI.LAMP_V2_REGEN = { ...YI.LAMP_V1, neckRadius: 7, shadeFlare: 1.1, shadeDepth: 0.94 };
  // Proposed parametric edit (P2): only the neck radius changes.
  YI.LAMP_V2_PARAM = { ...YI.LAMP_V1, neckRadius: 7 };
  YI.LAMP_V3_SWITCH = { ...YI.LAMP_V1, shadeFinish: "matte", heightCm: 35, baseColor: "#121212", shadeFlare: 1.04 };

  YI.STARTERS = [
    { label: "Desk lamp", prompt: "Make a compact desk lamp with a curved brass neck and a dark green shade." },
    { label: "Pen holder", prompt: "A hexagonal pen holder in terracotta" },
    { label: "Headphone stand", prompt: "A minimal walnut headphone stand" },
    { label: "Planter", prompt: "A small ribbed ceramic planter" },
    { label: "Phone stand", prompt: "An angled phone stand with a cable slot" },
    { label: "Coffee mug", prompt: "A ceramic coffee mug with a speckled glaze" }
  ];

  YI.QUICK_EDITS = ["Matte", "Glossy", "Black", "Brass", "Bigger", "Smaller"];

  // Shared technical detail for the optional details panel. Names mirror the
  // HF allowlist in lib/generation-policy.ts. Errors are SIMULATED examples.
  YI.TECH_ATTEMPTS = {
    quota: [
      { provider: "hf-trellis2", result: "429 · ZeroGPU quota exceeded (simulated)" },
      { provider: "hf-hunyuan", result: "429 · ZeroGPU quota exceeded (simulated)" },
      { provider: "hf-trellis", result: "skipped · recent failures (circuit breaker)" },
      { provider: "hf-stablefast", result: "429 · ZeroGPU quota exceeded (simulated)" },
      { provider: "hf-instantmesh", result: "not tried · overall deadline reached" }
    ],
    asleep: [
      { provider: "hf-trellis2", result: "timeout after 120 s (Space starting up) (simulated)" },
      { provider: "hf-hunyuan", result: "timeout after 90 s (simulated)" },
      { provider: "hf-trellis", result: "error · Space paused (simulated)" }
    ],
    invalid: [{ provider: "hf-trellis2", result: "file returned · failed GLB validation: 0 triangles (simulated)" }]
  };

  YI.PROJECTS = [
    {
      id: "lamp",
      name: "Desk lamp",
      updated: "Today, 14:20",
      versions: 3,
      turns: 10,
      storage: "account",
      status: "ready",
      params: YI.LAMP_V3_SWITCH
    },
    {
      id: "pen",
      name: "Hexagonal pen holder",
      updated: "Yesterday",
      versions: 1,
      turns: 3,
      storage: "browser",
      status: "ready",
      params: { ...YI.LAMP_V1, shadeColor: "#B5583A", neckColor: "#8A8379", baseColor: "#B5583A" },
      thumb: "pen"
    },
    {
      id: "stand",
      name: "Walnut headphone stand",
      updated: "3 Oct",
      versions: 0,
      turns: 1,
      storage: "browser",
      status: "failed",
      note: "No usable model — generation failed. Nothing to export."
    }
  ];

  YI.READINESS = {
    verified: [
      { label: "Opens as a valid GLB", detail: "File parsed; 1 mesh, 84.2k triangles." },
      { label: "Triangle budget", detail: "84.2k — within the 100k AR / web guideline." },
      { label: "UVs present", detail: "TEXCOORD_0 found." },
      { label: "Shading normals", detail: "NORMAL attribute found." }
    ],
    needsWork: [{ label: "Pivot and origin", detail: "Origin is 6 cm off the base centre.", fix: "Re-centre in Blender: Object › Set Origin › Origin to Geometry." }],
    unknown: [
      { label: "Real-world size", detail: "Height is an estimate (≈35 cm). The mesh has no measured dimensions." },
      { label: "Watertight solid", detail: "Not checked. Needed before 3D printing." },
      { label: "Wall thickness", detail: "Not checked." },
      { label: "Separate editable parts", detail: "The file is one fused mesh. Parts are selected geometrically in YIIYA, not stored as separate objects." },
      { label: "Likeness to your description", detail: "Not automatically verifiable — inspect it yourself." }
    ]
  };

  YI.RESTORED_TURNS = [
    { role: "user", text: "Make a compact desk lamp with a curved brass neck and a dark green shade." },
    { role: "assistant", kind: "note", text: "Made a compact desk lamp: curved brass neck, dark green shade, about 41 cm tall (estimated). Version 1." },
    { role: "user", text: "Make the shade matte." },
    { role: "assistant", kind: "action", action: "local", title: "Shade finish → matte", body: "Applied instantly. No generation used." },
    { role: "user", text: "Make this thinner, but keep the shade exactly the same.", selection: "Neck" },
    { role: "assistant", kind: "action", action: "generative", title: "New version 2 · thinner neck", body: "Regenerated the whole lamp. The shade changed slightly — kept version 1 for comparison." },
    { role: "user", text: "Undo that." },
    { role: "assistant", kind: "note", text: "Back to version 1 with the matte shade. Version 2 is still in Versions." },
    { role: "user", text: "Make it 35 centimetres tall." },
    { role: "assistant", kind: "action", action: "local", title: "Display height ≈ 35 cm (estimated)", body: "Scaled the mesh uniformly. This is an estimate, not a dimensioned CAD constraint." },
    { role: "user", text: "Make the base black.", selection: "Base" },
    { role: "assistant", kind: "action", action: "local", title: "Base colour → black", body: "Recoloured the selected region instantly." },
    { role: "user", text: "Make the neck glossier.", selection: "Neck" },
    { role: "assistant", kind: "action", action: "unsupported", title: "Part finish isn't available yet", body: "Selected parts can change colour only. Finish applies to the whole lamp — you chose to keep it as is." },
    { role: "user", text: "Can it be 3D printed?" },
    { role: "assistant", kind: "note", text: "Unknown yet: watertightness and wall thickness aren't checked, and the size is an estimate. I can show what's verified in Export." },
    { role: "user", text: "Add a small pull-chain switch under the shade." },
    { role: "assistant", kind: "action", action: "generative", title: "New version 3 · pull-chain switch", body: "Regenerated. Compared with version 1 before replacing it; you kept version 3." },
    { role: "user", text: "Export it for my portfolio render." },
    { role: "assistant", kind: "note", text: "Opened Export with the Render & portfolio destination." }
  ];
})();
