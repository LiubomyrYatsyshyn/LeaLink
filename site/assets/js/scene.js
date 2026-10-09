/* LeaLink 3D (Three.js): two smiling characters on a floating island for the home hero, and floating
   study props as a light accent on other pages. Loaded lazily by lealink.js, only when WebGL works and the
   visitor has not asked for reduced motion. If anything fails, the page keeps its static illustration. */
import * as THREE from "../vendor/three/three.min.js";

/* ---------- helpers ---------- */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const outBack = (x) => { x = clamp01(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outBounce = (x) => {
  x = clamp01(x); const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
  return n * (x -= 2.625 / d) * x + .984375;
};
const params = new URLSearchParams(location.search);

const matCache = new Map();
function mat(color, o) {
  const key = color + JSON.stringify(o || {});
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .62, metalness: 0 }, o)));
  return matCache.get(key);
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const texCache = {};
function shadowTex() {
  return texCache.shadow || (texCache.shadow = canvasTex(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(120,70,20,.38)"); g.addColorStop(.6, "rgba(120,70,20,.14)"); g.addColorStop(1, "rgba(120,70,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }));
}
function glowTex(rgb) {
  const key = "glow" + rgb;
  return texCache[key] || (texCache[key] = canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(" + rgb + ",.85)"); g.addColorStop(.4, "rgba(" + rgb + ",.28)"); g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }));
}
function heartTex(color) {
  const key = "heart" + color;
  return texCache[key] || (texCache[key] = canvasTex(64, 64, (ctx) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(32, 56);
    ctx.bezierCurveTo(4, 36, 6, 10, 24, 10); ctx.bezierCurveTo(30, 10, 32, 15, 32, 18);
    ctx.bezierCurveTo(32, 15, 34, 10, 40, 10); ctx.bezierCurveTo(58, 10, 60, 36, 32, 56); ctx.fill();
  }));
}

