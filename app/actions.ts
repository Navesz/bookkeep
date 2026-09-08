"use server"

import { revalidatePath } from "next/cache"

import { addBook, addCopy, removeBook } from "@/lib/db/books.ts"
import type { Book, Copy } from "@/lib/db/books.ts"
import { explain } from "@/lib/db/failures.ts"
import { lendByBarcode, returnByBarcode, returnLoan } from "@/lib/db/loans.ts"
import type { Loan } from "@/lib/db/loans.ts"
import { addMember } from "@/lib/db/members.ts"
import type { Member } from "@/lib/db/members.ts"
import { seed } from "@/lib/db/seed.ts"
import type { SeedSummary } from "@/lib/db/seed.ts"
import {
  checkBarcode,
  checkBookId,
  checkLend,
  checkLoanId,
  checkNewBook,
  checkNewCopy,
  checkNewMember,
} from "@/lib/validation.ts"
import type { Issue } from "@/lib/validation.ts"

/**
 * How the desk changes anything. Every mutation in the application is one of
 * the functions below, and each is the same three steps in the same order:
 * CHECK the input, TRY the write, TRANSLATE whatever comes back.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THEY RETURN FAILURES, THEY DO NOT THROW THEM.
 *
 * A thrown error in a server action becomes the nearest error boundary: the
 * whole screen is replaced, the half-filled form is gone, and in production
 * Next replaces the message with a digest anyway. That is the right response
 * to a fault and the wrong response to a librarian typing an ISBN with one
 * digit out of place. So the ordinary refusals — a duplicate barcode, a copy
 * that is already out, a bad check digit — come back as VALUES, next to the
 * field that caused them, with the rest of the form still on screen.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO RAW SQLITE MESSAGE CAN REACH THE BROWSER, AND `attempt` IS WHY.
 *
 * `UNIQUE constraint failed: book.isbn` is a true sentence about an index and
 * a useless one to the person holding the book. Every call into `lib/db` goes
 * through `attempt`, which asks `explain` for the desk-readable version and,
 * when there isn't one, logs the real error server-side and returns a generic
 * apology. There is no path from a driver error to the screen: the only
 * strings a reader can see are the ones written by hand in
 * `lib/db/failures.ts` and `lib/validation.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THEY TAKE `FormData` AND NOTHING ELSE.
 *
 * It is the one shape that works from every direction: `<form action={…}>`
 * passes exactly this with no client JavaScript at all, so the desk keeps
 * working on a machine where the bundle failed to load. A `useActionState`
 * caller wraps it in one line —
 *
 *   useActionState(async (_previous, form) => lendCopy(form), null)
 *
 * — whereas an action written for `useActionState`'s two-argument signature
 * cannot be handed to a plain `<form>` at all. The uniform shape is also the
 * contract: every action here reads named fields, and the names are listed on
 * each one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * READS ARE NOT HERE, ON PURPOSE. A server component calls `lib/db` directly;
 * routing a SELECT through a server action would add a round trip and a
 * serialisation boundary to a function call.
 */

/** Success carries the row that was written; failure carries what to fix. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: Issue[] }

/**
 * `FormData.get` returns `File | string | null`, and only one of those is an
 * answer to "what did they type". A file where a text field was expected is a
 * tampered or malformed submission, and it becomes the empty string so the
 * checkers in `lib/validation.ts` refuse it as missing — which is what it is.
 */
function field(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}

/**
 * The apology for something nobody anticipated.
 *
 * "Nothing was saved" is a promise, and it is one this codebase can actually
 * keep: every write in `lib/db` is a single statement, except `seed`, which
 * runs inside a transaction that rolls back. There is no operation here that
 * can fail halfway and leave part of itself behind.
 */
const UNEXPECTED: Issue = {
  field: null,
  code: "unexpected",
  message:
    "Something went wrong at our end and nothing was saved. Try again — if it keeps happening, the details are in the server log.",
}

function refused(issues: Issue[]): { ok: false; issues: Issue[] } {
  return { ok: false, issues }
}

/**
 * Run one call into the data layer and turn anything it throws into a value.
 *
 * The `console.error` is not decoration. It is the only place the real error
 * survives — the reader gets `UNEXPECTED`, so if this line is removed, an
 * unanticipated failure becomes completely silent and the bug is invisible
 * from both ends.
 */
function attempt<T>(work: () => T): ActionResult<T> {
  try {
    return { ok: true, data: work() }
  } catch (error) {
    const known = explain(error)
    if (known) return refused([known])

    console.error("[bookkeep] unexpected failure in a server action:", error)
    return refused([UNEXPECTED])
  }
}

/**
 * WHY EVERY MUTATION INVALIDATES THE WHOLE APP, AND WHEN TO NARROW IT.
 *
 * Lending one copy changes the book's availability, the member's record, the
 * count of what is out and the overdue list — four screens from one INSERT. A
 * per-path list would therefore be nearly the whole path list anyway, and
 * every path in it would be a guess: the routes are being built in parallel
 * with this file, and `revalidatePath` on a path that does not exist yet is a
 * line that silently does nothing and reads like it works.
 *
 * `revalidatePath("/", "layout")` invalidates the root layout and everything
 * nested under it, which is correct for all of them and merely broad. The day
 * the routes settle, this becomes a short list per mutation — and it is one
 * function, so that change happens once.
 */
function refresh(): void {
  revalidatePath("/", "layout")
}

// ── the catalogue ─────────────────────────────────────────────────────────

