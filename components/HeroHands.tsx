"use client";

import { useEffect, useState } from "react";

/**
 * Home screen hero: two flat cartoon hands play a looping round of hand
 * cricket (shake, shake, shake, reveal) with a running score, so the whole
 * game reads at a glance. Pure SVG + CSS, no assets.
 */

const SKIN = "#f4b283";
const SKIN_SHADE = "#e29a69";
const INK = "#0a0a0a";

// [you, them]. You bat: matching numbers are out, otherwise you score yours.
const ROUNDS: [number, number][] = [
  [4, 2],
  [6, 1],
  [3, 5],
  [5, 5],
  [2, 6],
  [1, 4],
  [6, 3],
  [3, 3],
];

const FINGERS = [
  { x: 40, h: 62 },
  { x: 62, h: 76 },
  { x: 84, h: 68 },
  { x: 106, h: 52 },
];
const PALM_TOP = 112;

function Hand({ n }: { n: number }) {
  const up = n >= 1 && n <= 5 ? Math.min(n, 4) : 0;
  const stroke = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 170 210" className="gc-hh-hand" aria-hidden="true">
      {/* thumb out to the side for an open hand */}
      {n === 5 && (
        <rect x="-4" y="-14" width="26" height="62" rx="13" fill={SKIN} {...stroke} transform="translate(28 152) rotate(-58)" />
      )}
      {FINGERS.map((f, i) =>
        i < up ? (
          <rect key={i} x={f.x} y={PALM_TOP - f.h} width="21" height={f.h + 14} rx="10.5" fill={SKIN} {...stroke} />
        ) : (
          <rect key={i} x={f.x} y={PALM_TOP - 12} width="21" height="38" rx="10.5" fill={SKIN_SHADE} {...stroke} />
        ),
      )}
      <rect x="34" y={PALM_TOP + 8} width="96" height="84" rx="26" fill={SKIN} {...stroke} />
      {FINGERS.slice(0, up).map((f, i) => (
        <rect key={i} x={f.x + 3} y={PALM_TOP + 4} width="15" height="12" fill={SKIN} />
      ))}
      {/* tucked thumb across the palm for 1-4 and the fist */}
      {(n <= 4 || n > 6) && (
        <rect x="46" y={PALM_TOP + 50} width="62" height="24" rx="12" fill={SKIN} {...stroke} />
      )}
      {/* thumbs up for six: a fat thumb on the outer edge of a closed fist */}
      {n === 6 && (
        <>
          <rect x="46" y={PALM_TOP + 50} width="62" height="24" rx="12" fill={SKIN} {...stroke} />
          <rect x="0" y="0" width="34" height="78" rx="17" fill={SKIN} {...stroke} transform={`translate(22 ${PALM_TOP - 22}) rotate(-14)`} />
        </>
      )}
      {/* wristband */}
      <rect x="30" y="184" width="104" height="24" rx="6" fill="var(--gc-blue)" {...stroke} />
    </svg>
  );
}

export function HeroHands() {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const id = window.setInterval(() => setTick((t) => t + 1), 450);
    return () => {
      mq.removeEventListener("change", sync);
      window.clearInterval(id);
    };
  }, []);

  const beat = tick % 6; // 0-2 shaking, 3-5 revealed
  const round = Math.floor(tick / 6) % ROUNDS.length;
  const revealed = reduced || beat >= 3;
  const [you, them] = ROUNDS[round];
  const out = you === them;

  // Running total for the current innings, up to and including this round.
  let total = 0;
  const upto = revealed ? round : round - 1;
  for (let i = 0; i <= upto; i++) {
    const [a, b] = ROUNDS[i];
    total = a === b ? 0 : total + a;
  }
  const justOut = revealed && out;

  return (
    <div className="gc-hero-art gc-hh" role="img" aria-label="Two cartoon hands playing a round of hand cricket">
      <div className="gc-hh-top">
        <span className="gc-hh-pill">Runs</span>
        <span key={total} className={`gc-hh-score${justOut ? " is-out" : ""}`}>
          {justOut ? "OUT" : total}
        </span>
      </div>

      <div className="gc-hh-stage">
        <div className="gc-hh-side">
          <div key={`a${round}${revealed}`} className={revealed ? "gc-hh-pop" : "gc-hh-shake"}>
            <Hand n={revealed ? you : 0} />
          </div>
          <span className="gc-hh-tag gc-hh-tag--you">{revealed ? you : "·"}</span>
          <span className="gc-hh-label">You bat</span>
        </div>

        <div className="gc-hh-vs">VS</div>

        <div className="gc-hh-side gc-hh-side--flip">
          <div key={`b${round}${revealed}`} className={revealed ? "gc-hh-pop" : "gc-hh-shake gc-hh-shake--b"}>
            <Hand n={revealed ? them : 0} />
          </div>
          <span className="gc-hh-tag gc-hh-tag--them">{revealed ? them : "·"}</span>
          <span className="gc-hh-label">They bowl</span>
        </div>
      </div>

      <div className="gc-hh-call">
        {revealed && (
          <span
            key={`r${round}`}
            className={`gc-hh-sticker ${out ? "is-out" : you === 6 ? "is-six" : "is-runs"}`}
          >
            {out ? "OUT!" : you === 6 ? "SIX!" : `+${you} runs`}
          </span>
        )}
      </div>
    </div>
  );
}