/* ---------- characters ---------- */
function makePerson(c) {
  const root = new THREE.Group();
  const skin = mat(c.skin), hairM = mat(c.hair, { roughness: .8 }), shirt = mat(c.shirt), pants = mat(c.pants);
  const dark = mat(0x2b1f2e, { roughness: .35 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .42, 6, 12), pants); leg.position.set(s * .25, .58, 0);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(.27, 18, 12), mat(c.shoe)); shoe.scale.set(1, .55, 1.4); shoe.position.set(s * .25, .13, .1);
    root.add(leg, shoe);
  });

  const body = new THREE.Group(); body.position.y = 1.42; root.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.54, .46, 8, 18), shirt); torso.scale.set(1, 1, .82); body.add(torso);

  function arm(side) {
    const pivot = new THREE.Group(); pivot.position.set(side * .62, 1.9, 0);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .5, 6, 12), shirt); a.position.y = -.38;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), skin); hand.position.y = -.82;
    pivot.add(a, hand); root.add(pivot); return pivot;
  }
  const waveArm = arm(c.waveSide), holdArm = arm(-c.waveSide);
  holdArm.rotation.z = -.3 * (-c.waveSide);

  const head = new THREE.Group(); head.position.set(0, 2.88, 0); root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.8, 40, 28), skin); skull.scale.set(1.04, .98, .96); head.add(skull);
  [-1, 1].forEach((s) => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), skin); ear.position.set(s * .84, -.02, 0); ear.scale.set(.6, 1, .9); head.add(ear); });

  const eyes = [];
  [-1, 1].forEach((s) => {
    const g = new THREE.Group(); g.position.set(s * .29, .1, .71);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.098, 16, 12), dark); eye.scale.set(1, 1.28, .55);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), white); hl.position.set(.03, .055, .05);
    g.add(eye, hl); head.add(g); eyes.push(g);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .15, 4, 8), hairM); brow.rotation.z = Math.PI / 2 + s * .16; brow.position.set(s * .29, .32, .67); head.add(brow);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8f8f, transparent: true, opacity: .5 }));
    cheek.scale.set(1, .7, .3); cheek.position.set(s * .52, -.15, .58); head.add(cheek);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), mat(c.skinShade)); nose.position.set(0, -.02, .79); nose.scale.set(1, .8, .8); head.add(nose);

  const mouth = new THREE.Mesh(new THREE.CircleGeometry(.21, 28, Math.PI, Math.PI), mat(0x6b1f2e, { roughness: .5 })); mouth.position.set(0, -.14, .752); head.add(mouth);
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(.1, 20, Math.PI, Math.PI), mat(0xff7a8a, { roughness: .5 })); tongue.position.set(0, -.25, .754); head.add(tongue);
  const teeth = new THREE.Mesh(new THREE.PlaneGeometry(.32, .06), new THREE.MeshBasicMaterial({ color: 0xffffff })); teeth.position.set(0, -.172, .755); head.add(teeth);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(.87, 40, 24, 0, Math.PI * 2, 0, Math.PI * .55), hairM);
  cap.rotation.x = -.75; cap.position.set(0, .05, -.03); head.add(cap);
  if (c.hairStyle === "ponytail") {
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), hairM); knot.position.set(0, .55, -.8); head.add(knot);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(.13, .55, 6, 10), hairM); tail.position.set(0, .12, -.95); tail.rotation.x = .25; head.add(tail);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(.14, .04, 8, 16), mat(0xff8fb1)); tie.position.set(0, .5, -.82); tie.rotation.x = 1.1; head.add(tie);
  } else {
    [[0, .86, -.12], [-.42, .76, -.06], [.42, .76, -.06], [-.68, .5, -.12], [.68, .5, -.12], [-.74, .16, -.2], [.74, .16, -.2], [0, .66, -.55], [-.42, .55, -.5], [.42, .55, -.5], [0, .2, -.78]].forEach((p) => {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(.27, 14, 10), hairM); curl.position.set(p[0], p[1], p[2]); head.add(curl);
    });
  }
  if (c.glasses) {
    const gm = mat(0x2b2f6b, { roughness: .35 });
    [-1, 1].forEach((s) => { const r = new THREE.Mesh(new THREE.TorusGeometry(.2, .03, 8, 28), gm); r.position.set(s * .29, .1, .74); head.add(r); });
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .14, 8), gm); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, .13, .75); head.add(bridge);
  }

  if (c.backpack) {
    const bp = new THREE.Mesh(new THREE.RoundedBoxGeometry(.98, 1.18, .42, 4, .14), mat(0xffc83d)); bp.position.set(0, 1.5, -.55); root.add(bp);
    const pocket = new THREE.Mesh(new THREE.RoundedBoxGeometry(.62, .4, .14, 3, .06), mat(0xf2a900)); pocket.position.set(0, 1.18, -.8); root.add(pocket);
    [-1, 1].forEach((s) => { const st = new THREE.Mesh(new THREE.BoxGeometry(.13, .95, .06), mat(0xf2a900)); st.position.set(s * .3, 1.62, .44); st.rotation.z = s * -.05; root.add(st); });
  }
  if (c.lanyard) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(.07, .85, .04), mat(0xffc83d)); l.position.set(0, 1.78, .46); root.add(l);
    const badge = new THREE.Mesh(new THREE.RoundedBoxGeometry(.34, .44, .05, 3, .04), mat(0xffffff)); badge.position.set(0, 1.28, .47); root.add(badge);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(.07, 14), mat(0xe4491e)); dot.position.set(0, 1.35, .5); root.add(dot);
  }
  const hx = -c.waveSide * .36;
  if (c.hold === "book") {
    const bk = new THREE.Group(); bk.position.set(hx, 1.62, .8); bk.rotation.set(0, -c.waveSide * -.3, .08 * c.waveSide);
    bk.add(new THREE.Mesh(new THREE.RoundedBoxGeometry(.56, .72, .15, 3, .04), mat(0x2fcb9a)));
    const pg = new THREE.Mesh(new THREE.BoxGeometry(.5, .66, .12), mat(0xffffff)); pg.position.set(.03, 0, -.01); bk.add(pg);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(.32, .16), mat(0xffffff)); lab.position.set(0, .12, .078); bk.add(lab);
    root.add(bk);
  } else {
    const pc = new THREE.Group(); pc.position.set(hx, 1.7, .82); pc.rotation.z = -c.waveSide * -.28;
    pc.add(new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1.5, 12), mat(0xffc83d)));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.07, .2, 12), mat(0xf3d6a6)); tip.position.y = .85; pc.add(tip);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 8), mat(0x2b2f6b)); lead.position.y = .98; pc.add(lead);
    const er = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .16, 12), mat(0xff8fb1)); er.position.y = -.83; pc.add(er);
    root.add(pc);
  }

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.userData.shadow = shadow;

  return { root, head, body, eyes, waveArm, holdArm, shadow, cfg: c, jump: -1, blinkAt: 2 + Math.random() * 2, blink: 0, look: new THREE.Vector2() };
}

