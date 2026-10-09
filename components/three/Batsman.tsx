"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// A stylised right-handed batsman, built from primitives and posed by two-
// bone IK every frame. The bat's hands are the input: wherever the shot puts
// the grip, the arms reach it; the hips, knees and feet follow the shot.
// Facing +Z (towards the camera), shoulders along X, bowler on the +X side.

const BODY_Z = -0.24; // the body stands behind the bat's swing plane
const UP = new THREE.Vector3(0, 1, 0);

const WHITE = "#efe9dc";
const SKIN = "#b9825a";
const HELMET = "#b81f2a";
const GLOVE = "#c62828";
const BOOT = "#f2efe6";

export type BatsmanPose = {
  /** bat angle about the pivot, radians; the grip sits at the pivot */
  theta: number;
  /** pivot (top hand) world position */
  pivot: THREE.Vector3;
  /** 0 stance .. 1 follow-through */
  rho: number;
};

export type BatsmanHandle = { update: (pose: BatsmanPose) => void };

/** Two-bone IK: elbow/knee position between `a` and `b`, bending toward `pole`. */
function solve(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = b.clone().sub(a);
  let dist = d.length();
  const max = l1 + l2 - 0.001;
  if (dist > max) {
    d.setLength(max);
    dist = max;
  }
  const dir = d.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const end = a.clone().add(dir.clone().multiplyScalar(dist));
  return { mid: a.clone().add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h)), end };
}

/** Stretch a unit-height cylinder between two points. */
function span(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.y = len;
}

