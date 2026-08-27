import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Simge = uygulamanın imzası: aralık çubuğu ve en iyi tahmin iğnesi. */
export default function Icon() {
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
          background: "#0d181b",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 320, height: 44 }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, #2f6d68, #f0a868)",
              opacity: 0.6,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 214,
              top: -22,
              width: 18,
              height: 88,
              borderRadius: 9,
              background: "#f0a868",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
