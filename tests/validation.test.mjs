// The input guard, tested by trying to get a lie past it.
//
// Nothing here touches the database, because nothing here is the database's
// job: a UNIQUE index cannot tell you that an ISBN's check digit is wrong, and
// a NOT NULL cannot tell you that 20255 is not a year. These are the refusals
// that have to happen before SQL, and they are pure functions over strings, so
// the tests are too.
//
// The `.ts` module is imported directly; Node strips types since 22.18.

import { strict as assert } from "node:assert"
import { join } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dirname, "..")
// pathToFileURL, not the raw path: on Windows `import('C:\...')` dies with
// ERR_UNSUPPORTED_ESM_URL_SCHEME, because the loader reads `c:` as a scheme.
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)

const {
  checkBarcode,
  checkBookId,
  checkLend,
  checkLoanId,
  checkNewBook,
  checkNewCopy,
  checkNewMember,
  isPlausibleEmail,
  isValidIsbn,
  normalizeIsbn,
} = await load("lib/validation.ts")

/** The codes raised, in order, so a test can say what was wrong and where. */
const codes = (result) => result.issues.map((issue) => issue.code)
const fields = (result) => result.issues.map((issue) => issue.field)

/** The one issue about a given field, when a test only cares about one. */
function about(result, field) {
  return result.issues.find((issue) => issue.field === field)
}

// ══════════════════════════════════════════════════════════════════════════
// THE ISBN CHECK DIGIT — the reason lib/validation.ts exists.
// ══════════════════════════════════════════════════════════════════════════

// The Mezzanine, in both notations. The same book, the same edition, the two
// numbering schemes either side of 2007.
const MEZZANINE_13 = "9780679725763"
const MEZZANINE_10 = "0679725768"

test("a real ISBN is accepted, in both notations", () => {
  assert.equal(isValidIsbn(MEZZANINE_13), true)
  assert.equal(isValidIsbn(MEZZANINE_10), true)
})

test("THE POINT: one digit out and the ISBN is refused", () => {
  // 9780679725763 with the tenth digit 5 changed to 6. It is still thirteen
  // digits, it still starts 978, and it is still a perfectly plausible string
  // — nothing but the check digit can tell that it is wrong. Let it through
  // and the catalogue holds a number that resolves, at every union catalogue
  // and every supplier, to somebody else's book.
  assert.equal(isValidIsbn("9780679726763"), false)

  // The same mistake in the ten-digit notation: last digit 8 typed as 9.
  assert.equal(isValidIsbn("0679725769"), false)
})

test("a transposition is refused — that is what the alternating weights buy", () => {
  // Two adjacent digits swapped (…725763 → …727563) is the other mistake
  // humans make when copying numbers, and the 1/3 weighting is chosen so that
  // swapping neighbours always changes the sum.
  assert.equal(isValidIsbn("9780679727563"), false)
})

test("the check digit says the number was copied right, not that it IS an ISBN", () => {
  // A valid EAN-13 that is not a book: 5000679725766 satisfies the mod-10 sum
  // exactly, and would sail through a checksum-only guard. Every ISBN-13 lives
  // under the Bookland prefixes 978 and 979, so the prefix is the second half
  // of the question and the checksum cannot answer it.
  assert.equal(isValidIsbn("5000679725766"), false)

  // 979 is accepted alongside 978 — it is the range issued since 2007, and a
  // guard that knows only about 978 starts refusing new books.
  assert.equal(isValidIsbn("9790000000001"), true)
})

test("X is a digit worth 10, and only in the last position", () => {
  // Eleven values are needed for an ISBN-10 check digit and there are ten
  // digits, which is the whole reason the letter exists.
  assert.equal(isValidIsbn("080442957X"), true)
  assert.equal(isValidIsbn("080442957x"), true, "lower case is the same number")

  // Anywhere else it is not a digit at all.
  assert.equal(isValidIsbn("X80442957X"), false)
})

test("hyphens are notation, not data — including the ones a word processor made", () => {
  assert.equal(normalizeIsbn("978-0-679-72576-3"), MEZZANINE_13)
  assert.equal(normalizeIsbn("0-679-72576-8"), MEZZANINE_13)
  assert.equal(normalizeIsbn("  9780679725763  "), MEZZANINE_13)

  // U+2013 EN DASH, which is what an ISBN pasted out of a PDF or a document
  // that "improved" its hyphens actually contains. It looks identical in the
  // form field and is a different character to `===`.
  assert.equal(normalizeIsbn("978\u20130\u2013679\u201372576\u20133"), MEZZANINE_13)
})

