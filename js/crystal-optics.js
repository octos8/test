import * as THREE from 'three';

// Rasterise the rounded exterior, then trace RGB rays within each block.
// This is a bounded optical approximation, not a photograph or a painted face.
export function createCrystalOptics(renderer, studio, count = 27) {
  const inverses = Array.from({ length: count }, () => new THREE.Matrix4());
  const transforms = Array.from({ length: count }, () => new THREE.Matrix4());
  const common = {
    opticalDirection: { value: new THREE.Vector3() },
    opticalLightAngle: { value: 0 },
    opticalCount: { value: count },
    opticalInverse: { value: inverses },
    opticalWorld: { value: transforms },
  };
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
    #define USE_IRIDESCENCE
    #include <common>
    #include <iridescence_fragment>
    uniform vec3 opticalDirection;
    uniform float opticalLightAngle;
    uniform int opticalCount;
    uniform mat4 opticalInverse[27];
    uniform mat4 opticalWorld[27];
    uniform int opticalIndex;
    varying vec3 opticalPosition;
    varying vec3 opticalNormal;
    float panel(float x,float c,float r,float blur) {
      return 1.0-smoothstep(r-blur,r+blur,abs(x-c));
    }
    vec3 studioRadiance(vec3 direction) {
      vec3 d=normalize(direction);
      vec3 p=opticalPosition;
      float c=cos(opticalLightAngle), s=sin(opticalLightAngle);
      d.xz=mat2(c,-s,s,c)*d.xz;
      p.xz=mat2(c,-s,s,c)*p.xz;
      vec3 back=p+d*((-6.0-p.z)/min(d.z,-.0001));
      vec3 left=p+d*((-6.0-p.x)/min(d.x,-.0001));
      vec3 right=p+d*((6.0-p.x)/max(d.x,.0001));
      vec3 top=p+d*((6.0-p.y)/max(d.y,.0001));
      vec3 front=p+d*((6.0-p.z)/max(d.z,.0001));
      float upper=panel(back.x,.2,4.0,.4)*panel(back.y,2.4,1.4,.3)*smoothstep(.0,.15,-d.z);
      float side=panel(left.y,0.0,4.0,.8)*panel(left.z,-.6,2.2,.8)*smoothstep(.0,.15,-d.x);
      float opposite=panel(right.y,0.0,3.0,.8)*panel(right.z,-2.0,1.6,.6)*smoothstep(.0,.15,d.x);
      float ceiling=panel(top.x,0.0,3.5,.4)*panel(top.z,-1.0,3.0,.4)*smoothstep(.0,.15,d.y);
      float ribbon=panel(front.x+front.y*.45,-.4,.65,.5)*panel(front.y,-1.0,2.6,.8)*smoothstep(.0,.15,d.z);
      float light=upper*.85+side*.65+opposite*.45+ceiling*.75;
      float wall=.12+.12*exp(-pow((back.y+1.0)/1.7,2.0))+.08*exp(-pow((back.x-1.0)/2.0,2.0));
      float base=mix(.12,wall,smoothstep(.0,.25,-d.z));
      base=mix(base,.28,smoothstep(.25,.65,-d.y));
      return vec3(base*.93,base*.96,base*1.08)
        +light*vec3(.94,1.0,1.06)+ribbon*vec3(1.4,1.45,1.55);
    }
    float crystalDistance(vec3 p) {
      vec3 q = abs(p)-vec3(0.39);
      return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-0.10;
    }
    vec3 crystalNormal(vec3 p) {
      // Analytic rounded-box normal, continuous across optical bevels.
      vec3 q = abs(p)-vec3(0.39);
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
      vec3 incident = normalize(opticalDirection);
      vec3 local=(opticalInverse[opticalIndex]*vec4(opticalPosition,1.0)).xyz;
      vec3 localNormal=crystalNormal(local);
      vec3 n = normalize(mat3(opticalWorld[opticalIndex])*localNormal);
      float f0=pow((indexOfRefraction-1.0)/(indexOfRefraction+1.0),2.0);
      float cosEntry=max(dot(-incident,n),0.0);
      float entryScalar=f0+(1.0-f0)*pow(1.0-cosEntry,5.0);
      vec3 film=evalIridescence(1.0,1.34,cosEntry,380.0+160.0*cosEntry,vec3(f0));
      vec3 normalSize=abs(localNormal);
      float bevel=1.0-smoothstep(.92,.998,max(normalSize.x,max(normalSize.y,normalSize.z)));
      vec3 entryFresnel=clamp(mix(vec3(entryScalar),film,.65*bevel),0.0,1.0);
      vec3 colour = studioRadiance(reflect(incident,n))*entryFresnel;
      vec3 throughput = vec3(1.0)-entryFresnel;
      vec3 direction = normalize(refract(incident,n,1.0/indexOfRefraction));
      vec3 origin = opticalPosition+direction*0.001;
      int medium = opticalIndex;
      for (int bounce=0; bounce<6; bounce++) {
        float nearest = 1000.0;
        int hitIndex = -1;
        vec3 normalAtHit = vec3(0.0);
        for (int block=0; block<27; block++) {
          if(block>=opticalCount) break;
          // Keep each glass block readable: tracing neighbouring blocks creates
          // dense repeated outlines and unstable subpixel colour fringes.
          if(block!=opticalIndex) continue;
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
        if (exiting) throughput *= exp(-nearest*vec3(.065,.055,.035));
        if (dot(nextDirection,nextDirection)<0.001) {
          direction = reflect(direction,facingNormal);
          // Total internal reflection keeps its energy and remains in the block.
          // Continue tracing instead of turning broad glass faces dark.
        } else {
          float fresnel = f0+(1.0-f0)*pow(1.0-max(dot(-direction,facingNormal),0.0),5.0);
          // An internal reflection does not see the studio directly.
          // Reduce this approximation so repeated interfaces do not wash out the glass.
          colour += studioRadiance(reflect(direction,facingNormal))*throughput*fresnel*(exiting ? .3 : 1.0);
          throughput *= 1.0-fresnel;
          direction = normalize(nextDirection);
          medium = exiting ? -1 : hitIndex;
        }
        origin += direction*0.001;
      }
      // A ray still trapped at the budget limit has not reached the environment.
      return colour+vec3(.16,.17,.20)*throughput;
    }
    void main() {
      vec3 redRay = opticalTrace(1.55);
      vec3 greenRay = opticalTrace(1.57);
      vec3 blueRay = opticalTrace(1.59);
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
    moveLight(angle) {
      common.opticalLightAngle.value=angle;
    },
    update(blocks, camera) {
      camera.getWorldDirection(common.opticalDirection.value);
      blocks.forEach((block,index) => {
        transforms[index].copy(block.matrixWorld);
        inverses[index].copy(block.matrixWorld).invert();
      });
    },
  };
}
