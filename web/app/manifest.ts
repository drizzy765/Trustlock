import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrustLock",
    short_name: "TrustLock",
    description: "Pay on delivery for African sellers across social media and any chat app.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0C0B",
    theme_color: "#0B0C0B",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
