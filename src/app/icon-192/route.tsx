import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET() {
  const size = 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a3a7a",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "sans-serif",
          }}
        >
          R
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