test("THE CANONICAL FORM: an ISBN-10 and its ISBN-13 become the same string", () => {
  // This is what makes `book.isbn UNIQUE` able to see a duplicate at all. Store
  // them as typed and they are two different strings, so the same delivery gets
  // catalogued twice — once off the copyright page, once off the barcode — and
  // the constraint that exists to prevent exactly that never fires.
  assert.equal(normalizeIsbn(MEZZANINE_10), normalizeIsbn(MEZZANINE_13))
  assert.equal(normalizeIsbn(MEZZANINE_10), MEZZANINE_13)

  // And through the form checker, which is where it actually matters.
  const ten = checkNewBook({ title: "T", author: "A", isbn: "0-679-72576-8" })
  const thirteen = checkNewBook({ title: "T", author: "A", isbn: MEZZANINE_13 })
  assert.equal(ten.ok && ten.value.isbn, MEZZANINE_13)
  assert.equal(thirteen.ok && thirteen.value.isbn, MEZZANINE_13)
})

test("normalizeIsbn returns null rather than a half-cleaned string", () => {
  assert.equal(normalizeIsbn("9780679726763"), null, "bad check digit")
  assert.equal(normalizeIsbn("97806797257"), null, "wrong length")
  assert.equal(normalizeIsbn("not an isbn"), null)
  assert.equal(normalizeIsbn(""), null)
})

test("a bad check digit and a bad shape are different messages", () => {
  // They send the librarian to different places: one means a digit is wrong and
  // the book in their hand is still the right thing to read it from; the other
  // means they are looking at the wrong number entirely.
  const typo = checkNewBook({ title: "T", author: "A", isbn: "9780679726763" })
  assert.equal(typo.ok, false)
  assert.equal(about(typo, "isbn").code, "bad_isbn_check")
  assert.match(about(typo, "isbn").message, /check digit/i)

  const nonsense = checkNewBook({ title: "T", author: "A", isbn: "12345" })
  assert.equal(about(nonsense, "isbn").code, "not_an_isbn")

  const barcode = checkNewBook({ title: "T", author: "A", isbn: "5000679725766" })
  assert.equal(about(barcode, "isbn").code, "not_an_isbn")
  assert.match(about(barcode, "isbn").message, /978 or 979/)
})

test("no ISBN is not the same as a wrong ISBN", () => {
  // The seed's fifteen pre-1970 books depend on this: blank means "we do not
  // know", which is true and which stores as NULL. Refusing it would make the
  // rare shelf uncatalogueable.
  const result = checkNewBook({ title: "Walden", author: "Thoreau", isbn: "" })
  assert.equal(result.ok, true)
  assert.equal(result.value.isbn, null)

  const absent = checkNewBook({ title: "Walden", author: "Thoreau" })
  assert.equal(absent.ok, true)
  assert.equal(absent.value.isbn, null)
})

// ══════════════════════════════════════════════════════════════════════════
// THE REST OF THE FORM
// ══════════════════════════════════════════════════════════════════════════

test("a year is four digits, in a range, and may be absent", () => {
  const ok = checkNewBook({ title: "T", author: "A", publishedYear: "1897" })
  assert.equal(ok.ok, true)
  assert.equal(ok.value.publishedYear, 1897)

  // A trailing digit from a slipped keypress. `Number("20255")` is a perfectly
  // good number, which is why the range and not the parse is what catches it.
  const far = checkNewBook({ title: "T", author: "A", publishedYear: "20255" })
  assert.equal(about(far, "publishedYear").code, "not_a_number")

  const ancient = checkNewBook({ title: "T", author: "A", publishedYear: "0" })
  assert.equal(about(ancient, "publishedYear").code, "out_of_range")

  const words = checkNewBook({ title: "T", author: "A", publishedYear: "MDCCC" })
  assert.equal(about(words, "publishedYear").code, "not_a_number")

  // Next year is allowed: forthcoming titles are catalogued before they arrive.
  const soon = String(new Date().getFullYear() + 1)
  assert.equal(checkNewBook({ title: "T", author: "A", publishedYear: soon }).ok, true)

  const later = String(new Date().getFullYear() + 2)
  const tooSoon = checkNewBook({ title: "T", author: "A", publishedYear: later })
  assert.equal(about(tooSoon, "publishedYear").code, "out_of_range")

  // Unknown is a legitimate answer and blank is how it is written.
  assert.equal(
    checkNewBook({ title: "T", author: "A", publishedYear: "  " }).value
      .publishedYear,
    null
  )
})

test("a title of nothing but whitespace is missing, not short", () => {
  const result = checkNewBook({ title: "   ", author: "A" })
  assert.equal(about(result, "title").code, "required")
})

test("a title longer than the column is refused with its own length in the message", () => {
  const result = checkNewBook({ title: "x".repeat(301), author: "A" })
  assert.equal(about(result, "title").code, "too_long")
  assert.match(about(result, "title").message, /301/)
})

test("EVERY bad field comes back at once, not one per round trip", () => {
  // Four mistakes in one submission. Refusing on the first would make the
  // librarian submit, read, fix, submit — one page load per typo.
  const result = checkNewBook({
    title: "",
    author: "",
    isbn: "123",
    publishedYear: "abcd",
  })

  assert.equal(result.ok, false)
  assert.deepEqual(fields(result), ["title", "author", "isbn", "publishedYear"])
  assert.deepEqual(codes(result), [
    "required",
    "required",
    "not_an_isbn",
    "not_a_number",
  ])
})

