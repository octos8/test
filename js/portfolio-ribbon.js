import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
try {




const home = document.querySelector('#home[data-crystal-hero]');
const stage = home.querySelector('.hero-stage');
const canvas = document.querySelector('#hero-crystal-canvas');
const fallback = document.createElement('div');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let mode = 'scatter';
let progress = 0;
let target = 0;
let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
} catch (error) {
  fallback.textContent = 'WebGL을 시작할 수 없습니다. 브라우저 하드웨어 가속을 켜거나 Chrome/Edge에서 열어주세요.';
  fallback.classList.add('show');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

// SCENE
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  37,
  innerWidth / innerHeight,
  0.05,
  100
);

const group = new THREE.Group();
scene.add(group);

// ENVIRONMENT
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);

scene.environment = pmrem.fromScene(environment, 0.04).texture;

environment.dispose();
pmrem.dispose();

// LIGHTS
scene.add(new THREE.HemisphereLight('#ffffff', '#9fabb8', 1.8));

const keyLight = new THREE.DirectionalLight('#ffffff', 4.2);
keyLight.position.set(-3, 5, 6);
scene.add(keyLight);

const purple = new THREE.PointLight('#c5b0ff', 27, 10);
purple.position.set(-3, -1, 3);
scene.add(purple);

const cyan = new THREE.PointLight('#a3f4ff', 21, 12);
cyan.position.set(4, 2, 2);
scene.add(cyan);

const amber = new THREE.PointLight('#fff0cb', 16, 10);
amber.position.set(0, -4, -2);
scene.add(amber);

// GLASS MATERIAL
const glass = new THREE.MeshPhysicalMaterial({
  color: '#e2eaf2',
  metalness: 0.03,
  roughness: 0.075,
  transmission: 0.97,
  thickness: 1.25,
  ior: 1.48,
  dispersion: 0.22,
  iridescence: 0.9,
  iridescenceIOR: 1.38,
  iridescenceThicknessRange: [140, 850],
  clearcoat: 1,
  clearcoatRoughness: 0.045,
  envMapIntensity: 2.8,
  transparent: true,
  opacity: 1,
  side: THREE.DoubleSide,
  depthWrite: true
});

const lineMat = new THREE.LineBasicMaterial({
  color: '#688da1',
  transparent: true,
  opacity: 0,
  depthWrite: false
});

// Fixed gold palette for the portfolio hero.
glass.color.set('#f2d291');
purple.color.set('#ffd789');
cyan.color.set('#ffeac0');
amber.color.set('#ffbfa4');
lineMat.color.set('#a78440');

// RIBBON CONFIG
const PIECES = 28;
const STEPS_PER_PIECE = 12;
const STEPS = PIECES * STEPS_PER_PIECE;
const CROSS = 24;

const HALF_WIDTH = 0.33;
const HALF_THICKNESS = 0.075;
const ROUND = 0.060;
const TAU = Math.PI * 2;

const clamp01 = n => Math.max(0, Math.min(1, n));

const smooth = n => {
  n = clamp01(n);
  return n * n * (3 - 2 * n);
};

const lerp = THREE.MathUtils.lerp;

const profile = [];

// Rounded rectangular ribbon cross-section
for (const [cx, cy, start] of [
  [HALF_WIDTH - ROUND, HALF_THICKNESS - ROUND, 0],
  [-HALF_WIDTH + ROUND, HALF_THICKNESS - ROUND, Math.PI / 2],
  [-HALF_WIDTH + ROUND, -HALF_THICKNESS + ROUND, Math.PI],
  [HALF_WIDTH - ROUND, -HALF_THICKNESS + ROUND, 3 * Math.PI / 2]
]) {
  for (let j = 0; j < CROSS / 4; j++) {
    const a = start + (j / (CROSS / 4)) * (Math.PI / 2);
    profile.push([
      cx + ROUND * Math.cos(a),
      cy + ROUND * Math.sin(a)
    ]);
  }
}

// RIBBON PATH + MORPH
function centerAt(t, amount) {
  const a = t * TAU;
  const r = 1.11 + 0.45 * Math.cos(3 * a);

  const knot = new THREE.Vector3(
    r * Math.cos(2 * a),
    r * Math.sin(2 * a),
    0.69 * Math.sin(3 * a)
  );

  // 01 UNFOLD
  if (mode === 'unfold') {
    const angle = t * TAU * 1.75;
    const targetShape = new THREE.Vector3(
      1.05 * Math.cos(angle),
      (t - 0.5) * 4.8,
      1.05 * Math.sin(angle)
    );

    return knot.lerp(targetShape, smooth(amount));
  }

  // 03 MORPH
  if (mode === 'morph') {
    const wave = smooth(amount);
    const petalRadius = 1.65 + 0.55 * Math.cos(5 * a + amount * 3);
    const bloom = new THREE.Vector3(
      petalRadius * Math.cos(a),
      petalRadius * Math.sin(a),
      0.85 * Math.sin(3 * a + amount * 4)
    );
    knot.lerp(bloom, wave);
    const swell = Math.sin(amount * Math.PI);
    knot.multiplyScalar(1 + swell * 0.3);
    knot.z += swell * 0.55 * Math.sin(4 * a + amount * TAU);
  }

  return knot;
}

