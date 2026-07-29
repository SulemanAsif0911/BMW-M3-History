/* ============================================================
   THE M3 LINEAGE — scroll-driven 3D archive
   Three.js renders a single fixed WebGL stage behind the page;
   GSAP ScrollTrigger drives the camera and a per-part "magnet"
   assembly animation as the visitor scrolls through each car.

   Chapter-to-chapter changes are a single cross-fade "conveyor":
   the incoming car slides in from one side of the screen while
   fading in, and the outgoing car slides out to the opposite
   side while fading out, with the camera gliding smoothly to the
   next chapter's framing at the same time. Direction flips with
   scroll direction, so it reads correctly forwards and backwards.
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

/* ---------------------------------------------------------
   Renderer / Scene / Camera
--------------------------------------------------------- */
const canvas = document.getElementById('stage-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x0a0b0d, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 2.6, 8.5);
camera.lookAt(0, 0.9, 0);

/* Lighting — a simple three-point studio rig. No shadows: keeps the
   frame rate high regardless of how dense a given model's mesh is. */
scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x0a0a0d, 1.15));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(5, 8, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6fa8ff, 1.2);
rimLight.position.set(-6, 3, -6);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xfff2e6, 0.5);
fillLight.position.set(-4, 2, 6);
scene.add(fillLight);

/* Quiet ground disc so cars have something to sit on. */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(10, 48),
  new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.4, metalness: 0.12 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  resize();
  clearTimeout(window.__rsz);
  window.__rsz = setTimeout(() => ScrollTrigger.refresh(), 200);
});
resize();

/* ---------------------------------------------------------
   Loaders
--------------------------------------------------------- */
const manager = new THREE.LoadingManager();
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
const loadErrorEl = document.getElementById('load-error');
const retryBtn = document.getElementById('retry-load');

manager.onProgress = (_url, loaded, total) => {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  loaderFill.style.width = pct + '%';
  loaderPct.textContent = pct + '%';
};

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader(manager);
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => reject(new Error('Failed to load ' + url + ': ' + (err && err.message ? err.message : err)))
    );
  });
}

/* ---------------------------------------------------------
   Model manifest
--------------------------------------------------------- */
const CHAPTER_ORDER = ['origin', 'racer', 'tuned', 'modern'];

const MODELS = {
  origin: { url: 'm3-e30.glb', size: 4.2, label: 'ORIGIN — 1986' },
  racer: { url: 'm3-gtr-e46-2001.glb', size: 4.35, label: 'RACER — 2001' },
  tuned: { url: 'm3-gtr-e46-schnitzer.glb', size: 4.45, label: 'TUNED — SCHNITZER' },
  modern: { url: 'm3-g81-touring.glb', size: 4.6, label: 'MODERN — 2022' },
};

const LOGO_URL = 'm-logo.glb';

/* Camera "drone" arc per chapter — angle in radians (measured around Y),
   radius and height in world units. Every chapter sweeps the camera in
   an arc around the car, descending slightly, so the whole vehicle is
   read front-to-back like a low pass from a drone. */
const CAMERA_ARCS = {
  origin: { fromA: -2.05, toA: -0.35, fromR: 7.6, toR: 4.3, fromH: 3.6, toH: 1.15, lookY: 0.55 },
  racer: { fromA: 2.05, toA: 0.35, fromR: 7.8, toR: 4.5, fromH: 3.4, toH: 1.05, lookY: 0.55 },
  tuned: { fromA: -1.95, toA: -0.25, fromR: 7.6, toR: 4.5, fromH: 3.3, toH: 1.0, lookY: 0.55 },
  modern: { fromA: 1.95, toA: 0.25, fromR: 8.0, toR: 4.8, fromH: 3.5, toH: 1.15, lookY: 0.6 },
};