test("an e-mail needs one @ and a domain that could exist", () => {
  assert.equal(isPlausibleEmail("ada@example.org"), true)
  assert.equal(isPlausibleEmail("ada.lovelace+cards@sub.example.co.uk"), true)

  assert.equal(isPlausibleEmail("ada.example.org"), false, "no @")
  assert.equal(isPlausibleEmail("ada@@example.org"), false, "two @")
  assert.equal(isPlausibleEmail("ada lovelace@example.org"), false, "a space")
  assert.equal(isPlausibleEmail("ada@example"), false, "no domain suffix")
  assert.equal(isPlausibleEmail("ada@example.o"), false, "one-letter suffix")
  assert.equal(isPlausibleEmail("ada@example.org,"), false, "pasted from a list")
  assert.equal(isPlausibleEmail("@example.org"), false, "nobody in front")
  assert.equal(isPlausibleEmail(""), false)

  // RFC 5321 caps the local part at 64 characters and the whole thing at 254.
  assert.equal(isPlausibleEmail(`${"a".repeat(65)}@example.org`), false)
})

test("the member form names the field that is wrong", () => {
  const result = checkNewMember({ name: "Ada Lovelace", email: "ada.example.org" })
  assert.equal(result.ok, false)
  assert.deepEqual(fields(result), ["email"])
  assert.equal(about(result, "email").code, "bad_email")

  // Case is left alone HERE — folding it is `lib/db/members.ts`'s job, beside
  // the INSERT it protects, so it holds for callers that never see a form.
  const cased = checkNewMember({ name: " Ada ", email: " Ada@Example.ORG " })
  assert.equal(cased.ok, true)
  assert.equal(cased.value.email, "Ada@Example.ORG")
  assert.equal(cased.value.name, "Ada", "but the whitespace is gone")
})

test("a barcode with a space in it is two scans, and is refused", () => {
  // The scanner is a keyboard. Two fires into one focused input produce one
  // string that no sticker in the building will ever match again.
  const doubled = checkBarcode({ barcode: "BK-0001-1 BK-0001-2" })
  assert.equal(doubled.ok, false)
  assert.equal(about(doubled, "barcode").code, "bad_barcode")

  // The trailing carriage return plenty of scanners append is trimmed, not
  // refused — that one is the scanner working as designed.
  const trailing = checkBarcode({ barcode: "BK-0001-1\r\n" })
  assert.equal(trailing.ok, true)
  assert.equal(trailing.value.barcode, "BK-0001-1")

  assert.equal(checkBarcode({ barcode: "" }).ok, false)
  assert.equal(checkBarcode({}).ok, false)
})

test("a row id must be digits — a tampered hidden field is not a number", () => {
  assert.equal(checkBookId({ bookId: "42" }).value.bookId, 42)

  // `Number()` would accept every one of these. `1e3` is 1000, ` 12 ` is 12,
  // and `0x10` is 16 — none of them is what a form that was not edited sends.
  for (const bad of ["1e3", "0x10", "12abc", "-1", "0", "", " ", "1.5"]) {
    const result = checkBookId({ bookId: bad })
    assert.equal(result.ok, false, `bookId ${JSON.stringify(bad)} should be refused`)
    assert.equal(result.issues[0].field, "bookId")
  }

  assert.equal(checkLoanId({ loanId: "7" }).value.loanId, 7)
  assert.equal(checkLoanId({ loanId: "x" }).ok, false)
})

test("the desk forms carry both of their fields", () => {
  const lend = checkLend({ barcode: "BK-0001-1", memberId: "3" })
  assert.deepEqual(lend.value, { barcode: "BK-0001-1", memberId: 3 })

  // Both wrong at once, both reported, in field order.
  const empty = checkLend({})
  assert.deepEqual(fields(empty), ["barcode", "memberId"])

  const copy = checkNewCopy({ bookId: "12", barcode: " BK-0012-4 " })
  assert.deepEqual(copy.value, { bookId: 12, barcode: "BK-0012-4" })
})

test("every refusal carries a field, a code and a sentence", () => {
  // The contract the UI renders against: `field` says where to put it, `code`
  // is what to branch on, `message` is what a human reads. A missing one of
  // those is an issue the interface cannot display next to anything.
  const result = checkNewBook({ title: "", author: "", isbn: "9780679726763" })

  assert.equal(result.ok, false)
  for (const issue of result.issues) {
    assert.equal(typeof issue.field, "string")
    assert.ok(issue.code.length > 0, "every issue has a code")
    assert.ok(issue.message.length > 10, "every issue has a real sentence")
    assert.match(issue.message, /\.$/, "and it ends like a sentence")
  }
})
