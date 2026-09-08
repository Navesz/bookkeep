// THE GEOMETRY OF THE MARK, in exactly one place.
//
// WHAT IT DEPICTS: a shelf with a gap in it.
//
// Two volumes stand upright, a third leans, and the shelf board runs under all
// three. The lean is not decoration — it is the point. A book leans because the
// one beside it is not there, and a book that is not on the shelf is a book
// that is out on loan. That gap is the entire subject of this system: a
// catalogue records what exists, a circulation system records what is missing.
// The mark shows the missing one by showing what fell into its place.
//
// Each volume carries ONE raised band cut across the spine, the way a sewn
// binding does. The band is 2.6 units in a box of 100 — 0.34px at 16px — so at
// favicon size it closes to a faint grey and the spine reads solid, and at
// 512px it opens into the detail that says these are bound books and not bars
// on a chart. One band and not two: rendered at 16 and 24px, two bands per
// spine turned all three volumes into grey stripes, which is exactly the
// failure the trick is supposed to avoid.
//
// WHY THE SHAPE IS DATA AND NOT A `<path d="…">`: the same drawing has to come
// out as `<rect>`s in a React component, as `app/icon.svg`, and as rasterised
// PNGs from `tools/generate-icons.mjs`. A hand-written path would be three
// copies that diverge on the first correction. Declared as shapes, the
// rasteriser measures the distance to each bar and the component emits a
// rectangle — one source, three outputs.
//
// Node strips the types on import, so `tools/generate-icons.mjs` reads this
// `.ts` file directly with no build step. The extension is on the import for
// the same reason it is on every other relative import in this repository.
//
// The coordinate system is a 100×100 box. The drawing occupies x 6..92 and
// y 18..92; the renderers inset it further inside the icon tile so the mark
// never touches the rounded corner.

export type Bar = {
  // Top-left corner and size, BEFORE the rotation.
  x: number
  y: number
  width: number
  height: number
  radius: number
  // Rotation in degrees, clockwise, about the bar's own centre.
  rotation?: number
}

// "volume" is a book, "shelf" is the board they stand on. The role is what the
// two renderers colour by: the icon paints the volumes in paper and the board
// in bookcloth, and the header paints the volumes in the current text colour
// and the board in the brand colour. Neither renderer knows which rectangle is
// which — it asks the role.
export type Role = "volume" | "shelf"

export type Shape = {
  bar: Bar
  // "ink" adds the bar to the drawing; "cut" removes it from every role.
  op: "ink" | "cut"
  role: Role
}

export const SIDE = 100

// One thickness for every volume. Books on a real shelf differ in HEIGHT, not
// in the width of their spine by a factor of two; varying both turns the row
// into a bar chart.
//
// 20 units and not the 17 this started at. At 16px the drawing has about
// thirteen pixels to work with, and a 17-unit spine came out 2.1px wide with
// 1px between it and the next one: the three volumes fused into one grey
// smudge. Fatter spines and a drawing that runs nearly edge to edge is what
// buys the favicon.
const SPINE = 20
const RADIUS = 2.5

// The top of the shelf board. Every volume's foot runs past it, into the board,
// so the union leaves no seam where the two meet.
const BOARD_TOP = 82
const FOOT = BOARD_TOP + 4

// A bar declared by the two points its centreline joins, because that is how
// you think about a leaning book — not as a width and an angle.
function barBetween(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  radius: number
): Bar {
  // The thickness is added to the length so the endpoints land at the centre of
  // the rounded caps: the bar reaches the points given, it does not stop short
  // of them by half its own width.
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

// The gap a raised band cuts. 2.6 units in a box of 100.
const BAND = 2.6

function band(x: number, y: number, width: number, rotation: number): Shape {
  return {
    bar: {
      x: x - width / 2,
      y: y - BAND / 2,
      width,
      height: BAND,
      radius: BAND / 2,
      rotation,
    },
    op: "cut",
    // A cut is subtracted from every role, so the role here only satisfies the
    // type; it is never read.
    role: "volume",
  }
}

// The leaning volume: its head rests against the tall one, its foot has slid
// out across the empty slot. 16 degrees off vertical — enough to read as
// fallen at 16px, not so much that it stops reading as a book.
const LEANING = barBetween(65.4, 34, 78.6, 80, SPINE, RADIUS)

// The angle the leaning volume makes with the horizontal, so a band cut across
// it sits square to ITS spine rather than to the page.
const LEAN_ANGLE = LEANING.rotation ?? 0

export const SHAPES: readonly Shape[] = [
  // The board first: the volumes are drawn over it and hide their own feet.
  {
    bar: { x: 6, y: BOARD_TOP, width: 86, height: 10, radius: RADIUS },
    op: "ink",
    role: "shelf",
  },

  // The short upright volume.
  {
    bar: { x: 9, y: 34, width: SPINE, height: FOOT - 34, radius: RADIUS },
    op: "ink",
    role: "volume",
  },
  // The tall one. The leaning volume rests on it.
  {
    bar: { x: 35, y: 18, width: SPINE, height: FOOT - 18, radius: RADIUS },
    op: "ink",
    role: "volume",
  },
  { bar: LEANING, op: "ink", role: "volume" },

  // Raised bands. Each one runs the FULL width of its spine and a little past
  // it — a band that stops inside the shape reads as damage, not as a binding.
  // A cut is subtracted from every volume it crosses, though, so the tall one's
  // band is kept short enough that its ends clear the leaning spine; run it
  // wider and it bites a notch out of that edge.
  band(19, 58, 24, 0),
  band(45, 48, 24, 0),
  // Square to the leaning spine, not to the page.
  band(71.1, 54, 24, LEAN_ANGLE - 90),
]

// The clip of the square icon: a rounded square the size of the box. It lives
// here so the PNG and the SVG agree about the corner.
export const TILE_RADIUS = 22