function Limb({ r0, r1 = r0, color, refMesh }: {
  r0: number;
  r1?: number;
  color: string;
  refMesh: (m: THREE.Mesh | null) => void;
}) {
  return (
    <mesh ref={refMesh} castShadow>
      <cylinderGeometry args={[r1, r0, 1, 16]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

function Joint({ r, color, refMesh }: { r: number; color: string; refMesh: (m: THREE.Mesh | null) => void }) {
  return (
    <mesh ref={refMesh} castShadow>
      <sphereGeometry args={[r, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

export const Batsman = forwardRef<BatsmanHandle>(function Batsman(_, ref) {
  const torso = useRef<THREE.Group>(null);
  // Mesh handles, filled by ref callbacks and read by update() each frame.
  const [parts] = useState<Record<string, THREE.Object3D | null>>(() => ({}));
  const set = (k: string) => (o: THREE.Object3D | null) => {
    parts[k] = o;
  };

  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      q: new THREE.Vector3(),
    }),
    [],
  );

  useImperativeHandle(ref, () => ({
    update({ theta, pivot, rho }) {
      const g = torso.current;
      if (!g) return;
      const o = parts;

      // --- hips and trunk -------------------------------------------------
      const hx = -0.42 + 0.26 * rho;
      const hipY = 0.9 - 0.05 * Math.sin(rho * Math.PI);
      g.position.set(hx, hipY, BODY_Z);
      g.rotation.order = "YXZ";
      g.rotation.set(0, -0.15 + 0.5 * rho, -(0.18 + 0.2 * rho));
      g.updateMatrixWorld(true);

      const sL = g.localToWorld(new THREE.Vector3(0.2, 0.5, 0)); // front shoulder (bowler side)
      const sR = g.localToWorld(new THREE.Vector3(-0.2, 0.5, 0));

      // --- arms: both hands on the handle --------------------------------
      const dBat = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0);
      const hTop = pivot.clone().addScaledVector(dBat, 0.1);
      const hLow = pivot.clone().addScaledVector(dBat, 0.19);
      const pole = new THREE.Vector3(0.2, -0.5, 1);
      const aL = solve(sL, hTop, 0.29, 0.27, pole);
      const aR = solve(sR, hLow, 0.29, 0.27, pole);
      span(o.uArmL!, sL, aL.mid);
      span(o.fArmL!, aL.mid, aL.end);
      span(o.uArmR!, sR, aR.mid);
      span(o.fArmR!, aR.mid, aR.end);
      o.elbL!.position.copy(aL.mid);
      o.elbR!.position.copy(aR.mid);
      o.gloveL!.position.copy(aL.end);
      o.gloveR!.position.copy(aR.end);

      // --- legs: planted feet, knees forward ------------------------------
      const hipL = g.localToWorld(tmp.p.set(0.1, 0, 0).clone());
      const hipR = g.localToWorld(tmp.q.set(-0.1, 0, 0).clone());
      const footF = new THREE.Vector3(hx + 0.4 + 0.08 * rho, 0.06, BODY_Z + 0.02);
      const footB = new THREE.Vector3(hx - 0.3, 0.06, BODY_Z - 0.02);
      const kolePole = new THREE.Vector3(0.1, 0, 1);
      const lF = solve(hipL, footF, 0.46, 0.46, kolePole);
      const lB = solve(hipR, footB, 0.46, 0.46, kolePole);
      span(o.thighF!, hipL, lF.mid);
      span(o.shinF!, lF.mid, lF.end);
      span(o.thighB!, hipR, lB.mid);
      span(o.shinB!, lB.mid, lB.end);
      o.kneeF!.position.copy(lF.mid);
      o.kneeB!.position.copy(lB.mid);
      // leg pads follow the shins, a touch fatter and set a little forward
      span(o.padF!, lF.mid, lF.end.clone().add(new THREE.Vector3(0, 0.04, 0)));
      span(o.padB!, lB.mid, lB.end.clone().add(new THREE.Vector3(0, 0.04, 0)));
      o.bootF!.position.copy(footF).add(new THREE.Vector3(0.05, -0.01, 0.02));
      o.bootB!.position.copy(footB).add(new THREE.Vector3(0.05, -0.01, 0.02));
    },
  }));

  return (
    <group>
      {/* trunk: everything above the hips lives in this group */}
      <group ref={torso}>
        <mesh position={[0, 0.27, 0]} scale={[1, 1, 0.62]} castShadow>
          <cylinderGeometry args={[0.2, 0.15, 0.56, 24]} />
          <meshStandardMaterial color={WHITE} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.02, 0]} scale={[1, 1, 0.65]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.18, 24]} />
          <meshStandardMaterial color="#e2dccd" roughness={0.9} />
        </mesh>
        {/* shoulders */}
        {[0.2, -0.2].map((x) => (
          <mesh key={x} position={[x, 0.5, 0]} castShadow>
            <sphereGeometry args={[0.065, 16, 12]} />
            <meshStandardMaterial color={WHITE} roughness={0.8} />
          </mesh>
        ))}
        {/* neck + head, turned to watch the bowler (+X) */}
        <mesh position={[0, 0.57, 0.02]} castShadow>
          <cylinderGeometry args={[0.055, 0.06, 0.08, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>
        <group position={[0.02, 0.69, 0.03]} scale={1.18} rotation={[0, Math.PI / 2 - 0.1, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.1, 24, 18]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          {/* helmet shell */}
          <mesh position={[0, 0.015, -0.005]} castShadow>
            <sphereGeometry args={[0.116, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshPhysicalMaterial color={HELMET} roughness={0.35} clearcoat={0.8} />
          </mesh>
          {/* peak */}
          <mesh position={[0, 0.045, 0.1]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.2, 0.01, 0.08]} />
            <meshStandardMaterial color={HELMET} roughness={0.4} />
          </mesh>
          {/* grille */}
          {[-0.04, 0, 0.04, 0.08].map((y) => (
            <mesh key={y} position={[0, y - 0.03, 0.105]} castShadow>
              <boxGeometry args={[0.15, 0.005, 0.005]} />
              <meshStandardMaterial color="#cfd3d8" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {[-0.06, -0.02, 0.02, 0.06].map((x) => (
            <mesh key={x} position={[x, -0.0, 0.108]} castShadow>
              <boxGeometry args={[0.005, 0.12, 0.005]} />
              <meshStandardMaterial color="#cfd3d8" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      </group>

      {/* arms (sleeves, elbows, gloves) */}
      <Limb r0={0.045} r1={0.04} color={WHITE} refMesh={set("uArmL")} />
      <Limb r0={0.04} r1={0.034} color={WHITE} refMesh={set("fArmL")} />
      <Limb r0={0.045} r1={0.04} color={WHITE} refMesh={set("uArmR")} />
      <Limb r0={0.04} r1={0.034} color={WHITE} refMesh={set("fArmR")} />
      <Joint r={0.042} color={WHITE} refMesh={set("elbL")} />
      <Joint r={0.042} color={WHITE} refMesh={set("elbR")} />
      <Joint r={0.045} color={GLOVE} refMesh={set("gloveL")} />
      <Joint r={0.045} color={GLOVE} refMesh={set("gloveR")} />

      {/* legs: trousers, pads, boots */}
      <Limb r0={0.075} r1={0.062} color={WHITE} refMesh={set("thighF")} />
      <Limb r0={0.06} r1={0.05} color={WHITE} refMesh={set("shinF")} />
      <Limb r0={0.074} r1={0.07} color="#f7f4ec" refMesh={set("padF")} />
      <Joint r={0.066} color={WHITE} refMesh={set("kneeF")} />
      <Limb r0={0.075} r1={0.062} color={WHITE} refMesh={set("thighB")} />
      <Limb r0={0.06} r1={0.05} color={WHITE} refMesh={set("shinB")} />
      <Limb r0={0.074} r1={0.07} color="#f7f4ec" refMesh={set("padB")} />
      <Joint r={0.066} color={WHITE} refMesh={set("kneeB")} />
      {["bootF", "bootB"].map((k) => (
        <mesh key={k} ref={set(k)} castShadow>
          <boxGeometry args={[0.2, 0.07, 0.09]} />
          <meshStandardMaterial color={BOOT} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
});
