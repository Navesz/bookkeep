import type { MetadataRoute } from "next"

/**
 * The web manifest. It exists because `public/icon-192.png` and
 * `public/icon-512.png` have no other reader: those two sizes are the ones an
 * Android home screen and a desktop install prompt ask for, and without a
 * manifest pointing at them they are two files nothing ever requests.
 *
 * `purpose: "maskable"` is deliberately NOT claimed. A maskable icon promises
 * that the whole drawing survives being cropped to a circle, and this one does
 * not — `tools/generate-icons.mjs` insets the mark to 82% of the tile, which is
 * the right margin for a rounded square and too little for the 80%-diameter
 * safe zone a maskable icon is judged against. Claiming it would get the shelf
 * board's ends sliced off.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "bookkeep",
    short_name: "bookkeep",
    description:
      "An open-source library management system: books, copies, members and loans.",
    start_url: "/",
    display: "standalone",
    // The tile's own ground and the light theme's paper — the splash screen
    // should be the colour the application actually opens on.
    background_color: "#f9f7f1",
    theme_color: "#1a1611",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}
