import { database } from "./connection.ts"

/**
 * Lending and returning.
 *
 * THE SHAPE OF EVERY FUNCTION HERE IS "TRY, THEN TRANSLATE" — never "check,
 * then act". `lend` does not ask whether the copy is free; it inserts, and
 * lets the partial unique index in schema.sql refuse. Asking first would be
 * two statements with a gap between them, and the gap is where the same copy
 * goes home with two people.
 */

/** How long a loan runs. One number, one place, so the desk cannot disagree. */
export const LOAN_DAYS = 14

/**
 * The fields are declared and assigned by hand, and NOT written as constructor
 * parameter properties (`constructor(readonly copyId: number)`).
 *
 * That shorthand is TypeScript that EMITS code rather than types, so Node's
 * type stripping refuses it outright — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`,
 * measured on Node 24.13. Every test here imports these `.ts` files directly,
 * with no build step between, so the rule for this codebase is: only syntax
 * that erases. Two extra lines buy a test suite that needs no toolchain.
 */
export class CopyAlreadyOut extends Error {
  readonly copyId: number

  constructor(copyId: number) {
    super(`copy ${copyId} is already on loan`)
    this.name = "CopyAlreadyOut"
    this.copyId = copyId
  }
}

export class NoSuchLoan extends Error {
  readonly loanId: number

  constructor(loanId: number) {
    super(`loan ${loanId} is not open`)
    this.name = "NoSuchLoan"
    this.loanId = loanId
  }
}

export type Loan = {
  id: number
  copy_id: number
  member_id: number
  lent_at: string
  due_at: string
  returned_at: string | null
}

/**
 * The unique-index violation, told apart from every other constraint failure.
 *
 * SQLite reports a missing foreign key and a duplicate open loan both as
 * `SQLITE_CONSTRAINT`, and swallowing the difference would turn "this member
 * does not exist" into "the copy is out" — a message that sends a librarian
 * looking at the wrong shelf.
 *
 * WHAT SEPARATES THEM IS THE COLUMN, NOT THE INDEX NAME. The first version of
 * this function matched `one_open_loan_per_copy` and never fired once, because
 * SQLite does not name the index: the message, measured on 3.50.4, is
 * `UNIQUE constraint failed: loan.copy_id` for the duplicate and
 * `FOREIGN KEY constraint failed` for the dangling reference. Matching the
 * column list is matching what the engine actually says.
 *
 * The coupling is real and worth naming: this string is the contract between
 * schema.sql and this file, and only the test in `tests/loans.test.mjs`
 * defends it. Change the index to cover different columns and the test goes
 * red — which is the point.
 */
const DUPLICATE_OPEN_LOAN = "UNIQUE constraint failed: loan.copy_id"

function isCopyAlreadyOut(error: unknown): boolean {
  return error instanceof Error && error.message.includes(DUPLICATE_OPEN_LOAN)
}

export function lend(copyId: number, memberId: number, days = LOAN_DAYS): Loan {
  const db = database()
  // The due date is computed by SQLite, not by JavaScript, so `lent_at` and
  // `due_at` come from the same clock. Two clocks is how a loan ends up due
  // before it was made.
  const insert = db.prepare(
    `INSERT INTO loan (copy_id, member_id, due_at)
     VALUES (?, ?, datetime('now', ?))
     RETURNING id, copy_id, member_id, lent_at, due_at, returned_at`,
  )

  try {
    return insert.get(copyId, memberId, `+${days} days`) as Loan
  } catch (error) {
    if (isCopyAlreadyOut(error)) throw new CopyAlreadyOut(copyId)
    throw error
  }
}

/**
 * Closing a loan is `UPDATE ... WHERE returned_at IS NULL`, and the WHERE is
 * the whole guard: returning the same copy twice changes zero rows instead of
 * overwriting the first return date. `changes` is what tells the two apart.
 */
export function returnLoan(loanId: number): Loan {
  const db = database()
  const update = db.prepare(
    `UPDATE loan SET returned_at = datetime('now')
     WHERE id = ? AND returned_at IS NULL
     RETURNING id, copy_id, member_id, lent_at, due_at, returned_at`,
  )

  const row = update.get(loanId) as Loan | undefined
  if (!row) throw new NoSuchLoan(loanId)
  return row
}

/** Every copy of a book, with the open loan attached when there is one. */
export function copiesOf(bookId: number) {
  return database()
    .prepare(
      `SELECT c.id, c.barcode, l.id AS loan_id, l.due_at, m.name AS borrower
       FROM copy c
       LEFT JOIN loan l ON l.copy_id = c.id AND l.returned_at IS NULL
       LEFT JOIN member m ON m.id = l.member_id
       WHERE c.book_id = ?
       ORDER BY c.barcode`,
    )
    .all(bookId)
}

/** What a member has out right now, soonest due first. */
export function openLoansOf(memberId: number) {
  return database()
    .prepare(
      `SELECT l.id, l.due_at, b.title, b.author, c.barcode
       FROM loan l
       JOIN copy c ON c.id = l.copy_id
       JOIN book b ON b.id = c.book_id
       WHERE l.member_id = ? AND l.returned_at IS NULL
       ORDER BY l.due_at`,
    )
    .all(memberId)
}
