import { Skeleton } from "@/components/ui/skeleton"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * WHAT A `loading.tsx` DRAWS, AND WHY IT DRAWS THE NAVIGATION TOO.
 *
 * The section navigation lives in `PageFrame`, which every PAGE renders — not
 * the layout. So while a page is suspended, the navigation is not on screen
 * either, and a skeleton that only covered the content would make the tabs
 * blink out and back on every navigation. A grey strip the shape of the tabs
 * holds that space.
 *
 * NOTHING HERE TOUCHES THE DATABASE, which is also why `PageFrame` cannot be
 * reused: it counts overdue loans, and a loading state that has to query is a
 * loading state that has to wait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HONESTLY: THESE ARE ALMOST NEVER SEEN, AND THEY ARE STILL WORTH HAVING.
 *
 * The queries behind these screens are single-digit milliseconds against a file
 * in the same process — there is no network between the page and its data — so
 * on a warm server the skeleton flashes for less than a frame. It matters in
 * exactly the cases nobody tests: the first request after a cold start, a
 * database on a slow or contended disk, and a client navigation on a phone
 * where the RSC payload is crossing a real network.
 *
 * `aria-busy` and the hidden sentence are what make the wait perceivable
 * without sight. Grey rectangles announce nothing at all on their own.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function PageSkeleton({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only" role="status">
        Loading
      </span>

      {/* The section navigation strip: four tabs and the rule under them. */}
      <div aria-hidden className="-mt-2 border-b border-border">
        <div className="flex gap-4 pb-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-18" />
          <Skeleton className="h-5 w-18" />
        </div>
      </div>

      <div aria-hidden className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>

      <div aria-hidden>{children}</div>
    </div>
  )
}

/**
 * A stack of rows the shape of the catalogue and member lists.
 *
 * The widths alternate rather than being uniform, because a column of
 * identical grey bars reads as a loading GRID and the thing arriving is a list
 * of titles of different lengths. The alternation is deterministic — a
 * `Math.random()` width would differ between the server's HTML and the
 * client's first render, which is a hydration mismatch for a decoration.
 */
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  const widths = ["w-64", "w-48", "w-72", "w-56", "w-40", "w-68", "w-52", "w-60"]

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex min-h-16 items-center justify-between gap-6 px-4 py-3"
        >
          <div className="space-y-2">
            <Skeleton className={`h-4 ${widths[index % widths.length]}`} />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-4 w-28 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** The shape of a table: a header rule, then rows of cells. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-8 border-b border-border pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-8 py-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-4xl" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-11 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
