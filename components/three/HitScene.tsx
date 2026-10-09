"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ball, Bat } from "./props";
import { Batsman, type BatsmanHandle } from "./Batsman";

export const BALL_SCALE = 2.2;
const G = 9.8;
const PIVOT_Y = 0.98;
const BALL_Y = 0.36;
const START_X = 1.5;
const DELIVERY = 3.0; // m/s: slowed down so the eye can follow the ball in
const TIME_SCALE = 0.7; // the whole replay runs in gentle slow motion

// Launch velocity by runs. 1-3 are worked into the gaps, 4 runs along the
// ground, 6 goes over the rope.
export function launch(runs: number) {
  switch (runs) {
    case 1: return new THREE.Vector3(2.8, 1.4, -0.8);
    case 2: return new THREE.Vector3(4.2, 1.8, -1.2);
    case 3: return new THREE.Vector3(5.4, 2.0, -1.6);
    case 4: return new THREE.Vector3(10, 0.5, -3.2);
    case 5: return new THREE.Vector3(8, 3.4, -2.6);
    case 6: return new THREE.Vector3(6.2, 7.2, -3.4);
    default: return new THREE.Vector3(0.5, 0.5, 0);
  }
}

const ease = (k: number) => k * k * (3 - 2 * k);

/** A batter's-eye replay: the ball is bowled in, the bat comes through and
 *  sends it away. Each delivery is one deterministic timeline driven by an
 *  accumulated clock, so the swing and the ball always agree. */
export function Hit({
  runs,
  loop = false,
  period = 4.2,
}: {
  runs: number;
  loop?: boolean;
  period?: number;
}) {
  const ball = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const man = useRef<BatsmanHandle>(null);
  const v = useRef(new THREE.Vector3(-DELIVERY, 0, 0));
  const struck = useRef(false);
  const clock = useRef(0);
  const out = useMemo(() => launch(runs), [runs]);

  const reset = () => {
    clock.current = 0;
    struck.current = false;
    if (ball.current) {
      ball.current.position.set(START_X, BALL_Y, 0);
      ball.current.rotation.set(0, 0, 0);
    }
    v.current.set(-DELIVERY, 0, 0);
  };

  const step = (dt: number) => {
    const b = ball.current;
    const p = pivot.current;
    if (!b || !p) return;
    clock.current += dt;
    const t = clock.current;

    // Backlift -> through the ball -> follow through -> rest.
    const swing = ease(Math.min(1, Math.max(0, (t - 0.34) / 0.32)));
    const rest = ease(Math.min(1, Math.max(0, (t - 2.1) / 1.0)));
    p.rotation.z = -1.0 + 1.9 * swing - 1.1 * rest;
    // The hands travel with the shot, crossing x = 0 exactly as the bat
    // reaches the ball, which is where the contact is timed.
    const rho = (p.rotation.z + 1) / 1.9;
    p.position.set(0.45 * (rho - 0.526), PIVOT_Y, 0);
    man.current?.update({ theta: p.rotation.z, pivot: p.position, rho });

    if (!struck.current && b.position.x <= 0.17) {
      struck.current = true;
      v.current.copy(out);
    }
    if (struck.current) v.current.y -= G * dt;
    b.position.addScaledVector(v.current, dt);
    b.rotation.z -= (struck.current ? 26 : 10) * dt;
    b.rotation.x += 5 * dt;
    if (b.position.y < 0.08 && v.current.y < 0) {
      b.position.y = 0.08;
      v.current.y *= -0.45;
      v.current.x *= 0.9;
    }

    if (loop && t > period) reset();
  };

  useFrame((_, rawDt) => {
    step(Math.min(rawDt, 1 / 30) * TIME_SCALE);
  });

  return (
    <>
      <Batsman ref={man} />
      {/* bat: toe down, pivoting from the top of the handle */}
      <group ref={pivot} position={[0, PIVOT_Y, 0]}>
        <group position={[0, -0.96, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <Bat scale={[1.5, 1, 1.5]} />
        </group>
      </group>
      <Ball ref={ball} scale={BALL_SCALE} position={[START_X, BALL_Y, 0]} />
    </>
  );
}
