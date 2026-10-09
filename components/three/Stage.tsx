"use client";

import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { useEffect, useState } from "react";
import { makeClay, makeFade } from "./textures";

/** If WebGL is unavailable (old phone, blocked GPU) the scene must degrade
 *  to the static fallback instead of taking the whole page down. */
class SceneBoundary extends Component<
  { fallback: ReactNode; onFail?: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Shared lighting rig: a soft key from the upper left with shadows, plus
 *  a procedural studio environment (no HDRI download) so the clearcoat on
 *  the ball and the willow have something to reflect. */
export function Stage({
  children,
  fallback,
  onFail,
  camera,
  className,
  dpr = [1, 1.5],
  shadowSize = 1024,
}: {
  children: ReactNode;
  fallback: ReactNode;
  onFail?: () => void;
  camera: { position: [number, number, number]; fov: number };
  className?: string;
  dpr?: [number, number];
  shadowSize?: number;
}) {
  // Lazy state, not useMemo: React may discard a memo, which would repaint
  // the canvases and orphan the old GPU textures.
  const [clay] = useState(() => makeClay());
  const [fade] = useState(() => makeFade());
  useEffect(
    () => () => {
      clay.dispose();
      fade.dispose();
    },
    [clay, fade],
  );

  // Render only while the canvas is on screen and the tab is visible, so a
  // scrolled-away hero doesn't keep the GPU busy.
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const [observed, setObserved] = useState<IntersectionObserver | null>(null);
  useEffect(() => () => observed?.disconnect(), [observed]);

  return (
    <SceneBoundary fallback={fallback} onFail={onFail}>
      <Canvas
        className={className}
        shadows
        dpr={dpr}
        frameloop={onScreen && tabVisible ? "always" : "never"}
        camera={camera}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
          io.observe(gl.domElement);
          setObserved(io);
        }}
      >
        <ambientLight intensity={0.5} color="#6f86c9" />
        {/* the floodlight: warm white from high on the bowler's side */}
        <spotLight
          position={[2.2, 6, 3]}
          angle={0.55}
          penumbra={0.8}
          intensity={260}
          color="#fff1d6"
          castShadow
          shadow-mapSize={[shadowSize, shadowSize]}
          shadow-bias={-0.0002}
          target-position={[0, 0.6, 0]}
        />
        {/* a cool rim from behind, so the white kit separates from the dark */}
        <directionalLight position={[-3, 2.5, -3]} intensity={1.6} color="#7aa2ff" />
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2} position={[-3, 3, 3]} scale={[4, 3, 1]} color="#cfe0ff" />
          <Lightformer form="rect" intensity={1.6} position={[4, 2, 2]} scale={[3, 2, 1]} color="#ffd9a0" />
          <Lightformer form="ring" intensity={1} position={[0, 4, -3]} scale={4} color="#9db8ff" />
        </Environment>
        {children}
        {/* A pool of clay under the light. Its edge fades to nothing, so the
            batsman stands on the stadium photograph, not on a rectangle. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <circleGeometry args={[1.45, 64]} />
          <meshStandardMaterial map={clay} alphaMap={fade} transparent roughness={1} color="#cdb48a" />
        </mesh>
      </Canvas>
    </SceneBoundary>
  );
}
