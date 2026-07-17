import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "YIIYA — Voice-First 3D Asset Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#050505",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 14,
            letterSpacing: 8,
            color: "#71717a",
            fontFamily: "monospace",
            marginBottom: 40,
          }}
        >
          YIIYA
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 400,
            color: "#ededed",
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Say something.
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 400,
            color: "#EF9F27",
            lineHeight: 1.1,
            marginBottom: 48,
          }}
        >
          Get a 3D asset.
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#71717a",
            fontFamily: "monospace",
          }}
        >
          Voice-first 3D generation — GLB / OBJ / USD / STL
        </div>
      </div>
    ),
    { ...size }
  );
}