/* ---------------------------------------------------------
   Chapter-switch transition tuning
--------------------------------------------------------- */
const SIDE_DISTANCE = 7.5;       // how far off-screen a car slides, world units
const TRANSITION_DUR = 1.75;     // seconds — long + eased for an "extra smooth" feel
const TRANSITION_EASE = 'power4.inOut';
const SWOOSH_ROTATION = 0.14;    // subtle extra rotation while sliding, radians

const state = {
  logoRoot: null,
  chapters: {}, // key -> { root, parts, ready:true }
  activeChapter: null,
};

/* ---------------------------------------------------------
   Geometry helpers
--------------------------------------------------------- */

// Centers an object at the origin on X/Z and rests it on the ground (y=0),
// scaled so its longest dimension equals `targetSize`.
function normalizeAndGround(object, targetSize) {
  let box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
  return object;
}

// Adaptively partitions the model's node graph into at most `maxParts`
// groups. Widely-exported car GLBs are already split into meaningful
// chunks (body, doors, wheels, glass, interior...); this walks the tree
// breadth-first and stops descending once the running total would
// exceed the cap, so dense models degrade gracefully instead of
// animating hundreds of individual meshes.
function collectPartNodes(root, maxParts = 34) {
  let level = [...root.children];
  if (level.length === 0) return [];
  let safety = 0;
  while (safety++ < 8) {
    let next = [];
    for (const node of level) {
      const childCount = node.children ? node.children.length : 0;
      if (childCount > 0 && next.length + childCount <= maxParts) {
        next.push(...node.children);
      } else {
        next.push(node);
      }
    }
    if (next.length === level.length || next.length >= maxParts) {
      level = next;
      break;
    }
    level = next;
  }
  return level;
}

// Builds the "magnet" explode data for a chapter's car: every part gets
// a scattered starting transform (flung outward + tumbled) and tweens
// back to its true, modeled position as the visitor scrolls.
function buildExplodeParts(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.y, size.z) * 1.15 + 1.2;

  const nodes = collectPartNodes(root);
  const parts = [];

  nodes.forEach((node) => {
    if (!node.isObject3D) return;

    const toPos = node.position.clone();
    const toQuat = node.quaternion.clone();

    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.4 - 0.2,
      Math.random() * 2 - 1
    ).normalize();
    const dist = spread * (1.6 + Math.random() * 2.0);
    const fromPos = toPos.clone().addScaledVector(dir, dist);

    const fromQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (Math.random() - 0.5) * 3.2,
        (Math.random() - 0.5) * 3.2,
        (Math.random() - 0.5) * 3.2
      )
    );

    node.position.copy(fromPos);
    node.quaternion.copy(fromQuat);

    parts.push({ node, fromPos, toPos, fromQuat, toQuat, proxy: { t: 0 } });
  });

  return parts;
}

/* ---------------------------------------------------------
   Whole-car opacity helpers (for the cross-fade transition)
--------------------------------------------------------- */
function ensureOpacityCache(root) {
  if (root.userData.__opacityCached) return;
  root.traverse((n) => {
    if (n.isMesh && n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => {
        if (m.userData.__baseOpacity === undefined) {
          m.userData.__baseOpacity = m.opacity;
          m.userData.__baseTransparent = !!m.transparent;
          m.userData.__baseDepthWrite = m.depthWrite;
        }
      });
    }
  });
  root.userData.__opacityCached = true;
}

// Scales every material's opacity by `t` (0 = invisible, 1 = original).
// While fading, materials are forced transparent with depth-write off so
// the incoming and outgoing cars blend cleanly instead of fighting the
// depth buffer; both are restored once a car settles fully in or out.
function setRootOpacity(root, t) {
  ensureOpacityCache(root);
  const fading = t < 0.999;
  root.traverse((n) => {
    if (n.isMesh && n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => {
        m.opacity = m.userData.__baseOpacity * Math.max(t, 0);
        m.transparent = fading ? true : m.userData.__baseTransparent;
        m.depthWrite = fading ? false : m.userData.__baseDepthWrite;
      });
    }
  });
}

