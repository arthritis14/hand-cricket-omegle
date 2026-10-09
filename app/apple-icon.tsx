import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#A3F23D",
        }}
      >
        <svg width="130" height="130" viewBox="0 0 100 100">
          <g fill="#FFD60A" stroke="#000" strokeWidth="5" strokeLinejoin="round">
            <rect x="22" y="14" width="12" height="42" rx="6" />
            <rect x="37" y="6" width="12" height="50" rx="6" />
            <rect x="52" y="9" width="12" height="47" rx="6" />
            <rect x="67" y="20" width="12" height="38" rx="6" />
            <path d="M24 50 L24 62 C24 82 36 94 54 94 C70 94 80 84 80 66 L80 52 Z" />
            <path d="M26 58 C16 50 10 44 10 40 C10 35 16 34 20 38 L32 52 Z" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
