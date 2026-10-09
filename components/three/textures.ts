import { useEffect, useState } from "react";
import * as THREE from "three";

// All textures are painted at runtime on a 2D canvas, so the 3D props ship
// with zero image downloads and nothing to break on a slow connection.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Seeded so the grain is identical on every render and every device.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** English willow: pale cream with long, slightly wavy grain lines. */
export function makeWillow() {
  const w = 512;
  const h = 1024;
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  const r = rng(7);
  g.fillStyle = "#e6c48f";
  g.fillRect(0, 0, w, h);
  const bump = canvas(w, h);
  const b = bump.getContext("2d")!;
  b.fillStyle = "#808080";
  b.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = r() * w;
    const wob = 4 + r() * 10;
    const dark = r() < 0.5;
    g.strokeStyle = dark
      ? `rgba(120,70,30,${0.08 + r() * 0.2})`
      : `rgba(255,236,200,${0.1 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    b.strokeStyle = dark ? "rgba(40,40,40,0.5)" : "rgba(200,200,200,0.35)";
    b.lineWidth = g.lineWidth;
    b.beginPath();
    for (let y = 0; y <= h; y += 16) {
      const px = x + Math.sin(y * 0.012 + i) * wob;
      if (y === 0) {
        g.moveTo(px, y);
        b.moveTo(px, y);
      } else {
        g.lineTo(px, y);
        b.lineTo(px, y);
      }
    }
    g.stroke();
    b.stroke();
  }
  // A few darker growth-ring cathedral arcs, the mark of real willow.
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = "rgba(150,95,45,0.22)";
    g.lineWidth = 1.5;
    g.beginPath();
    const cx = r() * w;
    const cy = r() * h;
    for (let k = 1; k < 5; k++) g.ellipse(cx, cy, 20 * k, 90 * k, 0, 0, Math.PI * 2);
    g.stroke();
  }
  return { map: toTexture(c), bump: toTexture(bump, false) };
}

/** Cork-grained red leather with pebbling. */
export function makeLeather() {
  const s = 512;
  const c = canvas(s, s);
  const g = c.getContext("2d")!;
  const r = rng(21);
  const grad = g.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, "#a8141b");
  grad.addColorStop(1, "#7d0d14");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const bump = canvas(s, s);
  const b = bump.getContext("2d")!;
  b.fillStyle = "#909090";
  b.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const x = r() * s;
    const y = r() * s;
    const rad = 0.8 + r() * 2.2;
    g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,120,110"},${0.04 + r() * 0.08})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    b.fillStyle = `rgba(${r() < 0.5 ? "30,30,30" : "230,230,230"},0.35)`;
    b.beginPath();
    b.arc(x, y, rad, 0, Math.PI * 2);
    b.fill();
  }
  return { map: toTexture(c), bump: toTexture(bump, false) };
}

/** Twine binding on the handle: bands of cane and thread. */
export function makeBinding() {
  const c = canvas(64, 256);
  const g = c.getContext("2d")!;
  for (let y = 0; y < 256; y += 4) {
    g.fillStyle = (y / 4) % 2 ? "#c9a46a" : "#a9814a";
    g.fillRect(0, y, 64, 4);
  }
  const t = toTexture(c);
  t.repeat.set(1, 3);
  return t;
}

/** Rubber grip: dark with fine vertical ribbing. */
export function makeGrip() {
  const c = canvas(256, 256);
  const g = c.getContext("2d")!;
  g.fillStyle = "#16181d";
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(x, 0, 3, 256);
  }
  const bump = canvas(256, 256);
  const b = bump.getContext("2d")!;
  b.fillStyle = "#777";
  b.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    b.fillStyle = "#eee";
    b.fillRect(x, 0, 4, 256);
  }
  return { map: toTexture(c), bump: toTexture(bump, false) };
}

/** Lawn grass, mown in alternating stripes, for the ground plane. */
export function makeTurf() {
  const s = 512;
  const c = canvas(s, s);
  const g = c.getContext("2d")!;
  const r = rng(99);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#3f7d2a" : "#4a8c33";
    g.fillRect(0, (i * s) / 8, s, s / 8);
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "20,60,10" : "150,210,90"},${0.05 + r() * 0.1})`;
    g.fillRect(r() * s, r() * s, 1, 2 + r() * 3);
  }
  const t = toTexture(c);
  t.repeat.set(3, 3);
  return t;
}

/** Packed clay pitch: warm sand with fine grit and a few scuffs. */
export function makeClay() {
  const s = 512;
  const c = canvas(s, s);
  const g = c.getContext("2d")!;
  const r = rng(5);
  g.fillStyle = "#d6b985";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "120,85,45" : "255,240,205"},${0.05 + r() * 0.1})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = "rgba(110,75,40,0.12)";
    g.lineWidth = 2 + r() * 4;
    g.beginPath();
    g.moveTo(r() * s, r() * s);
    g.lineTo(r() * s, r() * s);
    g.stroke();
  }
  const t = toTexture(c);
  t.repeat.set(10, 10);
  return t;
}

/** The maker's sticker on the face of the bat. */
export function makeSticker() {
  const c = canvas(256, 640);
  const g = c.getContext("2d")!;
  g.fillStyle = "#c62828";
  g.beginPath();
  g.roundRect(8, 8, 240, 624, 28);
  g.fill();
  g.strokeStyle = "#f6ecd2";
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = "#f6ecd2";
  g.textAlign = "center";
  g.save();
  g.translate(128, 320);
  g.rotate(-Math.PI / 2);
  g.font = "900 120px Impact, 'Arial Black', sans-serif";
  g.fillText("HAND", 0, -10);
  g.font = "900 92px Impact, 'Arial Black', sans-serif";
  g.fillText("CRICKET", 0, 88);
  g.restore();
  return toTexture(c);
}

/** Radial alpha: opaque in the middle, gone at the rim. */
export function makeFade() {
  const s = 256;
  const c = canvas(s, s);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.55, "#bbb");
  grad.addColorStop(1, "#000");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Paint textures once per mount and free their GPU copies on unmount.
 *  `make` returns a texture or an object of textures (e.g. map + bump). */
export function useTexture<T extends THREE.Texture | Record<string, THREE.Texture>>(
  make: () => T,
): T {
  const [tex] = useState(make);
  useEffect(
    () => () => {
      const all = tex instanceof THREE.Texture ? [tex] : Object.values(tex);
      all.forEach((t) => t.dispose());
    },
    [tex],
  );
  return tex;
}
