import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { invoke } from '@tauri-apps/api/core';
import { usePersonaStore } from '../store/personaStore';

interface GalaxyChunk {
  id: string;
  content: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
}

function InstancedStars({ chunks, onHover, accentColor }: { chunks: GalaxyChunk[], onHover: (id: string | null) => void, accentColor: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.5, 8, 8), []);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Set positions
  useEffect(() => {
    if (meshRef.current) {
      chunks.forEach((chunk, i) => {
        dummy.position.set(chunk.pos_x, chunk.pos_y, chunk.pos_z);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [chunks, dummy]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001; // Slow galaxy rotation
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, chunks.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && chunks[e.instanceId]) {
          onHover(chunks[e.instanceId].id);
        }
      }}
      onPointerOut={() => onHover(null)}
    >
      <meshBasicMaterial color={accentColor} transparent opacity={0.8} />
    </instancedMesh>
  );
}

export function VectorGalaxy({ agentId }: { agentId: string }) {
  const [chunks, setChunks] = useState<GalaxyChunk[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activePersonaId = usePersonaStore((state) => state.activePersonaId);
  const [accentColor, setAccentColor] = useState('#00E5FF');

  useEffect(() => {
    const timer = setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      setAccentColor(style.getPropertyValue('--forge-accent').trim() || '#00E5FF');
    }, 100);
    return () => clearTimeout(timer);
  }, [activePersonaId]);

  useEffect(() => {
    invoke<GalaxyChunk[]>('get_galaxy_chunks', { agentId }).then(setChunks).catch(console.error);
  }, [agentId]);

  const hoveredChunk = chunks.find(c => c.id === hoveredId);

  return (
    <div className="relative w-full h-full min-h-[400px] bg-forge-bg rounded-lg border border-forge-border overflow-hidden group">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <span className="text-xs font-bold tracking-widest text-forge-accent uppercase">Vector Galaxy Map</span>
        <div className="text-[10px] text-forge-text-muted mt-1">{chunks.length} Semantic Nodes</div>
      </div>
      
      <Canvas camera={{ position: [0, 50, 100], fov: 60 }}>
        <color attach="background" args={['#050505']} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={1} color={accentColor} />
        <pointLight position={[-10, -10, -10]} intensity={1} color={accentColor} />
        
        {chunks.length > 0 && <InstancedStars chunks={chunks} onHover={setHoveredId} accentColor={accentColor} />}
        <OrbitControls enableDamping dampingFactor={0.05} autoRotate autoRotateSpeed={0.5} />
      </Canvas>

      {hoveredChunk && (
        <div className="absolute bottom-4 left-4 right-4 z-10 p-3 bg-forge-surface-2/90 backdrop-blur-md border border-forge-accent/30 rounded shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
          <div className="text-[10px] text-forge-accent font-bold tracking-widest mb-1 uppercase">Node ID: {hoveredChunk.id.split('-')[0]}</div>
          <div className="text-xs text-forge-text line-clamp-3">{hoveredChunk.content}</div>
        </div>
      )}
    </div>
  );
}
