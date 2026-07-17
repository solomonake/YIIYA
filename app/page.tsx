"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  { text: "a ceramic coffee mug", preview: "Everyday object · clean geometry · matte glaze" },
  { text: "a leather armchair", preview: "Furniture · soft materials · stitching detail" },
  { text: "a vintage brass lamp", preview: "Metallic finish · warm patina · period detail" },
  { text: "a pair of running shoes", preview: "Product mockup · mesh fabric · rubber sole" },
  { text: "a glass perfume bottle", preview: "Transparent material · refraction · luxury feel" },
  { text: "a wooden acoustic guitar", preview: "Organic curves · wood grain · string detail" },
];

const FEATURES = [
  { label: "Voice input", desc: "Hold SPACE and describe what you want" },
  { label: "Photo to 3D", desc: "Drop a reference image, get a model" },
  { label: "Multi-format export", desc: "GLB, OBJ, USD, STL — ready for any pipeline" },
];

function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return;

    let animId: number;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const vsrc = `
      attribute vec3 aPos;
      attribute vec3 aNorm;
      uniform mat4 uMVP;
      uniform mat4 uModel;
      varying vec3 vNorm;
      varying vec3 vPos;
      void main(){
        vPos = (uModel * vec4(aPos, 1.0)).xyz;
        vNorm = mat3(uModel) * aNorm;
        gl_Position = uMVP * vec4(aPos, 1.0);
      }
    `;
    const fsrc = `
      precision mediump float;
      varying vec3 vNorm;
      varying vec3 vPos;
      uniform vec3 uColor;
      uniform vec3 uLightDir;
      void main(){
        vec3 n = normalize(vNorm);
        float diff = max(dot(n, normalize(uLightDir)), 0.0);
        vec3 viewDir = normalize(-vPos);
        vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
        float spec = pow(max(dot(n, halfDir), 0.0), 64.0);
        vec3 ambient = uColor * 0.15;
        vec3 col = ambient + uColor * diff * 0.7 + vec3(1.0) * spec * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compileShader(src: string, type: number) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(vsrc, gl.VERTEX_SHADER));
    gl.attachShader(prog, compileShader(fsrc, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Icosahedron geometry
    const t = (1 + Math.sqrt(5)) / 2;
    const rawVerts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const faces = [
      [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    for (const f of faces) {
      const v0 = rawVerts[f[0]], v1 = rawVerts[f[1]], v2 = rawVerts[f[2]];
      const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const n = [
        e1[1]*e2[2] - e1[2]*e2[1],
        e1[2]*e2[0] - e1[0]*e2[2],
        e1[0]*e2[1] - e1[1]*e2[0],
      ];
      const len = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
      n[0]/=len; n[1]/=len; n[2]/=len;
      for (const v of [v0, v1, v2]) {
        const vlen = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        positions.push(v[0]/vlen, v[1]/vlen, v[2]/vlen);
        normals.push(n[0], n[1], n[2]);
      }
    }

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    const aPosLoc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);

    const normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    const aNormLoc = gl.getAttribLocation(prog, "aNorm");
    gl.enableVertexAttribArray(aNormLoc);
    gl.vertexAttribPointer(aNormLoc, 3, gl.FLOAT, false, 0, 0);

    const uMVP = gl.getUniformLocation(prog, "uMVP");
    const uModel = gl.getUniformLocation(prog, "uModel");
    const uColor = gl.getUniformLocation(prog, "uColor");
    const uLightDir = gl.getUniformLocation(prog, "uLightDir");

    gl.uniform3f(uColor, 0.937, 0.624, 0.153); // #EF9F27
    gl.uniform3f(uLightDir, 1.0, 1.0, 1.0);

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    function mat4Perspective(fov: number, aspect: number, near: number, far: number) {
      const f = 1.0 / Math.tan(fov / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0
      ]);
    }

    function mat4RotateY(a: number) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]);
    }

    function mat4RotateX(a: number) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]);
    }

    function mat4Multiply(a: Float32Array, b: Float32Array) {
      const r = new Float32Array(16);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          for (let k = 0; k < 4; k++)
            r[i*4+j] += a[i*4+k] * b[k*4+j];
      return r;
    }

    function mat4Translate(x: number, y: number, z: number) {
      return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
    }

    const scale = 1.5;
    function render(time: number) {
      const t = time * 0.001;
      gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const proj = mat4Perspective(Math.PI / 6, aspect, 0.1, 100);

      const floatY = Math.sin(t * 1.5) * 0.15;
      const ry = mat4RotateY(t * 0.3);
      const rx = mat4RotateX(Math.sin(t * 0.2) * 0.15);
      const scaleM = new Float32Array([scale,0,0,0, 0,scale,0,0, 0,0,scale,0, 0,0,0,1]);
      const model = mat4Multiply(mat4Translate(0, floatY, 0), mat4Multiply(ry, mat4Multiply(rx, scaleM)));
      const view = mat4Translate(0, 0, -5);
      const mvp = mat4Multiply(proj, mat4Multiply(view, model));

      gl!.uniformMatrix4fv(uMVP, false, mvp);
      gl!.uniformMatrix4fv(uModel, false, model);
      gl!.drawArrays(gl!.TRIANGLES, 0, positions.length / 3);

      animId = requestAnimationFrame(render);
    }
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default function LandingPage() {
  const router = useRouter();

  function handleStart(prompt: string) {
    router.push(`/app?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] flex flex-col">
      {/* Header */}
      <header className="px-6 pt-8 sm:px-10 sm:pt-10">
        <span className="text-[11px] font-mono tracking-[0.4em] text-zinc-500 uppercase">
          YIIYA
        </span>
      </header>

      {/* Hero — split layout */}
      <section className="flex-1 flex flex-col lg:flex-row items-center px-6 sm:px-10 py-16 sm:py-24 gap-8 lg:gap-0">
        {/* Left: copy */}
        <div className="flex-1 max-w-2xl">
          <h1
            className="font-serif font-normal leading-[1.05] mb-4"
            style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)" }}
          >
            Say something.
            <br />
            Get a 3D asset.
          </h1>
          <p className="text-zinc-500 font-mono text-sm sm:text-base max-w-lg mb-12">
            Voice-first 3D generation. Describe anything — or drop a photo — and
            get a production-ready model in seconds.
          </p>

          {/* CTA */}
          <button
            type="button"
            onClick={() => router.push("/app")}
            className="self-start px-6 py-3 text-sm font-mono tracking-wide border border-[#EF9F27] text-[#EF9F27] hover:bg-[#EF9F27] hover:text-black transition-colors duration-200 mb-14"
          >
            Open Studio
          </button>

          {/* Example prompts */}
          <div className="mb-12">
            <p className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase mb-3">
              Try one
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  type="button"
                  onClick={() => handleStart(ex.text)}
                  className="text-[13px] font-mono px-3 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors duration-150"
                  title={ex.preview}
                >
                  {ex.text}
                </button>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10">
            {FEATURES.map((f) => (
              <div key={f.label}>
                <p className="text-[11px] font-mono text-[#EF9F27] tracking-wide mb-1">
                  {f.label}
                </p>
                <p className="text-[12px] font-mono text-zinc-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: 3D hero */}
        <div className="flex-1 w-full lg:w-auto h-[300px] sm:h-[400px] lg:h-[500px] cursor-grab active:cursor-grabbing">
          <HeroCanvas />
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 pb-8 sm:px-10 sm:pb-10 flex justify-between items-center">
        <span className="text-[10px] font-mono text-zinc-700">
          Built by{" "}
          <span className="text-zinc-500">SRL Studio</span>
        </span>
        <span className="text-[10px] font-mono text-zinc-700">
          Powered by YIIYA
        </span>
      </footer>
    </main>
  );
}
