import type { Issue } from "../validation.ts"
import { BookHasHistory, DuplicateBarcode, DuplicateIsbn } from "./books.ts"
import { CopyAlreadyOut, CopyNotOut, NoSuchBarcode, NoSuchLoan } from "./loans.ts"
import { DuplicateEmail } from "./members.ts"
import { AlreadySeeded } from "./seed.ts"

/**
 * Every refusal this data layer can make, said in a sentence a librarian can
 * act on.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A FILE AND NOT SIX `catch` BLOCKS IN `app/actions.ts`.
 *
 * `app/actions.ts` carries `"use server"`, which means Next may export
 * nothing from it but async functions, and it imports `next/cache`, which
 * plain Node cannot resolve. Together those make everything inside it
 * unreachable from `node --test`. The mapping below is the part with actual
 * judgement in it — which FIELD a failure belongs to, and what the desk should
 * do next — so leaving it stranded on the far side of a boundary the test
 * runner cannot cross would mean the one guarantee that matters here,
 *
 *   a raw SQLite message must never reach the browser,
 *
 * was defended by nothing but good intentions. Here it is a pure function over
 * an `unknown`, and `tests/desk.test.mjs` walks every error class through it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT SITS IN `lib/db` RATHER THAN NEXT TO THE UI.
 *
 * The FIELD is the load-bearing half of what this returns, and the field names
 * are the column names: `DuplicateIsbn` is about `book.isbn`, `DuplicateEmail`
 * about `member.email`, `CopyAlreadyOut` about the barcode that identifies
 * `copy`. The module that DEFINES an error is the module that knows which
 * column provoked it. A form whose input names match its columns is then just
 * a form that was named honestly.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A GOOD MESSAGE OWES THE READER, since every string below is held to it.
 *
 * `UNIQUE constraint failed: book.isbn` states a fact about an index. It does
 * not say which of the two books is the problem, it does not say the other one
 * already exists, and it does not say what to do — and a librarian at a desk
 * with a delivery to catalogue can act on none of it. So every message here
 * says three things: WHAT was refused, WHY it was refused in terms of the
 * library rather than the schema, and WHAT TO DO INSTEAD. The third is the one
 * usually missing, and it is the only one that ends the interruption.
 *
 * `null` from `explain` means "this is not a refusal, it is a fault" — a bug,
 * a full disk, a driver error. The caller must NOT dress those up: it logs the
 * real thing server-side and shows the reader a generic apology, because a
 * message invented for an error nobody anticipated is a message that is
 * confidently wrong.
 */
export function explain(error: unknown): Issue | null {
  // ── the catalogue ──────────────────────────────────────────────────────

  if (error instanceof DuplicateIsbn) {
    return {
      field: "isbn",
      code: "DuplicateIsbn",
      message: `ISBN ${error.isbn} is already in the catalogue. This library owns the book already — open its record and add a copy to it, rather than creating a second entry for the same title.`,
    }
  }

  if (error instanceof DuplicateBarcode) {
    return {
      field: "barcode",
      code: "DuplicateBarcode",
      message: `Barcode ${error.barcode} is already on another copy. Every sticker has to name exactly one object on the shelf, or the scanner cannot tell them apart — print a new label for this copy.`,
    }
  }

  if (error instanceof BookHasHistory) {
    return {
      // No single field is at fault: the record is fine, the request is not.
      field: null,
      code: "BookHasHistory",
      message: `This book has copies that have been lent, and withdrawing it would take that lending history with them. If the book has really left the collection, keep the record — a catalogue entry costs nothing, and the history is the only account of who had what.`,
    }
  }

  // ── the members ────────────────────────────────────────────────────────

  if (error instanceof DuplicateEmail) {
    return {
      field: "email",
      code: "DuplicateEmail",
      message: `Somebody is already registered with ${error.email}. Search for them by that address instead of making a second card — two cards for one person means two loan histories, and whichever one the desk does not open is invisible.`,
    }
  }

  // ── the desk ───────────────────────────────────────────────────────────

  if (error instanceof CopyAlreadyOut) {
    return {
      field: "barcode",
      code: "CopyAlreadyOut",
      message:
        error.barcode === null
          ? `That copy is already on loan to somebody else. Check the member's record to see who has it, and return it before lending it again.`
          : `The copy with barcode ${error.barcode} is already on loan to somebody else. Return it first — if it is in your hand, whoever brought it back never had it checked in.`,
    }
  }

  if (error instanceof NoSuchBarcode) {
    return {
      field: "barcode",
      code: "NoSuchBarcode",
      message: `No copy in the library carries barcode ${error.barcode}. Scan it again — and if the sticker really does read that, the copy was never added to the catalogue, so add it to its book first.`,
    }
  }

  if (error instanceof CopyNotOut) {
    return {
      field: "barcode",
      code: "CopyNotOut",
      message: `The copy with barcode ${error.barcode} is not on loan, so there is nothing to return. It is already on the shelf — somebody has checked it in.`,
    }
  }

  if (error instanceof NoSuchLoan) {
    return {
      field: "loanId",
      code: "NoSuchLoan",
      message: `That loan is not open — it has already been returned, and the return that is recorded stands. Reload the page to see who has what now.`,
    }
  }

  // ── the demo data ──────────────────────────────────────────────────────

  if (error instanceof AlreadySeeded) {
    return {
      field: null,
      code: "AlreadySeeded",
      message: `This library already holds the sample catalogue, and seeding again would give it a second copy of all fifteen titles. Nothing was written.`,
    }
  }

  // Not a refusal. A fault. The caller logs it and says so honestly.
  return null
}