/* ---------------------------------------------------------
   Chapter setup
--------------------------------------------------------- */
function setupChapter(key, gltf) {
  const cfg = MODELS[key];
  const root = gltf.scene;
  normalizeAndGround(root, cfg.size);
  scene.add(root);

  const parts = buildExplodeParts(root);
  state.chapters[key] = { root, parts, ready: true };
  buildChapterScrub(key);

  if (state.activeChapter === key) {
    // The visitor is already on this chapter and the model only just
    // finished loading in the background — reveal it directly at rest
    // rather than replaying the slide-in.
    root.visible = true;
    root.position.x = 0;
    setRootOpacity(root, 1);
  } else {
    root.visible = false;
    setRootOpacity(root, 0);
  }
}

function buildChapterScrub(key) {
  const sectionEl = document.getElementById('chapter-' + key);
  const chapter = state.chapters[key];
  if (!sectionEl || !chapter) return;

  const arc = CAMERA_ARCS[key];
  const camProxy = { a: arc.fromA, r: arc.fromR, h: arc.fromH };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: sectionEl,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });

  tl.to(
    camProxy,
    {
      a: arc.toA,
      r: arc.toR,
      h: arc.toH,
      duration: 3,
      ease: 'none',
      onUpdate: () => {
        if (state.activeChapter !== key) return;
        camera.position.set(
          Math.sin(camProxy.a) * camProxy.r,
          camProxy.h,
          Math.cos(camProxy.a) * camProxy.r
        );
        camera.lookAt(0, arc.lookY, 0);
      },
    },
    0
  );

  chapter.parts.forEach((p, i) => {
    tl.to(
      p.proxy,
      {
        t: 1,
        duration: 1.15,
        ease: 'back.out(1.5)',
        onUpdate: () => {
          p.node.position.lerpVectors(p.fromPos, p.toPos, p.proxy.t);
          p.node.quaternion.slerpQuaternions(p.fromQuat, p.toQuat, p.proxy.t);
        },
      },
      Math.min(i * 0.022, 1.7)
    );
  });

  chapter.timeline = tl;
}

/* ---------------------------------------------------------
   Chapter transition — side slide + cross-fade
   The incoming object slides in from one side while fading in;
   the outgoing object slides out to the opposite side while
   fading out, at the same time, with a matching easing curve so
   the whole cut reads as one continuous, smooth motion.
--------------------------------------------------------- */
function animateSlideOut(root, dir) {
  if (!root) return;
  gsap.killTweensOf(root.position);
  gsap.killTweensOf(root.rotation);
  root.position.x = root.position.x || 0;
  gsap.to(root.position, {
    x: -dir * SIDE_DISTANCE,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
  });
  gsap.to(root.rotation, {
    y: root.rotation.y - dir * SWOOSH_ROTATION,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
  });
  const proxy = { t: 1 };
  gsap.to(proxy, {
    t: 0,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
    onUpdate: () => setRootOpacity(root, proxy.t),
    onComplete: () => {
      root.visible = false;
      root.position.x = 0;
      root.rotation.y = 0;
    },
  });
}

function animateSlideIn(root, dir) {
  if (!root) return;
  gsap.killTweensOf(root.position);
  gsap.killTweensOf(root.rotation);
  root.visible = true;
  root.position.x = dir * SIDE_DISTANCE;
  root.rotation.y = dir * SWOOSH_ROTATION;
  setRootOpacity(root, 0);
  gsap.to(root.position, {
    x: 0,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
  });
  gsap.to(root.rotation, {
    y: 0,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
  });
  const proxy = { t: 0 };
  gsap.to(proxy, {
    t: 1,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
    onUpdate: () => setRootOpacity(root, proxy.t),
  });
}

// Reads the camera's current position back into the (angle, radius,
// height) terms the per-chapter arcs are defined in, so a transition
// can glide smoothly from wherever the camera actually is right now.
function currentCameraSpherical() {
  const p = camera.position;
  return {
    a: Math.atan2(p.x, p.z),
    r: Math.sqrt(p.x * p.x + p.z * p.z) || 0.001,
    h: p.y,
  };
}

