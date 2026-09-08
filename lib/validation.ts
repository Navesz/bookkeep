/**
 * The input guard: what a form sends, checked before it reaches SQL.
 *
 * ZERO DEPENDENCIES, and not for taste. The house rule is that a built-in wins
 * when it does the job, and the job here is a dozen rules over strings — zod
 * would be 60 kB of runtime and a second way of describing types for the sake
 * of `z.string().min(1)`. Hand-written, the rules read as the sentences the
 * librarian will see.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS AND IS NOT.
 *
 * It is NOT the thing that keeps the database honest. Uniqueness, foreign
 * keys and "a copy cannot be lent twice" all belong to constraints in
 * `schema.sql`, and `lib/db/*` translates their refusals — that is the "try,
 * then translate" rule this project is built on, and asking a question before
 * acting on the answer is exactly what it forbids.
 *
 * It IS the guard for the things a constraint cannot see: a title that is
 * blank, a year of 20255, a barcode with a newline the scanner appended, and —
 * the one that matters — an ISBN whose check digit does not match its own
 * digits. Nothing in SQLite can notice that, and nothing downstream ever will
 * either: an ISBN is an identifier that union catalogues, inter-library loan
 * and acquisitions all treat as resolvable. A typo'd one is not a bad string,
 * it is a WRONG BOOK, quoted with confidence, forever. Refusing it at the door
 * is the whole point of this module.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IMPORTS NOTHING FROM `lib/db`, ON PURPOSE.
 *
 * The tempting move is to reuse `NewBook` from `lib/db/books.ts`. It would
 * also drag `./connection.ts`, and with it `node:sqlite`, into the module
 * graph of anything that imports this file — including a client component that
 * only wanted `isValidIsbn` to grey out a submit button while the librarian
 * types. So the shapes below are declared here and are structurally
 * compatible with the data layer's, and the compiler checks that where they
 * meet, in `app/actions.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EVERY CHECK COLLECTS, NONE OF THEM THROW.
 *
 * A form with three bad fields must show three messages. Throwing on the first
 * bad field makes the librarian submit, fix, submit, fix — one round trip per
 * mistake, which is how a five-field form costs five page loads. So each
 * checker walks every field, pushes an `Issue` per problem, and returns them
 * together.
 */

// ── what a refusal looks like ─────────────────────────────────────────────

/**
 * One field, one thing wrong with it, in words the desk can act on.
 *
 * `code` is the stable half and `message` is the readable half. The UI renders
 * `message`; it branches on `code` when it wants to do something cleverer than
 * printing (offer "open the existing record" on `DuplicateIsbn`, say). The
 * codes raised HERE are: `required`, `too_long`, `not_a_number`,
 * `out_of_range`, `bad_email`, `bad_barcode`, `not_an_isbn`, `bad_isbn_check`.
 * `lib/db/failures.ts` adds one code per domain error, named after the error
 * class. It is typed `string` rather than a closed union because the two sets
 * are maintained in two files, and a union that lives in one of them is a
 * union that goes stale in the other.
 */
export type Issue = {
  /** The form field to render this next to. `null` means the form as a whole. */
  field: string | null
  /** Stable identifier, safe to branch on. */
  code: string
  /** What is wrong, and what to do about it. */
  message: string
}

/** Either the clean value, or every reason it was refused. */
export type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] }

function reject(
  issues: Issue[],
  field: string,
  code: string,
  message: string,
): void {
  issues.push({ field, code, message })
}

function settle<T>(issues: Issue[], value: T): Checked<T> {
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
}

// ── the primitives ────────────────────────────────────────────────────────

/**
 * EVERYTHING IS TRIMMED, and that is a rule about hardware, not tidiness.
 *
 * A barcode scanner is a keyboard that types the code and then presses Enter;
 * plenty of them append a space or a carriage return first. A pasted e-mail
 * brings a trailing space from whatever it was copied out of. To a human those
 * values are the same value; to a UNIQUE index they are two different rows.
 * Trimming at the door is what stops `"ada@example.org "` from becoming a
 * second library card nobody can find.
 */
function trimmed(raw: string | undefined): string {
  return (raw ?? "").trim()
}

type Limits = { max: number; min?: number }

