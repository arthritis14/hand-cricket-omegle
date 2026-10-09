"use client";

import { forwardRef, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  makeBinding,
  makeSticker,
  makeGrip,
  makeLeather,
  makeWillow,
  useTexture,
} from "./textures";

// Everything here is modelled in real metres: a cricket ball is 7.2cm
// across, a bat 96cm long, a stump 71cm tall. Scenes scale the groups, so
// the proportions between the props are right even when they are cartoon
// sized on screen.

export const BALL_R = 0.036;
export const STUMP_H = 0.711;
export const STUMP_R = 0.0175;
export const STUMP_GAP = 0.0968;

/* ------------------------------------------------------------ BALL */

/** A four-piece leather ball: pebbled red hide, one raised equatorial
 *  seam and six rows of stitches (three either side), the way the real
 *  ones are sewn. The group's local Y is the seam axis. */
export const Ball = forwardRef<
  THREE.Group,
  { scale?: number; position?: [number, number, number] }
>(function Ball(
  { scale = 1, position },
  ref,
) {
  const leather = useTexture(makeLeather);
  const stitches = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const count = 46;
    const rows = [-0.0095, -0.0062, -0.0029, 0.0029, 0.0062, 0.0095].map(
      (v) => v * (BALL_R / 0.036),
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [ri, y] of rows.entries()) {
      for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2 + (ri % 2) * 0.03;
        const rr = Math.sqrt(BALL_R * BALL_R - y * y) + 0.0004;
        const p = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
        const n = p.clone().normalize();
        const t = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
        const tilt = (i % 2 ? 1 : -1) * 0.7;
        const d = new THREE.Vector3(0, 1, 0)
          .multiplyScalar(Math.cos(tilt))
          .add(t.clone().multiplyScalar(Math.sin(tilt)))
          .normalize();
        const z = new THREE.Vector3().crossVectors(d, n).normalize();
        m.makeBasis(d, n, z);
        q.setFromRotationMatrix(m);
        out.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const im = stitches.current;
    if (!im) return;
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <group ref={ref} scale={scale} position={position}>
      <mesh castShadow>
        <sphereGeometry args={[BALL_R, 64, 48]} />
        <meshPhysicalMaterial
          map={leather.map}
          bumpMap={leather.bump}
          bumpScale={2.2}
          roughness={0.32}
          clearcoat={0.7}
          clearcoatRoughness={0.28}
          color="#ffffff"
        />
      </mesh>
      {/* the raised seam */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[BALL_R + 0.0003, 0.0021, 12, 120]} />
        <meshStandardMaterial color="#8c0f16" roughness={0.45} />
      </mesh>
      <instancedMesh
        ref={stitches}
        args={[undefined, undefined, matrices.length]}
        castShadow
      >
        <boxGeometry args={[0.0022, 0.0034, 0.0013]} />
        <meshStandardMaterial color="#efe6cf" roughness={0.9} />
      </instancedMesh>
    </group>
  );
});

/* ------------------------------------------------------------- BAT */

const BLADE_LEN = 0.72;
const HALF_W = 0.054;
const SHOULDER = 0.5;

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A single subdivided slab bent into a bat: flat face in front, spine
 *  ridge behind, rounded toe, shoulders that taper through the splice
 *  into the round of the handle. */
function buildBlade() {
  const g = new THREE.BoxGeometry(1, 1, 1, 28, 90, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2; // -1..1 across
    const y = (pos.getY(i) + 0.5) * BLADE_LEN; // 0..L, toe to neck
    const side = pos.getZ(i) > 0 ? 1 : -1;

    // Plan-view width: rounded toe, straight blade, splice taper.
    let hw = HALF_W;
    if (y < 0.05) hw *= Math.sqrt(Math.max(0, 1 - ((0.05 - y) / 0.05) ** 2)) * 0.18 + 0.82 * smooth(0, 0.05, y);
    const neck = 0.0125;
    hw = hw * (1 - smooth(SHOULDER, BLADE_LEN, y)) + neck * smooth(SHOULDER, BLADE_LEN, y);

    // Thickness: spine ridge behind, near flat in front.
    const edge = Math.sqrt(Math.max(0, 1 - u * u));
    const round = smooth(SHOULDER - 0.05, BLADE_LEN, y); // blends to a round neck
    const body = 0.012 + 0.03 * smooth(0, 0.18, y);
    const back = (0.006 + (body + 0.012) * edge) * (1 - round) + neck * edge * round;
    const front = (0.004 + 0.006 * edge) * (1 - round) + neck * edge * round;

    pos.setX(i, u * hw);
    pos.setY(i, y);
    pos.setZ(i, side > 0 ? back : -front);
  }
  g.computeVertexNormals();
  return g;
}