function glideCameraTo(arc) {
  if (!arc) return;
  gsap.killTweensOf('__cameraGlide');
  const camProxy = currentCameraSpherical();
  gsap.to(camProxy, {
    a: arc.fromA,
    r: arc.fromR,
    h: arc.fromH,
    duration: TRANSITION_DUR,
    ease: TRANSITION_EASE,
    id: '__cameraGlide',
    onUpdate: () => {
      camera.position.set(
        Math.sin(camProxy.a) * camProxy.r,
        camProxy.h,
        Math.cos(camProxy.a) * camProxy.r
      );
      camera.lookAt(0, arc.lookY, 0);
    },
  });
}

function activateChapter(key) {
  if (state.activeChapter === key) return;
  const prevKey = state.activeChapter;
  const prevIndex = CHAPTER_ORDER.indexOf(prevKey);
  const nextIndex = CHAPTER_ORDER.indexOf(key);
  // dir = +1 reads as "moving forward": the incoming car enters from the
  // right and the outgoing car exits to the left. Scrolling back up
  // flips it, so the motion always matches scroll direction.
  const dir = prevIndex === -1 || nextIndex > prevIndex ? 1 : -1;

  state.activeChapter = key;

  if (prevKey === 'hero' && state.logoRoot) {
    animateSlideOut(state.logoRoot, dir);
  } else if (prevKey && state.chapters[prevKey]) {
    animateSlideOut(state.chapters[prevKey].root, dir);
  }

  const next = state.chapters[key];
  if (next) animateSlideIn(next.root, dir);

  glideCameraTo(CAMERA_ARCS[key]);
  updateRail(key);
}

// Mirror transition back to the hero logo (scrolling back up past the
// first chapter).
function returnToHero() {
  if (state.activeChapter === 'hero') return;
  const prevKey = state.activeChapter;
  state.activeChapter = 'hero';

  if (prevKey && state.chapters[prevKey]) {
    animateSlideOut(state.chapters[prevKey].root, -1);
  }
  if (state.logoRoot) {
    animateSlideIn(state.logoRoot, -1);
  }
  updateRail(CHAPTER_ORDER[0]);
}

/* ---------------------------------------------------------
   Progress rail
--------------------------------------------------------- */
const railFill = document.getElementById('rail-fill');
const railTicksEl = document.getElementById('rail-ticks');
const railLabel = document.getElementById('rail-label');
const TICK_TOP = [6, 35.3, 64.6, 94];

CHAPTER_ORDER.forEach((key, i) => {
  const tick = document.createElement('div');
  tick.className = 'tick';
  tick.style.top = TICK_TOP[i] + '%';
  tick.dataset.chapter = key;
  railTicksEl.appendChild(tick);
});

function updateRail(activeKey) {
  railTicksEl.querySelectorAll('.tick').forEach((t) => {
    t.classList.toggle('active', t.dataset.chapter === activeKey);
  });
  railLabel.textContent = MODELS[activeKey] ? MODELS[activeKey].label : '';
}

/* ---------------------------------------------------------
   Logo (hero)
--------------------------------------------------------- */
function setupLogo(gltf) {
  const root = gltf.scene;
  normalizeAndGround(root, 2.1);
  root.position.y += 0.4;
  scene.add(root);
  state.logoRoot = root;
}

/* ---------------------------------------------------------
   Loading-failure UI
--------------------------------------------------------- */
function showLoadError() {
  loaderEl.classList.add('hidden');
  if (loadErrorEl) loadErrorEl.hidden = false;
}

function hideLoadError() {
  if (loadErrorEl) loadErrorEl.hidden = true;
}

if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    hideLoadError();
    loaderEl.classList.remove('hidden');
    loaderFill.style.width = '0%';
    loaderPct.textContent = '0%';
    boot();
  });
}

