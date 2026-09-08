import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * THE TOP OF EVERY SCREEN: one `<h1>`, an optional sentence under it, and the
 * actions that belong to the page as a whole.
 *
 * IT RENDERS THE `<h1>` ITSELF, and that is the reason it exists rather than
 * being copied JSX. One `<h1>` per document is the rule; nine pages each
 * hand-rolling their own heading is nine chances to open with an `<h2>` because
 * a section above it looked like the title. The heading tree of this app starts
 * here, in one file, and every `<h2>` below it is a real section.
 *
 * NO `text-balance` AND NO `font-heading` ARE WRITTEN HERE. Both already come
 * from the base layer in `app/globals.css`, which sets the reading face on
 * `h1`–`h3` and balances every heading. Repeating them would be a second copy
 * of a decision that already has an owner — and the day the base layer changes
 * its mind, this file would quietly keep the old answer.
 *
 * `text-h1` and `text-lead` are that file's scale, not ad-hoc sizes: `--text-h1`
 * is `clamp(2rem, 1.5rem + 2.1vw, 2.75rem)`, so the title shrinks on a phone
 * instead of taking four lines and eating the fold.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Page-level buttons, right-aligned from `sm` and stacked below on phones. */
  actions?: ReactNode
  /** A quiet line ABOVE the title — what this record is, not what it is called. */
  eyebrow?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // The gap grows with the viewport rather than the actions moving up:
        // on a phone the buttons sit under the sentence they act on, which is
        // the reading order, and only from `sm` do they move to the right where
        // there is room for them without squeezing the title.
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-h1">{title}</h1>
        {description ? (
          // `max-w-2xl` is the reading measure. The page container is 72rem
          // wide, and a sentence set across all of it is swept rather than
          // read — roughly 140 characters a line against the 60-75 that
          // typography has settled on.
          <p className="max-w-2xl text-lead text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        // `shrink-0` so a long title never squeezes a button into two lines of
        // one word each, and `flex-wrap` so two buttons at 375px stack instead
        // of overflowing the viewport.
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
