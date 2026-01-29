import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Vertex shader for ONE wide fabric with internal folds
const fabricVertexShader = `
  uniform float uTime;
  uniform float uIsActive;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vFoldDepth;
  varying float vCrease;
  varying float vLayerDensity;  // How many layers of fabric (affects opacity)

  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;

    // Animation intensity based on mic active state
    float activeMultiplier = mix(0.15, 1.0, uIsActive);  // Much slower when inactive
    float windSpeed = mix(0.3, 1.2, uIsActive);  // Wind speed multiplier
    // Start with a time offset so initial state looks good
    float t = (uTime + 2.5) * windSpeed;

    // Position along the fabric (x = along flow, y = across width)
    float x = position.x;
    float y = position.y;

    // === PINCH/GATHER EFFECT ===
    // Fabric pinches together off-center to the right, spreads at edges
    float pinchCenter = 0.8;  // x position of pinch point
    float distFromPinch = abs(x - pinchCenter);
    float pinchFactor = smoothstep(0.0, 1.8, distFromPinch);  // 0 at pinch, 1 at edges

    // Asymmetric width: narrower on left, wider on right
    float leftRightBias = smoothstep(-3.0, 3.0, x);  // 0 on far left, 1 on far right
    float widthScale = mix(0.45, 1.0, leftRightBias);  // Left side is 45% width, right is full

    // Cinch compression - minimum 0.12 to avoid sharp point, folds look gathered not pinched to a point
    float cinchCompression = 0.12 + pinchFactor * 0.88;
    float gatherY = y * cinchCompression * widthScale;

    // Main flow path - more HORIZONTAL, gentle wave
    float sCurve = sin(x * 0.5) * 0.35;  // Much reduced S-curve for horizontal flow
    // Wind ripple effect - stronger when active
    float windRipple = sin(x * 0.8 + t * 0.8) * 0.12 * activeMultiplier;
    windRipple += sin(x * 1.5 - t * 1.2) * 0.08 * activeMultiplier;
    sCurve += windRipple;

    // === FLOWING FOLDS - sheer but with visible layering ===
    float foldStrength = 1.0 + (1.0 - pinchFactor) * 0.5;  // More folds at pinch

    // Primary folds - flowing with good amplitude
    float foldSpeed = mix(0.15, 0.5, uIsActive);
    float fold1 = sin(gatherY * 5.0 + x * 0.9 + t * foldSpeed) * 0.4 * foldStrength;
    float fold2 = sin(gatherY * 7.0 - x * 0.5 + t * foldSpeed * 0.85) * 0.28 * foldStrength;
    float fold3 = sin(gatherY * 10.0 + x * 1.3 - t * foldSpeed * 1.3) * 0.15;

    // Creases create the dark gathered areas
    float crease1 = sin(gatherY * 5.0 + x * 0.9 + t * foldSpeed);
    float crease2 = sin(gatherY * 7.0 - x * 0.5 + t * foldSpeed * 0.85);

    // Combine folds
    float totalFold = fold1 + fold2 + fold3;

    // Crease factor - moderate transitions for visible folds
    float valleyDark1 = smoothstep(-1.0, 0.6, crease1);  // 0 in valleys, 1 on peaks
    float valleyDark2 = smoothstep(-1.0, 0.6, crease2);
    vCrease = valleyDark1 * valleyDark2;  // Dark where both are in valleys

    // Organic noise for natural fabric movement - more pronounced when active (wind blowing)
    float noiseSpeed = mix(0.15, 0.5, uIsActive);  // Faster noise animation when active
    float noiseAmp = mix(0.1, 0.3, uIsActive);  // Stronger movement when active
    float noise1 = snoise(vec3(x * 0.6, y * 0.5, t * noiseSpeed)) * noiseAmp;
    float noise2 = snoise(vec3(x * 1.2, y * 0.8, t * noiseSpeed * 1.3 + 5.0)) * noiseAmp * 0.5;

    // Z-depth variation (some parts come forward, others recede)
    float zDepth = totalFold * 0.8 + (1.0 - vCrease) * 0.3 + noise1 * 0.4;

    // Twist along the flow - more movement when active
    float twistSpeed = mix(0.08, 0.25, uIsActive);
    float twist = sin(x * 0.5 + t * twistSpeed) * 0.25;
    float twistedY = y + twist * 0.3;

    // Edge fold effect - fabric curls/gathers at top and bottom edges
    // Use original y (not gatherY) so edges are visible even at cinch
    float edgeY = abs(y) / 2.0;  // 0 at center, 1 at edges (based on original position)
    float edgeFold = smoothstep(0.5, 1.0, edgeY) * sin(x * 3.0 + t * 0.2) * 0.18;
    float edgeCurl = smoothstep(0.6, 1.0, edgeY) * 0.25;  // Edges curl forward

    // At cinch point, add extra edge spread so it doesn't collapse to a point
    float cinchEdgeBoost = (1.0 - pinchFactor) * edgeY * 0.15;

    // Final position - use gatherY for pinched effect
    vec3 newPosition;
    newPosition.x = x + noise2 * 0.1;
    // Add cinchEdgeBoost to keep edges slightly spread at cinch
    newPosition.y = sCurve + gatherY * 0.9 + totalFold * 0.12 + edgeFold + sign(y) * cinchEdgeBoost;
    newPosition.z = zDepth + noise2 * 0.2 + edgeCurl;  // Edges come forward (curl)

    // Store fold depth for coloring - include edge info for visible border
    float edgeIntensity = smoothstep(0.85, 1.0, edgeY);  // Strong at very edge
    vFoldDepth = totalFold + noise1 + edgeIntensity * 0.5;  // Edges register as "folded"

    // Calculate layer density - more layers where fabric overlaps/gathers
    float cinchDensity = (1.0 - pinchFactor) * 0.8;  // Higher at cinch point
    float foldDensity = abs(totalFold) * 0.7;  // Where folded
    float creaseDensity = (1.0 - vCrease) * 0.5;  // In crease valleys
    float gatherDensity = (1.0 - widthScale) * 0.4;  // On narrower left side
    vLayerDensity = clamp(cinchDensity + foldDensity + creaseDensity + gatherDensity, 0.0, 1.0);

    // Calculate normal based on fold gradients (using gatherY)
    float foldGradY = cos(gatherY * 5.0 + x * 0.9 + t * foldSpeed) * 5.0 * 0.4 * foldStrength
                    + cos(gatherY * 7.0 - x * 0.5 + t * foldSpeed * 0.85) * 7.0 * 0.28 * foldStrength
                    + cos(gatherY * 10.0 + x * 1.3 - t * foldSpeed * 1.3) * 10.0 * 0.15;

    float foldGradX = cos(gatherY * 5.0 + x * 0.9 + t * foldSpeed) * 0.9 * 0.4
                    - cos(gatherY * 7.0 - x * 0.5 + t * foldSpeed * 0.85) * 0.5 * 0.28
                    + cos(gatherY * 10.0 + x * 1.3 - t * foldSpeed * 1.3) * 1.3 * 0.15;

    vec3 computedNormal = normalize(vec3(-foldGradX * 0.3, -foldGradY * 0.15, 1.0));

    // Add noise to normal for fabric texture
    computedNormal += vec3(
      snoise(vec3(uv * 15.0, t * noiseSpeed * 0.3)) * 0.08,
      snoise(vec3(uv * 15.0 + 50.0, t * noiseSpeed * 0.3)) * 0.08,
      0.0
    );

    vNormal = normalize(normalMatrix * computedNormal);
    vWorldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

// Fragment shader with fold-based coloring
const fabricFragmentShader = `
  uniform float uTime;
  uniform float uIsActive;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vFoldDepth;
  varying float vCrease;
  varying float vLayerDensity;  // How many layers of fabric (affects opacity)

  // Simple hash for grainy texture
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);

    // Soft lighting
    vec3 lightDir1 = normalize(vec3(1.0, 0.8, 1.5));
    vec3 lightDir2 = normalize(vec3(-0.5, 1.0, 0.8));
    float diffuse1 = max(dot(normal, lightDir1), 0.0);
    float diffuse2 = max(dot(normal, lightDir2), 0.0) * 0.35;
    float lighting = diffuse1 * 0.5 + diffuse2 + 0.55;

    // SHEER FABRIC COLOR PALETTE
    vec3 colorPale = vec3(0.78, 0.96, 0.93);      // Pale mint (thin areas)
    vec3 colorLight = vec3(0.50, 0.88, 0.82);     // Light teal
    vec3 colorMid = vec3(0.22, 0.70, 0.64);       // Medium teal (layered)
    vec3 colorDark = vec3(0.08, 0.50, 0.45);      // Dark teal (gathered)
    vec3 colorDeep = vec3(0.04, 0.35, 0.32);      // Deep teal (dense overlap)

    // Layer factor drives the color - more layers = darker
    float layerFactor = vLayerDensity;
    float creaseFactor = (1.0 - vCrease);
    float colorFactor = layerFactor * 0.6 + creaseFactor * 0.5;
    colorFactor = clamp(colorFactor, 0.0, 1.0);

    // Multi-stop gradient with good contrast
    vec3 baseColor;
    if (colorFactor < 0.2) {
      baseColor = mix(colorPale, colorLight, colorFactor / 0.2);
    } else if (colorFactor < 0.4) {
      baseColor = mix(colorLight, colorMid, (colorFactor - 0.2) / 0.2);
    } else if (colorFactor < 0.7) {
      baseColor = mix(colorMid, colorDark, (colorFactor - 0.4) / 0.3);
    } else {
      baseColor = mix(colorDark, colorDeep, (colorFactor - 0.7) / 0.3);
    }

    // Apply lighting
    baseColor *= lighting;

    // GRAINY texture instead of lines (like georgette)
    float grain = hash(vUv * 800.0) * 0.06 - 0.03;  // Fine grain
    float grain2 = hash(vUv * 400.0 + 100.0) * 0.04 - 0.02;  // Coarser grain layer
    baseColor += grain + grain2;

    // Visible edge for twist - darken the Y edges to show fabric border
    float edgeY = abs(vUv.y - 0.5) * 2.0;  // 0 at center, 1 at edges
    float edgeLine = smoothstep(0.88, 0.98, edgeY);  // Visible border at edge
    baseColor *= (1.0 - edgeLine * 0.4);  // Darken edge to show twist

    // X edge fade (only horizontal edges fade)
    float edgeFadeX = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);

    // MORE SHEER transparency - lower base alpha
    float baseAlpha = mix(0.32, 0.88, pow(colorFactor, 1.3));
    // Y edges should be visible (not fade out) to show the twist
    float edgeFadeY = 1.0 - smoothstep(0.92, 1.0, edgeY) * 0.3;  // Slight fade at very edge
    float alpha = baseAlpha * edgeFadeX * edgeFadeY;

    gl_FragColor = vec4(baseColor, alpha);
  }
