// What the desk does all day, tested by trying to break it.
//
// Like the other two suites this runs against a real SQLite file in a temp
// directory. The things under test are the engine's: a partial unique index
// refusing a second open loan, an UPDATE that matches nothing, and date
// arithmetic done by SQLite's clock rather than JavaScript's. A mock would
// only assert what we already believe about all three.
//
// The `.ts` modules are imported directly; Node strips types since 22.18.

import { strict as assert } from "node:assert"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dirname, "..")
// pathToFileURL, not the raw path: on Windows `import('C:\...')` dies with
// ERR_UNSUPPORTED_ESM_URL_SCHEME, because the loader reads `c:` as a scheme.
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)

const { database, closeDatabase } = await load("lib/db/connection.ts")
const {
  allOpenLoans,
  lend,
  lendByBarcode,
  loanHistoryOf,
  overdueLoans,
  returnByBarcode,
  returnLoan,
  CopyAlreadyOut,
  CopyNotOut,
  NoSuchBarcode,
  NoSuchLoan,
} = await load("lib/db/loans.ts")
const { addBook, addCopy, BookHasHistory, DuplicateBarcode, DuplicateIsbn } =
  await load("lib/db/books.ts")
const { addMember, DuplicateEmail } = await load("lib/db/members.ts")
const { AlreadySeeded } = await load("lib/db/seed.ts")
const { explain } = await load("lib/db/failures.ts")

let dir
let db

before(() => {
  dir = mkdtempSync(join(tmpdir(), "bookkeep-"))
  process.env.BOOKKEEP_DATABASE = join(dir, "test.db")
  db = database(process.env.BOOKKEEP_DATABASE)
})

after(() => {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
})

// Barcodes and e-mails are unique library-wide, so tests cannot share them.
let n = 0
const unique = () => `D${++n}`

/** A book with one copy, and somebody to lend it to. */
function shelf(title = "The Mezzanine") {
  const tag = unique()
  const book = addBook({ title, author: "Nicholson Baker" })
  const copy = addCopy(book.id, `BC-${tag}`)
  const member = addMember({ name: `Reader ${tag}`, email: `${tag}@example.org` })
  return { book, copy, member, barcode: copy.barcode }
}

// ══════════════════════════════════════════════════════════════════════════
// LENDING BY BARCODE — one scan and one name.
// ══════════════════════════════════════════════════════════════════════════

test("a scan and a name is enough to lend a copy", () => {
  const { copy, member, barcode } = shelf()

  const loan = lendByBarcode(barcode, member.id)

  assert.equal(loan.copy_id, copy.id, "the barcode resolved to the right copy")
  assert.equal(loan.member_id, member.id)
  assert.equal(loan.returned_at, null)
  assert.ok(loan.due_at > loan.lent_at, `${loan.due_at} should follow ${loan.lent_at}`)
})

test("THE RULE HOLDS THROUGH THE BARCODE DOOR TOO", () => {
  const { copy, member, barcode } = shelf()
  lendByBarcode(barcode, member.id)

  // Resolving the barcode inside the INSERT is what keeps this a single
  // statement. If it were a SELECT followed by a lend, two librarians scanning
  // the same sticker at the same moment would both read "free" and both write.
  assert.throws(() => lendByBarcode(barcode, member.id), CopyAlreadyOut)

  const open = db
    .prepare("SELECT count(*) n FROM loan WHERE copy_id = ? AND returned_at IS NULL")
    .get(copy.id)
  assert.equal(open.n, 1, "the database refused, whatever the caller tried")
})

test("the refusal names the sticker, because that is what the librarian holds", () => {
  const { copy, member, barcode } = shelf()
  lendByBarcode(barcode, member.id)

  try {
    lendByBarcode(barcode, member.id)
    assert.fail("should have refused")
  } catch (error) {
    assert.ok(error instanceof CopyAlreadyOut)
    assert.equal(error.barcode, barcode)
    assert.equal(error.copyId, copy.id, "and still carries the row id")
    assert.match(error.message, new RegExp(barcode))
  }
})

