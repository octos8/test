import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { createCrystalOptics } from './crystal-optics.js';

const canvas = document.querySelector('#cube-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#d8d8d6');
const camera = new THREE.OrthographicCamera(-4,4,5,-5,0.1,100);
camera.up.set(-0.20,1,0).normalize();
camera.position.set(-5.2,-3.2,12);
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
const geometry=new RoundedBoxGeometry(0.98,0.98,0.98,8,0.10);
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

const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:'#d8d8d6'}));
floor.rotation.x=-Math.PI/2;
floor.position.y=-3.4;
scene.add(floor);

const optics=createCrystalOptics(renderer,scene,cubes.length);
cubes.forEach((cube,index)=>{cube.mesh.material=optics.material(index);});
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  vertexShader:'varying vec2 uvShadow; void main(){uvShadow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec2 uvShadow; void main(){vec2 p=(uvShadow-.5)*5.0;gl_FragColor=vec4(vec3(.18),.23*exp(-dot(p,p)));}'
}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=-3.39;scene.add(shadow);
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.10,.3,.95));
composer.addPass(new OutputPass());
const antialias=new ShaderPass(FXAAShader);composer.addPass(antialias);
function resize(){
  const aspect=innerWidth/innerHeight;
  const height=single?3.2:Math.max(7.8,5.7/aspect);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;
  camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
  antialias.material.uniforms.resolution.value.set(1/innerWidth,1/innerHeight);
}
resize();window.addEventListener('resize',resize);
history.scrollRestoration='manual';window.scrollTo(0,0);
window.addEventListener('scroll',()=>{
  const max=document.documentElement.scrollHeight-innerHeight;
  const p=max>0?Math.min(1,scrollY/max)*3:0;
  const phase=Math.min(2,Math.floor(p)), t=THREE.MathUtils.smoothstep(p-phase,0,1);
  cubes.forEach(cube=>{
    const from=phase===0?cube.original:phase===1?cube.broken:cube.aligned;
    const to=phase===0?cube.broken:phase===1?cube.aligned:cube.question;
    cube.mesh.position.lerpVectors(from,to,t);
    const spin=phase===0?t:phase===1?1-t:0;
    cube.mesh.rotation.set(cube.rotation.x*spin,cube.rotation.y*spin,cube.rotation.z*spin);
  });
},{passive:true});
canvas.tabIndex=0;
canvas.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const orbit=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  orbit.theta+=(event.key==='ArrowLeft'?.22:event.key==='ArrowRight'?-.22:0);
  orbit.phi+=(event.key==='ArrowUp'?-.15:event.key==='ArrowDown'?.15:0);
  orbit.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(orbit));controls.update();
});
document.querySelector('#light-direction').addEventListener('input',event=>optics.moveLight(Number(event.target.value)));
document.querySelector('#reset-view').addEventListener('click',()=>{
  camera.position.set(-5.2,-3.2,12);camera.zoom=1;camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.update();window.scrollTo(0,0);
});
document.querySelector('#render-status').textContent='';
function animate(){
  requestAnimationFrame(animate);
  sculpture.updateMatrixWorld(true);optics.update(cubes.map(cube=>cube.mesh),camera);
  composer.render();
}
animate();