/** A required piece of text, trimmed, within length. */
function text(
  issues: Issue[],
  field: string,
  label: string,
  raw: string | undefined,
  limits: Limits,
): string {
  const clean = trimmed(raw)

  if (clean === "") {
    reject(issues, field, "required", `${label} is required.`)
    return ""
  }
  if (limits.min !== undefined && clean.length < limits.min) {
    reject(
      issues,
      field,
      "too_short",
      `${label} must be at least ${limits.min} characters.`,
    )
    return clean
  }
  if (clean.length > limits.max) {
    reject(
      issues,
      field,
      "too_long",
      `${label} must be at most ${limits.max} characters; this one is ${clean.length}.`,
    )
  }
  return clean
}

/**
 * A row id arriving as a string, because that is all a form can send.
 *
 * Refuses anything that is not a run of digits — `Number("12abc")` is NaN but
 * `Number(" 12 ")` is 12 and `Number("1e3")` is 1000, and a hidden field that
 * says `1e3` is a tampered form, not a book.
 */
function rowId(
  issues: Issue[],
  field: string,
  label: string,
  raw: string | undefined,
): number {
  const clean = trimmed(raw)

  if (clean === "") {
    reject(issues, field, "required", `${label} is required.`)
    return 0
  }
  if (!/^[0-9]+$/.test(clean)) {
    reject(
      issues,
      field,
      "not_a_number",
      `${label} must be a whole number; this form sent ${JSON.stringify(clean)}.`,
    )
    return 0
  }

  const value = Number(clean)
  if (!Number.isSafeInteger(value) || value < 1) {
    reject(issues, field, "out_of_range", `${label} is not a valid record number.`)
    return 0
  }
  return value
}

// ── the year a book was published ─────────────────────────────────────────

/**
 * The floor, and the honest reason for it: this is a check for "is it a year",
 * not a claim about the history of printing. A four-digit number below 1000 in
 * a catalogue field is a typo — a dropped digit — far more often than it is a
 * manuscript, and the library that really does hold a 9th-century scroll is a
 * library whose cataloguer will notice this line and change it. The ceiling
 * moves with the calendar because forthcoming titles are catalogued under next
 * year's date.
 */
export const EARLIEST_PUBLICATION_YEAR = 1000

function latestPublicationYear(): number {
  return new Date().getFullYear() + 1
}

/** The publication year, which a book is allowed not to have. */
function publicationYear(
  issues: Issue[],
  field: string,
  raw: string | undefined,
): number | null {
  const clean = trimmed(raw)
  if (clean === "") return null

  if (!/^[0-9]{1,4}$/.test(clean)) {
    reject(
      issues,
      field,
      "not_a_number",
      `The year must be four digits, like 1897; this form sent ${JSON.stringify(clean)}.`,
    )
    return null
  }

  const value = Number(clean)
  const latest = latestPublicationYear()
  if (value < EARLIEST_PUBLICATION_YEAR || value > latest) {
    reject(
      issues,
      field,
      "out_of_range",
      `The year must be between ${EARLIEST_PUBLICATION_YEAR} and ${latest}. Leave it blank if the year is unknown.`,
    )
    return null
  }
  return value
}

// ── e-mail ────────────────────────────────────────────────────────────────

/**
 * DELIBERATELY NOT RFC 5322, and the distinction is worth stating because
 * "validate an e-mail address" is one of the classic ways to write a hundred
 * lines that reject real people.
 *
 * The full grammar permits quoted local parts (`"ada lovelace"@example.org`),
 * comments in parentheses, and bare IP-literal domains. Implementing it buys
 * acceptance of addresses nobody types at a library desk, and it still cannot
 * tell you the one thing that matters — whether mail arrives. The only proof
 * of that is a message that gets delivered.
 *
 * So this catches the typo class that actually happens: no `@`, two `@`, a
 * space in the middle, `ada@example` with no domain suffix, a trailing comma
 * left over from pasting a list, a one-letter suffix. Domain labels are
 * letters, digits and hyphens, which keeps `xn--p1ai` and rejects `org,`.
 */
