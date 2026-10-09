"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Stage } from "./Stage";
import { Hit } from "./HitScene";
import { Ball, Stumps, type StumpRefs } from "./props";
import { useReducedMotion } from "./useReducedMotion";

const BALL_SCALE = 2.2;
const G = 9.8;
const CAMERA = { position: [1, 0.6, 2] as [number, number, number], fov: 38 };
const RUNS_CAM: [number, number, number] = [1.2, 0.78, 2.15];
const RUNS_LOOK: [number, number, number] = [0.5, 0.52, 0];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Camera({ at, look }: { at: [number, number, number]; look: [number, number, number] }) {
  useFrame(({ camera }) => {
    camera.position.set(...at);
    camera.lookAt(...look);
  });
  return null;
}

/* ---- Bowled: ball hits the stumps, everything flies --------------- */

function Bowled() {
  const ball = useRef<THREE.Group>(null);
  const parts = useRef<StumpRefs>({ stumps: [], bails: [] });
  const broken = useRef(false);
  const bv = useRef(new THREE.Vector3(0.05, 0.1, -10));
  const sv = useRef<{ v: THREE.Vector3; fall: number }[]>([]);
  const lv = useRef<{ v: THREE.Vector3; w: THREE.Vector3 }[]>([]);

  const step = (dt: number) => {
    const b = ball.current;
    if (!b) return;
    b.position.addScaledVector(bv.current, dt);
    bv.current.y -= G * dt * 0.4;
    b.rotation.x -= 18 * dt;
    if (b.position.y < 0.08 && bv.current.y < 0) {
      b.position.y = 0.08;
      bv.current.y *= -0.35;
      bv.current.x *= 0.85;
      bv.current.z *= 0.85;
    }

    if (!broken.current && b.position.z <= 0.1) {
      broken.current = true;
      bv.current.set(rand(-0.6, 0.6), 1.2, -3.2);
      sv.current = parts.current.stumps.map(() => ({
        v: new THREE.Vector3(rand(-0.6, 0.6), rand(0.2, 1), rand(-2.4, -1.2)),
        fall: rand(2.2, 4),
      }));
      lv.current = parts.current.bails.map((_, i) => ({
        v: new THREE.Vector3(i ? 1.1 : -1.1, rand(2.6, 3.4), rand(-2.4, -1)),
        w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
      }));
    }
    if (!broken.current) return;

    parts.current.stumps.forEach((s, i) => {
      const st = sv.current[i];
      if (!s || !st) return;
      s.position.addScaledVector(st.v, dt);
      st.v.multiplyScalar(1 - 1.6 * dt);
      s.rotation.x = Math.max(-1.45, s.rotation.x - st.fall * dt);
    });
    parts.current.bails.forEach((m, i) => {
      const l = lv.current[i];
      if (!m || !l) return;
      l.v.y -= G * dt;
      m.position.addScaledVector(l.v, dt);
      m.rotation.x += l.w.x * dt;
      m.rotation.y += l.w.y * dt;
      m.rotation.z += l.w.z * dt;
      if (m.position.y < 0.01) {
        m.position.y = 0.01;
        l.v.y *= -0.3;
        l.v.x *= 0.7;
        l.v.z *= 0.7;
        l.w.multiplyScalar(0.6);
      }
    });
  };

  useFrame((_, rawDt) => {
    step(Math.min(rawDt, 1 / 30));
  });

  return (
    <>
      <Camera at={[0.5, 0.55, 1.45]} look={[0, 0.36, 0]} />
      <Stumps refs={parts} />
      <Ball ref={ball} scale={BALL_SCALE} position={[0.02, 0.42, 4.2]} />
    </>
  );
}

export default function ResultScene({
  kind,
  runs,
  fallback,
  onFail,
}: {
  kind: "out" | "runs";
  runs: number;
  fallback: React.ReactNode;
  onFail?: () => void;
}) {
  const reduced = useReducedMotion();
  // Reduced motion: no replay, the verdict card already says what happened.
  if (reduced) return <>{fallback}</>;
  return (
    <Stage
      fallback={fallback}
      onFail={onFail}
      camera={CAMERA}
      dpr={[1, 1.5]}
      shadowSize={1024}
    >
      {kind === "out" ? (
        <Bowled />
      ) : (
        <>
          <Camera at={RUNS_CAM} look={RUNS_LOOK} />
          <Hit runs={runs} />
        </>
      )}
    </Stage>
  );
}
