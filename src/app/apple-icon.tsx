import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Simge = uygulamanın imzası: aralık çubuğu ve en iyi tahmin iğnesi. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f2eee5",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 116, height: 16 }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              background: "#d2141f",
              opacity: 0.6,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 78,
              top: -8,
              width: 7,
              height: 32,
              borderRadius: 4,
              background: "#17140f",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
