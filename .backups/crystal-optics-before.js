import * as THREE from 'three';

// Rasterise the rounded exterior, then trace RGB rays through all 27 blocks.
// This is a bounded optical approximation, not a photograph or a painted face.
export function createCrystalOptics(renderer, studio, count = 27) {
  const target = new THREE.WebGLCubeRenderTarget(1024, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const capture = new THREE.CubeCamera(0.1, 100, target);
  capture.update(renderer, studio);
  const inverses = Array.from({ length: count }, () => new THREE.Matrix4());
  const transforms = Array.from({ length: count }, () => new THREE.Matrix4());
  const common = {
    opticalEnvironment: { value: target.texture },
    opticalInverse: { value: inverses },
    opticalWorld: { value: transforms },
  };
  let lastCapture = -1;
  let lastX = NaN, lastY = NaN;
  const movingPanel = studio.children[1];
  const originalPanelPosition = movingPanel.position.clone();
  const vertexShader = `
    varying vec3 opticalPosition;
    varying vec3 opticalNormal;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      opticalPosition = world.xyz;
      opticalNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  const fragmentShader = `
    precision highp float;
    uniform samplerCube opticalEnvironment;
    uniform mat4 opticalInverse[27];
    uniform mat4 opticalWorld[27];
    uniform int opticalIndex;
    varying vec3 opticalPosition;
    varying vec3 opticalNormal;
    vec3 studioRadiance(vec3 direction) {
      return textureCube(opticalEnvironment, normalize(direction), 1.25).rgb;
    }
    float crystalDistance(vec3 p) {
      vec3 q = abs(p)-vec3(0.435);
      return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-0.055;
    }
    vec3 crystalNormal(vec3 p) {
      // Analytic rounded-box normal, continuous across optical bevels.
      vec3 q = abs(p)-vec3(0.435);
      vec3 rounded = max(q,0.0)*sign(p);
      if (dot(rounded,rounded)>0.0000001) return normalize(rounded);
      vec3 ap=abs(p);
      return ap.x>ap.y && ap.x>ap.z ? vec3(sign(p.x),0.0,0.0) :
             ap.y>ap.z ? vec3(0.0,sign(p.y),0.0) : vec3(0.0,0.0,sign(p.z));
    }
    bool boxHit(vec3 origin, vec3 direction, int index, bool inside,
                out float distanceToHit, out vec3 hitNormal) {
      vec3 o=(opticalInverse[index]*vec4(origin,1.0)).xyz;
      vec3 d=(opticalInverse[index]*vec4(direction,0.0)).xyz;
      float speed=max(length(d),0.00001);
      vec3 safe=mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),d))*max(abs(d),vec3(0.00001));
      vec3 a=(vec3(-0.49)-o)/safe, b=(vec3(0.49)-o)/safe;
      vec3 lo=min(a,b), hi=max(a,b);
      float nearT=max(lo.x,max(lo.y,lo.z));
      float farT=min(hi.x,min(hi.y,hi.z));
      if(farT<max(nearT,0.0001)) return false;
      float t=max(nearT,0.0001);
      if(inside) {
        // An interior ray has exactly one exit. Bisection gives a stable hit.
        float low=0.0, high=farT+0.001/speed;
        for(int iteration=0;iteration<16;iteration++) {
          float middle=(low+high)*0.5;
          if(crystalDistance(o+d*middle)<0.0) low=middle; else high=middle;
        }
        t=(low+high)*0.5;
      } else {
        bool found=false;
        for(int iteration=0;iteration<32;iteration++) {
          float distanceToSurface=crystalDistance(o+d*t);
          if(distanceToSurface<0.00015) { found=true; break; }
          t+=max(distanceToSurface/speed,0.00005);
          if(t>farT) break;
        }
        if(!found) return false;
      }
      distanceToHit=t;
      hitNormal=normalize(mat3(opticalWorld[index])*crystalNormal(o+d*t));
      return t>0.0001;
    }
    vec3 opticalTrace(float indexOfRefraction) {
      vec3 incident = normalize(opticalPosition-cameraPosition);
      vec3 n = normalize(opticalNormal);
      float entryFresnel = 0.04+0.96*pow(1.0-max(dot(-incident,n),0.0),5.0);
      vec3 colour = studioRadiance(reflect(incident,n))*entryFresnel;
      float throughput = 1.0-entryFresnel;
      vec3 direction = normalize(refract(incident,n,1.0/indexOfRefraction));
      vec3 origin = opticalPosition+direction*0.001;
      int medium = opticalIndex;
      for (int bounce=0; bounce<12; bounce++) {
        float nearest = 1000.0;
        int hitIndex = -1;
        vec3 normalAtHit = vec3(0.0);
        for (int block=0; block<27; block++) {
          if (medium >= 0 && block != medium) continue;
          float hitDistance;
          vec3 candidateNormal;
          if (boxHit(origin,direction,block,medium==block,hitDistance,candidateNormal)
              && hitDistance<nearest) {
            nearest=hitDistance;
            hitIndex=block;
            normalAtHit=candidateNormal;
          }
        }
        if (hitIndex<0) {
          colour += studioRadiance(direction)*throughput;
          return colour;
        }
        bool exiting = medium >= 0;
        vec3 facingNormal = exiting ? -normalAtHit : normalAtHit;
        float eta = exiting ? indexOfRefraction : 1.0/indexOfRefraction;
        vec3 nextDirection = refract(direction,facingNormal,eta);
        origin += direction*nearest;
        if (exiting) throughput *= exp(-nearest*0.045);
        if (dot(nextDirection,nextDirection)<0.001) {
          direction = reflect(direction,facingNormal);
        } else {
          float fresnel = 0.04+0.96*pow(1.0-max(dot(-direction,facingNormal),0.0),5.0);
          colour += studioRadiance(reflect(direction,facingNormal))*throughput*fresnel;
          throughput *= 1.0-fresnel;
          direction = normalize(nextDirection);
          medium = exiting ? -1 : hitIndex;
        }
        origin += direction*0.001;
      }
      return colour+studioRadiance(direction)*throughput;
    }
    void main() {
      vec3 redRay = opticalTrace(1.49);
      vec3 greenRay = opticalTrace(1.52);
      vec3 blueRay = opticalTrace(1.57);
      gl_FragColor = vec4(vec3(redRay.r,greenRay.g,blueRay.b),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  return {
    material(index) {
      return new THREE.ShaderMaterial({
        uniforms: { ...common, opticalIndex: { value: index } },
        vertexShader, fragmentShader,
      });
    },
    moveLight(x, y, time) {
      if (time-lastCapture < 0.15) return;
      if (Math.abs(x-lastX)+Math.abs(y-lastY)<0.005) return;
      movingPanel.position.copy(originalPanelPosition);
      movingPanel.position.x += x*5;
      movingPanel.position.y -= y*4;
      movingPanel.lookAt(0,0,0);
      capture.update(renderer, studio);
      lastCapture=time;
      lastX=x; lastY=y;
    },
    update(blocks) {
      blocks.forEach((block,index) => {
        transforms[index].copy(block.matrixWorld);
        inverses[index].copy(block.matrixWorld).invert();
      });
    },
  };
}
