"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "./Stage";
import { Hit } from "./HitScene";
import { useReducedMotion } from "./useReducedMotion";

// The loop cycles through shots so the hero never plays the same one twice
// in a row. The delivery count is the only state; the scene remounts the
// timeline when it changes.
const SHOTS = [6, 4, 2, 6, 1, 4];
const CAMERA = { position: [1.0, 1.05, 4.4] as [number, number, number], fov: 32 };

function Camera() {
  const look = useRef(new THREE.Vector3(0.0, 0.8, 0));
  useFrame(({ camera, pointer }) => {
    // Gentle parallax: the camera drifts a little with the pointer.
    const x = 1.0 + pointer.x * 0.25;
    const y = 1.05 + pointer.y * 0.06;
    camera.position.x += (x - camera.position.x) * 0.06;
    camera.position.y += (y - camera.position.y) * 0.06;
    camera.position.z = 4.4;
    camera.lookAt(look.current);
  });
  return null;
}

export default function HeroScene({ fallback }: { fallback: React.ReactNode }) {
  const [n, setN] = useState(0);
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  // Reduced motion or no WebGL: the static art, and no "tap" promise.
  if (reduced || failed) return <>{fallback}</>;
  return (
    <div className="gc-hero-art gc-hero-3d">
      <div className="gc-hero-stage" onPointerDown={() => setN((v) => v + 1)}>
        <Stage
          fallback={fallback}
          onFail={() => setFailed(true)}
          camera={CAMERA}
          dpr={[1, 1.5]}
          shadowSize={1024}
        >
          <Camera />
          <Hit key={n} runs={SHOTS[n % SHOTS.length]} loop period={4.6} />
        </Stage>
      </div>
      <span className="gc-hero-hint">Tap for another ball</span>
    </div>
  );
}
