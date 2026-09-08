import { SHAPES, SIDE, type Role } from "@/lib/brand"
import { cn } from "@/lib/utils"

/**
 * THE MARK, drawn from `lib/brand.ts` — the same data `tools/generate-icons.mjs`
 * rasterises into the PNGs and writes into `app/icon.svg`. Nothing about the
 * shape is written here; this file only decides what colour each role gets and
 * emits one `<rect>` per bar.
 *
 * Colours: the volumes take `currentColor`, so the mark inherits the text
 * colour of whatever it sits in and follows the theme for free. The shelf board
 * takes `--brand`, because the board is the system and the books are what it
 * holds. On the icon tile the split is the same, in paper and bookcloth over
 * ink.
 */

/**
 * The mask id is FIXED rather than taken from `useId()`, and that keeps this a
 * server component — `useId` is a hook and a hook would force `"use client"` on
 * something that is a pile of static rectangles.
 *
 * Two copies of the mark on one page therefore declare the same id twice. That
 * is safe HERE and nowhere else: both masks have byte-identical contents, so
 * whichever one the document resolves to draws the identical picture. The day
 * this component takes a prop that changes the cuts, it needs a real unique id.
 */
const MASK_ID = "bookkeep-mark-bands"

const FILL: Record<Role, string> = {
  volume: "currentColor",
  shelf: "var(--brand)",
}

function rect(bar: (typeof SHAPES)[number]["bar"], key: string, fill: string) {
  return (
    <rect
      key={key}
      x={bar.x}
      y={bar.y}
      width={bar.width}
      height={bar.height}
      rx={bar.radius}
      fill={fill}
      transform={
        bar.rotation
          ? `rotate(${bar.rotation.toFixed(3)} ${(
              bar.x +
              bar.width / 2
            ).toFixed(3)} ${(bar.y + bar.height / 2).toFixed(3)})`
          : undefined
      }
    />
  )
}

export function Mark({
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children">) {
  const cuts = SHAPES.filter((shape) => shape.op === "cut")
  // The board is drawn first: the volumes stand over it and hide their own
  // feet, so no seam shows where the two meet.
  const order: Role[] = ["shelf", "volume"]

  return (
    <svg
      viewBox={`0 0 ${SIDE} ${SIDE}`}
      xmlns="http://www.w3.org/2000/svg"
      // Decorative by default: wherever it appears the product name is right
      // beside it, and a screen reader announcing "bookkeep bookkeep" is worse
      // than one that says it once. Pass `aria-hidden={false}` with a `<title>`
      // if it ever has to stand alone.
      aria-hidden
      focusable="false"
      className={cn("size-6", className)}
      {...props}
    >
      {/* `maskUnits` is spelled out because the SVG default is the bounding box
          of the masked group padded by 10%, and these rectangles are written in
          user space. Left to the default, the bands land near the drawing
          rather than on it. */}
      <mask
        id={MASK_ID}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={SIDE}
        height={SIDE}
      >
        <rect width={SIDE} height={SIDE} fill="white" />
        {cuts.map((shape, i) => rect(shape.bar, `cut-${i}`, "black"))}
      </mask>
      <g mask={`url(#${MASK_ID})`}>
        {order.flatMap((role) =>
          SHAPES.filter(
            (shape) => shape.op === "ink" && shape.role === role
          ).map((shape, i) => rect(shape.bar, `${role}-${i}`, FILL[role]))
        )}
      </g>
    </svg>
  )
}
