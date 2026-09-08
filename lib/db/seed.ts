import { pathToFileURL } from "node:url"
import { closeDatabase, database } from "./connection.ts"
import { addBook, addCopy, DuplicateBarcode } from "./books.ts"
import { addMember } from "./members.ts"
import { lend } from "./loans.ts"

/**
 * A believable small library, so the UI has something to render and a newcomer
 * can see a working system in one command instead of an empty table.
 */

export class AlreadySeeded extends Error {
  constructor() {
    super(
      "this database already contains the seed; seeding again would duplicate it"
    )
    this.name = "AlreadySeeded"
  }
}

/** [title, author, year first published, copies on the shelf] */
type Entry = [string, string, number, number]

/**
 * ═════════════════════════════════════════════════════════════════════════
 * EVERY ISBN HERE IS NULL, ON PURPOSE.
 *
 * The ISBN was introduced in 1970. Every book below was published between 1813
 * and 1897, so no original edition has one, and the numbers printed in modern
 * reprints identify *that reprint* — a specific publisher, year and binding we
 * are not modelling and have no reason to claim.
 *
 * The tempting shortcut is to generate something ISBN-shaped. An ISBN carries
 * a check digit, so a fabricated one can be made to *validate* while still
 * pointing at nothing — a plausible-looking lie, in a field that other systems
 * (union catalogues, inter-library loan, acquisitions) treat as an identifier
 * they can resolve. A null says "we do not know", which is true and which
 * every downstream consumer already knows how to handle. A fake says something
 * false in a language other machines trust.
 *
 * `book.isbn` is `TEXT UNIQUE` and NULLs do not collide in SQLite — unique
 * indexes treat each NULL as distinct — so fifteen unknown ISBNs coexist
 * without weakening the constraint for the books that do have one.
 * ═════════════════════════════════════════════════════════════════════════
 */
const CATALOGUE: Entry[] = [
  ["Pride and Prejudice", "Jane Austen", 1813, 3],
  ["Frankenstein; or, The Modern Prometheus", "Mary Shelley", 1818, 2],
  ["Jane Eyre", "Charlotte Brontë", 1847, 2],
  ["Wuthering Heights", "Emily Brontë", 1847, 1],
  ["Moby-Dick; or, The Whale", "Herman Melville", 1851, 2],
  ["Walden", "Henry David Thoreau", 1854, 1],
  ["Great Expectations", "Charles Dickens", 1861, 2],
  ["Alice's Adventures in Wonderland", "Lewis Carroll", 1865, 3],
  ["Crime and Punishment", "Fyodor Dostoevsky", 1866, 2],
  ["Middlemarch", "George Eliot", 1871, 1],
  ["Anna Karenina", "Leo Tolstoy", 1878, 2],
  ["The Adventures of Huckleberry Finn", "Mark Twain", 1884, 2],
  ["The Picture of Dorian Gray", "Oscar Wilde", 1890, 1],
  ["The Time Machine", "H. G. Wells", 1895, 2],
  ["Dracula", "Bram Stoker", 1897, 2],
]

/**
 * `example.org` is reserved by RFC 2606 precisely so documentation and demo
 * data cannot accidentally address a real mailbox. Seed data that mails a
 * stranger is a bug that only shows up in production.
 */
const MEMBERS = [
  { name: "Ada Lovelace", email: "ada@example.org" },
  { name: "Grace Hopper", email: "grace@example.org" },
  { name: "Alan Turing", email: "alan@example.org" },
  { name: "Katherine Johnson", email: "katherine@example.org" },
  { name: "Edsger Dijkstra", email: "edsger@example.org" },
]

/**
 * What is out on loan when the demo starts, as [title, copy number, borrower].
 *
 * Chosen so the availability column is not uniform: Wuthering Heights is the
 * library's only copy and it is gone (0 of 1 — the state that makes a
 * reservation feature look necessary), Pride and Prejudice is partly out
 * (2 of 3), and most of the shelf is untouched.
 */
const ON_LOAN: [string, number, string][] = [
  ["Wuthering Heights", 1, "ada@example.org"],
  ["Pride and Prejudice", 1, "grace@example.org"],
  ["Crime and Punishment", 2, "alan@example.org"],
  ["Alice's Adventures in Wonderland", 2, "katherine@example.org"],
  ["The Time Machine", 1, "edsger@example.org"],
]

/**
 * The barcode a given copy gets. Deterministic, which is what makes the
 * re-run refusal below work.
 */
