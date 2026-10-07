import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* =====================================================
   BASIC
===================================================== */

const canvas = document.getElementById('cube-canvas');

if (!canvas) {
  throw new Error('#cube-canvas를 찾을 수 없습니다.');
}

/* 캔버스가 화면 전체에 깔리도록 강제 */
Object.assign(canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  display: 'block',
  zIndex: '0',
  pointerEvents: 'none'
});

const scrollContainer = document.querySelector('.scroll-container');
if (scrollContainer) {
  scrollContainer.style.position = 'relative';
  scrollContainer.style.zIndex = '1';
}

document.querySelectorAll('.scroll-section').forEach((section) => {
  section.style.minHeight = '100vh';
});

/* =====================================================
   SCENE
===================================================== */

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efefef');

/* =====================================================
   CAMERA
===================================================== */

const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 0.35, 7.4);

/* =====================================================
   RENDERER
===================================================== */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* =====================================================
   ENVIRONMENT
===================================================== */

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
const envMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;

scene.environment = envMap;

roomEnvironment.dispose();
pmremGenerator.dispose();

/* =====================================================
   LIGHTS
   참고 이미지처럼 "색조명"이 아니라
   거의 흰빛 + 굴절/분산으로 색이 보이게 구성
===================================================== */

const hemisphereLight = new THREE.HemisphereLight(
  0xffffff,
  0xf1f1f1,
  1.15
);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(4, 7, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.6);
fillLight.position.set(-5, 2, 5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
rimLight.position.set(-3, 3, -6);
scene.add(rimLight);

const topLight = new THREE.PointLight(0xffffff, 18, 20, 2);
topLight.position.set(0, 5, 2);
scene.add(topLight);

/* =====================================================
   SHADOW PLANE
===================================================== */

const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.ShadowMaterial({ opacity: 0.08 })
);

shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -2.15;
shadowPlane.receiveShadow = true;

scene.add(shadowPlane);

/* =====================================================
   MATERIAL
   참고 이미지 느낌:
   - 거의 무색
   - 강한 굴절
   - 부드러운 프리즘 색분산
===================================================== */

const crystalMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#fdfefe'),

  metalness: 0,
  roughness: 0.012,

  transmission: 1,
  transparent: false,
  opacity: 1,

  ior: 1.52,
  thickness: 1.45,

  attenuationColor: new THREE.Color('#eef4ff'),
  attenuationDistance: 5.2,

  envMapIntensity: 3.8,

  clearcoat: 0.55,
  clearcoatRoughness: 0.01,

  specularIntensity: 1,
  specularColor: new THREE.Color('#ffffff'),

  side: THREE.FrontSide
});

if ('dispersion' in crystalMaterial) {
  crystalMaterial.dispersion = 0.48;
}

if ('iridescence' in crystalMaterial) {
  crystalMaterial.iridescence = 0.015;
  crystalMaterial.iridescenceIOR = 1.3;
  crystalMaterial.iridescenceThicknessRange = [60, 120];
}

/* =====================================================
   GEOMETRY
===================================================== */

const cubeGeometry = new RoundedBoxGeometry(
  0.96,
  0.96,
  0.96,
  8,
  0.045
);

const GAP = 0.99;

/* =====================================================
   GROUP
===================================================== */

const sculpture = new THREE.Group();
scene.add(sculpture);

sculpture.rotation.x = -0.36;
sculpture.rotation.y = 0.62;
sculpture.rotation.z = -0.02;

/* =====================================================
   CUBES DATA
===================================================== */

const cubes = [];

/* =====================================================
   CREATE 3x3x3 CUBES
===================================================== */

for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      const cube = new THREE.Mesh(cubeGeometry, crystalMaterial);

      cube.castShadow = true;
      cube.receiveShadow = true;

      const original = new THREE.Vector3(
        x * GAP,
        y * GAP,
        z * GAP
      );

      cube.position.copy(original);

      sculpture.add(cube);

      cubes.push({
        mesh: cube,
        original: original.clone(),
        broken: new THREE.Vector3(),
        aligned: new THREE.Vector3(),
        question: new THREE.Vector3(),
        randomRotation: new THREE.Vector3(
          (Math.random() - 0.5) * 2.8,
          (Math.random() - 0.5) * 2.8,
          (Math.random() - 0.5) * 2.8
        )
      });
    }
  }
}

/* =====================================================
   BREAK POSITIONS
===================================================== */

