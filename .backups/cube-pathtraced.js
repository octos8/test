import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer';

const canvas = document.querySelector('#cube-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#d8d8d6');
const camera = new THREE.OrthographicCamera(-4,4,5,-5,0.1,100);
camera.position.set(-5.2,4.4,12);
camera.lookAt(0,0,0);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = false;
controls.minZoom = 0.6;
controls.maxZoom = 2;
controls.target.set(0,0,0);

// HDR studio: white softboxes and dark surroundings, separate from background.
function studioTexture() {
  const width=1024, height=512;
  const data=new Float32Array(width*height*4);
  function windowWeight(value, centre, radius, softness) {
    return 1-THREE.MathUtils.smoothstep(Math.abs(value-centre), radius-softness, radius+softness);
  }
  for(let y=0;y<height;y++) {
    const theta=(y+0.5)/height*Math.PI;
    for(let x=0;x<width;x++) {
      const phi=(x+0.5)/width*Math.PI*2;
      const dx=-Math.sin(theta)*Math.cos(phi), dy=-Math.cos(theta), dz=-Math.sin(theta)*Math.sin(phi);
      let value=0.38+0.22*(dy+1)*0.5;
      const overhead=windowWeight(dx,-0.12,0.58,0.03)*windowWeight(dz,0.10,0.62,0.03)*THREE.MathUtils.smoothstep(dy,0.55,0.7);
      const back=windowWeight(dx,-0.15,0.58,0.025)*windowWeight(dy,0.32,0.19,0.025)*THREE.MathUtils.smoothstep(-dz,0.5,0.7);
      const left=windowWeight(dy,0.02,0.55,0.025)*windowWeight(dz,0.0,0.09,0.025)*THREE.MathUtils.smoothstep(-dx,0.6,0.8);
      const right=windowWeight(dy,-0.03,0.48,0.025)*windowWeight(dz,-0.3,0.10,0.025)*THREE.MathUtils.smoothstep(dx,0.6,0.8);
      value+=overhead*5+back*8+left*2.7+right*2;
      const index=(y*width+x)*4;
      data[index]=value*0.98;
      data[index+1]=value;
      data[index+2]=value*1.03;
      data[index+3]=1;
    }
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.mapping=THREE.EquirectangularReflectionMapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}
scene.environment=studioTexture();
scene.environmentIntensity=1;

const sculpture=new THREE.Group();
scene.add(sculpture);
const material=new THREE.MeshPhysicalMaterial({
  color:'#ffffff', metalness:0, roughness:0.025,
  transmission:1, ior:1.65, thickness:0.98,
  attenuationColor:'#a9b3c5', attenuationDistance:2.5,
  clearcoat:0, opacity:1, transparent:false, side:THREE.DoubleSide,
  dispersion:0.8,
});
const geometry=new RoundedBoxGeometry(0.98,0.98,0.98,4,0.075);
const cubes=[];
const questionPoints=[[-1.2,2.2],[-.6,2.55],[0,2.65],[.6,2.55],[1.2,2.2],[1.55,1.7],[1.6,1.1],[1.4,.55],[1,.15],[.55,-.1],[.15,-.35],[0,-.75],[0,-1.15],[-.9,2],[-.3,2.25],[.3,2.25],[.9,2],[1.25,1.55],[1.25,1],[.95,.5],[.5,.25],[.1,-.65],[0,-2],[-.3,-2],[.3,-2],[-.4,1.55],[.45,1.5]];
const single=new URLSearchParams(location.search).get('preview')==='single';
for(let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++) {
  if(single && (x!==0 || y!==0 || z!==0))continue;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(x*1.015,y*1.015,z*1.015);
  sculpture.add(mesh);
  const original=mesh.position.clone();
  const index=cubes.length;
  
  cubes.push({mesh,original,
    broken:original.clone().multiplyScalar(2.3).add(new THREE.Vector3(Math.sin(index)*0.5,Math.cos(index)*0.5,0)),
    aligned:new THREE.Vector3((index%9-4)*0.7,(Math.floor(index/9)-1)*0.7,0),
    question:new THREE.Vector3(questionPoints[index][0]*.83,questionPoints[index][1]*.83,(index%3-1)*.1),
    rotation:new THREE.Vector3(Math.sin(index*2)*2,Math.cos(index)*2,Math.sin(index)*2),
  });
}

const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#d8d8d6',roughness:0.9,emissive:'#d8d8d6',emissiveIntensity:0.32}));
floor.rotation.x=-Math.PI/2;
floor.position.y=-3.4;
scene.add(floor);

const tracer=new WebGLPathTracer(renderer);
tracer.tiles.set(3,3);
tracer.bounces=6;
tracer.transmissiveBounces=10;
tracer.renderDelay=0;
tracer.minSamples=1;
tracer.fadeDuration=0;
tracer.dynamicLowRes=false;
tracer.lowResScale=0.35;
tracer.renderScale=0.65;
tracer.filterGlossyFactor=0;
// Add wavelength-dependent IOR to the library's triangle-based transport.
// RGB paths are accumulated in sequence, so the background remains neutral.
function addDispersion(pathMaterial) {
  const shader=pathMaterial.fragmentShader;
  if(!shader.includes('surf.ior = material.ior;'))throw new Error('Unsupported path-tracer version');
  pathMaterial.uniforms.crystalSpectralChannel={value:1};
  pathMaterial.setDefine('RANDOM_TYPE',0);

  pathMaterial.fragmentShader='uniform float crystalSpectralChannel;\n'+shader
    .replace('surf.ior = material.ior;', 'float spectralIor = material.ior + (transmission > 0.5 ? (crystalSpectralChannel - 1.0) * 0.06 : 0.0);\n surf.ior = spectralIor;')
    .replace('1.0 / material.ior : material.ior;', '1.0 / spectralIor : spectralIor;')
    .replace('gl_FragColor.a *= opacity;', 'vec3 spectralMask = crystalSpectralChannel < 0.5 ? vec3(3.0,0.0,0.0) : crystalSpectralChannel < 1.5 ? vec3(0.0,3.0,0.0) : vec3(0.0,0.0,3.0);\n gl_FragColor.rgb *= spectralMask;\n gl_FragColor.a *= opacity;');
  pathMaterial.needsUpdate=true;
}
addDispersion(tracer._pathTracer.material);
// Low-res fallback uses normal RGB until the progressively rendered image settles.
tracer.setScene(scene,camera);
const denoise=new DenoiseMaterial({sigma:1.4,threshold:0.2,kSigma:2});
const denoiseQuad=new FullScreenQuad(denoise);
tracer.renderToCanvasCallback=(target)=>{
  if(Math.abs(tracer.samples-Math.round(tracer.samples))>0.001 || Math.round(tracer.samples)%3!==0)return;
  denoise.map=target.texture;denoiseQuad.render(renderer);
};
let sample=0, dirtyAt=0, geometryDirty=false, cameraDirty=false;
function rebuild() {tracer.setScene(scene,camera);sample=0;geometryDirty=false;}
controls.addEventListener('change',()=>{cameraDirty=true;dirtyAt=performance.now();});
let currentScroll=0;
function applyScroll() {
  const max=document.documentElement.scrollHeight-innerHeight;
  const p=max>0?Math.min(1,scrollY/max)*3:0;
  if(Math.abs(p-currentScroll)<0.0001)return;
  currentScroll=p;
  const phase=Math.min(2,Math.floor(p));
  const t=THREE.MathUtils.smoothstep(p-phase,0,1);
  cubes.forEach(cube=>{
    const from=phase===0?cube.original:phase===1?cube.broken:cube.aligned;
    const to=phase===0?cube.broken:phase===1?cube.aligned:cube.question;
    cube.mesh.position.lerpVectors(from,to,t);
    const spin=phase===0?t:phase===1?1-t:0;
    cube.mesh.rotation.set(cube.rotation.x*spin,cube.rotation.y*spin,cube.rotation.z*spin);
  });
  geometryDirty=true;dirtyAt=performance.now();
}
window.addEventListener('scroll',applyScroll,{passive:true});
function resize() {
  const aspect=innerWidth/innerHeight;
  const height=single?3.2:Math.max(7.8,5.7/aspect);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;
  camera.top=height/2;camera.bottom=-height/2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  tracer.updateCamera();sample=0;
}
window.addEventListener('resize',resize);resize();
canvas.tabIndex=0;
canvas.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const orbit=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  orbit.theta+=(event.key==='ArrowLeft'?.22:event.key==='ArrowRight'?-.22:0);
  orbit.phi+=(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0);
  orbit.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(orbit));
  controls.update();
});
history.scrollRestoration='manual';window.scrollTo(0,0);
const lightControl=document.querySelector('#light-direction');
lightControl.addEventListener('input',()=>{
  scene.environmentRotation.y=Number(lightControl.value);
  tracer.updateEnvironment();sample=0;
});
document.querySelector('#reset-view').addEventListener('click',()=>{
  camera.position.set(-5.2,4.4,12);controls.target.set(0,0,0);controls.update();
  window.scrollTo(0,0);camera.zoom=1;camera.updateProjectionMatrix();
  tracer.updateCamera();sample=0;
});
function animate() {
  requestAnimationFrame(animate);
  if((geometryDirty||cameraDirty) && performance.now()-dirtyAt>100) {
    if(geometryDirty)rebuild();else {tracer.updateCamera();sample=0;}
    cameraDirty=false;
  }
  tracer._pathTracer.material.uniforms.crystalSpectralChannel.value=Math.floor(tracer.samples+0.0001)%3;

  if(Math.abs(tracer.samples-Math.round(tracer.samples))<0.001)tracer._pathTracer.material.seed=Math.floor((tracer.samples+0.0001)/3);
  if(!geometryDirty && !cameraDirty && tracer.samples<384){tracer.renderSample();sample++;}
  else if(geometryDirty||cameraDirty)renderer.render(scene,camera);
  canvas.dataset.samples=String(Math.floor(tracer.samples));
  canvas.dataset.renderer='path-tracing';
  canvas.dataset.compiling=String(tracer.isCompiling);
  const status=document.querySelector('#render-status');
  status.textContent=tracer.isCompiling?'광학 렌더러 준비 중':tracer.samples<96?'빛 굴절 계산 중':'';
}
animate();








