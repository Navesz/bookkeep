"use client"

import Link from "next/link"
import { LoaderCircle, Plus } from "lucide-react"

import { createBookState } from "@/components/form-actions"
import { EARLIEST_PUBLICATION_YEAR } from "@/lib/validation.ts"
import { FormIssues, SuccessNotice } from "@/components/form-notices"
import {
  formIssues,
  issueFor,
  retainedValue,
  useFormAction,
} from "@/components/form-state"
import { TextField } from "@/components/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

/**
 * ADDING A BOOK — the WORK, not a copy of it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THERE IS NO BARCODE FIELD HERE, AND ITS ABSENCE IS THE POINT.
 *
 * `book` and `copy` are separate tables because a title can have any number of
 * physical objects behind it, including none — a book on order is a legitimate
 * record. Asking for a barcode on this form would quietly make "one book, one
 * copy" the only shape the system knows, which is the modelling mistake the
 * schema was designed to avoid. The success notice therefore offers the next
 * step rather than performing it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FORM STAYS ON SCREEN AFTER A SUCCESS, AND DOES NOT REDIRECT.
 *
 * Cataloguing is done in batches — a delivery arrives and eleven books go in.
 * Redirecting to each new record would mean eleven trips back. So the form
 * clears itself, says what it just added with a link to it, and is ready for
 * the next one. That behaviour is identical with JavaScript off, which a
 * redirect-then-return dance would not be.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function BookForm() {
  const { state, submit, pending } = useFormAction(createBookState)
  const added = state?.result.ok ? state.result.data : null

  return (
    <form
      action={submit}
      // Remounts on each completed submission so the `defaultValue`s below are
      // actually taken: React 19 resets an uncontrolled form once its action
      // settles, which would otherwise discard the values a refused form needs
      // to keep.
      key={state?.attempt ?? 0}
      className="max-w-2xl space-y-6"
    >
      <FormIssues issues={formIssues(state)} />

      <SuccessNotice>
        {added ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Added “{added.title}”.</span>
            <Link
              href={`/books/${added.id}/copies/new`}
              className="underline underline-offset-4"
            >
              Add a copy
            </Link>
            <span aria-hidden>·</span>
            <Link
              href={`/books/${added.id}`}
              className="underline underline-offset-4"
            >
              Open the record
            </Link>
          </span>
        ) : null}
      </SuccessNotice>

      <FieldGroup>
        <TextField
          id="book-title"
          name="title"
          label="Title"
          required
          autoFocus
          autoComplete="off"
          defaultValue={retainedValue(state, "title")}
          issue={issueFor(state, "title")}
        />

        <TextField
          id="book-author"
          name="author"
          label="Author"
          required
          autoComplete="off"
          defaultValue={retainedValue(state, "author")}
          issue={issueFor(state, "author")}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="book-isbn"
            name="isbn"
            label="ISBN"
            optional
            // `inputMode="numeric"` and not `type="number"`: an ISBN-10 can end
            // in `X`, and a number input would silently refuse to hold it while
            // also offering spinner arrows for a value nothing increments. The
            // keyboard hint is the part worth having on a phone.
            inputMode="numeric"
            autoComplete="off"
            placeholder="978-0-14-143951-8"
            description="ISBN-10 or ISBN-13, with or without hyphens. Leave it blank if the book has none — the number was only introduced in 1970."
            defaultValue={retainedValue(state, "isbn")}
            issue={issueFor(state, "isbn")}
          />

          <TextField
            id="book-year"
            name="publishedYear"
            label="Published"
            optional
            inputMode="numeric"
            autoComplete="off"
            placeholder="1813"
            // The floor comes from `lib/validation.ts` rather than being typed
            // here, so the hint and the rule that enforces it cannot drift.
            description={`Four digits, ${EARLIEST_PUBLICATION_YEAR} or later.`}
            defaultValue={retainedValue(state, "publishedYear")}
            issue={issueFor(state, "publishedYear")}
            className="tabular-nums"
          />
        </div>
      </FieldGroup>

      <Button type="submit" size="lg" aria-disabled={pending} className="h-11">
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <Plus aria-hidden />
        )}
        Add to the catalogue
      </Button>
    </form>
  )
}
