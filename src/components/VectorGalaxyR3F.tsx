import { useEffect, useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface EmbeddingNode {
  id: string;
  pos: [number, number, number];
  cluster: number;
}

interface VectorGalaxyR3FProps {
  embeddings: EmbeddingNode[];
  queryId: string | null;
}

const vertexShader = `
  attribute float aSize;
  attribute float aCluster;
  attribute float aIsResult;
  uniform float uTime;
  uniform float uPulseRadius;
  uniform vec3 uQueryPos;
  varying float vCluster;
  varying float vSonar;
  varying float vIsResult;

  void main() {
    vCluster = aCluster;
    vIsResult = aIsResult;
    vec3 pos = position;
    float drift = sin(uTime * 0.5 + aCluster * 1.7) * 0.05;
    pos.x += drift;
    pos.y += cos(uTime * 0.4 + aCluster * 2.1) * 0.05;
    float distFromQuery = length(pos - uQueryPos);
    float pulseBand = smoothstep(uPulseRadius - 0.2, uPulseRadius, distFromQuery)
                    - smoothstep(uPulseRadius, uPulseRadius + 0.2, distFromQuery);
    pos += normalize(pos - uQueryPos) * pulseBand * 0.3;
    vSonar = pulseBand;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (300.0 / -mvPosition.z) * (1.0 + vSonar * 2.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying float vCluster;
  varying float vSonar;
  varying float vIsResult;
  uniform float uTime;

  vec3 palette(float t) {
    vec3 colors[8] = vec3[8](
      vec3(0.0, 0.85, 1.0), vec3(1.0, 0.2, 0.6), vec3(0.3, 1.0, 0.5),
      vec3(1.0, 0.7, 0.0), vec3(0.7, 0.3, 1.0), vec3(1.0, 0.4, 0.2),
      vec3(0.2, 0.6, 1.0), vec3(1.0, 1.0, 0.3)
    );
    int idx = int(mod(t, 8.0));
    return colors[idx];
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.3, 0.5, r);
    vec3 color = palette(vCluster);
    color = mix(color, vec3(1.0), vIsResult * 0.6);
    color += vec3(vSonar * 0.8);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

export default function VectorGalaxyR3F({ embeddings, queryId }: VectorGalaxyR3FProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulseRadius: { value: 0 },
      uQueryPos: { value: new THREE.Vector3(0, 0, 0) },
    }),
    []
  );

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(embeddings.length * 3);
    const sizes = new Float32Array(embeddings.length);
    const clusters = new Float32Array(embeddings.length);
    const isResult = new Float32Array(embeddings.length);

    embeddings.forEach((node, i) => {
      positions[i * 3] = node.pos[0];
      positions[i * 3 + 1] = node.pos[1];
      positions[i * 3 + 2] = node.pos[2];
      sizes[i] = node.id === queryId ? 6.0 : Math.random() * 2 + 1;
      clusters[i] = node.cluster;
      isResult[i] = node.id === queryId ? 1.0 : 0.0;
    });

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aCluster", new THREE.BufferAttribute(clusters, 1));
    geo.setAttribute("aIsResult", new THREE.BufferAttribute(isResult, 1));
    return geo;
  }, [embeddings, queryId]);

  useEffect(() => {
    if (!queryId) return;
    const target = embeddings.find((e) => e.id === queryId);
    if (!target) return;
    
    uniforms.uQueryPos.value.set(target.pos[0], target.pos[1], target.pos[2]);
    uniforms.uPulseRadius.value = 0; // Reset sonar

    let raf = 0;
    const start = camera.position.clone();
    const end = new THREE.Vector3(
      target.pos[0] * 0.7,
      target.pos[1] * 0.7,
      target.pos[2] * 0.7 + 4
    );
    const startTime = performance.now();
    const duration = 1200;
    
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const e = 1 - Math.pow(1 - t, 3); // Ease out cubic
      
      camera.position.lerpVectors(start, end, e);
      camera.lookAt(target.pos[0], target.pos[1], target.pos[2]);

      // Expand sonar pulse
      const pulseT = Math.min(1, elapsed / 1500);
      uniforms.uPulseRadius.value = pulseT * 8.0;

      if (t < 1 || pulseT < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [queryId, embeddings, camera, uniforms]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