/* ---------------------------------------------------------
   Boot sequence
--------------------------------------------------------- */
let scrollSystemsReady = false;

async function boot() {
  state.activeChapter = 'hero';

  let logoGltf, firstGltf;
  try {
    [logoGltf, firstGltf] = await Promise.all([
      loadGLB(LOGO_URL),
      loadGLB(MODELS[CHAPTER_ORDER[0]].url),
    ]);
  } catch (err) {
    console.error('Initial model load failed:', err);
  }

  // The first car is essential — without it there's nothing to show, so
  // surface a clear, actionable message instead of a silent blank page.
  if (!firstGltf) {
    showLoadError();
    return;
  }

  if (logoGltf) setupLogo(logoGltf);
  setupChapter(CHAPTER_ORDER[0], firstGltf);

  // Reveal the page.
  loaderEl.classList.add('hidden');
  renderer.setAnimationLoop(tick);

  if (!scrollSystemsReady) {
    initScrollSystems();
    scrollSystemsReady = true;
  } else {
    ScrollTrigger.refresh();
  }

  // Load the remaining chapters in the background — they aren't needed
  // until the visitor scrolls several viewports down, which gives slower
  // connections real time to finish fetching before each car is due.
  CHAPTER_ORDER.slice(1).forEach((key) => {
    loadGLB(MODELS[key].url)
      .then((gltf) => setupChapter(key, gltf))
      .catch((err) => console.error('Failed to load chapter "' + key + '":', err));
  });
}

/* ---------------------------------------------------------
   Scroll systems: hero CTA, hero hint, chapter activation
--------------------------------------------------------- */
function initScrollSystems() {
  // First chapter's activation trigger + rail wiring is set up alongside
  // every other chapter, uniformly, once each model is ready:
  CHAPTER_ORDER.forEach((key) => {
    const sectionEl = document.getElementById('chapter-' + key);
    if (!sectionEl) return;
    ScrollTrigger.create({
      trigger: sectionEl,
      start: 'top center',
      end: 'bottom center',
      onEnter: () => activateChapter(key),
      onEnterBack: () => activateChapter(key),
    });
  });

  // Hero <-> first chapter boundary: when scrolled back to the very top,
  // treat it as "hero" so the logo alone is shown.
  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom center',
    onEnterBack: () => returnToHero(),
  });

  const firstSection = document.getElementById('chapter-' + CHAPTER_ORDER[0]);
  if (firstSection) {
    ScrollTrigger.create({
      trigger: firstSection,
      start: 'top 90%',
      onEnter: () => activateChapter(CHAPTER_ORDER[0]),
      once: true,
    });
  }

  // Rail fill across the whole chapters block.
  const railStart = document.getElementById('chapter-' + CHAPTER_ORDER[0]);
  const railEnd = document.getElementById('chapter-' + CHAPTER_ORDER[CHAPTER_ORDER.length - 1]);
  if (railStart && railEnd) {
    ScrollTrigger.create({
      trigger: railStart,
      start: 'top top',
      endTrigger: railEnd,
      end: 'bottom bottom',
      onUpdate: (self) => {
        railFill.style.height = self.progress * 100 + '%';
      },
    });
  }

  updateRail(CHAPTER_ORDER[0]);

  // Hero scroll hint.
  const hint = document.getElementById('scroll-hint');
  setTimeout(() => hint.classList.add('visible'), 900);
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 40) hint.classList.remove('visible');
    },
    { passive: true }
  );

  // "Get started" CTA scrolls to chapter 1.
  document.getElementById('get-started').addEventListener('click', () => {
    document.getElementById('chapter-' + CHAPTER_ORDER[0]).scrollIntoView({ behavior: 'smooth' });
  });

  ScrollTrigger.refresh();
}

/* ---------------------------------------------------------
   Render loop
--------------------------------------------------------- */
const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  if (state.logoRoot && state.activeChapter === 'hero') {
    state.logoRoot.rotation.y += dt * 0.35;
  }
  renderer.render(scene, camera);
}

boot();
