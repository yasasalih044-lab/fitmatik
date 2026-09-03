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
          background: "#f2eee5",
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 320, height: 44 }}>
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
              left: 214,
              top: -22,
              width: 18,
              height: 88,
              borderRadius: 9,
              background: "#17140f",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