/* ---------- study props ---------- */
function starGeo() {
  const s = new THREE.Shape(); const R = .5, r = .23;
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R, x = Math.cos(a) * rad, y = Math.sin(a) * rad; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .14, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 }); g.center(); return g;
}
let STAR_GEO;
const PROPS = {
  atom() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 16), mat(0xffc83d)));
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.56, .04, 10, 52), mat(0x5b4be0, { roughness: .4 })); r.rotation.set(i * Math.PI / 3, i * Math.PI / 5, 0); g.add(r); }
    g.userData.spin = [.5, .8, 0]; return g;
  },
  bulb() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 18), mat(0xffd95a, { emissive: 0xffc83d, emissiveIntensity: .35, roughness: .35 })));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.2, .16, .26, 14), mat(0xb9bcd6)); neck.position.y = -.5; g.add(neck);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), mat(0x565a82)); tip.position.y = -.7; g.add(tip);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("255,200,61"), transparent: true, depthWrite: false })); glow.scale.set(2.4, 2.4, 1); glow.position.z = -.3; g.add(glow);
    g.userData.spin = [0, .4, 0]; return g;
  },
  note() {
    const g = new THREE.Group(); const m = mat(0xff8fb1, { roughness: .45 });
    [-.32, .32].forEach((x) => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), m); h.scale.set(1.15, .8, .7); h.position.set(x, -.4, 0); h.rotation.z = .3; g.add(h);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .95, 8), m); st.position.set(x + .18, .05, 0); g.add(st);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(.78, .15, .1), m); beam.position.set(.18, .5, 0); beam.rotation.z = -.08; g.add(beam);
    g.userData.spin = [0, .6, 0]; return g;
  },
  book() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.RoundedBoxGeometry(1.05, .16, .76, 3, .05), mat(0x5cb8ff)));
    const pages = new THREE.Mesh(new THREE.RoundedBoxGeometry(.96, .12, .68, 3, .03), mat(0xffffff)); pages.position.y = .13; g.add(pages);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(.08, .02, .36), mat(0xe4491e)); mark.position.set(.2, .21, .46); g.add(mark);
    g.rotation.set(.35, .4, .12); g.userData.spin = [0, .5, 0]; g.userData.tilt = true; return g;
  },
  pencil() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.1, 12), mat(0xffc83d)));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.09, .24, 12), mat(0xf3d6a6)); tip.position.y = .67; g.add(tip);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(.03, .08, 8), mat(0x2b2f6b)); lead.position.y = .83; g.add(lead);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .1, 12), mat(0xb9bcd6)); band.position.y = -.52; g.add(band);
    const er = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .16, 12), mat(0xff8fb1)); er.position.y = -.65; g.add(er);
    g.rotation.z = .7; g.userData.spin = [0, .7, 0]; g.userData.keepZ = .7; return g;
  },
  star(color) {
    const g = new THREE.Group(); STAR_GEO = STAR_GEO || starGeo();
    g.add(new THREE.Mesh(STAR_GEO, mat(color || 0xffc83d, { roughness: .4 }))); g.userData.spin = [0, 1.2, 0]; return g;
  }
};
const PROP_COLORS = { 0: 0xffc83d, 1: 0xff8fb1, 2: 0x2fcb9a, 3: 0x5cb8ff };

