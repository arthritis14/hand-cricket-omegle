"use client";

export function Countdown({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="brutal-border brutal-shadow-lg flex h-32 w-32 items-center justify-center rounded-full bg-brutal-yellow font-display text-5xl font-bold text-black">
        {label}
      </div>
    </div>
  );
}
