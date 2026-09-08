#!/usr/bin/env node
// GENERATES THE ICONS AND THE SHARE CARD, with no dependency at all.
//
// Why rasterise by hand instead of installing `sharp` or `resvg`: this
// repository takes no dependency for what a built-in already does, and a PNG is
// literally an RGBA buffer plus `zlib.deflateSync` plus a CRC32. `sharp` does
// sit in `node_modules` as a transitive dependency of Next, but relying on
// something that is not declared is worse than declaring it — it disappears in
// an upgrade and nobody can work out why.
//
// The geometry is not here. It is in `lib/brand.ts`, and it is the SAME data
// that `components/mark.tsx` draws. Node erases the types on import, so this
// script reads the `.ts` file directly with no build step.
//
// Run it from the root of the project:
//   node tools/generate-icons.mjs
//
// It rewrites: app/icon.svg, app/apple-icon.png, app/favicon.ico,
// public/icon-192.png, public/icon-512.png, public/og.png, public/mark.svg.

import { deflateSync } from "node:zlib"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { SHAPES, SIDE, TILE_RADIUS } from "../lib/brand.ts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

// ──────────────────────────────────────────────────────────────────── colour
//
// The colours are born in oklch, in the same space `app/globals.css` declares
// its tokens in — so the icon and the site are talking about the same colour
// and not about two that merely look alike on the monitor of whoever picked
// them.

function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return linear.map((v) => {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(g * 255)))
  })
}

// COPIED from the `.dark` block of `app/globals.css`: `--background`,
// `--foreground` and `--brand`. The icon carries its own ground and is seen
// against a browser tab strip, a dock or a feed — all of which are dark far
// more often than they are light. A tile taken from the light theme would be a
// cream square vanishing into the white background of everywhere.
const INK = oklchToRgb(0.205, 0.012, 76) // the tile
const PAPER = oklchToRgb(0.945, 0.011, 92) // the volumes
const CLOTH = oklchToRgb(0.755, 0.115, 160) // the shelf board, and the rule

// The light theme's ink and cloth, for `public/mark.svg` — that file is used
// on light ground (a README, a slide) where the tile does not exist.
const INK_ON_PAPER = oklchToRgb(0.226, 0.016, 68)
const CLOTH_ON_PAPER = oklchToRgb(0.462, 0.083, 158)

