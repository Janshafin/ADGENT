import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the ADGENT mark on white. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <svg width="120" height="120" viewBox="0 0 18 18">
          <rect x="1" y="1" width="11" height="11" rx="3.2" fill="#0070e0" />
          <rect x="6" y="6" width="11" height="11" rx="3.2" fill="#003087" opacity="0.85" />
        </svg>
      </div>
    ),
    size,
  );
}
