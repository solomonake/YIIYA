/* three.js canvas for the example desk lamp (ES module).
 * Renders on demand (no continuous loop), so a hidden tab costs nothing.
 * Parts are named meshes; selection draws a coloured outline plus a
 * luminance-adaptive halo via inverted hulls. If WebGL or the module fails,
 * the app falls back to the SVG renderer (see app.js -> canvas fallback). */
import * as THREE from "./vendor/three.module.min.js";

const YI = (window.YI = window.YI || {});

const FINISH = {
  matte: { roughness: 0.92, metalness: 0 },
  satin: { roughness: 0.5, metalness: 0 },
  glossy: { roughness: 0.14, metalness: 0.05 }
};

function hullMaterial(color, thickness) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, t: { value: thickness } },
    vertexShader:
      "uniform float t; void main(){ vec3 p = position + normal * t; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
    fragmentShader: "uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }",
    side: THREE.BackSide
  });
}

function relLum(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

class LampCanvas {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.params = null;
    this.selected = null;
    this.yaw = -0.55;
    this.pitch = 0.18;
    this.distance = 1.15;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "three-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x302a24, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.2, 1.6, 1.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 0.9);
    rim.position.set(-1.4, 0.8, -1.2);
    this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.0005;
    this.scene.add(ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.raycaster = new THREE.Raycaster();

    this._bindPointer();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(host);
    this.resize();
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
      if (down.moved) {
        this.yaw = down.yaw + dx * 0.008;
        this.pitch = Math.max(-0.2, Math.min(1.1, down.pitch + dy * 0.006));
        this.render();
      }
    });
    el.addEventListener("pointerup", (e) => {
      if (down && !down.moved) this._pick(e);
      down = null;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false }
    );
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables || [], false);
    const part = hits.length ? hits[0].object.userData.part : null;
    this.opts.onSelect && this.opts.onSelect(part);
  }

  setParams(p) {
    this.params = { ...p };
    this._build();
    this.render();
  }

  select(part) {
    this.selected = part;
    this._applySelection();
    this.render();
  }

  _build() {
    const p = this.params;
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.meshes = {};
    this.pickables = [];
    const finish = FINISH[p.shadeFinish] || FINISH.satin;
    const brass = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.88, roughness: p.neckFinish === "glossy" ? 0.18 : 0.36 });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.078, 0.022, 64),
      new THREE.MeshStandardMaterial({ color: p.baseColor, roughness: 0.55, metalness: 0.2 })
    );
    base.position.y = 0.011;
    this._add("base", base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.12, 24), brass(p.stemColor || p.neckColor));
    stem.position.y = 0.08;
    this._add("stem", stem);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.138, 0),
      new THREE.Vector3(0, 0.25, 0),
      new THREE.Vector3(0.035, 0.345, 0),
      new THREE.Vector3(0.12, 0.385, 0),
      new THREE.Vector3(0.185, 0.355, 0)
    ]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, p.neckRadius / 1000, 16, false), brass(p.neckColor));
    this._add("neck", neck);

    const f = p.shadeFlare || 1;
    const profile = [
      new THREE.Vector2(0.012, 0.0),
      new THREE.Vector2(0.024, -0.004),
      new THREE.Vector2(0.03, -0.012),
      new THREE.Vector2(0.066 * f, -0.085 * (p.shadeDepth || 1)),
      new THREE.Vector2(0.069 * f, -0.09 * (p.shadeDepth || 1))
    ];
    const shade = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 64),
      new THREE.MeshStandardMaterial({ color: p.shadeColor, side: THREE.DoubleSide, ...finish })
    );
    shade.position.set(0.19, 0.352, 0);
    shade.rotation.z = -0.42;
    this._add("shade", shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd88a, emissiveIntensity: 1.2 })
    );
    bulb.position.set(0.205, 0.315, 0);
    this.root.add(bulb);

    if (p.pullChain) {
      const chainMat = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.9, roughness: 0.3 });
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.07, 8), chainMat);
      chain.position.set(0.17, 0.27, 0.02);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), chainMat);
      bead.position.set(0.17, 0.233, 0.02);
      this.root.add(chain, bead);
    }

    const s = (p.heightCm || 41) / 41;
    this.root.scale.setScalar(s);
    this.root.position.set(-0.07 * s, 0, 0);
    this._applySelection();
  }

  _add(part, mesh) {
    mesh.userData.part = part;
    this.meshes[part] = mesh;
    this.pickables.push(mesh);
    const outline = new THREE.Mesh(mesh.geometry, hullMaterial(getComputedStyle(document.documentElement).getPropertyValue("--yi-selection").trim() || "#4C9AFF", 0.0062));
    const halo = new THREE.Mesh(mesh.geometry, hullMaterial("#ffffff", 0.0022));
    outline.visible = halo.visible = false;
    outline.raycast = halo.raycast = () => {};
    mesh.add(outline);
    mesh.add(halo);
    mesh.userData.outline = outline;
    mesh.userData.halo = halo;
    this.root.add(mesh);
  }

  _applySelection() {
    if (!this.meshes) return;
    const selColor = getComputedStyle(document.documentElement).getPropertyValue("--yi-selection").trim() || "#4C9AFF";
    for (const [part, mesh] of Object.entries(this.meshes)) {
      const on = part === this.selected;
      mesh.userData.outline.visible = on;
      mesh.userData.halo.visible = on;
      if (on) {
        mesh.userData.outline.material.uniforms.c.value.set(selColor);
        const matColor = "#" + mesh.material.color.getHexString();
        mesh.userData.halo.material.uniforms.c.value.set(relLum(matColor) > 0.35 ? "#0B1426" : "#FFFFFF");
      }
    }
  }

  rotate(dir) { this.yaw += dir * 0.35; this.render(); }
  tilt(dir) { this.pitch = Math.max(-0.2, Math.min(1.1, this.pitch + dir * 0.15)); this.render(); }
  zoom(dir) { this.distance = Math.max(0.55, Math.min(2.2, this.distance * (dir > 0 ? 1.12 : 0.89))); this.render(); }
  reset() { this.yaw = -0.55; this.pitch = 0.18; this.distance = 1.15; this.render(); }
  refreshTheme() { this._applySelection(); this.render(); }

  resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the object comfortably framed on tall phone canvases.
    this.camera.fov = w / h < 0.8 ? 46 : 35;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (!this.params) return;
    const s = this.root.scale.x;
    const target = new THREE.Vector3(0, 0.19 * s, 0);
    const d = this.distance * Math.max(0.8, s);
    this.camera.position.set(
      target.x + d * Math.cos(this.pitch) * Math.sin(this.yaw),
      target.y + d * Math.sin(this.pitch),
      target.z + d * Math.cos(this.pitch) * Math.cos(this.yaw)
    );
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

YI.Canvas3D = {
  available: webglAvailable(),
  create: (host, opts) => new LampCanvas(host, opts)
};
window.dispatchEvent(new Event("yi-canvas3d-ready"));