`;

const FabricMesh: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIsActive: { value: isActive ? 1.0 : 0.0 }
  }), []);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      const targetActive = isActive ? 1.0 : 0.0;
      material.uniforms.uIsActive.value += (targetActive - material.uniforms.uIsActive.value) * 0.03;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[0, 0, 0]}>
      {/* Wide fabric: 6 units long, 4 units tall (fills more of view), high detail */}
      <planeGeometry args={[6, 4, 300, 200]} />
      <shaderMaterial
        vertexShader={fabricVertexShader}
        fragmentShader={fabricFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

const PixelRatioSetter: React.FC = () => {
  const { gl } = useThree();
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  }, [gl]);
  return null;
};

interface Props {
  isActive: boolean;
}

export const FabricWave3D: React.FC<Props> = ({ isActive }) => {
  const [pixelRatio, setPixelRatio] = useState(2);

  useEffect(() => {
    setPixelRatio(Math.min(window.devicePixelRatio || 2, 3));
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
    >
      <Canvas
        key={pixelRatio}
        camera={{
          position: [0, 0, 4],
          fov: 45,
          near: 0.1,
          far: 100
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(pixelRatio);
        }}
        style={{
          background: 'transparent',
          width: '100%',
          height: '100%'
        }}
        dpr={pixelRatio}
      >
        <PixelRatioSetter />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 2, 5]} intensity={0.6} />
        <directionalLight position={[-2, 1, 3]} intensity={0.3} color="#e0f7fa" />
        <FabricMesh isActive={isActive} />
      </Canvas>
    </div>
  );
};
