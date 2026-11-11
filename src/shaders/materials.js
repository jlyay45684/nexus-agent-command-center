export const coreVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uPulse;
  // simplex-ish noise
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

export const nebulaVertex = /* glsl */`
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying vec3 vColor;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  void main(){
    vec3 p = position;
    float t = uTime * 0.08 + aSeed * 6.2831;
    p.x += sin(t + position.y*0.3)*0.12;
    p.z += cos(t*0.9 + position.x*0.25)*0.12;
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = aSize * uPixelRatio * (22.0 / max(dist, 1.0));
    vAlpha = smoothstep(18.0, 2.0, dist) * (0.55 + 0.45*sin(aSeed*12.0 + uTime*0.6));
    vColor = mix(uColorA, uColorB, fract(aSeed*3.17));
  }
`;

export const nebulaFragment = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if(a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;