// GENERATE GEOMETRY
function makeSegment() {
  const ringCount = STEPS_PER_PIECE + 1;
  const verts = ringCount * CROSS;
  const positions = new Float32Array((verts + 2) * 3);
  const indices = [];

  for (let j = 0; j < STEPS_PER_PIECE; j++) {
    for (let k = 0; k < CROSS; k++) {
      const a = j * CROSS + k;
      const b = j * CROSS + (k + 1) % CROSS;
      const c = (j + 1) * CROSS + k;
      const d = (j + 1) * CROSS + (k + 1) % CROSS;

      indices.push(a, b, c, b, d, c);
    }
  }

  const first = verts;
  const last = verts + 1;

  for (let k = 0; k < CROSS; k++) {
    indices.push(first, (k + 1) % CROSS, k);

    indices.push(
      last,
      STEPS_PER_PIECE * CROSS + k,
      STEPS_PER_PIECE * CROSS + (k + 1) % CROSS
    );
  }

  const geo = new THREE.BufferGeometry();

  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
      .setUsage(THREE.DynamicDrawUsage)
  );

  geo.setIndex(indices);
  return geo;
}

const fragments = [];

function pseudo(seed) {
  return (Math.sin(seed * 127.1 + 78.233) * 43758.5453) % 1;
}

for (let piece = 0; piece < PIECES; piece++) {
  const geo = makeSegment();
  const mesh = new THREE.Mesh(geo, glass);

  mesh.frustumCulled = false;
  group.add(mesh);

  const edgeVertexCount =
    (STEPS_PER_PIECE * 4 + 5 * 4) * 2;

  const edgeGeo = new THREE.BufferGeometry();

  edgeGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array(edgeVertexCount * 3),
      3
    ).setUsage(THREE.DynamicDrawUsage)
  );

  const edges = new THREE.LineSegments(edgeGeo, lineMat);
  edges.frustumCulled = false;
  mesh.add(edges);

  fragments.push({
    mesh,
    geo,
    edges,
    edgeGeo,
    dir: new THREE.Vector3(
      pseudo(piece + 11),
      pseudo(piece + 57),
      pseudo(piece + 102)
    ).normalize(),
    spin: new THREE.Vector3(
      pseudo(piece + 73),
      pseudo(piece + 97),
      pseudo(piece + 131)
    )
  });
}

// PATH ARRAYS
const centers = Array.from(
  { length: STEPS + 1 },
  () => new THREE.Vector3()
);

const tangents = Array.from(
  { length: STEPS + 1 },
  () => new THREE.Vector3()
);

const normals = Array.from(
  { length: STEPS + 1 },
  () => new THREE.Vector3()
);

const binormals = Array.from(
  { length: STEPS + 1 },
  () => new THREE.Vector3()
);

const up = new THREE.Vector3(0, 0, 1);
const tmpAxis = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const point = new THREE.Vector3();
const rawA = new THREE.Vector3();
const rawB = new THREE.Vector3();

function sample(tIndex, px, py) {
  const t = tIndex / STEPS;

  const turn =
    (mode === 'morph' ? progress * TAU * 2 * t : 0) +
    0.16 * Math.sin(t * TAU * 3);

  const s = Math.sin(turn);
  const c = Math.cos(turn);

  const a = px * c - py * s;
  const b = px * s + py * c;

  return point
    .copy(centers[tIndex])
    .addScaledVector(normals[tIndex], a)
    .addScaledVector(binormals[tIndex], b);
}

