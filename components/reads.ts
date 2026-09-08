import { copiesOf } from "@/lib/db/loans.ts"
import { members } from "@/lib/db/members.ts"

/**
 * ONE TYPE THAT `lib/db` CANNOT STATE FOR ITSELF, AND NOTHING ELSE.
 *
 * SERVER ONLY. This reaches `node:sqlite` through `lib/db`, so a `"use client"`
 * file that imported it would try to bundle the SQLite driver for the browser.
 * Nothing here is imported from a client component; the boundary is kept by
 * hand because `server-only` is not a dependency of this project and adding one
 * is not this agent's call.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE SHRANK.
 *
 * It used to carry `allOpenLoans` and an overdue count, both composed out of
 * `members()` and `openLoansOf()` — one query per member, with a note saying
 * the single JOIN belonged in `lib/db/loans.ts`. It now IS in
 * `lib/db/loans.ts`, as `allOpenLoans`, `overdueLoans` and `loanHistoryOf`,
 * computing "late" from SQLite's own clock. Those are the ones the screens
 * call; keeping a second implementation here would be keeping a second
 * definition of what "out" means.
 *
 * What is left is the one thing the data layer genuinely cannot say. `copiesOf`
 * ends in `.all(...)`, and `node:sqlite` types that as `unknown[]` — it cannot
 * know the shape of a string of SQL. Casting at each call site would be several
 * chances to write a different shape, and a column renamed in the SQL would
 * still typecheck at every one of them. One cast, next to the query it
 * describes, is one place to be wrong.
 *
 * The column names keep SQLite's spelling, `snake_case`: a row that reads the
 * same here as in `lib/db/loans.ts` needs no translation table in anyone's
 * head.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** One row of `copiesOf` — a physical copy, with its open loan if it has one. */
export type CopyRow = {
  id: number
  barcode: string
  /** `null` when the copy is on the shelf. This is the availability flag. */
  loan_id: number | null
  due_at: string | null
  borrower: string | null
}

export function copyRowsOf(bookId: number): CopyRow[] {
  return copiesOf(bookId) as CopyRow[]
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE MEMBER LIST, FLATTENED INTO PLAIN OBJECTS FOR THE CLIENT BOUNDARY.
 *
 * This is not tidying. `node:sqlite` returns each row as an object with a NULL
 * PROTOTYPE — `Object.create(null)`, not `{}` — and React refuses to serialise
 * one across the server/client boundary:
 *
 *   Only plain objects, and a few built-ins, can be passed to Client Components
 *   from Server Components. Classes or null prototypes are not supported.
 *
 * Measured on Node 24.13 / Next 16.2.6: passing `members()` straight into the
 * lend form is a 500, and the message names the prototype rather than the
 * column, so it reads at first like a class instance problem.
 *
 * Rebuilding the object with a literal gives it `Object.prototype` and makes it
 * serialisable. Taking only `id` and `name` is the second reason to do it here:
 * a member's e-mail address has no job in a `<select>`, and shipping it to the
 * browser on every page that can lend would put every borrower's address in the
 * page source of a screen that never displays one.
 * ═════════════════════════════════════════════════════════════════════════
 */
export type MemberOption = { id: number; name: string }

export function memberOptions(): MemberOption[] {
  return members().map((person) => ({ id: person.id, name: person.name }))
}
