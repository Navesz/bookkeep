import { database } from "./connection.ts"

/**
 * The catalogue: the books, the copies on the shelf, and the search box the
 * librarian lives in.
 *
 * Same shape as loans.ts — "TRY, THEN TRANSLATE", never "check, then act". No
 * function here asks whether an ISBN is taken before inserting it; it inserts,
 * and turns the constraint's refusal into a domain error. Two statements have a
 * gap between them, and the gap is where two librarians cataloguing the same
 * delivery both create the same book.
 */

/**
 * Fields declared and assigned by hand rather than as constructor parameter
 * properties — see the long note in loans.ts. That shorthand emits code instead
 * of erasing, and Node's type stripping refuses it.
 */
export class DuplicateIsbn extends Error {
  readonly isbn: string

  constructor(isbn: string) {
    super(`a book with ISBN ${isbn} is already in the catalogue`)
    this.name = "DuplicateIsbn"
    this.isbn = isbn
  }
}

export class DuplicateBarcode extends Error {
  readonly barcode: string

  constructor(barcode: string) {
    super(`barcode ${barcode} is already on another copy`)
    this.name = "DuplicateBarcode"
    this.barcode = barcode
  }
}

/**
 * Raised when withdrawing a book would destroy lending history.
 *
 * `copy.book_id` cascades, but `loan.copy_id` deliberately does NOT — see the
 * note on `removeBook`. This is that decision surfacing as an error the desk
 * can read.
 */
export class BookHasHistory extends Error {
  readonly bookId: number

  constructor(bookId: number) {
    super(
      `book ${bookId} has copies that have been lent; its history would be lost`
    )
    this.name = "BookHasHistory"
    this.bookId = bookId
  }
}

/** A row of `book`, exactly as SQLite hands it back. */
export type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  published_year: number | null
  added_at: string
}

/**
 * A book plus the two numbers the desk actually asks for. `copies` is how many
 * exist; `available` is how many are on the shelf this second.
 */
export type BookWithAvailability = Book & {
  copies: number
  available: number
}

export type Copy = {
  id: number
  book_id: number
  barcode: string
  acquired_at: string
}

export type NewBook = {
  title: string
  author: string
  isbn?: string | null
  publishedYear?: number | null
}

// SQLite names the COLUMN, not the index, when a unique constraint fails —
// measured on 3.50.4. Matching an index name here would produce a matcher that
// never fires, which is the bug loans.ts documents having already made once.
const DUPLICATE_ISBN = "UNIQUE constraint failed: book.isbn"
const DUPLICATE_BARCODE = "UNIQUE constraint failed: copy.barcode"

