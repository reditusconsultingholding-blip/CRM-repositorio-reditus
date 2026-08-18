import { ImageResponse } from "next/og";
import { REDITUS_ISOTIPO_DATA_URI } from "@/lib/brand-icon";

export const runtime = "nodejs";

export async function GET() {
  const size = 512;
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
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={REDITUS_ISOTIPO_DATA_URI}
          width={size}
          height={size}
          style={{ objectFit: "cover" }}
          alt=""
        />
      </div>
    ),
    { width: size, height: size },
  );
}
