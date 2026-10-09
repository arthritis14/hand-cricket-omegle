import { ImageResponse } from "next/og";

export const alt = "Hand Cricket Omegle: play hand cricket with a stranger on camera";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#000000";
const LIME = "#A3F23D";
const PINK = "#FF6FB5";
const YELLOW = "#FFD60A";
const CREAM = "#F7F1E3";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: LIME,
          padding: "0 70px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: CREAM,
              border: `6px solid ${INK}`,
              boxShadow: `10px 10px 0 0 ${INK}`,
              padding: "6px 26px",
              fontSize: 92,
              fontWeight: 900,
              color: INK,
              transform: "rotate(-1.5deg)",
            }}
          >
            HAND
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 26,
              background: PINK,
              border: `6px solid ${INK}`,
              boxShadow: `10px 10px 0 0 ${INK}`,
              padding: "6px 26px",
              fontSize: 92,
              fontWeight: 900,
              color: INK,
              transform: "rotate(1deg) translateX(14px)",
            }}
          >
            CRICKET
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 26,
              background: YELLOW,
              border: `6px solid ${INK}`,
              boxShadow: `10px 10px 0 0 ${INK}`,
              padding: "6px 26px",
              fontSize: 92,
              fontWeight: 900,
              color: INK,
              transform: "rotate(-0.8deg) translateX(4px)",
            }}
          >
            OMEGLE
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 40,
              fontSize: 32,
              fontWeight: 700,
              color: INK,
            }}
          >
            Throw a hand. Beat a stranger. On camera.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 380,
            height: 380,
            background: CREAM,
            border: `8px solid ${INK}`,
            boxShadow: `16px 16px 0 0 ${INK}`,
            transform: "rotate(3deg)",
          }}
        >
          {/* Open palm: four fingers, a thumb and a palm block */}
          <svg width="300" height="300" viewBox="0 0 100 100">
            <g fill={YELLOW} stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
              <rect x="22" y="14" width="12" height="42" rx="6" />
              <rect x="37" y="6" width="12" height="50" rx="6" />
              <rect x="52" y="9" width="12" height="47" rx="6" />
              <rect x="67" y="20" width="12" height="38" rx="6" />
              <path d="M24 50 L24 62 C24 82 36 94 54 94 C70 94 80 84 80 66 L80 52 Z" />
              <path d="M26 58 C16 50 10 44 10 40 C10 35 16 34 20 38 L32 52 Z" />
            </g>
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
