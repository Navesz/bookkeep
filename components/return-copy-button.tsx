"use client"

import { LoaderCircle, Undo2 } from "lucide-react"

import { returnLoanState } from "@/components/form-actions"
import { useFormAction } from "@/components/form-state"
import { Button } from "@/components/ui/button"

/**
 * "Return", beside one row of the copies table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS A `<form>`, NOT A BUTTON WITH AN `onClick`.
 *
 * The loan id travels in a hidden input, so with JavaScript off the browser
 * posts it, `returnLoanById` runs on the server exactly as it would have, and
 * the page comes back with the row updated. A click handler would leave a
 * button that silently does nothing — the worst of the three possible failures,
 * because it looks like it worked.
 *
 * WHY THE ERROR IS RENDERED HERE, IN THE ROW, AND NOT AT THE TOP OF THE PAGE.
 * The realistic refusal is "that loan is not open" — somebody else took the
 * book back on the other terminal while this page sat open. The reader's eyes
 * are on the row whose button they just pressed; a banner above the fold is a
 * message delivered to where they are not looking. `role="alert"` still
 * announces it for anyone not looking at all.
 *
 * WHY THE BUTTON DOES NOT SAY "RETURNING…". On success this row is replaced —
 * `revalidatePath` in `app/actions.ts` re-renders the page and the copy is back
 * on the shelf — so the label would change for the duration of one round trip
 * and then vanish with the element. The spinner replaces the icon instead: same
 * width, no reflow, and `aria-disabled` rather than `disabled` so the control
 * keeps its place in the tab order while it is in flight.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function ReturnCopyButton({
  loanId,
  barcode,
}: {
  loanId: number
  /** Only for the accessible name — see below. */
  barcode: string
}) {
  const { state, submit, pending } = useFormAction(returnLoanState)
  const failed = state && !state.result.ok ? state.result.issues : []

  return (
    <form action={submit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="loanId" value={loanId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-disabled={pending}
        // 44px tall even though the visual button is a `sm`: a table of six
        // copies is six targets in a column, and this is the one that is
        // pressed a hundred times a day.
        className="h-11 px-3"
      >
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <Undo2 aria-hidden />
        )}
        Return
        {/* Six buttons all called "Return" is six identical entries in a screen
            reader's list of controls. The barcode is what tells them apart, and
            it is the same string printed on the sticker in the reader's hand. */}
        <span className="sr-only"> copy {barcode}</span>
      </Button>

      {failed.length > 0 ? (
        <p
          role="alert"
          className="max-w-56 text-right text-caption text-overdue-foreground"
        >
          {failed[0].message}
        </p>
      ) : null}
    </form>
  )
}