cubes.forEach((cube) => {
  const dir = cube.original.clone();

  if (dir.length() < 0.001) {
    dir.set(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
  }

  dir.normalize();

  const dist = 2.7 + Math.random() * 1.8;

  cube.broken.copy(cube.original);
  cube.broken.add(dir.multiplyScalar(dist));

  cube.broken.x += (Math.random() - 0.5) * 1.1;
  cube.broken.y += (Math.random() - 0.5) * 1.0;
  cube.broken.z += (Math.random() - 0.5) * 1.1;
});

/* =====================================================
   ALIGN POSITIONS
   27개를 9 x 3 그리드로 정렬
===================================================== */

cubes.forEach((cube, i) => {
  const col = i % 9;
  const row = Math.floor(i / 9);

  cube.aligned.set(
    (col - 4) * 0.68,
    (1 - row) * 0.72,
    0
  );
});

/* =====================================================
   QUESTION MARK POSITIONS
   총 27개 포인트
===================================================== */

const questionPoints = [
  [-1.2, 2.2],
  [-0.6, 2.55],
  [0, 2.65],
  [0.6, 2.55],
  [1.2, 2.2],

  [1.55, 1.7],
  [1.6, 1.1],
  [1.4, 0.55],

  [1.0, 0.15],
  [0.55, -0.1],
  [0.15, -0.35],

  [0, -0.75],
  [0, -1.15],

  [-0.9, 2.0],
  [-0.3, 2.25],
  [0.3, 2.25],
  [0.9, 2.0],

  [1.25, 1.55],
  [1.25, 1.0],

  [0.95, 0.5],
  [0.5, 0.25],

  [0.1, -0.65],

  [0, -2.0],
  [-0.3, -2.0],
  [0.3, -2.0],

  [-0.4, 1.55],
  [0.45, 1.5]
];

cubes.forEach((cube, i) => {
  const p = questionPoints[i];

  cube.question.set(
    p[0] * 0.83,
    p[1] * 0.83,
    ((i % 3) - 1) * 0.1
  );
});

/* =====================================================
   HELPERS
===================================================== */

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(value) {
  value = clamp(value);
  return value * value * (3 - 2 * value);
}

/* =====================================================
   SCROLL
===================================================== */

let targetProgress = 0;
let currentProgress = 0;

function updateScroll() {
  const maxScroll =
    document.documentElement.scrollHeight - window.innerHeight;

  targetProgress = maxScroll > 0
    ? window.scrollY / maxScroll
    : 0;
}

window.addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

/* =====================================================
   POINTER
===================================================== */

let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;

window.addEventListener('pointermove', (event) => {
  targetMouseX = (event.clientX / window.innerWidth - 0.5) * 2;
  targetMouseY = (event.clientY / window.innerHeight - 0.5) * 2;
});

/* =====================================================
   ANIMATION
===================================================== */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  currentProgress += (targetProgress - currentProgress) * 0.07;
  mouseX += (targetMouseX - mouseX) * 0.04;
  mouseY += (targetMouseY - mouseY) * 0.04;

  const timeline = clamp(currentProgress) * 3;

  let stage = 0;
  let local = 0;

  if (timeline < 1) {
    stage = 0;
    local = smoothstep(timeline);
  } else if (timeline < 2) {
    stage = 1;
    local = smoothstep(timeline - 1);
  } else {
    stage = 2;
    local = smoothstep(timeline - 2);
  }

  cubes.forEach((cube, index) => {
    let from;
    let to;

    if (stage === 0) {
      from = cube.original;
      to = cube.broken;
    } else if (stage === 1) {
      from = cube.broken;
      to = cube.aligned;
    } else {
      from = cube.aligned;
      to = cube.question;
    }

    cube.mesh.position.lerpVectors(from, to, local);

    let breakRotation = 0;

    if (timeline < 1) {
      breakRotation = local;
    } else if (timeline < 2) {
      breakRotation = 1 - local;
    }

    cube.mesh.rotation.x =
      cube.randomRotation.x * breakRotation;

    cube.mesh.rotation.y =
      cube.randomRotation.y * breakRotation;

    cube.mesh.rotation.z =
      cube.randomRotation.z * breakRotation;

    if (stage === 0) {
      cube.mesh.rotation.y +=
        Math.sin(time + index * 0.25) * 0.002;
    }
  });

  /* 전체 조형물 각도 */
  if (timeline < 1) {
    sculpture.rotation.x = -0.36 + mouseY * 0.035;
    sculpture.rotation.y = 0.62 + mouseX * 0.04;
    sculpture.rotation.z = -0.02;
  } else if (timeline < 2) {
    sculpture.rotation.x = THREE.MathUtils.lerp(-0.36, 0, local);
    sculpture.rotation.y = THREE.MathUtils.lerp(0.62, 0, local);
    sculpture.rotation.z = THREE.MathUtils.lerp(-0.02, 0, local);
  } else {
    sculpture.rotation.x = 0;
    sculpture.rotation.y = 0;
    sculpture.rotation.z = 0;
  }

  /* 처음 화면에서만 살짝 떠있게 */
  if (timeline < 0.8) {
    sculpture.position.y = Math.sin(time * 0.9) * 0.04;
  } else {
    sculpture.position.y += (0 - sculpture.position.y) * 0.05;
  }

  renderer.render(scene, camera);
}

animate();

/* =====================================================
   RESIZE
===================================================== */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  updateScroll();
});