// UPDATE RIBBON GEOMETRY
function updateGeometry(p) {
  for (let i = 0; i <= STEPS; i++) {
    centers[i].copy(centerAt(i / STEPS, p));
  }

  for (let i = 0; i <= STEPS; i++) {
    const before = centers[Math.max(i - 1, 0)];
    const after = centers[Math.min(i + 1, STEPS)];

    tangents[i].subVectors(after, before).normalize();
  }

  normals[0].crossVectors(up, tangents[0]);

  if (normals[0].lengthSq() < 0.0001) {
    normals[0].set(0, 1, 0);
  }

  normals[0].normalize();

  binormals[0]
    .crossVectors(tangents[0], normals[0])
    .normalize();

  for (let i = 1; i <= STEPS; i++) {
    tmpAxis.crossVectors(tangents[i - 1], tangents[i]);
    normals[i].copy(normals[i - 1]);

    if (tmpAxis.lengthSq() > 0.000000001) {
      tmpAxis.normalize();

      const dot = THREE.MathUtils.clamp(
        tangents[i - 1].dot(tangents[i]),
        -1,
        1
      );

      tmpQ.setFromAxisAngle(tmpAxis, Math.acos(dot));
      normals[i].applyQuaternion(tmpQ);
    }

    binormals[i]
      .crossVectors(tangents[i], normals[i])
      .normalize();

    normals[i]
      .crossVectors(binormals[i], tangents[i])
      .normalize();
  }

  // Close the ribbon's twist smoothly
  if (mode !== 'unfold' || p < 0.001) {
    const theta = Math.atan2(
      tangents[0].dot(
        new THREE.Vector3().crossVectors(
          normals[STEPS],
          normals[0]
        )
      ),
      normals[STEPS].dot(normals[0])
    );

    for (let i = 1; i <= STEPS; i++) {
      tmpQ.setFromAxisAngle(
        tangents[i],
        theta * i / STEPS
      );

      normals[i].applyQuaternion(tmpQ);

      binormals[i]
        .crossVectors(tangents[i], normals[i])
        .normalize();
    }
  }

  for (let n = 0; n < PIECES; n++) {
    const f = fragments[n];
    const attr = f.geo.getAttribute('position');
    const edgeAttr = f.edgeGeo.getAttribute('position');

    for (let j = 0; j <= STEPS_PER_PIECE; j++) {
      const ix = n * STEPS_PER_PIECE + j;

      for (let k = 0; k < CROSS; k++) {
        const [px, py] = profile[k];
        sample(ix, px, py);

        attr.setXYZ(
          j * CROSS + k,
          point.x,
          point.y,
          point.z
        );
      }
    }

    sample(n * STEPS_PER_PIECE, 0, 0);

    attr.setXYZ(
      (STEPS_PER_PIECE + 1) * CROSS,
      point.x,
      point.y,
      point.z
    );

    sample((n + 1) * STEPS_PER_PIECE, 0, 0);

    attr.setXYZ(
      (STEPS_PER_PIECE + 1) * CROSS + 1,
      point.x,
      point.y,
      point.z
    );

    attr.needsUpdate = true;
    f.geo.computeVertexNormals();

    // 05 WIREFRAME
    let write = 0;

    const put = v => {
      edgeAttr.setXYZ(
        write++,
        v.x,
        v.y,
        v.z
      );
    };

    for (let j = 0; j < STEPS_PER_PIECE; j++) {
      const ix = n * STEPS_PER_PIECE + j;

      for (let c = 0; c < 4; c++) {
        const pr = profile[c * 6];

        sample(ix, pr[0], pr[1]);
        rawA.copy(point);

        sample(ix + 1, pr[0], pr[1]);
        rawB.copy(point);

        put(rawA);
        put(rawB);
      }
    }

    for (const j of [0, 3, 6, 9, 12]) {
      const ix = n * STEPS_PER_PIECE + j;

      for (let c = 0; c < 4; c++) {
        const pr = profile[c * 6];
        const pr2 = profile[((c + 1) * 6) % CROSS];

        sample(ix, pr[0], pr[1]);
        rawA.copy(point);

        sample(ix, pr2[0], pr2[1]);
        rawB.copy(point);

        put(rawA);
        put(rawB);
      }
    }

    edgeAttr.needsUpdate = true;
  }
}

// MOUSE INTERACTION
let pointerX = 0;
let pointerY = 0;
let followX = 0;
let followY = 0;
let dragX = 0;
let dragY = 0;
let rotationX = 0;
let rotationY = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.pointerType === 'touch') return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
function endDrag(e) {
  dragging = false;
  canvas.classList.remove('dragging');
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', () => {
  dragging = false;
  canvas.classList.remove('dragging');
});
document.documentElement.addEventListener('pointerleave', () => {
  pointerX = 0;
  pointerY = 0;
});

window.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  pointerX = THREE.MathUtils.clamp((e.clientX / innerWidth - 0.5) * 2, -1, 1);
  pointerY = THREE.MathUtils.clamp((e.clientY / innerHeight - 0.5) * 2, -1, 1);
  if (dragging) {
    dragY += (e.clientX - lastX) * 0.008;
    dragX += (e.clientY - lastY) * 0.008;
    lastX = e.clientX;
    lastY = e.clientY;
  }
}, { passive: true });

// SCROLL CONTROL
function readScroll() {
  const height = Math.max(1, stage.clientHeight);
  target = reducedMotion ? 0 : clamp01(-home.getBoundingClientRect().top / (height * 2.2));
}

window.addEventListener('scroll', readScroll, {
  passive: true
});

// RESPONSIVE
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio || 1,
      innerWidth < 750 ? 1.4 : 1.7
    )
  );

  renderer.setSize(innerWidth, innerHeight);
  readScroll();
});

