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
  /**
   * The sticker, when the caller reached the copy by scanning one. A librarian
   * holding the book knows the barcode and has never seen the row id, so the
   * message says whichever the caller actually had.
   */
  readonly barcode: string | null

  constructor(copyId: number, barcode: string | null = null) {
    super(
      barcode === null
        ? `copy ${copyId} is already on loan`
        : `the copy with barcode ${barcode} is already on loan`
    )
    this.name = "CopyAlreadyOut"
    this.copyId = copyId
    this.barcode = barcode
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

/**
 * The scanner read a sticker that belongs to nothing in the catalogue.
 *
 * KEPT SEPARATE FROM `CopyNotOut` DELIBERATELY. Both are "the barcode did not
 * work", and flattening them into one error would send a librarian to the
 * wrong place: an unknown barcode means the copy was never catalogued, or the
 * sticker was misread; a copy that is not out means the book in their hand is
 * already back on the shelf and someone has returned it twice.
 */
export class NoSuchBarcode extends Error {
  readonly barcode: string

  constructor(barcode: string) {
    super(`no copy in the library carries barcode ${barcode}`)
    this.name = "NoSuchBarcode"
    this.barcode = barcode
  }
}

/** The copy exists and has no open loan — there is nothing to give back. */
export class CopyNotOut extends Error {
  readonly barcode: string

  constructor(barcode: string) {
    super(`the copy with barcode ${barcode} is not on loan`)
    this.name = "CopyNotOut"
    this.barcode = barcode
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

/** Every column of `loan`, so the RETURNING clauses cannot drift apart. */
const LOAN_COLUMNS = "id, copy_id, member_id, lent_at, due_at, returned_at"

/**
 * The `days` argument as SQLite's date arithmetic wants to read it.
 *
 * THE SIGN IS WRITTEN, NOT PREPENDED. The first version built
 * `` `+${days} days` ``, which is right for every positive number and produces
 * `'+-3 days'` for a negative one — and SQLite does not reject a modifier it
 * cannot parse, it returns NULL for the whole `datetime()` call. `due_at` is
 * NOT NULL, so the insert then failed with a constraint message about a column
 * nobody had touched, which is the least useful possible way to learn that an
 * argument was negative. Measured on 3.50.4.
 *
 * A negative loan length is not a desk feature. It is how a test builds a loan
 * that is ALREADY overdue without reaching around this module to edit the row
 * by hand, which is the only way `overdueLoans` below can be tested against
 * the clock SQLite actually reads.
 */
function dayModifier(days: number): string {
  return `${days >= 0 ? "+" : ""}${days} days`
}

export function lend(copyId: number, memberId: number, days = LOAN_DAYS): Loan {
  const db = database()
  // The due date is computed by SQLite, not by JavaScript, so `lent_at` and
  // `due_at` come from the same clock. Two clocks is how a loan ends up due
  // before it was made.
  const insert = db.prepare(
    `INSERT INTO loan (copy_id, member_id, due_at)
     VALUES (?, ?, datetime('now', ?))
     RETURNING ${LOAN_COLUMNS}`
  )

  try {
    return insert.get(copyId, memberId, dayModifier(days)) as Loan
  } catch (error) {
    if (isCopyAlreadyOut(error)) throw new CopyAlreadyOut(copyId)
    throw error
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * LENDING THE WAY THE DESK DOES IT: one scan and one name.
 *
 * The scanner reads the sticker; nobody at the desk has ever seen a `copy.id`.
 * So `lend(copyId, …)` asks the caller for a number it has to look up first,
 * and a lookup followed by a call is two statements with a gap — the exact
 * shape the whole of this file exists to avoid.
 *
 * THE RESOLUTION THEREFORE HAPPENS INSIDE THE INSERT. `INSERT … SELECT …
 * WHERE barcode = ?` is ONE statement: an unknown barcode selects no rows, so
 * nothing is inserted and RETURNING hands back nothing; a known barcode whose
 * copy is already out still meets `one_open_loan_per_copy` and is refused by
 * the index. Both answers are the database's, and there is no window between
 * them.
 *
 * The two failures are told apart by WHICH signal arrived — an empty result
 * versus a thrown constraint — and not by asking a question beforehand.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function lendByBarcode(
  barcode: string,
  memberId: number,
  days = LOAN_DAYS
): Loan {
  const db = database()
  const insert = db.prepare(
    `INSERT INTO loan (copy_id, member_id, due_at)
     SELECT c.id, ?, datetime('now', ?) FROM copy c WHERE c.barcode = ?
     RETURNING ${LOAN_COLUMNS}`
  )

  let row: Loan | undefined
  try {
    row = insert.get(memberId, dayModifier(days), barcode) as Loan | undefined
  } catch (error) {
    if (!isCopyAlreadyOut(error)) throw error
    // A LOOKUP ON THE FAILURE PATH IS NOT CHECK-THEN-ACT. The write has already
    // been refused and nothing is decided by what comes back; this runs so the
    // error can carry the copy id as well as the barcode the caller had.
    const copy = db
      .prepare("SELECT id FROM copy WHERE barcode = ?")
      .get(barcode)
    // The index cannot fire for a copy that does not exist, so this branch is
    // unreachable — and if it is ever reached, re-raising the original error is
    // more honest than inventing an id to put in a nicer one.
    if (!copy) throw error
    throw new CopyAlreadyOut((copy as { id: number }).id, barcode)
  }

  if (!row) throw new NoSuchBarcode(barcode)
  return row
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
     RETURNING ${LOAN_COLUMNS}`
  )

  const row = update.get(loanId) as Loan | undefined
  if (!row) throw new NoSuchLoan(loanId)
  return row
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * RETURNING THE WAY THE DESK DOES IT: the scanner reads the sticker.
 *
 * Nobody types a loan id at a returns desk — the book is in their hand and the
 * number on it is the barcode. So the barcode is resolved inside the UPDATE:
 * `copy_id = (SELECT id FROM copy WHERE barcode = ?)`. A subquery that finds
 * nothing yields NULL, `copy_id = NULL` is NULL rather than true, and the
 * statement closes exactly the one open loan or nothing at all.
 *
 * WHY THERE IS A SECOND QUERY, AND WHY IT IS STILL NOT CHECK-THEN-ACT.
 *
 * Zero rows changed is TWO different situations — "no copy carries that
 * barcode" and "that copy is not out" — and they send a librarian to opposite
 * places: to look again at the sticker, or to go and find who already brought
 * it back. Telling them apart needs a lookup. But that lookup runs AFTER the
 * write has already happened or already failed to happen, and no decision to
 * mutate depends on its answer; it exists only to phrase the error.
 *
 * That is the line, and it is worth stating once for the whole codebase:
 * check-then-act is a read that a WRITE depends on. A read that only a
 * MESSAGE depends on has no window to lose, because there is nothing left to
 * race for.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function returnByBarcode(barcode: string): Loan {
  const db = database()
  const update = db.prepare(
    `UPDATE loan SET returned_at = datetime('now')
     WHERE returned_at IS NULL
       AND copy_id = (SELECT id FROM copy WHERE barcode = ?)
     RETURNING ${LOAN_COLUMNS}`
  )

  const row = update.get(barcode) as Loan | undefined
  if (row) return row

  const copy = db.prepare("SELECT id FROM copy WHERE barcode = ?").get(barcode)
  if (!copy) throw new NoSuchBarcode(barcode)
  throw new CopyNotOut(barcode)
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
       ORDER BY c.barcode`
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
       ORDER BY l.due_at`
    )
    .all(memberId)
}

// ══════════════════════════════════════════════════════════════════════════
// THE DESK'S OWN SCREENS.
//
// ONE FACT UNDERPINS ALL THREE, AND IT IS WORTH STATING BEFORE THE QUERIES:
// "is it late?" IS A STRING COMPARISON HERE, NOT A DATE ONE, AND THAT IS EXACT
// RATHER THAN CLEVER.
//
// Every timestamp in this database is written by SQLite's `datetime()`, which
// emits `YYYY-MM-DD HH:MM:SS` in UTC — fixed width, zero padded, biggest unit
// first. In that format lexicographic order IS chronological order, so
// `due_at < datetime('now')` is both correct and index-friendly, and it never
// parses anything. Compare against a JavaScript `Date` instead and you have
// introduced a second clock and a timezone, which is how a loan becomes
// overdue at 9pm for one reader and midnight for another.
//
// THE CONSEQUENCE FOR CALLERS: overdue is computed here, at read time, from
// the database's clock. There is no `is_overdue` column to keep in step and no
// job that has to run at midnight to set one — a loan becomes late by the
// world moving, not by anything writing a row.
// ══════════════════════════════════════════════════════════════════════════

/** One row of `allOpenLoans` — a loan that is still out, and who has it. */
export type OpenLoan = {
  id: number
  copy_id: number
  member_id: number
  member_name: string
  barcode: string
  /**
   * The book this copy belongs to, so a title can link to its record rather
   * than to a catalogue search for its own name. Without it the only honest
   * link was `/?q=<title>`, which is a guess dressed as navigation: two
   * books sharing a title land the reader on a list and ask them to pick.
   */
  book_id: number
  title: string
  author: string
  lent_at: string
  due_at: string
}

/** `OpenLoan` plus how late it is, in whole days. */
export type OverdueLoan = OpenLoan & {
  /**
   * Whole days past the due date, truncated — 0 for a loan that went overdue
   * within the last twenty-four hours. Computed by SQLite so the subtraction
   * and the "now" it is measured against come from the same clock.
   */
  days_overdue: number
}

const OPEN_LOAN_QUERY = `
  SELECT l.id, l.copy_id, l.member_id, m.name AS member_name,
         c.barcode, b.id AS book_id, b.title, b.author, l.lent_at, l.due_at
  FROM loan l
  JOIN copy c ON c.id = l.copy_id
  JOIN book b ON b.id = c.book_id
  JOIN member m ON m.id = l.member_id
  WHERE l.returned_at IS NULL`

/**
 * Every loan that is still out, soonest due first.
 *
 * This is the single JOIN that replaces walking `members()` and calling
 * `openLoansOf` once each. That loop is not wrong, it is just a query the
 * database can answer in one pass, and keeping "what is out" defined in two
 * places is how the two definitions eventually disagree.
 *
 * The tie-break on title exists so the order is TOTAL. Two loans made in the
 * same second sort identically on `due_at`, and SQLite is then free to return
 * them in either order — a list that reshuffles between renders is a list
 * nobody can click accurately.
 */
export function allOpenLoans(): OpenLoan[] {
  return database()
    .prepare(`${OPEN_LOAN_QUERY} ORDER BY l.due_at, b.title, l.id`)
    .all() as OpenLoan[]
}

/**
 * THE FIRST SCREEN AT OPENING TIME: what is late, most overdue first.
 *
 * `julianday()` returns a day count as a float, so the subtraction is in days
 * already and the CAST truncates toward zero. Doing the arithmetic in SQL
 * rather than in JavaScript keeps the "now" in the subtraction identical to
 * the "now" in the WHERE clause; two `new Date()` calls either side of a query
 * are two different instants, and at the boundary they disagree about whether
 * a row belongs in the list it is being counted for.
 */
export function overdueLoans(): OverdueLoan[] {
  return database()
    .prepare(
      `SELECT l.id, l.copy_id, l.member_id, m.name AS member_name,
              c.barcode, b.id AS book_id, b.title, b.author, l.lent_at, l.due_at,
              CAST(julianday('now') - julianday(l.due_at) AS INTEGER)
                AS days_overdue
       FROM loan l
       JOIN copy c ON c.id = l.copy_id
       JOIN book b ON b.id = c.book_id
       JOIN member m ON m.id = l.member_id
       WHERE l.returned_at IS NULL AND l.due_at < datetime('now')
       ORDER BY l.due_at, b.title, l.id`
    )
    .all() as OverdueLoan[]
}

/** One row of a member's history: every loan, open or closed. */
export type LoanRecord = {
  id: number
  copy_id: number
  barcode: string
  /**
   * The book this copy belongs to, so a title can link to its record rather
   * than to a catalogue search for its own name. Without it the only honest
   * link was `/?q=<title>`, which is a guess dressed as navigation: two
   * books sharing a title land the reader on a list and ask them to pick.
   */
  book_id: number
  title: string
  author: string
  lent_at: string
  due_at: string
  /** `null` while the copy is still out. */
  returned_at: string | null
  /**
   * 1 when this loan is open AND past its due date, 0 otherwise.
   *
   * A NUMBER AND NOT A BOOLEAN because SQLite has no boolean type — it stores
   * and returns 0 and 1, and `node:sqlite` hands those straight back. Coercing
   * to `true`/`false` here would be a translation layer for one column, so the
   * type says what actually arrives and the UI writes `row.overdue === 1`.
   */
  overdue: number
}

/**
 * A member's WHOLE history, not just what they are holding.
 *
 * `openLoansOf` answers "what do they have"; this answers "what have they
 * done", which is the screen the desk opens when someone asks whether they
 * already read a book, or when a copy comes back damaged and the question is
 * who had it before.
 *
 * The ordering is open loans first — because those are the ones that can still
 * be acted on — then most recent first. `(l.returned_at IS NULL) DESC` is that
 * first key: it evaluates to 1 for an open loan and 0 for a closed one.
 */
export function loanHistoryOf(memberId: number): LoanRecord[] {
  return database()
    .prepare(
      `SELECT l.id, l.copy_id, c.barcode, b.id AS book_id, b.title, b.author,
              l.lent_at, l.due_at, l.returned_at,
              (l.returned_at IS NULL AND l.due_at < datetime('now'))
                AS overdue
       FROM loan l
       JOIN copy c ON c.id = l.copy_id
       JOIN book b ON b.id = c.book_id
       WHERE l.member_id = ?
       ORDER BY (l.returned_at IS NULL) DESC, l.lent_at DESC, l.id DESC`
    )
    .all(memberId) as LoanRecord[]
}
