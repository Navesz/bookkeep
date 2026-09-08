import { CircleAlert, CircleCheck } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { Issue } from "@/lib/validation.ts"

/**
 * THE TWO BANNERS EVERY FORM USES: it worked, or it did not.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WHY THESE ARE HAND-ROLLED RATHER THAN `components/ui/alert.tsx`.
 *
 * `Alert` sets `role="alert"` on itself, unconditionally. `role="alert"` is
 * `aria-live="assertive"`: it interrupts whatever the screen reader is saying.
 *
 * That is correct for a refusal and wrong for a confirmation, and using the
 * component for both produced a genuine conflict — a success banner wrapped in
 * a polite `role="status"` region with an assertive `role="alert"` inside it.
 * Two live regions, nested, disagreeing about urgency, announcing the same
 * sentence twice. Since the role cannot be turned off from the outside, the
 * box is fifteen lines of markup here instead, and each banner carries exactly
 * one role.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BOTH REGIONS ARE IN THE DOM EVEN WHEN THEY ARE EMPTY.
 *
 * A live region is announced when its CONTENT changes. An element that appears
 * for the first time already holding text is, to a good part of the assistive
 * stack, just new markup — `role="alert"` is usually announced on insertion,
 * `aria-live="polite"` frequently is not. Rendering the container on every
 * pass, empty until there is something to say, means the message always arrives
 * into a region that was already being watched. It costs one empty `<div>`.
 *
 * WHY A SUCCESS BANNER AT ALL, on a screen that also re-renders with the new
 * data: because the change can be off-screen. Lending from the copies table on
 * a phone moves one row's status, and the row may be below the fold while the
 * librarian's eyes are on the book. A sentence in a fixed place is the only
 * feedback that does not depend on where you were looking.
 * ═════════════════════════════════════════════════════════════════════════
 */

export function FormIssues({
  issues,
  className,
}: {
  /** Only the issues with no field of their own — see `formIssues`. */
  issues: Issue[]
  className?: string
}) {
  return (
    // `role="alert"` on the WRAPPER, not on the box inside it, so the region
    // exists before there is anything in it. It carries an implicit
    // `aria-live="assertive"` and `aria-atomic="true"`, which is what makes the
    // whole sentence read rather than the word that changed.
    <div role="alert" className={cn(issues.length > 0 && className)}>
      {issues.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-overdue-foreground/30 bg-overdue px-3 py-2.5 text-overdue-foreground">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1 text-row">
            {/* "That did not work" and not "Error": the reader is a librarian
                mid-transaction, and what they need first is that nothing was
                saved — not that a category of event occurred. */}
            <p className="font-medium">That did not work</p>
            {issues.length === 1 ? (
              <p>{issues[0].message}</p>
            ) : (
              <ul className="ml-4 list-disc space-y-1">
                {issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SuccessNotice({
  children,
  className,
}: {
  /** `null` when there is nothing to announce — the region still renders. */
  children?: ReactNode
  className?: string
}) {
  return (
    // `role="status"` is the polite counterpart, and it is the only live role
    // in this subtree. "Lent to Ada Lovelace" can wait for the current sentence
    // to finish; at the desk one of these lands every few seconds, and
    // interrupting each time makes a screen reader unusable.
    <div
      role="status"
      aria-live="polite"
      className={cn(children ? className : undefined)}
    >
      {children ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-border/40 bg-brand-subtle px-3 py-2.5 text-row font-medium text-brand-subtle-foreground">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">{children}</div>
        </div>
      ) : null}
    </div>
  )
}