test("a barcode nothing carries is its own error, not a lend that failed quietly", () => {
  const { member } = shelf()

  assert.throws(() => lendByBarcode("NO-SUCH-STICKER", member.id), NoSuchBarcode)

  // And nothing was written on the way past.
  const loans = db.prepare("SELECT count(*) n FROM loan WHERE member_id = ?").get(member.id)
  assert.equal(loans.n, 0)
})

test("lending to a member who does not exist still fails loudly", () => {
  const { barcode } = shelf()
  // Proves `PRAGMA foreign_keys = ON` reaches this statement too: without it
  // SQLite accepts the row and the shelf owes a book to nobody.
  assert.throws(() => lendByBarcode(barcode, 999_999), /FOREIGN KEY/i)
})

// ══════════════════════════════════════════════════════════════════════════
// RETURNING BY BARCODE — the scanner reads the sticker, not a loan id.
// ══════════════════════════════════════════════════════════════════════════

test("a scan is enough to take a copy back", () => {
  const { member, barcode } = shelf()
  const lent = lendByBarcode(barcode, member.id)

  const closed = returnByBarcode(barcode)

  assert.equal(closed.id, lent.id)
  assert.ok(closed.returned_at, "the loan is closed")

  // And the copy can go out again: closed loans leave the partial index.
  const again = lendByBarcode(barcode, member.id)
  assert.notEqual(again.id, lent.id)
})

test("RETURNING A BARCODE THAT IS NOT OUT is refused, and says so exactly", () => {
  const { barcode } = shelf()
  // The copy exists and is on the shelf. Nothing to give back.
  assert.throws(() => returnByBarcode(barcode), CopyNotOut)
})

test("returning twice tells the desk the second time is a mistake", () => {
  const { member, barcode } = shelf()
  lendByBarcode(barcode, member.id)
  const closed = returnByBarcode(barcode)

  // Not "success, zero rows" — that is how a librarian concludes a book is
  // checked in when it never was.
  assert.throws(() => returnByBarcode(barcode), CopyNotOut)

  // The first return date stands; nothing overwrote it.
  const row = db.prepare("SELECT returned_at FROM loan WHERE id = ?").get(closed.id)
  assert.equal(row.returned_at, closed.returned_at)
})

test("an unknown barcode at the returns desk is NOT the same as a copy on the shelf", () => {
  // The two send a librarian to opposite places — look at the sticker again,
  // or go and find who already brought it back. Flattening them into one
  // "could not return" would send half of them to the wrong one.
  assert.throws(() => returnByBarcode("NO-SUCH-STICKER"), NoSuchBarcode)
})

test("returning by loan id still works, for the button beside a row", () => {
  const { member, barcode } = shelf()
  const lent = lendByBarcode(barcode, member.id)

  assert.equal(returnLoan(lent.id).id, lent.id)
  assert.throws(() => returnLoan(lent.id), NoSuchLoan)
})

// ══════════════════════════════════════════════════════════════════════════
// OVERDUE — the first screen at opening time.
// ══════════════════════════════════════════════════════════════════════════

test("a loan due in the past is overdue, and by how many days", () => {
  const { member, barcode } = shelf("Long Overdue")
  // Negative days puts the due date behind the lend date, which is the only
  // honest way to test this: the comparison and the arithmetic both run on
  // SQLite's clock, so faking the clock in JavaScript would test nothing.
  const loan = lend(shelfCopyId(barcode), member.id, -3)

  assert.ok(loan.due_at < loan.lent_at, "the fixture really is in the past")

  const late = overdueLoans().find((row) => row.barcode === barcode)
  assert.ok(late, "the overdue list found it")
  assert.equal(late.days_overdue, 3)
  assert.equal(late.title, "Long Overdue")
  assert.equal(late.member_name, member.name, "and who to ask for it back")
})