const rgb = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`

// ─────────────────────────────────────────────────────────────── rasteriser
//
// Signed-distance coverage: for each pixel, measure the distance to the edge of
// each bar and turn it into an opacity. Antialiasing comes out for free and is
// exact at any size — supersampling would give the same picture for sixteen
// times the arithmetic.

function distanceToBar(px, py, bar) {
  const cx = bar.x + bar.width / 2
  const cy = bar.y + bar.height / 2

  let dx = px - cx
  let dy = py - cy

  if (bar.rotation) {
    const t = (-bar.rotation * Math.PI) / 180
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const rx = dx * cos - dy * sin
    dy = dx * sin + dy * cos
    dx = rx
  }

  const r = bar.radius
  const qx = Math.abs(dx) - bar.width / 2 + r
  const qy = Math.abs(dy) - bar.height / 2 + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

// Distance to the rounded square that is the icon tile.
function distanceToTile(px, py, side, radius) {
  return distanceToBar(px, py, {
    x: 0,
    y: 0,
    width: side,
    height: side,
    radius,
  })
}

// Coverage of ONE role. The bars of the other role are skipped, but the cuts
// are applied to both — a raised band goes through whatever it crosses.
function coverageOf(px, py, unitsPerPixel, role) {
  let a = 0
  for (const shape of SHAPES) {
    if (shape.op === "ink" && shape.role !== role) continue
    const d = distanceToBar(px, py, shape.bar)
    const ai = Math.max(0, Math.min(1, 0.5 - d / unitsPerPixel))
    a = shape.op === "ink" ? Math.max(a, ai) : Math.min(a, 1 - ai)
  }
  return a
}

// The board is laid down first and the volumes over it, so the feet that run
// into the board are hidden and no seam shows where the two meet.
const ROLES = [
  ["shelf", CLOTH],
  ["volume", PAPER],
]

// ──────────────────────────────────────────────────────────────────── png

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([size, body, crc])
}

function buildPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 6 // RGBA
  const rows = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const to = y * (width * 4 + 1)
    rows[to] = 0 // filter "none": the drawing is flat, filtering does not pay
    rgba.copy(rows, to + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function writePng(path, width, height, rgba) {
  writeFileSync(path, buildPng(width, height, rgba))
}

// The `.ico` exists for one reason: old Safari and feed readers still ask for
// `/favicon.ico` and ignore `icon.svg`. The container here holds PNGs (which
// Windows has understood since Vista) rather than DIB bitmaps — DIB would want
// an inverted AND mask and a palette, three hundred lines to serve a browser
// that no longer exists.
function writeIco(path, sizes) {
  const images = sizes.map((s) => buildPng(s, s, rasteriseIcon(s)))

  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = header.length
  images.forEach((png, i) => {
    const e = 6 + i * 16
    // 0 means 256 in this single-byte field; every size here is smaller.
    header[e] = sizes[i] % 256
    header[e + 1] = sizes[i] % 256
    header.writeUInt16LE(1, e + 4) // planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })

  writeFileSync(path, Buffer.concat([header, ...images]))
}

function blend(target, i, colour, alpha) {
  if (alpha <= 0) return
  for (let c = 0; c < 3; c++) {
    target[i + c] = Math.round(target[i + c] * (1 - alpha) + colour[c] * alpha)
  }
  target[i + 3] = Math.round(target[i + 3] * (1 - alpha) + 255 * alpha)
}

// ─────────────────────────────────────────────────────────────────── icon

function rasteriseIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const units = SIDE / size // drawing units per pixel
  // The mark fills 82% of the tile, centred. Less margin than that and the
  // shelf board runs into the rounded corner when an operating system re-clips
  // the icon into a shape of its own; more, and at 16px the three spines no
  // longer have a pixel of gap between them.
  const scale = 0.82
  const shift = (SIDE * (1 - scale)) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * units
      const py = (y + 0.5) * units
      const i = (y * size + x) * 4

      const dTile = distanceToTile(px, py, SIDE, TILE_RADIUS)
      const aTile = Math.max(0, Math.min(1, 0.5 - dTile / units))
      blend(rgba, i, INK, aTile)

      const mx = (px - shift) / scale
      const my = (py - shift) / scale
      for (const [role, colour] of ROLES) {
        const a = coverageOf(mx, my, units / scale, role)
        blend(rgba, i, colour, a * aTile)
      }
    }
  }

  return rgba
}

function generateIcon(path, size) {
  writePng(path, size, size, rasteriseIcon(size))
  return `${path} (${size}×${size})`
}

// ───────────────────────────────────────────────────────────────── alphabet
//
// "BOOKKEEP" drawn out of the same rectangles as the mark. The wordmark is a
// spine label — the stencilled capitals a library stamps on a book — and not a
// font borrowed for the occasion. Each letter is described in a 60×84 box and
// comes back already moved to where it was asked for.

const STROKE = 13
const LETTER_RADIUS = 2

function letter(name, x, y, boxHeight) {
  const e = boxHeight / 84 // scale out of the drawing box
  const t = STROKE * e
  const r = LETTER_RADIUS * e
  const w = 60 * e
  const h = boxHeight
  const bar = (bx, by, bw, bh) => ({
    x: x + bx,
    y: y + by,
    width: bw,
    height: bh,
    radius: r,
  })
  const mid = (h - t) / 2

  switch (name) {
    case "B":
      return [
        bar(0, 0, t, h),
        bar(0, 0, w, t),
        bar(w - t, 0, t, mid + t),
        bar(0, mid, w, t),
        bar(w - t, mid, t, h - mid),
        bar(0, h - t, w, t),
      ]
    case "O":
      return [
        bar(0, 0, w, t),
        bar(0, h - t, w, t),
        bar(0, 0, t, h),
        bar(w - t, 0, t, h),
      ]
    case "K":
      // The junction sits ON the right edge of the stem and not inside it. Set
      // it further left and the back corner of the diagonal — a rectangle, so
      // its corner reaches further than its cap — pokes a nub out of the LEFT
      // side of the stem; measured, it came out a quarter of a unit proud.
      return [
        bar(0, 0, t, h),
        between(x + t, y + mid + t / 2, x + w - t / 2, y + t / 2, t, r),
        between(x + t, y + mid + t / 2, x + w - t / 2, y + h - t / 2, t, r),
      ]
    case "E":
      return [
        bar(0, 0, t, h),
        bar(0, 0, w, t),
        bar(0, mid, w * 0.84, t),
        bar(0, h - t, w, t),
      ]
    case "P":
      return [
        bar(0, 0, t, h),
        bar(0, 0, w, t),
        bar(w - t, 0, t, mid + t),
        bar(0, mid, w, t),
      ]
    default:
      throw new Error(`no drawing for the letter: ${name}`)
  }
}

function between(x1, y1, x2, y2, thickness, radius) {
  const length = Math.hypot(x2 - x1, y2 - y1) + thickness
  const rotation = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  return {
    x: (x1 + x2) / 2 - length / 2,
    y: (y1 + y2) / 2 - thickness / 2,
    width: length,
    height: thickness,
    radius,
    rotation,
  }
}

function word(text, x, y, height, gap) {
  const width = (60 * height) / 84
  const bars = []
  let cursor = x
  for (const c of text) {
    bars.push(...letter(c, cursor, y, height))
    cursor += width + gap
  }
  return { bars, width: cursor - x - gap }
}

function coverageOfBars(px, py, bars, unitsPerPixel) {
  let a = 0
  for (const b of bars) {
    const d = distanceToBar(px, py, b)
    a = Math.max(a, Math.max(0, Math.min(1, 0.5 - d / unitsPerPixel)))
  }
  return a
}

// ──────────────────────────────────────────────────────────────── og card

function generateOg(path) {
  const width = 1200
  const height = 630
  const rgba = Buffer.alloc(width * height * 4)

  // The ruled register from `app/globals.css`, in the ink of the tile: faint
  // horizontal lines and one vertical margin rule. It gives the card the
  // texture of a page without competing with the mark in a feed thumbnail.
  const PITCH = 42
  const MARGIN_X = 300
  for (let y = 0; y < height; y++) {
    const onRule = y % PITCH === PITCH - 1
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      rgba[i] = INK[0]
      rgba[i + 1] = INK[1]
      rgba[i + 2] = INK[2]
      rgba[i + 3] = 255
      if (onRule) blend(rgba, i, PAPER, 0.06)
      if (x === MARGIN_X) blend(rgba, i, CLOTH, 0.18)
    }
  }

  // The composition sits on the vertical centre: the crop a feed applies takes
  // the edges, never the middle.
  const markSide = 214
  // Centred in the margin column, so the vertical rule reads as the fence
  // between the mark and the word rather than as a line drawn near the mark.
  const markX = (MARGIN_X - markSide) / 2
  const markY = (height - markSide) / 2
  const capHeight = 84
  const wordX = MARGIN_X + 70
  const { bars, width: wordWidth } = word(
    "BOOKKEEP",
    wordX,
    height / 2 - capHeight / 2 - 16,
    capHeight,
    20
  )

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4

      const mx = ((x + 0.5 - markX) * SIDE) / markSide
      const my = ((y + 0.5 - markY) * SIDE) / markSide
      if (mx > -4 && mx < SIDE + 4 && my > -4 && my < SIDE + 4) {
        for (const [role, colour] of ROLES) {
          blend(rgba, i, colour, coverageOf(mx, my, SIDE / markSide, role))
        }
      }

      blend(rgba, i, PAPER, coverageOfBars(x + 0.5, y + 0.5, bars, 1))
    }
  }

  // The rule under the wordmark: the shelf, again, in bookcloth — the same
  // board the volumes stand on, running the width of the word.
  const ruleY = Math.round(height / 2 + capHeight / 2 + 26)
  for (let y = ruleY; y < ruleY + 8; y++) {
    for (let x = wordX; x < wordX + wordWidth; x++) {
      blend(rgba, (y * width + x) * 4, CLOTH, 1)
    }
  }

  writePng(path, width, height, rgba)
  return `${path} (${width}×${height})`
}

// ──────────────────────────────────────────────────────────────────── svg

function markSvg({ tiled }) {
  const cuts = SHAPES.filter((s) => s.op === "cut")

  const rect = (b, colour) => {
    const rotation = b.rotation
      ? ` transform="rotate(${b.rotation.toFixed(3)} ${(
          b.x +
          b.width / 2
        ).toFixed(3)} ${(b.y + b.height / 2).toFixed(3)})"`
      : ""
    return `<rect x="${b.x.toFixed(3)}" y="${b.y.toFixed(3)}" width="${b.width.toFixed(
      3
    )}" height="${b.height.toFixed(3)}" rx="${b.radius}" fill="${colour}"${rotation}/>`
  }

  // The volumes on a light ground are ink; on the dark tile they are paper.
  const colours = tiled
    ? { shelf: rgb(CLOTH), volume: rgb(PAPER) }
    : { shelf: rgb(CLOTH_ON_PAPER), volume: rgb(INK_ON_PAPER) }

  const drawn = ["shelf", "volume"].flatMap((role) =>
    SHAPES.filter((s) => s.op === "ink" && s.role === role).map((s) =>
      rect(s.bar, colours[role])
    )
  )

  // `maskUnits` is spelled out because the SVG default is the object's bounding
  // box padded by 10%, and the mask rect below is written in user space. When
  // the two disagree the bands land somewhere near the drawing instead of on it.
  const body = [
    `<mask id="bands" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIDE}" height="${SIDE}">`,
    `<rect width="${SIDE}" height="${SIDE}" fill="white"/>`,
    ...cuts.map((s) => rect(s.bar, "black")),
    `</mask>`,
    `<g mask="url(#bands)">`,
    ...drawn,
    `</g>`,
  ].join("")

  // On the tile the mark is inset by the same 82% the raster uses, so the SVG
  // and the PNG are the same picture and not two that nearly agree.
  const scale = 0.82
  const shift = (SIDE * (1 - scale)) / 2
  const inner = tiled
    ? `<g transform="translate(${shift.toFixed(2)} ${shift.toFixed(
        2
      )}) scale(${scale})">${body}</g>`
    : body

  const ground = tiled
    ? `<rect width="${SIDE}" height="${SIDE}" rx="${TILE_RADIUS}" fill="${rgb(INK)}"/>`
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIDE} ${SIDE}">${ground}${inner}</svg>\n`
}

// ──────────────────────────────────────────────────────────────────── door

mkdirSync(join(ROOT, "public"), { recursive: true })

const done = [
  generateIcon(join(ROOT, "public", "icon-192.png"), 192),
  generateIcon(join(ROOT, "public", "icon-512.png"), 512),
  generateIcon(join(ROOT, "app", "apple-icon.png"), 180),
  generateOg(join(ROOT, "public", "og.png")),
]

// Three sizes and not one: 16 is the tab, 32 is the tab on a retina screen and
// the taskbar shortcut, 48 is the shortcut on the desktop. Letting the system
// shrink the 48 down to 16 smears the bands into dirty grey.
writeIco(join(ROOT, "app", "favicon.ico"), [16, 32, 48])
done.push("app/favicon.ico")

writeFileSync(join(ROOT, "app", "icon.svg"), markSvg({ tiled: true }))
done.push("app/icon.svg")
writeFileSync(join(ROOT, "public", "mark.svg"), markSvg({ tiled: false }))
done.push("public/mark.svg")

process.stdout.write(`icons generated:\n  ${done.join("\n  ")}\n`)