function barcodeFor(bookNumber: number, copyNumber: number): string {
  return `BK-${String(bookNumber).padStart(4, "0")}-${copyNumber}`
}

export type SeedSummary = {
  books: number
  copies: number
  members: number
  loans: number
}

/**
 * Fill an empty database.
 *
 * IT REFUSES TO RUN TWICE — it is not idempotent, and the difference matters.
 * An idempotent seed would need a natural key to upsert on, and the honest
 * choice above was to leave every ISBN null, which leaves nothing to match a
 * book against. Two runs would silently produce two of every title.
 *
 * The refusal is the DATABASE's, not a guard: barcodes are deterministic, so
 * the second run collides with `copy.barcode`'s UNIQUE constraint on its very
 * first copy. That is the house rule — try, then translate — and it is also
 * why the whole seed runs inside one transaction: a refused re-run rolls back
 * to exactly the state it found, leaving no half-written catalogue behind.
 *
 * ONLY THE RE-RUN IS TRANSLATED. Seeding a database that is not empty but not
 * seeded either — one that already holds, say, a member at ada@example.org —
 * fails with that constraint's own error (`DuplicateEmail`) rather than
 * `AlreadySeeded`, because those are genuinely different situations and
 * flattening them would tell the operator the wrong thing. The transaction
 * still rolls the attempt back either way.
 *
 * (`node:sqlite` has no `transaction()` helper the way better-sqlite3 does, so
 * BEGIN/COMMIT/ROLLBACK are written out.)
 */
export function seed(): SeedSummary {
  const db = database()

  db.exec("BEGIN")
  try {
    const copyIds = new Map<string, number[]>()

    CATALOGUE.forEach(([title, author, year, copies], index) => {
      const book = addBook({
        title,
        author,
        publishedYear: year,
        // Stated once more where it is actually written: unknown, not invented.
        isbn: null,
      })

      const ids: number[] = []
      for (let n = 1; n <= copies; n++) {
        ids.push(addCopy(book.id, barcodeFor(index + 1, n)).id)
      }
      copyIds.set(title, ids)
    })

    const memberIds = new Map<string, number>()
    for (const person of MEMBERS) {
      memberIds.set(person.email, addMember(person).id)
    }

    for (const [title, copyNumber, email] of ON_LOAN) {
      const ids = copyIds.get(title)
      const memberId = memberIds.get(email)
      // A typo in the tables above is a bug in this file, not a desk situation,
      // so it fails loudly here rather than silently lending nothing.
      if (!ids || !memberId)
        throw new Error(`seed data refers to unknown "${title}" / ${email}`)
      lend(ids[copyNumber - 1], memberId)
    }

    const summary: SeedSummary = {
      books: CATALOGUE.length,
      copies: CATALOGUE.reduce((total, [, , , copies]) => total + copies, 0),
      members: MEMBERS.length,
      loans: ON_LOAN.length,
    }

    db.exec("COMMIT")
    return summary
  } catch (error) {
    db.exec("ROLLBACK")
    if (error instanceof DuplicateBarcode) throw new AlreadySeeded()
    throw error
  }
}

/**
 * `node lib/db/seed.ts` — the one command the README can promise a newcomer.
 *
 * It lives here rather than in a `scripts` entry because a bin script would be
 * a second file that can drift from this one. The comparison is false when the
 * module is imported, so the tests get `seed()` without the side effect.
 *
 * WHY NOT `import.meta.main`: it exists in Node 24 and reads better, but it was
 * absent from the `ImportMeta` type in `@types/node@20`, which this project
 * pinned when this line was written — so it ran fine and failed
 * `npm run typecheck`. The types are on `^24` now and the objection has
 * expired; the form below stays because it costs nothing and works on both.
 * `pathToFileURL` is the same comparison with types that exist, and it is the
 * idiom already used in
 * the test files, where the reason is also Windows: comparing against the raw
 * `process.argv[1]` never matches, because `import.meta.url` is a file:// URL
 * and `C:\...` is not.
 *
 * The expected failure prints as a sentence and exits 1; an unexpected one
 * keeps its stack, because that is a bug and the trace is the useful part.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const summary = seed()
    console.log(
      `Seeded ${summary.books} books, ${summary.copies} copies, ` +
        `${summary.members} members, ${summary.loans} loans out.`
    )
  } catch (error) {
    if (error instanceof AlreadySeeded) {
      console.error(`${error.message}\nNothing was written.`)
      process.exitCode = 1
    } else {
      throw error
    }
  } finally {
    closeDatabase()
  }
}
