"use client";

export function Countdown({ label }: { label: string }) {
  return (
    <div className="nb-countdown-badge">
      <span>{label}</span>
    </div>
  );
}
