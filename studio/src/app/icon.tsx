import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080b",
          borderRadius: 14,
          color: "#9d8cff",
          fontSize: 44,
          fontWeight: 800,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