export const Bat = forwardRef<
  THREE.Group,
  { scale?: number | [number, number, number] }
>(function Bat(
  { scale = 1 },
  ref,
) {
  const willow = useTexture(makeWillow);
  const binding = useTexture(makeBinding);
  const grip = useTexture(makeGrip);
  const blade = useMemo(() => buildBlade(), []);
  const sticker = useTexture(makeSticker);

  return (
    <group ref={ref} scale={scale}>
      {/* Origin is the toe; the bat stands along +Y. */}
      <mesh geometry={blade} castShadow receiveShadow>
        <meshPhysicalMaterial
          map={willow.map}
          bumpMap={willow.bump}
          bumpScale={1.2}
          roughness={0.5}
          clearcoat={0.25}
          clearcoatRoughness={0.6}
        />
      </mesh>
      {/* maker's sticker on the flat face */}
      <mesh position={[0, 0.3, -0.0118]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.062, 0.2]} />
        <meshStandardMaterial map={sticker} roughness={0.5} transparent />
      </mesh>
      {/* toe guard and shoulder tape: the dark bands real bats have */}
      <mesh position={[0, 0.006, 0.0]} castShadow>
        <boxGeometry args={[HALF_W * 1.9, 0.012, 0.028]} />
        <meshStandardMaterial color="#d9cdb0" roughness={0.8} />
      </mesh>
      {/* cane handle with twine binding */}
      <mesh position={[0, BLADE_LEN + 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.0125, 0.0125, 0.1, 24]} />
        <meshStandardMaterial map={binding} roughness={0.7} />
      </mesh>
      {/* rubber grip */}
      <mesh position={[0, BLADE_LEN + 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.0142, 0.0142, 0.16, 32]} />
        <meshStandardMaterial
          map={grip.map}
          bumpMap={grip.bump}
          bumpScale={2}
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>
      <mesh position={[0, BLADE_LEN + 0.252, 0]}>
        <sphereGeometry args={[0.0142, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#16181d" roughness={0.8} />
      </mesh>
    </group>
  );
});

/* ---------------------------------------------------------- STUMPS */

export type StumpRefs = {
  stumps: (THREE.Group | null)[];
  bails: (THREE.Mesh | null)[];
};

/** Three stumps and two bails, each a separate ref so a scene can break
 *  them up independently. Origin is the base centre of the middle stump. */
export function Stumps({
  refs,
}: {
  refs: { current: StumpRefs };
}) {
  const wood = useTexture(makeWillow);
  const xs = [-STUMP_GAP, 0, STUMP_GAP];
  return (
    <group>
      {xs.map((x, i) => (
        <group
          key={i}
          position={[x, 0, 0]}
          ref={(el) => {
            refs.current.stumps[i] = el;
          }}
        >
          <mesh position={[0, STUMP_H / 2, 0]} castShadow>
            <cylinderGeometry args={[STUMP_R, STUMP_R, STUMP_H, 24]} />
            <meshStandardMaterial map={wood.map} bumpMap={wood.bump} roughness={0.55} />
          </mesh>
          <mesh position={[0, STUMP_H, 0]} castShadow>
            <sphereGeometry args={[STUMP_R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial map={wood.map} roughness={0.55} />
          </mesh>
          {/* brass ferrule */}
          <mesh position={[0, STUMP_H - 0.012, 0]}>
            <cylinderGeometry args={[STUMP_R + 0.0007, STUMP_R + 0.0007, 0.008, 24]} />
            <meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {[-STUMP_GAP / 2, STUMP_GAP / 2].map((x, i) => (
        <mesh
          key={i}
          position={[x, STUMP_H + STUMP_R + 0.004, 0]}
          rotation={[0, 0, Math.PI / 2]}
          ref={(el) => {
            refs.current.bails[i] = el;
          }}
          castShadow
        >
          <cylinderGeometry args={[0.0055, 0.0055, STUMP_GAP - 0.004, 16]} />
          <meshStandardMaterial map={wood.map} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
