export const coreVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uPulse;
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  void main(){
    vNormal = normalize(normalMatrix * normal);
    float n = snoise(normal * 2.2 + uTime * 0.35);
    float disp = n * 0.18 + uPulse * 0.12;
    vec3 p = position + normal * disp;
    vPos = (modelViewMatrix * vec4(p,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
  }
`;

export const coreFragment = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  void main(){
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vPos);
    float fres = pow(1.0 - max(dot(n,v), 0.0), 3.0);
    float scan = 0.5 + 0.5*sin(vPos.y*8.0 - uTime*2.5);
    vec3 col = mix(uColorA, uColorB, fres + 0.2*sin(uTime*0.7));
    col += fres * 0.9 + scan*0.08 + uPulse*0.25;
    gl_FragColor = vec4(col, 0.95);
  }
`;

// Nebula now samples a pre-generated low-res noise texture instead of per-fragment FBM.
// 3 layered samples with slow UV offsets preserve purple/blue/pink depth and breathing.
export const nebulaVertex = /* glsl */`
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform sampler2D uNoiseTex;
  varying float vAlpha;
  varying vec3 vColor;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  void main(){
    vec3 p = position;
    float t = uTime * 0.06 + aSeed * 6.2831;
    // slow breathing/flow offsets (no FBM)
    p.x += sin(t + position.y*0.22)*0.16;
    p.z += cos(t*0.85 + position.x*0.18)*0.16;
    p.y += sin(t*0.6 + position.z*0.15)*0.08;
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = aSize * uPixelRatio * (24.0 / max(dist, 1.0));
    // texture-sampled modulation for depth/breathing (3 samples, cheap)
    vec2 uv = p.xz * 0.045 + vec2(uTime*0.012, uTime*0.008);
    float n1 = texture2D(uNoiseTex, uv + aSeed).r;
    float n2 = texture2D(uNoiseTex, uv*1.7 - vec2(uTime*0.01, 0.0) + aSeed*0.37).g;
    float n3 = texture2D(uNoiseTex, uv*0.6 + vec2(0.0, uTime*0.007)).b;
    float dens = n1*0.5 + n2*0.3 + n3*0.2;
    float breath = 0.75 + 0.25*sin(uTime*0.35 + aSeed*6.2831);
    vAlpha = smoothstep(18.0, 2.5, dist) * (0.35 + 0.65*dens) * breath;
    // preserve purple, blue, pink gradient
    vec3 c1 = mix(uColorA, uColorB, n2);
    vColor = mix(c1, uColorC, n3*0.7);
  }
`;

export const nebulaFragment = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.06, d) * vAlpha;
    if(a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// Post-processing: chromatic aberration, halation, grain (texture), scanlines, vignette, radial warp.
// Optimized: fewer samples; grain via low-cost noise texture lookup (no animated heavy math);
// warp uniforms gated so when warp<=0 the shader skips warp math.
export const postVertex = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

export const postFragment = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tNoise;
  uniform float uTime;
  uniform float uWarp;      // 0 = off
  uniform float uHue;
  uniform float uCA;        // chromatic aberration amount
  uniform vec2 uResolution;
  varying vec2 vUv;

  vec3 hueShift(vec3 color, float hue){
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosA = cos(hue);
    return color * cosA + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosA);
  }

  void main(){
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Radial warp (skipped when off)
    if (uWarp > 0.001) {
      float w = uWarp * dist * dist;
      uv = uv + normalize(center + 1e-5) * w;
    }

    // Chromatic aberration (2 extra samples) - scaled by uCA
    float ca = uCA * (0.002 + dist * 0.004);
    vec2 dir = normalize(center + 1e-5) * ca;
    float r = texture2D(tDiffuse, uv + dir).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - dir).b;
    vec3 col = vec3(r,g,b);

    // Halation (cheap single-tap bloom-ish glow around brights)
    float luma = dot(col, vec3(0.299,0.587,0.114));
    float halo = smoothstep(0.55, 1.0, luma) * 0.18;
    col += col * halo;

    // Hue shift
    if (abs(uHue) > 0.001) col = hueShift(col, uHue);

    // Scanlines (very cheap)
    float scan = 0.985 + 0.015 * sin(vUv.y * uResolution.y * 1.2);
    col *= scan;

    // Grain via low-cost noise texture (pre-generated, no animated heavy math)
    vec2 nUv = vUv * (uResolution / 256.0) + vec2(uTime * 0.07, uTime * 0.11);
    float grain = texture2D(tNoise, nUv).r - 0.5;
    col += grain * 0.045;

    // Vignette
    float vig = smoothstep(0.85, 0.25, dist);
    col *= mix(0.78, 1.0, vig);

    gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
  }
`;