const PLAUSIBLE_EMAIL =
  /^[^\s@,;:<>"()[\]\\]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z0-9-]{2,}$/

/** The limits from RFC 5321: 64 for the local part, 254 for the whole thing. */
const EMAIL_MAX = 254
const LOCAL_PART_MAX = 64

/** True when this could be somebody's address. Safe to call from the browser. */
export function isPlausibleEmail(raw: string): boolean {
  const clean = raw.trim()
  if (clean.length > EMAIL_MAX) return false
  if (!PLAUSIBLE_EMAIL.test(clean)) return false
  // The regex has already proved there is exactly one `@`, so this cannot be -1.
  return clean.slice(0, clean.indexOf("@")).length <= LOCAL_PART_MAX
}

function email(
  issues: Issue[],
  field: string,
  raw: string | undefined,
): string {
  const clean = trimmed(raw)

  if (clean === "") {
    reject(issues, field, "required", "An e-mail address is required.")
    return ""
  }
  if (clean.length > EMAIL_MAX) {
    reject(
      issues,
      field,
      "too_long",
      `An e-mail address cannot be longer than ${EMAIL_MAX} characters.`,
    )
    return clean
  }
  if (!isPlausibleEmail(clean)) {
    reject(
      issues,
      field,
      "bad_email",
      `${JSON.stringify(clean)} does not look like an e-mail address. It needs one @ and a domain, like ada@example.org.`,
    )
  }

  // NOT lowercased here. Folding case is how one person stops being two
  // members, and that fold lives in `lib/db/members.ts` — beside the INSERT it
  // protects, so it holds for every caller and not only for forms.
  return clean
}

// ── barcodes ──────────────────────────────────────────────────────────────

const BARCODE_MAX = 64

function barcode(
  issues: Issue[],
  field: string,
  raw: string | undefined,
): string {
  const clean = trimmed(raw)

  if (clean === "") {
    reject(
      issues,
      field,
      "required",
      "Scan the barcode on the copy, or type what is printed on the sticker.",
    )
    return ""
  }
  if (clean.length > BARCODE_MAX) {
    reject(
      issues,
      field,
      "too_long",
      `A barcode cannot be longer than ${BARCODE_MAX} characters.`,
    )
    return clean
  }
  // Whitespace INSIDE, after the ends were trimmed, is almost always two scans
  // that landed in one box — the scanner fired twice, or the librarian never
  // left the field. Storing it creates a barcode no sticker will ever match.
  if (/\s/.test(clean)) {
    reject(
      issues,
      field,
      "bad_barcode",
      "A barcode cannot contain spaces. If two codes went into the box at once, clear it and scan again.",
    )
  }
  return clean
}

// ══════════════════════════════════════════════════════════════════════════
// ISBN — the check digit, which is the reason this module exists.
//
// An ISBN carries its own error detection. The last character is computed from
// the others, so a single mistyped digit, and any transposition of two
// adjacent digits, both break the sum. That is not a formatting rule; it is
// the only chance anyone gets to notice the mistake. Once a wrong-but-
// well-formed ISBN is in the catalogue, every system downstream — union
// catalogues, inter-library loan, the acquisitions supplier — treats it as an
// identifier it can resolve, and resolves it to a different book. `seed.ts`
// already refuses to invent ISBNs for exactly this reason; this is the same
// decision on the other side of the door.
//
// ISBN-10 (1970–2006): digits weighted 10…1, and the total must be divisible
// by 11. Eleven values are needed for the last position and there are only ten
// digits, so `X` stands for 10 — which is why the letter is legal in the check
// position and nowhere else.
//
// ISBN-13 (2007–): the same number re-issued as an EAN-13 barcode. Weights
// alternate 1 and 3 and the total must be divisible by 10. Alternating weights
// is what catches transpositions, since swapping two neighbours changes the
// sum by twice their difference.
// ══════════════════════════════════════════════════════════════════════════

/**
 * What people put between the digits. Spaces and the ASCII hyphen are the
 * common ones; the Unicode dashes arrive when an ISBN is pasted out of a PDF
 * or a word processor that helpfully "improved" the hyphens.
 */
function compactIsbn(raw: string): string {
  // `\s` already covers the non-breaking space; U+2010–U+2015 are the hyphen,
  // non-breaking hyphen, figure dash, en dash, em dash and horizontal bar; the
  // trailing `-` is the plain ASCII one, literal because it ends the class.
  return raw.replace(/[\s‐-―-]/g, "").toUpperCase()
}

function isbn10CheckDigitHolds(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const character = digits[i]
    const value = character === "X" ? 10 : character.charCodeAt(0) - 48
    sum += value * (10 - i)
  }
  return sum % 11 === 0
}

