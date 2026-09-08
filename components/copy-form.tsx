"use client"

import Link from "next/link"
import { LoaderCircle, Plus } from "lucide-react"

import { createCopyState } from "@/components/form-actions"
import { FormIssues, SuccessNotice } from "@/components/form-notices"
import {
  formIssues,
  issueFor,
  retainedValue,
  useFormAction,
} from "@/components/form-state"
import { TextField } from "@/components/text-field"
import { Button } from "@/components/ui/button"

/**
 * PUTTING ONE MORE PHYSICAL OBJECT ON THE SHELF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BOOK IS A HIDDEN FIELD, NOT A PICKER.
 *
 * This form is only ever reached from one book's page, so the book is already
 * decided and re-asking would be the software forgetting where the reader came
 * from. It travels as `<input type="hidden" name="bookId">` because that is
 * what makes the plain `POST` carry it with JavaScript off — a value held in a
 * closure would not survive the form being submitted by the browser itself.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT CLEARS AND STAYS PUT, because copies arrive in batches.
 *
 * Three copies of the same title is three barcodes typed one after another. A
 * redirect to the book page after each would be two extra navigations for a
 * job that is one field long. So the barcode clears, the count of what has been
 * added this session is on screen, and the way out is a link the reader takes
 * when they are finished.
 *
 * The duplicate-barcode refusal is the interesting one and it needs no special
 * handling here: `copy.barcode` is `UNIQUE`, `lib/db/books.ts` turns the
 * constraint's refusal into `DuplicateBarcode`, and `lib/db/failures.ts` gives
 * it the `barcode` field — so it lands under this box on its own.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function CopyForm({
  bookId,
  bookTitle,
}: {
  bookId: number
  bookTitle: string
}) {
  const { state, submit, pending } = useFormAction(createCopyState)
  const added = state?.result.ok ? state.result.data : null

  return (
    <form
      action={submit}
      key={state?.attempt ?? 0}
      className="max-w-xl space-y-6"
    >
      <input type="hidden" name="bookId" value={bookId} />

      <FormIssues issues={formIssues(state)} />

      <SuccessNotice>
        {added ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span className="font-mono text-mark">{added.barcode}</span> is on
              the shelf.
            </span>
            <Link
              href={`/books/${bookId}`}
              className="underline underline-offset-4"
            >
              Back to {bookTitle}
            </Link>
          </span>
        ) : null}
      </SuccessNotice>

      <TextField
        id="copy-barcode"
        name="barcode"
        label="Barcode"
        required
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="BK-0001-4"
        description="Whatever is printed on the sticker. It has to be unique across the whole library, because it is what the scanner resolves to exactly one object."
        defaultValue={retainedValue(state, "barcode")}
        issue={issueFor(state, "barcode")}
        // Monospace, because this is read and compared digit by digit against a
        // label in someone's hand — and because `0`/`O` and `1`/`l` are the
        // same shape in the interface face.
        className="font-mono tracking-wide"
      />

      <Button type="submit" size="lg" aria-disabled={pending} className="h-11">
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <Plus aria-hidden />
        )}
        Add the copy
      </Button>
    </form>
  )
}