/* ---------- stage ---------- */
function createStage(host, o) {
  o = Object.assign({ fov: 28, D: 14, dpr: 2, fixed: false, interactive: false, guard: true }, o);
  const canvas = document.createElement("canvas");
  canvas.className = "gl-canvas" + (o.fixed ? " gl-fixed" : "");
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "default" }); } catch (e) { return null; }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov, 1, .5, 120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9b0, 1.55));
  const key = new THREE.DirectionalLight(0xfff1de, 2.3); key.position.set(4, 8, 9); scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe3ff, .8); fill.position.set(-6, 3, 6); scene.add(fill);
  host.insertBefore(canvas, host.firstChild);

  const stage = { host, canvas, renderer, scene, camera, o, view: { w: 1, h: 1, H: 1, W: 1, pxu: 1, D: o.D }, ptr: { x: 0, y: 0, ndcX: 0, ndcY: 0, px: -999, py: -999, active: false, down: false }, time: +params.get("gltime") || 0, visible: true, dead: false, ready: false };
  let dprCap = Math.min(window.devicePixelRatio || 1, o.dpr);

  stage.resize = function () {
    const r = o.fixed ? { width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(dprCap); renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const D = o.fitWidth ? Math.min(o.maxD || 34, Math.max(o.minD || 12, o.fitWidth / (2 * Math.tan(THREE.MathUtils.degToRad(o.fov / 2)) * camera.aspect))) : o.D;
    camera.updateProjectionMatrix();
    const H = 2 * D * Math.tan(THREE.MathUtils.degToRad(o.fov / 2));
    stage.view = { w, h, H, W: H * camera.aspect, pxu: H / h, D };
    stage.onResize && stage.onResize(stage.view);
  };

  let raf = 0, last = 0, acc = 0, n = 0, strikes = 0;
  const born = performance.now();
  function frame(now) {
    raf = 0;
    if (stage.dead || !stage.visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, .05); last = now; stage.time += dt;
    stage.update && stage.update(stage.time, dt);
    renderer.render(scene, camera);
    if (!stage.ready) { stage.ready = true; stage.onReady && stage.onReady(); }
    if (o.guard && now - born > 3000) {
      acc += dt; n++;
      if (n >= 90) {
        const avg = acc / n; acc = 0; n = 0;
        if (avg > .037) { if (dprCap > 1) { dprCap = 1; stage.resize(); } else if (++strikes >= 2) { stage.fail("slow"); return; } } else strikes = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  }
  stage.wake = function () { if (!raf && !stage.dead && stage.visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const ro = new ResizeObserver(() => stage.resize());
  ro.observe(o.fixed ? document.documentElement : host);
  const io = new IntersectionObserver((en) => { stage.visible = en[0].isIntersecting; stage.wake(); });
  if (!o.fixed) io.observe(host);
  const onVis = () => stage.wake();
  document.addEventListener("visibilitychange", onVis);

  const listenEl = o.fixed ? window : host;
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const r = o.fixed ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
    const p = stage.ptr; p.px = e.clientX - r.left; p.py = e.clientY - r.top;
    p.x = p.px / r.width - .5; p.y = p.py / r.height - .5; p.ndcX = p.x * 2; p.ndcY = -p.y * 2; p.active = true;
    stage.onMove && stage.onMove(e);
  };
  const onLeave = () => { stage.ptr.active = false; stage.ptr.px = stage.ptr.py = -999; };
  const onDown = (e) => { const r = host.getBoundingClientRect(); stage.ptr.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1; stage.ptr.ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1); stage.onDown && stage.onDown(e); };
  listenEl.addEventListener("pointermove", onMove); listenEl.addEventListener("pointerleave", onLeave);
  if (o.interactive) host.addEventListener("pointerdown", onDown);

  stage.dispose = function () {
    stage.dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    listenEl.removeEventListener("pointermove", onMove); listenEl.removeEventListener("pointerleave", onLeave);
    host.removeEventListener("pointerdown", onDown);
    renderer.dispose(); canvas.remove();
  };
  stage.fail = function (why) { stage.dispose(); o.onFail && o.onFail(why); };
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stage.fail("lost"); });
  stage.resize();
  stage.wake();
  return stage;
}

