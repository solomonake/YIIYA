/* Static SVG renderer for the example desk lamp.
 * Used for version thumbnails, library cards, compare view and as the
 * WebGL-unavailable fallback (parts stay selectable with mouse and keyboard).
 * EXAMPLE CONTENT — an illustrative lamp, not a generated YIIYA asset. */
(function () {
  const YI = (window.YI = window.YI || {});

  const FINISH_SHEEN = { matte: 0.05, satin: 0.18, glossy: 0.38 };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  YI.haloFor = (hex) => (lum(hex) > 0.35 ? "#0B1426" : "#FFFFFF");

  /**
   * @param {object} p lamp params
   * @param {object} o { selected, interactive, title, idSuffix, hidden }
   */
  YI.lampSVG = function lampSVG(p, o = {}) {
    const id = "l" + (o.idSuffix || Math.random().toString(36).slice(2, 7));
    const sel = o.selected || null;
    const neckW = Math.max(3, p.neckRadius * 0.8);
    const flare = p.shadeFlare || 1;
    const sheen = FINISH_SHEEN[p.shadeFinish] ?? 0.18;
    const selColor = "var(--yi-selection)";
    const parts = {
      base: {
        label: "Base",
        color: p.baseColor,
        draw: (fill, stroke, extra = "") =>
          `<path d="M28 222 Q28 210 70 208 Q112 210 112 222 L112 226 Q70 232 28 226 Z" fill="${fill}" ${stroke} ${extra}/>`
      },
      stem: {
        label: "Stem",
        color: p.stemColor || p.neckColor,
        draw: (fill, stroke, extra = "") =>
          `<rect x="66" y="150" width="8" height="60" rx="3" fill="${fill}" ${stroke} ${extra}/>`
      },
      neck: {
        label: "Neck",
        color: p.neckColor,
        draw: (fill, stroke, extra = "", w = neckW) =>
          `<path d="M70 152 C70 92 96 52 140 56 C152 57 160 62 164 70" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`
      },
      shade: {
        label: "Shade",
        color: p.shadeColor,
        draw: (fill, stroke, extra = "") => {
          const half = 22 * flare;
          return `<path d="M152 66 L176 66 L${164 + half + 8} 116 Q164 122 ${164 - half - 8} 116 Z" transform="rotate(-8 164 90)" fill="${fill}" ${stroke} ${extra}/>`;
        }
      }
    };

    const interactiveAttrs = (key) =>
      o.interactive
        ? `data-part="${key}" role="button" tabindex="0" aria-pressed="${sel === key}" aria-label="${parts[key].label}${sel === key ? " (selected)" : ""}" class="svg-part"`
        : `data-part="${key}"`;

    let out = "";
    // Selection: coloured outline + luminance-adaptive halo, drawn under the part.
    if (sel && parts[sel]) {
      const halo = YI.haloFor(parts[sel].color);
      if (sel === "neck") {
        out += parts.neck.draw(selColor, "", "", neckW + 9);
        out += parts.neck.draw(halo, "", "", neckW + 3);
      } else {
        out += parts[sel].draw("none", `stroke="${selColor}" stroke-width="7" stroke-linejoin="round"`);
        out += parts[sel].draw("none", `stroke="${halo}" stroke-width="2" stroke-linejoin="round"`);
      }
    }
    for (const key of ["base", "stem", "neck", "shade"]) {
      if (o.hidden && o.hidden.includes(key)) continue;
      const part = parts[key];
      const fill = key === "neck" ? part.color : `url(#${id}-${key})`;
      out += `<g ${interactiveAttrs(key)}>${part.draw(fill, "")}</g>`;
    }
    if (p.pullChain) out += `<path d="M156 120 L153 150" stroke="#C9A23A" stroke-width="1.6"/><circle cx="153" cy="153" r="3.2" fill="#C9A23A"/>`;
    // Bulb glow (not selectable).
    out += `<ellipse cx="166" cy="114" rx="10" ry="5" fill="#FFE8B0" opacity="0.85"/>`;

    const grad = (key, c) =>
      `<linearGradient id="${id}-${key}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${shade(c, -0.08)}"/><stop offset="0.45" stop-color="${shade(c, sheen)}"/><stop offset="1" stop-color="${shade(c, -0.12)}"/></linearGradient>`;

    return `<svg viewBox="0 0 200 240" class="lamp-svg" ${o.title ? `role="img" aria-label="${o.title}"` : 'aria-hidden="true"'} focusable="false">
      <defs>${grad("base", p.baseColor)}${grad("stem", p.stemColor || p.neckColor)}${grad("shade", p.shadeColor)}</defs>
      <ellipse cx="72" cy="228" rx="52" ry="6" fill="#000" opacity="0.18"/>
      ${out}
    </svg>`;
  };
})();