function isbn13CheckDigitHolds(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < 13; i++) {
    sum += (digits.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3)
  }
  return sum % 10 === 0
}

/** The ISBN-13 that names the same edition as this valid ISBN-10. */
function asIsbn13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += (body.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3)
  }
  return `${body}${(10 - (sum % 10)) % 10}`
}

type IsbnVerdict =
  | { ok: true; isbn13: string }
  | { ok: false; why: "shape" | "prefix" | "check_digit" }

/**
 * The three refusals are kept apart because they are three different sentences
 * at the desk. "That is not the right number of digits" sends the librarian to
 * look at the book again; "the check digit does not match" tells them a digit
 * is wrong and the book in their hand is still the right one to read it from.
 * Collapsing them into `false` would throw away the more useful half.
 */
function readIsbn(raw: string): IsbnVerdict {
  const compact = compactIsbn(raw)

  if (/^[0-9]{9}[0-9X]$/.test(compact)) {
    if (!isbn10CheckDigitHolds(compact)) return { ok: false, why: "check_digit" }
    return { ok: true, isbn13: asIsbn13(compact) }
  }

  if (/^[0-9]{13}$/.test(compact)) {
    // Every ISBN-13 lives in the Bookland EAN prefixes. A 13-digit number that
    // starts anywhere else is a product barcode off the back cover, not an
    // ISBN, and it will happily satisfy the mod-10 sum — the check digit
    // cannot tell you what a number IS, only that it was copied correctly.
    if (!/^97[89]/.test(compact)) return { ok: false, why: "prefix" }
    if (!isbn13CheckDigitHolds(compact)) return { ok: false, why: "check_digit" }
    return { ok: true, isbn13: compact }
  }

  return { ok: false, why: "shape" }
}

/**
 * True when this is a real ISBN — right shape AND self-consistent. Pure, and
 * free of any server import, so a client component can call it on every
 * keystroke.
 */
