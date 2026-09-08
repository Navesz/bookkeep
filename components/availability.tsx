import { cn } from "@/lib/utils"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * "3 of 5 available" — AND WHY IT IS NEVER A YES/NO.
 *
 * A boolean answers the question the catalogue is asked and none of the ones
 * that follow it. "Available" tells a librarian they can hand over a copy; it
 * does not tell them this is the LAST copy, which is what decides whether to
 * take a reservation, chase the two that are out, or order a sixth. Two numbers
 * cost the same row height as a green tick and answer all three.
 *
 * The count is exact rather than approximate, and the reason is in
 * `lib/db/books.ts`: the partial unique index `one_open_loan_per_copy` means a
 * copy can hold at most one open loan, so the aggregate cannot double-count.
 *
 * THREE STATES, NOT TWO. A book with no copies at all is not "0 of 0
 * available" — that is a sentence about nothing. It is a title the catalogue
 * knows and the shelf does not have, which is a real and different situation
 * (on order, lost, catalogued ahead of delivery), and it gets its own words.
 *
 * THE DOT IS NOT THE MESSAGE. `--shelved` and `--on-loan` are two of the three
 * circulation colours `app/globals.css` defines, and they are used here in the
 * order that file intends: cloth green for something on the shelf, brass for
 * something that is out. But the sentence beside the dot says the whole thing
 * on its own, so nothing is carried by hue alone — which is the test this
 * fails if the dot is ever asked to replace the words.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function Availability({
  available,
  copies,
  className,
}: {
  available: number
  copies: number
  className?: string
}) {
  const none = copies === 0
  const allOut = !none && available === 0

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-row whitespace-nowrap",
        none ? "text-muted-foreground" : "text-foreground",
        className
      )}
    >
      {/* Hidden from the accessibility tree: the sentence beside it already
          encodes everything the dot does, and a screen reader announcing a
          bullet before every row of twenty is noise with no content. */}
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          none
            ? "ring-1 ring-muted-foreground/60"
            : allOut
              ? "bg-on-loan-foreground"
              : "bg-shelved-foreground"
        )}
      />
      {none ? (
        "No copies on the shelf"
      ) : (
        <>
          {/* `tabular-nums` so the digits sit in fixed-width cells. In a list
              of twenty results the counts stack into a column, and
              proportional digits make that column ripple — a `1` is close to
              half the width of a `3` in most sans faces, so the word
              "available" lands somewhere different on every row. The base
              layer sets this on `table`; a list is not a table, so it is set
              here. */}
          <span
            className={cn("tabular-nums", allOut ? "font-normal" : "font-medium")}
          >
            {available} of {copies}
          </span>
          <span className={cn(allOut && "text-muted-foreground")}>
            available
          </span>
        </>
      )}
    </span>
  )
}