/* ---------- hero: two smiling people on a floating island ---------- */
function heroScene(host, onReady, onFail) {
  const stage = createStage(host, { fov: 28, fitWidth: 12.6, minD: 16, maxD: 40, interactive: true, guard: params.get("glguard") !== "0", onFail });
  if (!stage) { onFail && onFail("nocontext"); return null; }
  const { scene, camera } = stage;
  const world = new THREE.Group(); scene.add(world);

  const island = new THREE.Group(); world.add(island);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.7, .55, 72), mat(0xfff0d6, { roughness: .8 })); top.position.y = -.28; island.add(top);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.95, 3.95, .1, 72), mat(0x2fcb9a, { roughness: .7 })); rim.position.y = -.02; island.add(rim);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, .06, 72), mat(0x8fe3b8, { roughness: .8 })); grass.position.y = .02; island.add(grass);
  const under = new THREE.Mesh(new THREE.ConeGeometry(3.7, 2.8, 56), mat(0xf4bd82, { roughness: .85 })); under.rotation.x = Math.PI; under.position.y = -1.95; island.add(under);
  [[-2.7, .55, 1.0], [2.9, .45, .6], [-1.2, .4, 2.6]].forEach((p, i) => {
    const bush = new THREE.Group(); bush.position.set(p[0], 0, p[2]);
    [[0, 0, 0, .42], [.32, -.05, .1, .3], [-.3, -.08, .05, .28]].forEach((b) => { const s = new THREE.Mesh(new THREE.SphereGeometry(b[3], 16, 12), mat(i === 1 ? 0x2fcb9a : 0x57d49b)); s.position.set(b[0], b[3] * .6, b[2]); bush.add(s); });
    island.add(bush);
  });

  const learner = makePerson({ skin: 0xf3cba5, skinShade: 0xe0aa80, hair: 0x6b3a1e, shirt: 0xff6b4a, pants: 0x3e6fd9, shoe: 0xffffff, hairStyle: "ponytail", glasses: false, backpack: true, lanyard: false, hold: "book", waveSide: -1 });
  const teacher = makePerson({ skin: 0xc98b5e, skinShade: 0xb4744a, hair: 0x2a1a12, shirt: 0x5b4be0, pants: 0x2b2f6b, shoe: 0xffd9a8, hairStyle: "curly", glasses: true, backpack: false, lanyard: true, hold: "pencil", waveSide: 1 });
  learner.root.position.set(-1.55, 0, .25); learner.root.rotation.y = .38; learner.delay = .25;
  teacher.root.position.set(1.7, 0, 0); teacher.root.rotation.y = -.38; teacher.delay = .55;
  const people = [learner, teacher];
  people.forEach((p) => {
    island.add(p.root);
    p.shadow.position.set(p.root.position.x, .06, p.root.position.z); island.add(p.shadow);
    p.root.traverse((m) => { m.userData.person = p; });
  });

  const props = [];
  function addProp(kind, x, y, z, scale, color) {
    const g = PROPS[kind](color); g.position.set(x, y, z); g.scale.setScalar(scale); world.add(g);
    props.push({ g, baseY: y, phase: Math.random() * 6, delay: .9 + props.length * .12, scale });
  }
  addProp("atom", -4.3, 5.0, -.6, 1.15);
  addProp("bulb", 3.9, 5.5, -.3, 1.05);
  addProp("note", 4.9, 2.4, .8, 1.0);
  addProp("book", -4.9, 2.3, 1.0, 1.1);
  addProp("pencil", .2, 6.4, -.8, 1.0);
  [[-2.6, 6.2, -1.2, .42, 1], [2.4, 4.3, -1.4, .34, 0], [-5.2, 4.2, -1.0, .3, 3], [5.5, 4.4, -1.0, .36, 2], [-3.2, 3.6, 2.2, .3, 0]].forEach((s) => addProp("star", s[0], s[1], s[2], s[3], PROP_COLORS[s[4]]));

  const clouds = new THREE.Group(); world.add(clouds);
  [[-5.8, 6.9, -4, 1.5], [5.6, 7.6, -5, 1.2], [6.3, .6, -4, 1.0]].forEach((c) => {
    const g = new THREE.Group(); g.position.set(c[0], c[1], c[2]);
    [[0, 0, .8], [.9, -.1, .6], [-.9, -.12, .55], [.4, .35, .5]].forEach((b) => { const s = new THREE.Mesh(new THREE.SphereGeometry(b[2] * c[3] * .6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 })); s.position.set(b[0] * c[3], b[1] * c[3], 0); g.add(s); });
    g.userData.base = c[0]; clouds.add(g);
  });

  const hearts = []; const heartMat = new THREE.SpriteMaterial({ map: heartTex("#ff6b8b"), transparent: true, depthWrite: false });
  for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(heartMat.clone()); s.visible = false; s.userData = { life: 0 }; world.add(s); hearts.push(s); }
  let heartIdx = 0;
  function burst(p) {
    for (let i = 0; i < 6; i++) {
      const s = hearts[heartIdx++ % hearts.length]; s.visible = true;
      s.position.set(p.root.position.x + (Math.random() - .5) * 1.2, 3.6 + Math.random() * .6, p.root.position.z + .6);
      s.userData = { life: 0, vx: (Math.random() - .5) * 1.4, vy: 1.6 + Math.random() * 1.2, size: .36 + Math.random() * .3 };
    }
  }

  const ray = new THREE.Raycaster();
  function pick() {
    ray.setFromCamera(new THREE.Vector2(stage.ptr.ndcX, stage.ptr.ndcY), camera);
    const hit = ray.intersectObjects(people.map((p) => p.root), true)[0];
    return hit && hit.object.userData.person;
  }
  stage.onMove = () => { host.style.cursor = pick() ? "pointer" : ""; };
  stage.onDown = () => { const p = pick(); if (p && p.jump < 0) { p.jump = 0; burst(p); } };

  const cam = { x: 0, y: 0 }; let intro = 0;
  stage.onResize = (v) => { camera.position.set(0, 4.6, v.D); camera.lookAt(0, 2.5, 0); };
  stage.onReady = onReady;
  stage.update = function (t, dt) {
    const p = stage.ptr;
    const tx = p.active ? p.x * 2 : Math.sin(t * .35) * .35, ty = p.active ? p.y * 2 : Math.cos(t * .27) * .25;
    cam.x = damp(cam.x, tx, 3, dt); cam.y = damp(cam.y, ty, 3, dt);
    world.rotation.y = cam.x * .3; world.rotation.x = cam.y * .05;
    island.position.y = Math.sin(t * .9) * .14;

    people.forEach((q, i) => {
      const k = clamp01((t - q.delay) / 1.1), drop = (1 - outBounce(k)) * 7;
      let j = 0;
      if (q.jump >= 0) { q.jump += dt / .75; if (q.jump >= 1) q.jump = -1; else j = Math.sin(Math.PI * q.jump) * 1.0; }
      q.root.visible = k > 0;
      q.root.position.y = drop + j;
      q.shadow.visible = k > 0; q.shadow.scale.setScalar(lerp(.7, 1, k) * (1 - j * .12));
      const br = Math.sin(t * 2.2 + i) * .014; q.body.scale.set(1 - br, 1 + br, 1 - br);
      const lookX = p.active ? p.x * 1.1 : Math.sin(t * .6 + i * 2) * .25, lookY = p.active ? p.y * .7 : Math.sin(t * .5 + i) * .08;
      q.look.x = damp(q.look.x, lookX, 6, dt); q.look.y = damp(q.look.y, lookY, 6, dt);
      q.head.rotation.y = q.look.x * .7 + (i ? .16 : -.16); q.head.rotation.x = q.look.y * .6; q.head.rotation.z = Math.sin(t * 1.3 + i) * .035;
      q.blinkAt -= dt; if (q.blinkAt < 0) { q.blink = .14; q.blinkAt = 2.5 + Math.random() * 3; }
      q.blink = Math.max(0, q.blink - dt); const ey = q.blink > 0 ? .12 : 1; q.eyes.forEach((e) => (e.scale.y = damp(e.scale.y, ey, 40, dt)));
      const side = q.cfg.waveSide, wv = q.jump >= 0 ? 2.9 : 2.5 + Math.sin(t * 6.2 + i * 1.7) * .28;
      q.waveArm.rotation.z = side * wv;
      q.holdArm.rotation.x = -1.0 + Math.sin(t * 2 + i) * .03;
    });

    const pk = clamp01((t - .9) / 1);
    props.forEach((o) => {
      const k = outBack((t - o.delay) / .8);
      o.g.visible = k > .001; o.g.scale.setScalar(Math.max(.001, k) * o.scale);
      o.g.position.y = o.baseY + Math.sin(t * 1.1 + o.phase) * .2;
      const sp = o.g.userData.spin;
      if (sp) { if (o.g.userData.tilt) o.g.rotation.y = .4 + Math.sin(t * .8 + o.phase) * .4; else if (o.g.userData.keepZ) o.g.rotation.y += sp[1] * dt; else { o.g.rotation.x += sp[0] * dt; o.g.rotation.y += sp[1] * dt; } }
    });
    clouds.children.forEach((c, i) => { c.position.x = c.userData.base + Math.sin(t * .15 + i * 2) * .5; });
    hearts.forEach((s) => {
      if (!s.visible) return; const u = s.userData; u.life += dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; const f = clamp01(u.life / 1.4);
      s.scale.setScalar(u.size * (.6 + Math.min(1, u.life * 4) * .4)); s.material.opacity = 1 - f * f;
      if (f >= 1) s.visible = false;
    });
    intro = Math.min(1, intro + dt);
  };
  return stage;
}