export function isValidIsbn(raw: string): boolean {
  return readIsbn(raw).ok
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE CANONICAL FORM, AND WHY AN ISBN-10 IS STORED AS ITS ISBN-13.
 *
 * `0-679-72576-8` and `9780679725763` are the same edition of the same book,
 * written in the two notations that existed either side of 2007. Stored as
 * typed, they are two rows, and `book.isbn UNIQUE` cannot help: it compares
 * strings, and these are different strings. The delivery gets catalogued
 * twice, once from the copyright page and once from the barcode, and the
 * second cataloguer sees no warning at all.
 *
 * So a valid ISBN-10 is converted — `978` in front, check digit recomputed —
 * and the hyphens go, because hyphen placement is a publisher-range
 * convention that the same number is printed with and without.
 *
 * This is normalisation, NOT a check-then-act: it canonicalises the input and
 * the single INSERT still does the refusing. It is the same move, for the same
 * reason, as `canonical()` in `members.ts`, and it carries the same caveat —
 * rows written by a path that skips this function are not canonical, so it
 * holds exactly as long as writes go through here.
 *
 * Returns null when the input is not a valid ISBN at all.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function normalizeIsbn(raw: string): string | null {
  const verdict = readIsbn(raw)
  return verdict.ok ? verdict.isbn13 : null
}

/** The ISBN, which a book published before 1970 is allowed not to have. */
function isbn(
  issues: Issue[],
  field: string,
  raw: string | undefined,
): string | null {
  const clean = trimmed(raw)
  // Blank is "we do not know", which is true of every book on the rare shelf
  // and is stored as NULL. It is not the same as a wrong ISBN.
  if (clean === "") return null

  const verdict = readIsbn(clean)
  if (verdict.ok) return verdict.isbn13

  if (verdict.why === "check_digit") {
    reject(
      issues,
      field,
      "bad_isbn_check",
      `${JSON.stringify(clean)} has the right number of digits but fails its own check digit, so at least one digit is wrong. Read it off the book again — an ISBN that is nearly right identifies a different book, and every catalogue we share it with will believe it.`,
    )
    return null
  }

  if (verdict.why === "prefix") {
    reject(
      issues,
      field,
      "not_an_isbn",
      `${JSON.stringify(clean)} is a 13-digit barcode but not an ISBN — every ISBN-13 begins 978 or 979. Check you are reading the ISBN and not another barcode on the cover.`,
    )
    return null
  }

  reject(
    issues,
    field,
    "not_an_isbn",
    `${JSON.stringify(clean)} is not an ISBN. It should be 10 or 13 digits, hyphens optional. Leave it blank if the book has none.`,
  )
  return null
}

// ── the forms ─────────────────────────────────────────────────────────────
//
// One checker per form. The `Raw*` types are what a form yields — every field
// a string, every field possibly absent — and the `Valid*` types are what the
// data layer takes. Each `Valid*` is structurally assignable to its
// counterpart in `lib/db`, and `app/actions.ts` is where the compiler proves
// it: pass a checked value straight into `addBook` and a drift between the two
// declarations stops compiling.

const TITLE_MAX = 300
const AUTHOR_MAX = 200
const NAME_MAX = 120

export type RawBook = {
  title?: string
  author?: string
  isbn?: string
  publishedYear?: string
}

export type ValidBook = {
  title: string
  author: string
  isbn: string | null
  publishedYear: number | null
}

export function checkNewBook(raw: RawBook): Checked<ValidBook> {
  const issues: Issue[] = []
  const value: ValidBook = {
    title: text(issues, "title", "The title", raw.title, { max: TITLE_MAX }),
    author: text(issues, "author", "The author", raw.author, {
      max: AUTHOR_MAX,
    }),
    isbn: isbn(issues, "isbn", raw.isbn),
    publishedYear: publicationYear(issues, "publishedYear", raw.publishedYear),
  }
  return settle(issues, value)
}

export type RawCopy = { bookId?: string; barcode?: string }
export type ValidCopy = { bookId: number; barcode: string }

export function checkNewCopy(raw: RawCopy): Checked<ValidCopy> {
  const issues: Issue[] = []
  const value: ValidCopy = {
    bookId: rowId(issues, "bookId", "The book", raw.bookId),
    barcode: barcode(issues, "barcode", raw.barcode),
  }
  return settle(issues, value)
}

export type RawMember = { name?: string; email?: string }
export type ValidMember = { name: string; email: string }

export function checkNewMember(raw: RawMember): Checked<ValidMember> {
  const issues: Issue[] = []
  const value: ValidMember = {
    name: text(issues, "name", "The member's name", raw.name, {
      max: NAME_MAX,
    }),
    email: email(issues, "email", raw.email),
  }
  return settle(issues, value)
}

export type RawLend = { barcode?: string; memberId?: string }
export type ValidLend = { barcode: string; memberId: number }

export function checkLend(raw: RawLend): Checked<ValidLend> {
  const issues: Issue[] = []
  const value: ValidLend = {
    barcode: barcode(issues, "barcode", raw.barcode),
    memberId: rowId(issues, "memberId", "The member", raw.memberId),
  }
  return settle(issues, value)
}

export type RawBarcode = { barcode?: string }

export function checkBarcode(raw: RawBarcode): Checked<{ barcode: string }> {
  const issues: Issue[] = []
  const value = { barcode: barcode(issues, "barcode", raw.barcode) }
  return settle(issues, value)
}

export type RawBookId = { bookId?: string }

export function checkBookId(raw: RawBookId): Checked<{ bookId: number }> {
  const issues: Issue[] = []
  const value = { bookId: rowId(issues, "bookId", "The book", raw.bookId) }
  return settle(issues, value)
}

export type RawLoanId = { loanId?: string }

export function checkLoanId(raw: RawLoanId): Checked<{ loanId: number }> {
  const issues: Issue[] = []
  const value = { loanId: rowId(issues, "loanId", "The loan", raw.loanId) }
  return settle(issues, value)
}