/**
 * Add a book to the catalogue — the work, not a copy of it.
 *
 * Fields: `title`, `author`, `isbn` (optional), `publishedYear` (optional).
 *
 * A book with no copies is a legitimate record — it is a title on order — so
 * this deliberately does not ask for a barcode. `createCopy` puts the objects
 * on the shelf, and the two are separate because a book can have any number of
 * copies including none.
 */
export async function createBook(
  form: FormData
): Promise<ActionResult<Book>> {
  const checked = checkNewBook({
    title: field(form, "title"),
    author: field(form, "author"),
    isbn: field(form, "isbn"),
    publishedYear: field(form, "publishedYear"),
  })
  if (!checked.ok) return refused(checked.issues)

  // The ISBN reaching `addBook` is the canonical ISBN-13 that `checkNewBook`
  // produced, never the hyphenated ISBN-10 that may have been typed. That is
  // what lets `book.isbn UNIQUE` recognise the two notations as one book.
  const result = attempt(() => addBook(checked.value))
  if (result.ok) refresh()
  return result
}

/**
 * Put one more physical object on the shelf.
 *
 * Fields: `bookId`, `barcode`.
 */
export async function createCopy(
  form: FormData
): Promise<ActionResult<Copy>> {
  const checked = checkNewCopy({
    bookId: field(form, "bookId"),
    barcode: field(form, "barcode"),
  })
  if (!checked.ok) return refused(checked.issues)

  const result = attempt(() => addCopy(checked.value.bookId, checked.value.barcode))
  if (result.ok) refresh()
  return result
}

/**
 * Withdraw a book, and with it every copy on the shelf.
 *
 * Fields: `bookId`.
 *
 * `removeBook` returns false rather than throwing when there is no such book,
 * because deleting nothing is not an error at the data layer. At the desk it
 * still needs saying — the row was there when the page rendered and is not
 * there now — so it becomes a refusal here rather than a silent success.
 */
export async function withdrawBook(
  form: FormData
): Promise<ActionResult<{ id: number }>> {
  const checked = checkBookId({ bookId: field(form, "bookId") })
  if (!checked.ok) return refused(checked.issues)

  const removed = attempt(() => removeBook(checked.value.bookId))
  if (!removed.ok) return removed

  if (!removed.data) {
    return refused([
      {
        field: "bookId",
        code: "NoSuchBook",
        message:
          "That book is not in the catalogue any more — somebody withdrew it while this page was open. Reload to see the catalogue as it is now.",
      },
    ])
  }

  refresh()
  return { ok: true, data: { id: checked.value.bookId } }
}

// ── the members ───────────────────────────────────────────────────────────

/**
 * Issue a library card.
 *
 * Fields: `name`, `email`.
 *
 * The address is validated here and lowercased in `lib/db/members.ts`, so
 * `Ada@Example.org` and `ada@example.org` cannot become two people.
 */
export async function createMember(
  form: FormData
): Promise<ActionResult<Member>> {
  const checked = checkNewMember({
    name: field(form, "name"),
    email: field(form, "email"),
  })
  if (!checked.ok) return refused(checked.issues)

  const result = attempt(() => addMember(checked.value))
  if (result.ok) refresh()
  return result
}

// ── the desk ──────────────────────────────────────────────────────────────

/**
 * Lend a copy: one scan and one name.
 *
 * Fields: `barcode`, `memberId`.
 *
 * The barcode is resolved inside the INSERT — see `lendByBarcode` — so there
 * is no moment between finding the copy and lending it in which somebody else
 * can lend the same one.
 */
export async function lendCopy(form: FormData): Promise<ActionResult<Loan>> {
  const checked = checkLend({
    barcode: field(form, "barcode"),
    memberId: field(form, "memberId"),
  })
  if (!checked.ok) return refused(checked.issues)

  const result = attempt(() =>
    lendByBarcode(checked.value.barcode, checked.value.memberId)
  )
  if (result.ok) refresh()
  return result
}

/**
 * Take a copy back, from the sticker.
 *
 * Fields: `barcode`.
 *
 * This is the returns desk: the book is in the librarian's hand and the only
 * number on it is the barcode.
 */
export async function returnCopy(form: FormData): Promise<ActionResult<Loan>> {
  const checked = checkBarcode({ barcode: field(form, "barcode") })
  if (!checked.ok) return refused(checked.issues)

  const result = attempt(() => returnByBarcode(checked.value.barcode))
  if (result.ok) refresh()
  return result
}

/**
 * Take a copy back, from a row on screen.
 *
 * Fields: `loanId`.
 *
 * The same operation as `returnCopy` reached from the other direction: a
 * button beside a loan in a list, where the id is already on the page and
 * there is no sticker to scan. Both exist because both happen.
 */
export async function returnLoanById(
  form: FormData
): Promise<ActionResult<Loan>> {
  const checked = checkLoanId({ loanId: field(form, "loanId") })
  if (!checked.ok) return refused(checked.issues)

  const result = attempt(() => returnLoan(checked.value.loanId))
  if (result.ok) refresh()
  return result
}

// ── the demo data ─────────────────────────────────────────────────────────

/**
 * Fill an empty library with the sample catalogue. Takes no fields.
 *
 * It refuses to run twice, and the refusal is the database's — the second run
 * collides with `copy.barcode` on its first copy and the whole transaction
 * rolls back. `AlreadySeeded` is what that refusal looks like once translated.
 */
export async function seedLibrary(): Promise<ActionResult<SeedSummary>> {
  const result = attempt(() => seed())
  if (result.ok) refresh()
  return result
}