/* ---------- accent: floating props behind content on other pages ---------- */
function accentScene(host, kind, onFail) {
  const fixed = kind === "field";
  const stage = createStage(host, { fov: 28, D: 14, dpr: 1.5, fixed, guard: params.get("glguard") !== "0", onFail });
  if (!stage) { onFail && onFail("nocontext"); return null; }
  const layouts = {
    field: [["atom", .1, .22, 40, 96], ["book", .17, .72, 20, 110], ["star", .06, .55, 10, 40, 0xffc83d], ["bulb", .9, .2, 30, 90], ["note", .86, .66, 20, 90], ["pencil", .94, .46, 10, 90], ["star", .8, .85, 10, 38, 0xff8fb1], ["star", .24, .12, 0, 34, 0x2fcb9a]],
    band: [["book", .62, .5, 20, 64], ["star", .72, .3, 10, 28, 0xffc83d], ["atom", .8, .55, 30, 64], ["star", .9, .65, 10, 26, 0xff8fb1], ["bulb", .95, .35, 20, 56]]
  }[kind];
  const items = layouts.map((d, i) => { const g = PROPS[d[0]](d[5]); stage.scene.add(g); return { g, d, phase: i * 1.7, delay: .2 + i * .12 }; });
  stage.onResize = (v) => {
    stage.camera.position.set(0, 0, v.D); stage.camera.lookAt(0, 0, 0);
    items.forEach((it) => { const d = it.d, zw = d[3] * v.pxu, k = (v.D - zw) / v.D; it.x = (d[1] - .5) * v.W * k; it.y = -(d[2] - .5) * v.H * k; it.z = zw; it.s = d[4] * v.pxu * k; });
  };
  stage.onResize(stage.view);
  const cam = { x: 0, y: 0 };
  stage.update = function (t, dt) {
    const p = stage.ptr;
    cam.x = damp(cam.x, p.active ? p.x * 2 : Math.sin(t * .3) * .4, 3, dt); cam.y = damp(cam.y, p.active ? p.y * 2 : Math.cos(t * .25) * .3, 3, dt);
    const v = stage.view, sx = cam.x * v.W * .06, sy = -cam.y * v.H * .06;
    stage.camera.position.set(sx, sy, v.D); stage.camera.lookAt(sx, sy, 0);
    items.forEach((it) => {
      const k = outBack((t - it.delay) / .8), g = it.g;
      g.visible = k > .001; g.scale.setScalar(Math.max(.001, k) * it.s);
      g.position.set(it.x, it.y + Math.sin(t * 1.1 + it.phase) * .16 * v.H * .1, it.z);
      const sp = g.userData.spin;
      if (sp) { if (g.userData.tilt) g.rotation.y = .4 + Math.sin(t * .8 + it.phase) * .4; else if (g.userData.keepZ) g.rotation.y += sp[1] * dt; else { g.rotation.x += sp[0] * dt; g.rotation.y += sp[1] * dt; } }
    });
  };
  return stage;
}

/* ---------- entry ---------- */
export function start() {
  const hero = document.querySelector("[data-scene='hero']");
  if (hero) {
    const section = hero.closest(".hero") || hero;
    heroScene(hero, () => section.classList.add("gl-on"), () => section.classList.remove("gl-on"));
  }
  const field = document.querySelector("body[data-scene='field']");
  if (field && innerWidth >= 900) accentScene(document.body, "field");
  const band = document.querySelector(".band[data-scene='band']");
  if (band && innerWidth >= 900) accentScene(band, "band");
}
