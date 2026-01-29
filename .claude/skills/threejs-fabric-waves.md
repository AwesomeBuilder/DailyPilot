---
name: threejs-fabric-waves
description: Use when user wants flowing fabric/ribbon-like translucent waves (procedural shader deformation) in Three.js or React Three Fiber.
---

# Three.js Fabric / Ribbon Waves (Shader Deformation)

## Quick Start (React Three Fiber)
- Use a subdivided PlaneGeometry (e.g. 200x60 segments)
- Use ShaderMaterial with:
  - vertex displacement based on time + position
  - fragment gradient color + translucent alpha
- Animate via `useFrame` updating `uTime`
- Layer 2–3 ribbons with slight offsets for depth

## Minimal Example Structure
- `<Canvas>` full width/height, orthographic or mild perspective
- `<mesh>` with plane geometry
- `uniforms: { uTime, uColorA, uColorB, uOpacity }`
- Enable transparency and disable depthWrite for clean overlaps:
  - `transparent: true`
  - `depthWrite: false`
  - `side: DoubleSide`

## Vertex Displacement Pattern
- Displace along Y and Z with multiple sines for organic flow:
  - `float w1 = sin(pos.x * freq1 + uTime * speed1);`
  - `float w2 = sin(pos.x * freq2 - uTime * speed2 + pos.y * phase);`
  - `pos.z += (w1 * amp1 + w2 * amp2);`
  - `pos.y += sin(uTime + pos.x * smallFreq) * smallAmp;`

## Fragment Look (Teal Glass)
- Use UV-based gradient (left->right or top->bottom):
  - `vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vUv.x));`
- Add soft highlight band:
  - `float hl = smoothstep(a, b, sin(vUv.x*PI + uTime*0.2));`
  - `col += hl * 0.08;`
- Alpha falloff near edges for ribbon-like softness:
  - `float edge = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));`
  - `alpha = uOpacity * edge;`

## Layering & Render Order
- Use 2–3 meshes with:
  - slight z offsets (e.g. 0.02)
  - different phase offsets (uniform uPhase)
  - different opacity (0.25–0.6)
- Set `renderOrder` to control overlap

## Performance Notes
- Geometry subdivisions matter: start 200x60, adjust
- Prefer GPU deformation over per-vertex CPU updates
- Avoid heavy postprocessing initially; add bloom later if needed