test("a loan not yet due is not on the overdue list", () => {
  const { member, barcode } = shelf("Not Due Yet")
  lendByBarcode(barcode, member.id)

  assert.equal(
    overdueLoans().some((row) => row.barcode === barcode),
    false
  )
  // But it IS out, which is a different list.
  assert.equal(
    allOpenLoans().some((row) => row.barcode === barcode),
    true
  )
})

test("an overdue loan that comes back leaves the list", () => {
  const { member, barcode } = shelf("Late But Returned")
  lend(shelfCopyId(barcode), member.id, -9)

  assert.equal(overdueLoans().some((row) => row.barcode === barcode), true)
  returnByBarcode(barcode)
  assert.equal(overdueLoans().some((row) => row.barcode === barcode), false)
})

test("overdue is computed at read time — no column to keep in step", () => {
  const { member, barcode } = shelf("Goes Late By Itself")
  const loan = lendByBarcode(barcode, member.id)

  assert.equal(overdueLoans().some((row) => row.barcode === barcode), false)

  // Nothing writes an `is_overdue` flag; the world moving is what makes a loan
  // late. Move the due date and the same query answers differently, with no
  // job having run at midnight.
  db.prepare("UPDATE loan SET due_at = datetime('now', '-1 day') WHERE id = ?").run(loan.id)

  const late = overdueLoans().find((row) => row.barcode === barcode)
  assert.ok(late)
  assert.equal(late.days_overdue, 1)
})

test("the overdue list is ordered most overdue first", () => {
  const a = shelf("Ordering A")
  const b = shelf("Ordering B")
  lend(shelfCopyId(a.barcode), a.member.id, -30)
  lend(shelfCopyId(b.barcode), b.member.id, -1)

  const rows = overdueLoans()
  const indexA = rows.findIndex((row) => row.barcode === a.barcode)
  const indexB = rows.findIndex((row) => row.barcode === b.barcode)
  assert.ok(indexA >= 0 && indexB >= 0)
  assert.ok(indexA < indexB, "thirty days late comes before one day late")
})

// ══════════════════════════════════════════════════════════════════════════
// A MEMBER'S WHOLE HISTORY — not just what they are holding.
// ══════════════════════════════════════════════════════════════════════════

test("history keeps the loans that are already closed", () => {
  const { member, barcode } = shelf("Read Twice")
  const first = lendByBarcode(barcode, member.id)
  returnByBarcode(barcode)
  const second = lendByBarcode(barcode, member.id)

  const history = loanHistoryOf(member.id)
  assert.equal(history.length, 2, "the closed loan did not disappear")

  // Open first — those are the ones that can still be acted on.
  assert.equal(history[0].id, second.id)
  assert.equal(history[0].returned_at, null)
  assert.equal(history[1].id, first.id)
  assert.ok(history[1].returned_at)

  assert.equal(history[0].title, "Read Twice")
  assert.equal(history[0].barcode, barcode)
})

test("history flags the open loans that are late, and only those", () => {
  const { member, barcode } = shelf("Overdue In History")
  lend(shelfCopyId(barcode), member.id, -5)

  const [open] = loanHistoryOf(member.id)
  // 1 and 0, not true and false: SQLite has no boolean type, and inventing one
  // here would be a translation layer for a single column.
  assert.equal(open.overdue, 1)

  returnByBarcode(barcode)
  const [closed] = loanHistoryOf(member.id)
  assert.equal(
    closed.overdue,
    0,
    "a returned loan is not overdue, however late it was"
  )
})

test("a member who has never borrowed has an empty history, not an error", () => {
  const member = addMember({
    name: "Never Borrowed",
    email: `${unique()}@example.org`,
  })
  assert.deepEqual(loanHistoryOf(member.id), [])
  assert.deepEqual(loanHistoryOf(999_999), [])
})

test("every open loan in the library, in one query, with who has it", () => {
  const { member, barcode } = shelf("Across Members")
  lendByBarcode(barcode, member.id)

  const row = allOpenLoans().find((loan) => loan.barcode === barcode)
  assert.ok(row)
  assert.equal(row.member_id, member.id)
  assert.equal(row.member_name, member.name)
  assert.equal(row.title, "Across Members")

  // Nothing that has been returned is in it.
  returnByBarcode(barcode)
  assert.equal(
    allOpenLoans().some((loan) => loan.barcode === barcode),
    false,
    "a closed loan is not an open one"
  )
})