home.classList.add('has-crystal-3d');
canvas.classList.add('crystal-transition-canvas');
document.body.append(canvas);
// ANIMATION LOOP
let oldP = -1;
let previousTime;

function animate(ms) {
  requestAnimationFrame(animate);
  readScroll();
  const height = Math.max(1, stage.clientHeight);
  const scroll = -home.getBoundingClientRect().top;
  const fade = reducedMotion ? clamp01(scroll / height) : smooth((target - 0.62) / 0.38);
  canvas.style.opacity = String(1 - fade);
  canvas.style.pointerEvents = scroll < height * 0.25 && fade < 1 ? 'auto' : 'none';
  stage.style.setProperty('--hero-ui-fade', String(smooth(clamp01(scroll / (height * 0.5)))));
  if (document.hidden || scroll < -height || fade >= 1) return;
  const dt = previousTime === undefined ? 1 / 60 : Math.min((ms - previousTime) / 1000, 0.05);
  previousTime = ms;
  const response = reducedMotion ? 1 : 1 - Math.exp(-8 * dt);
  followX = lerp(followX, pointerX, response);
  followY = lerp(followY, pointerY, response);
  rotationX = lerp(rotationX, dragX, response);
  rotationY = lerp(rotationY, dragY, response);

  // Move the studio lights independently of the ribbon for shifting highlights.
  keyLight.position.set(-3 + followX * 4, 5 - followY * 3, 6);
  purple.position.set(-3 + followX * 1.6, -1 - followY * 2, 3);
  cyan.position.set(4 - followX * 2, 2 + followY * 1.5, 2);
  amber.position.set(followX * 2, -4 - followY, -2);

  progress = reducedMotion
    ? target
    : lerp(progress, target, 0.07);

  const p = smooth(progress);

  if (
    Math.abs(progress - oldP) > 0.00008 ||
    oldP === -1
  ) {
    updateGeometry(mode === 'unfold' || mode === 'morph' ? progress : p);
    oldP = progress;
  }

  // 02 SCATTER
  const s = mode === 'scatter' ? smooth(progress) : 0;

  for (let i = 0; i < PIECES; i++) {
    const f = fragments[i];

    const radial = centers[
      Math.floor((i + 0.5) * STEPS_PER_PIECE)
    ].clone().normalize();

    f.mesh.position
      .copy(radial.multiplyScalar(s * 4.2))
      .addScaledVector(f.dir, s * 2.8);

    f.mesh.rotation.set(
      s * f.spin.x * 5.2,
      s * f.spin.y * 6.0,
      s * f.spin.z * 4.7
    );
  }

  // 05 WIREFRAME
  const w = mode === 'wire' ? smooth(p) : 0;

  glass.opacity = 1 - w * 0.93;
  glass.transmission = 0.97 * (1 - w);
  glass.depthWrite = w < 0.55;
  lineMat.opacity = w * 0.97;

  // CAMERA
  // Fit portrait screens by aspect ratio so the ribbon stays inside the viewport.
  const aspectShift = innerWidth < 750
    ? Math.min(0.72, 1.15 * camera.aspect)
    : 1;
  const baseZ = innerWidth < 750 ? 8.0 : 7.1;

  // 04 ORBIT
  const orbit = mode === 'orbit' ? smooth(p) : 0;

  camera.position.set(
    Math.sin(orbit * Math.PI * 1.55) * 2.8 * orbit,
    0.45 + orbit * 1.5,
    baseZ - orbit * 2.0 + s * 5.0 + (mode === 'morph' ? p * 1.2 : 0)
  );

  camera.lookAt(0, 0, 0);

  group.rotation.set(
    -0.12 +
      (mode === 'morph' ? p * 0.55 : 0) +
      followY * 0.65 + rotationX,

    -0.28 +
      (mode === 'orbit' ? orbit * 4.0 : 0) +
      followX * 1.1 + rotationY,

    -0.12 +
      (mode === 'unfold' ? -p * 0.05 : 0)
  );

  group.scale.setScalar(
    (mode === 'unfold' ? 0.89 : 1) * aspectShift
  );

  // SUBTLE IDLE MOTION
  if (!reducedMotion && progress < 0.01) {
    group.rotation.z +=
      Math.sin(ms * 0.00023) * 0.035;
  }

  renderer.render(scene, camera);
}

readScroll();
updateGeometry(0);
requestAnimationFrame(animate);

} catch (error) {
  const home = document.querySelector('#home');
  const canvas = document.querySelector('#hero-crystal-canvas');
  home?.classList.remove('has-crystal-3d');
  canvas?.classList.remove('crystal-transition-canvas');
  if (canvas && home) home.querySelector('.hero-stage')?.append(canvas);
  console.warn('Gold ribbon unavailable; using the original hero image.', error);
}
