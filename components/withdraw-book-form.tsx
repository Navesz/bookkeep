"use client"

import { ChevronRight, LoaderCircle, Trash2 } from "lucide-react"

import { withdrawBookState } from "@/components/form-actions"
import { FormIssues } from "@/components/form-notices"
import { useFormAction } from "@/components/form-state"
import { Button } from "@/components/ui/button"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * WITHDRAWING A BOOK — the one destructive control in the application.
 *
 * IT IS A `<details>`, NOT A DIALOG.
 *
 * The reason is the same one that shaped the lend panel: a dialog needs
 * JavaScript to exist, and a destructive button that silently opens nothing is
 * worse than no button. `<details>`/`<summary>` is a disclosure the browser
 * implements — it opens with a click, with Enter, with Space, it is announced
 * as expandable, and it works before any bundle has loaded.
 *
 * The confirmation is real, not decoration. The step it adds is not "are you
 * sure" — nobody reads that — but a sentence saying WHAT ELSE GOES: every copy
 * of this book on the shelf, because `copy.book_id` cascades. That is a fact
 * about the schema most people would not guess, and it is the one that makes
 * the decision.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE REFUSAL IS THE INTERESTING CASE, AND IT IS NOT AN ERROR.
 *
 * `loan.copy_id` deliberately has no `ON DELETE`, so a book whose copies have
 * ever been lent CANNOT be withdrawn — the loan rows block the delete instead
 * of vanishing with it. Lending history outlives the catalogue entry on
 * purpose. That arrives here as `BookHasHistory`, already turned into a
 * sentence by `lib/db/failures.ts`, and it is shown in the panel rather than
 * thrown, because it is the system working exactly as designed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE A SUCCESSFUL WITHDRAWAL LANDS, AND WHY IT IS NOT A REDIRECT.
 *
 * The first version pushed the reader to the catalogue on success —
 * `router.replace("/")` from an effect watching the result. It does not work,
 * and the way it fails is worth writing down because it looks like it works
 * about half the time.
 *
 * The action ends with `revalidatePath("/", "layout")`. That re-renders this
 * page, `bookById` returns nothing for a book that no longer exists, and
 * `notFound()` throws — which unmounts this component and swaps in the
 * not-found boundary. The effect and the boundary are racing, and the boundary
 * usually wins. Measured: withdrawing a book landed on
 * `/books/16` showing "That book is not in the catalogue", with the redirect
 * never having run.
 *
 * A destructive action that ends in one of two places depending on timing is
 * worse than one that always ends in the same place. So the redirect is gone
 * and the not-found page IS the destination — which is also exactly where the
 * no-JavaScript path lands, so both are the same screen for the same reason.
 * `app/books/[id]/not-found.tsx` is written to be that screen: it says the book
 * may have been withdrawn, which for this reader is confirmation rather than a
 * guess, and offers the catalogue.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function WithdrawBookForm({
  bookId,
  title,
}: {
  bookId: number
  title: string
}) {
  const { state, submit, pending } = useFormAction(withdrawBookState)
  const issues = state && !state.result.ok ? state.result.issues : []

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════════════
          THE REFUSAL IS RENDERED OUTSIDE THE DISCLOSURE, NOT INSIDE IT.

          It was inside at first, next to the button that causes it, which is
          where a field error belongs. It does not work here, and the reason is
          worth writing down: every action in `app/actions.ts` ends with
          `revalidatePath("/", "layout")`. Invalidating the root layout
          re-renders this subtree, and `<details open>` — an attribute React was
          not managing, because nothing set it — came back at its default.

          Measured: press Withdraw on a book with lending history, and the
          refusal really is in the DOM, with `role="alert"`, inside a panel that
          has just shut itself. The reader sees the page flicker and nothing
          else, with the explanation one click away and no reason to think there
          is one.

          Controlling `open` with state was the first fix and it is worse: it
          makes the browser's own disclosure something React fights over, and
          a panel that will not close while an error stands is its own
          annoyance. Putting the message above the disclosure means it cannot be
          hidden by the disclosure at all — which is what a refusal needs, since
          it is about the whole action rather than about anything inside the
          panel.
          ═══════════════════════════════════════════════════════════════════ */}
      <FormIssues issues={issues} />

      <details className="group rounded-xl border border-border">
        <summary
          // `list-none` plus the WebKit pseudo-element kills the platform
          // triangle, which is a different glyph on every browser and the one
          // part of the page that would ignore the theme. The chevron beside the
          // text replaces it and rotates on open.
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-row text-muted-foreground outline-none marker:content-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          Withdraw this book
        </summary>

        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="max-w-2xl text-row text-muted-foreground">
            Withdrawing <span className="text-foreground">{title}</span> removes
            the catalogue record{" "}
            <strong className="font-medium">
              and every copy of it on the shelf
            </strong>
            . It cannot be undone. A book whose copies have ever been lent
            cannot be withdrawn at all — the lending history outlives the
            catalogue entry, and the database refuses.
          </p>

          <form action={submit}>
            <input type="hidden" name="bookId" value={bookId} />
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              aria-disabled={pending}
              className="h-11"
            >
              {pending ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : (
                <Trash2 aria-hidden />
              )}
              {/* The title is in the accessible name as well as on screen: a
                control that destroys something should say what, in the one
                place a screen reader reads before activating it. */}
              Withdraw <span className="sr-only">{title}</span>
            </Button>
          </form>
        </div>
      </details>
    </div>
  )
}