// ══════════════════════════════════════════════════════════════════════════
// THE TRANSLATION — no raw SQLite message may reach the browser.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Every domain error the data layer defines. If a new one is added and this
 * list is not, the loop below is the thing that goes red — which is the point
 * of writing the list out rather than deriving it.
 */
const EVERY_DOMAIN_ERROR = () => [
  new DuplicateIsbn("9780679725763"),
  new DuplicateBarcode("BK-0001-1"),
  new BookHasHistory(7),
  new DuplicateEmail("ada@example.org"),
  new CopyAlreadyOut(3),
  new CopyAlreadyOut(3, "BK-0001-1"),
  new NoSuchBarcode("BK-0001-1"),
  new CopyNotOut("BK-0001-1"),
  new NoSuchLoan(12),
  new AlreadySeeded(),
]

test("every domain error becomes something a librarian can act on", () => {
  for (const error of EVERY_DOMAIN_ERROR()) {
    const issue = explain(error)
    assert.ok(issue, `${error.name} has no desk message`)
    assert.equal(issue.code, error.name, "the code is the error's own name")
    assert.ok(issue.message.length > 40, `${error.name}'s message is too thin`)

    // The three words that mean the schema leaked into the screen.
    assert.doesNotMatch(
      issue.message,
      /constraint|SQLITE|FOREIGN KEY/i,
      `${error.name} leaks database vocabulary`
    )
  }
})

test("a fault is NOT dressed up as a refusal", () => {
  // `explain` returning null is what makes `app/actions.ts` log the real error
  // and show a generic apology. If it invented a message for anything it did
  // not recognise, an unanticipated bug would arrive at the desk wearing a
  // confident and wrong explanation.
  assert.equal(explain(new Error("UNIQUE constraint failed: book.isbn")), null)
  assert.equal(explain(new TypeError("x is not a function")), null)
  assert.equal(explain("a string"), null)
  assert.equal(explain(null), null)
})

test("THE GUARANTEE: a real refusal from the data layer arrives readable", () => {
  // Not a hand-built error — one actually thrown by SQLite, caught by the
  // translation in `lib/db`, and turned into a sentence. This is the whole
  // path the browser depends on.
  const isbn = "9780140449136"
  addBook({ title: "First Entry", author: "Anon", isbn })

  try {
    addBook({ title: "Same Book Again", author: "Anon", isbn })
    assert.fail("the duplicate ISBN should have been refused")
  } catch (error) {
    const issue = explain(error)
    assert.ok(issue, "a raw SQLite error reached the caller untranslated")
    assert.equal(issue.field, "isbn", "and it names the field to render it beside")
    assert.match(issue.message, new RegExp(isbn))
    assert.doesNotMatch(issue.message, /constraint/i)
  }
})

test("the field on each issue is a form field, or null for the whole form", () => {
  const seen = new Map()
  for (const error of EVERY_DOMAIN_ERROR()) {
    const issue = explain(error)
    seen.set(error.name, issue.field)
  }

  // The contract the UI renders against, written out so a rename is visible in
  // the diff rather than discovered by a message appearing beside nothing.
  assert.deepEqual(Object.fromEntries(seen), {
    DuplicateIsbn: "isbn",
    DuplicateBarcode: "barcode",
    BookHasHistory: null,
    DuplicateEmail: "email",
    CopyAlreadyOut: "barcode",
    NoSuchBarcode: "barcode",
    CopyNotOut: "barcode",
    NoSuchLoan: "loanId",
    AlreadySeeded: null,
  })
})

/** The copy id behind a barcode, for the fixtures that need `lend` directly. */
function shelfCopyId(barcode) {
  return db.prepare("SELECT id FROM copy WHERE barcode = ?").get(barcode).id
}