function says(error: unknown, fragment: string): boolean {
  return error instanceof Error && error.message.includes(fragment)
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE AVAILABILITY COUNT — the reason `book` and `copy` are separate tables.
 *
 * A LEFT JOIN to `copy` keeps books with zero copies in the results (an
 * on-order title still belongs in the catalogue, reading 0 of 0), and a second
 * LEFT JOIN to the OPEN loans marks which of those copies is out.
 *
 * `count(c.id) FILTER (WHERE l.id IS NULL)` is exact rather than approximate
 * for one specific reason: the partial unique index `one_open_loan_per_copy`
 * guarantees a copy has at most ONE open loan, so the join cannot multiply a
 * copy into several rows and inflate the count. The index that stops
 * double-lending is also what lets this aggregate skip a DISTINCT. Drop the
 * index and this number silently starts lying.
 * ═════════════════════════════════════════════════════════════════════════
 */
const WITH_AVAILABILITY = `
  SELECT b.id, b.title, b.author, b.isbn, b.published_year, b.added_at,
         count(c.id)                             AS copies,
         count(c.id) FILTER (WHERE l.id IS NULL) AS available
  FROM book b
  LEFT JOIN copy c ON c.book_id = b.id
  LEFT JOIN loan l ON l.copy_id = c.id AND l.returned_at IS NULL`

export function addBook(book: NewBook): Book {
  const insert = database().prepare(
    `INSERT INTO book (title, author, isbn, published_year)
     VALUES (?, ?, ?, ?)
     RETURNING id, title, author, isbn, published_year, added_at`
  )

  // `?? null` matters: an omitted key arrives as `undefined`, which node:sqlite
  // rejects as an unsupported binding type rather than storing as NULL.
  const isbn = book.isbn ?? null

  try {
    return insert.get(
      book.title,
      book.author,
      isbn,
      book.publishedYear ?? null
    ) as Book
  } catch (error) {
    if (isbn !== null && says(error, DUPLICATE_ISBN))
      throw new DuplicateIsbn(isbn)
    throw error
  }
}

/**
 * Put one more physical object on the shelf.
 *
 * The barcode is what the scanner reads, so it has to resolve to exactly one
 * object library-wide; a duplicate is a cataloguing mistake worth naming rather
 * than a raw SQLite throw. A missing `bookId` surfaces as the FOREIGN KEY error
 * untranslated — it means the caller invented an id, which is a programming
 * bug, not a desk situation.
 */
export function addCopy(bookId: number, barcode: string): Copy {
  const insert = database().prepare(
    `INSERT INTO copy (book_id, barcode)
     VALUES (?, ?)
     RETURNING id, book_id, barcode, acquired_at`
  )

  try {
    return insert.get(bookId, barcode) as Copy
  } catch (error) {
    if (says(error, DUPLICATE_BARCODE)) throw new DuplicateBarcode(barcode)
    throw error
  }
}

/** One book with its counts, or undefined if there is no such id. */
export function bookById(id: number): BookWithAvailability | undefined {
  return database()
    .prepare(`${WITH_AVAILABILITY} WHERE b.id = ? GROUP BY b.id`)
    .get(id) as BookWithAvailability | undefined
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * SEARCH — why `LIKE '%needle%'` and not FTS5.
 *
 * FTS5 *is* compiled into the SQLite that ships with Node 24 (ENABLE_FTS5 is
 * in `pragma_compile_options`, checked rather than assumed). It was still the
 * wrong tool here, for three measured reasons:
 *
 * 1. ITS QUERY LANGUAGE LEAKS INTO THE SEARCH BOX. `MATCH` parses what the
 *    user typed. On 3.50.4, `Alice's` raises `fts5: syntax error near "'"`.
 *    So does `NOT alice`, and a lone `(`. Our own catalogue has *Alice's
 *    Adventures in Wonderland* in it — the first apostrophe in the collection
 *    would turn a search into a crash. Escaping the input means quoting it,
 *    and quoting it means giving up the operators that were the reason to
 *    reach for FTS5.
 *
 * 2. THE DEFAULT TOKENIZER CANNOT DO PARTIAL WORDS ANYWAY. It indexes whole
 *    tokens: `Prej*` finds *Prejudice*, but `rejudic` finds nothing. A
 *    librarian who half-remembers the middle of a title gets silence. The
 *    `trigram` tokenizer fixes that but needs three characters — a two-letter
 *    search returns empty rather than erroring, which is a worse failure than
 *    being slow.
 *
 * 3. THE COST IS FIVE SHADOW TABLES AND A SYNC OBLIGATION. An FTS5 index over
 *    `book` means `book_data`, `book_idx`, `book_content`, `book_docsize`,
 *    `book_config`, plus triggers on every INSERT/UPDATE/DELETE to keep them
 *    honest. That is a second copy of the catalogue that can drift from the
 *    first.
 *
 * WHAT LIKE COSTS, MEASURED: a full scan of `book`, then the availability
 * aggregate. At 5,000 books / 10,000 copies on this machine, 2.5–3.4 ms per
 * query. A leading `%` cannot use a B-tree, so `book_title` and `book_author`
 * in schema.sql do NOT accelerate this — they serve exact and prefix lookups
 * and the ORDER BY, and it would be dishonest to imply otherwise. A public
 * library branch holds tens of thousands of titles, so this stays comfortable
 * for the size of collection this app is for.
 *
 * THE HONEST LIMITATION: SQLite's built-in `LIKE` folds case for ASCII only.
 * `bronte` will not find *Brontë*, and `emile` will not find *Émile* — the
 * seed contains both, deliberately, so the gap is visible rather than
 * theoretical. Fixing it properly means an FTS5 `unicode61 remove_diacritics`
 * tokenizer or a normalized shadow column, and that trade is worth revisiting
 * the day this catalogue holds enough non-English names to hurt.
 *
 * WHEN TO REVISIT: past roughly 50k books, or the first time accented titles
 * matter more than apostrophes do.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * `%` and `_` are wildcards to LIKE, and a backslash is our escape character,
 * so all three have to be neutralised before the needle is concatenated into
 * the pattern. Without this a librarian searching for "100%" matches every
 * book in the catalogue.
 */
function escapeLike(needle: string): string {
  return needle.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * Find books by title or author, case-insensitively, matching partial words.
 *
 * An empty needle is browsing, not an error: it returns the head of the
 * catalogue, which is what a search screen should show before anyone types.
 */
export function search(needle: string, limit = 50): BookWithAvailability[] {
  const trimmed = needle.trim()

  if (trimmed === "") {
    return database()
      .prepare(`${WITH_AVAILABILITY} GROUP BY b.id ORDER BY b.title LIMIT ?`)
      .all(limit) as BookWithAvailability[]
  }

  const pattern = `%${escapeLike(trimmed)}%`

  // The title match is repeated in ORDER BY so a title hit outranks a book
  // that only matched on its author — searching "Dickens" should still lead
  // with the Dickens novel whose title you half-typed. Re-evaluating LIKE
  // costs nothing measurable next to the scan that already happened.
  return database()
    .prepare(
      `${WITH_AVAILABILITY}
       WHERE b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\'
       GROUP BY b.id
       ORDER BY (b.title LIKE ? ESCAPE '\\') DESC, b.title
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit) as BookWithAvailability[]
}

/**
 * Withdraw a book and, with it, every copy on the shelf.
 *
 * The cascade to `copy` is in schema.sql and is real only because
 * connection.ts turns foreign keys on — `tests/catalogue.test.mjs` proves the
 * pragma actually ran rather than trusting the DDL.
 *
 * A book whose copies have EVER been lent cannot be withdrawn, and that is the
 * schema working as designed: `loan.copy_id` has no `ON DELETE`, so the loan
 * rows block the delete instead of vanishing with it. Lending history outlives
 * the catalogue entry on purpose. Returns false when there was no such book —
 * deleting nothing is not an error.
 */
export function removeBook(id: number): boolean {
  try {
    return (
      database().prepare("DELETE FROM book WHERE id = ?").run(id).changes > 0
    )
  } catch (error) {
    if (says(error, "FOREIGN KEY constraint failed"))
      throw new BookHasHistory(id)
    throw error
  }
}
