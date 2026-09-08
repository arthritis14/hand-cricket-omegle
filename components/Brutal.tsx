"use client";

import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type Tone =
  | "purple"
  | "lime"
  | "coral"
  | "yellow"
  | "pink"
  | "blue"
  | "orange"
  | "mint"
  | "red"
  | "black"
  | "white"
  | "lilac"
  | "peach";

const toneToBg: Record<Tone, string> = {
  purple: "bg-brutal-purple text-white",
  lime: "bg-brutal-lime text-black",
  coral: "bg-brutal-coral text-white",
  yellow: "bg-brutal-yellow text-black",
  pink: "bg-brutal-pink text-black",
  blue: "bg-brutal-blue text-white",
  orange: "bg-brutal-orange text-black",
  mint: "bg-brutal-mint text-black",
  red: "bg-brutal-red text-white",
  black: "bg-black text-white",
  white: "bg-white text-black",
  // Tinted stand-ins for plain white on the larger content panels - still
  // light enough for black text to read easily, but never actually white.
  lilac: "bg-brutal-lilac text-black",
  peach: "bg-brutal-peach text-black",
};

export function BrutalButton({
  children,
  tone = "lime",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: Tone }) {
  return (
    <button
      className={`brutal-border brutal-shadow brutal-press cursor-pointer rounded-xl px-6 py-3 font-display text-base font-bold uppercase tracking-tight disabled:cursor-not-allowed disabled:opacity-50 ${toneToBg[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function BrutalCard({
  children,
  tone = "white",
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; tone?: Tone }) {
  return (
    <div
      className={`brutal-border brutal-shadow rounded-2xl ${toneToBg[tone]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function BrutalBadge({
  children,
  tone = "yellow",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`brutal-border inline-flex items-center rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-wide ${toneToBg[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
