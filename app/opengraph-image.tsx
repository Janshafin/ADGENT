import { ImageResponse } from "next/og";

export const alt = "ADGENT: ads for the age of AI shopping. Merchants pay only when a sale settles on PayPal.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card in the site's white, Apple-like style, with the sale split from the home page. */
export default function OpenGraphImage() {
  const bar = (flex: number, color: string) => <div style={{ flex, height: 14, borderRadius: 7, background: color }} />;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#ffffff", color: "#1d1d1f", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, color: "#6e6e73" }}>
          <svg width="40" height="40" viewBox="0 0 18 18">
            <rect x="1" y="1" width="11" height="11" rx="3.2" fill="#0070e0" />
            <rect x="6" y="6" width="11" height="11" rx="3.2" fill="#003087" opacity="0.85" />
          </svg>
          ADGENT
        </div>
        <div style={{ marginTop: 22, fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>Ads for the age of AI shopping.</div>
        <div style={{ marginTop: 16, fontSize: 34, color: "#1d1d1f" }}>Merchants pay only when a sale settles on PayPal.</div>
        <div style={{ marginTop: 56, width: 760, display: "flex", gap: 8 }}>
          {bar(14, "#0070e0")}
          {bar(1, "#003087")}
          {bar(1, "#ffc439")}
        </div>
        <div style={{ marginTop: 18, width: 760, display: "flex", justifyContent: "space-between", fontSize: 24, color: "#6e6e73" }}>
          <span>Merchant $16.78</span>
          <span>Publisher $0.63</span>
          <span>Ad fee $0.63</span>
        </div>
      </div>
    ),
    size,
  );
}
