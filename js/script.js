
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const info = {
  unfold: ['01', 'Unfold', '서로 교차하던 리본이 부드러운 S자 곡선으로 풀립니다.'],
  scatter: ['02', 'Scatter', '28개의 유리 조각이 사방으로 흩어지며 공간감을 만듭니다.'],
  morph: ['03', 'Morph', '유리 리본 자체가 물결치고 꼬이며 다른 구조로 변형됩니다.'],
  orbit: ['04', 'Orbit', '리본의 입체 구조를 카메라 회전과 클로즈업으로 탐색합니다.'],
  wire: ['05', 'Wireframe', '빛을 반사하는 유리 표면이 구조선 드로잉으로 전환됩니다.']
};

const canvas = document.querySelector('#view');
const fallback = document.querySelector('#fallback');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let mode = 'unfold';
let progress = 0;
let target = 0;
let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
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
renderer.toneMappingExposure = 1.6;

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5e5e3');

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
scene.add(new THREE.HemisphereLight('#ffffff', '#9fabb8', 2));

const keyLight = new THREE.DirectionalLight('#ffffff', 4.8);
keyLight.position.set(-3, 5, 6);
scene.add(keyLight);

const purple = new THREE.PointLight('#c5b0ff', 30, 10);
purple.position.set(-3, -1, 3);
scene.add(purple);

const cyan = new THREE.PointLight('#a3f4ff', 24, 12);
cyan.position.set(4, 2, 2);
scene.add(cyan);

const amber = new THREE.PointLight('#fff0cb', 18, 10);
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

const themes = {
  opal: ['#e2eaf2', '#e5e5e3', '#c5b0ff', '#a3f4ff', '#fff0cb', '#688da1'],
  lavender: ['#bca0ef', '#e9e3ef', '#ad79ff', '#dcc4ff', '#ffd5ed', '#825ca8'],
  aqua: ['#91e4d9', '#e0ece9', '#8cebd2', '#78dfff', '#e4ffd4', '#398d91'],
  rose: ['#f0adc9', '#efe3e7', '#ff9dcd', '#d0b5ff', '#ffe0ba', '#b56489'],
  gold: ['#f2d291', '#eee8dc', '#ffd789', '#ffeac0', '#ffbfa4', '#a78440']
};
function applyTheme(name) {
  const theme = themes[name];
  if (!theme) return;
  glass.color.set(theme[0]);
  scene.background.set(theme[1]);
  [purple, cyan, amber].forEach((light, i) => light.color.set(theme[i + 2]));
  lineMat.color.set(theme[5]);
  document.documentElement.style.setProperty('--accent', theme[5]);
  document.documentElement.style.setProperty('--background', theme[1]);
  document.querySelector('meta[name="theme-color"]').content = theme[1];
  document.querySelectorAll('[data-theme]').forEach(button => {
    const selected = button.dataset.theme === name;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
document.querySelectorAll('[data-theme]').forEach(button => {
  button.addEventListener('click', () => applyTheme(button.dataset.theme));
});
applyTheme('opal');

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
    const targetShape = new THREE.Vector3(
      (t - 0.5) * 4.5,
      0.54 * Math.sin(t * Math.PI * 2.25) +
        0.07 * Math.sin(t * TAU * 4),
      0.28 * Math.cos(t * TAU * 1.5)
    );

    return knot.lerp(targetShape, smooth(amount));
  }

  // 03 MORPH
  if (mode === 'morph') {
    const wave = smooth(amount);

    knot.x += wave * 0.22 * Math.cos(6 * a + amount * 5);
    knot.y += wave * 0.31 * Math.sin(5 * a + amount * 4);
    knot.z += wave * (
      0.48 * Math.sin(2 * a + 1.5) +
      0.25 * Math.cos(5 * a)
    );
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
    (mode === 'morph' ? progress * 5.7 * t : 0) +
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

window.addEventListener('pointermove', e => {
  pointerX = (e.clientX / innerWidth - 0.5) * 2;
  pointerY = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

// SCROLL CONTROL
function readScroll() {
  const total =
    document.documentElement.scrollHeight - innerHeight;

  target = total > 0
    ? clamp01(scrollY / total)
    : 0;
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

// EFFECT SELECTOR
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;

    document.querySelectorAll('[data-mode]').forEach(b => {
      const selected = b === button;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-pressed', String(selected));
    });

    const [num, name, desc] = info[mode];

    document.querySelector('#number').textContent =
      'EXPERIMENT / ' + num;

    document.querySelector('#name').textContent = name;
    document.querySelector('#description').textContent = desc;

    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });

    target = 0;
    progress = 0;
  });
});

// ANIMATION LOOP
let oldP = -1;

function animate(ms) {
  requestAnimationFrame(animate);

  progress = reducedMotion
    ? target
    : lerp(progress, target, 0.07);

  const p = smooth(progress);

  if (
    Math.abs(progress - oldP) > 0.00008 ||
    oldP === -1
  ) {
    updateGeometry(p);
    oldP = progress;
  }

  // 02 SCATTER
  const s = mode === 'scatter' ? smooth(p) : 0;

  for (let i = 0; i < PIECES; i++) {
    const f = fragments[i];

    const radial = centers[
      Math.floor((i + 0.5) * STEPS_PER_PIECE)
    ].clone().normalize();

    f.mesh.position
      .copy(radial.multiplyScalar(s * 1.8))
      .addScaledVector(f.dir, s * 1.6);

    f.mesh.rotation.set(
      s * f.spin.x * 3.2,
      s * f.spin.y * 4.0,
      s * f.spin.z * 2.7
    );
  }

  // 05 WIREFRAME
  const w = mode === 'wire' ? smooth(p) : 0;

  glass.opacity = 1 - w * 0.93;
  glass.transmission = 0.97 * (1 - w);
  glass.depthWrite = w < 0.55;
  lineMat.opacity = w * 0.97;

  // CAMERA
  const aspectShift = innerWidth < 750 ? 1.15 : 1;
  const baseZ = innerWidth < 750 ? 8.0 : 7.1;

  // 04 ORBIT
  const orbit = mode === 'orbit' ? smooth(p) : 0;

  camera.position.set(
    Math.sin(orbit * Math.PI * 1.55) * 2.8 * orbit,
    0.45 + orbit * 1.5,
    baseZ - orbit * 2.0
  );

  camera.lookAt(0, 0, 0);

  group.rotation.set(
    -0.12 +
      (mode === 'morph' ? p * 0.55 : 0) +
      pointerY * 0.045,

    -0.28 +
      (mode === 'orbit' ? orbit * 4.0 : 0) +
      pointerX * 0.055,

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

  // SCROLL PROGRESS UI
  document.querySelector('#fill').style.height =
    (progress * 100).toFixed(1) + '%';

  document.querySelector('#progress').textContent =
    String(Math.round(progress * 100))
      .padStart(3, '0') + '%';

  renderer.render(scene, camera);
}

readScroll();
updateGeometry(0);
requestAnimationFrame(animate);
