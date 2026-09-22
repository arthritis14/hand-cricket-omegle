"use client";

/** The ball coming at you. It covers the whole self-tile rather than
 *  sitting in a corner badge, because the throw instant is the loudest
 *  moment in the game and the player needs to feel it land on "1".
 *
 *  `key={label}` is doing real work: it remounts on every tick so the
 *  arrival animation re-fires, which is what makes the ball feel thrown
 *  each time rather than the digit quietly swapping underneath. */
export function Countdown({ label }: { label: string }) {
  return (
    <div className="gc-count">
      <div className="gc-count-ball" key={label}>
        {label}
      </div>
    </div>
  );
}
