// The rule this system exists to keep, tested by trying to break it.
//
// These tests run against a real SQLite file in a temp directory, not a mock.
// A mock of the database would be a mock of the exact thing under test: the
// partial unique index. Faking it would leave us testing our own belief about
// what SQLite does.
//
// The `.ts` modules are imported directly — Node strips types since 22.18.

import { strict as assert } from "node:assert"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { pathToFileURL } from "node:url"

const ROOT = join(import.meta.dirname, "..")
// pathToFileURL, not the raw path: on Windows `import('C:\...')` dies with
// ERR_UNSUPPORTED_ESM_URL_SCHEME, because the loader reads `c:` as a scheme.
const carregar = (rel) => import(pathToFileURL(join(ROOT, rel)).href)

const { database, closeDatabase } = await carregar("lib/db/connection.ts")
const { lend, returnLoan, copiesOf, openLoansOf, CopyAlreadyOut, NoSuchLoan } =
  await carregar("lib/db/loans.ts")

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

/** A book, one copy of it, and someone to lend it to. */
function seed(barcode, email) {
  const book = db
    .prepare(
      "INSERT INTO book (title, author) VALUES (?, ?) RETURNING id",
    )
    .get("The Mezzanine", "Nicholson Baker")
  const copy = db
    .prepare(
      "INSERT INTO copy (book_id, barcode) VALUES (?, ?) RETURNING id",
    )
    .get(book.id, barcode)
  const member = db
    .prepare("INSERT INTO member (name, email) VALUES (?, ?) RETURNING id")
    .get("Ada Lovelace", email)
  return { book: book.id, copy: copy.id, member: member.id }
}

test("a copy goes out, and the loan knows when it is due", () => {
  const { copy, member } = seed("A-1", "ada@example.org")
  const loan = lend(copy, member)

  assert.equal(loan.copy_id, copy)
  assert.equal(loan.returned_at, null)
  // Due after lent, from the same clock — not merely "a date exists".
  assert.ok(loan.due_at > loan.lent_at, `${loan.due_at} should follow ${loan.lent_at}`)
})

test("THE RULE: the same copy cannot go out twice", () => {
  const { copy, member } = seed("A-2", "grace@example.org")
  lend(copy, member)

  assert.throws(() => lend(copy, member), CopyAlreadyOut)

  // And the refusal is the DATABASE's, not a guard we could forget: exactly one
  // open loan exists for that copy, whatever the caller tried.
  const abertos = db
    .prepare(
      "SELECT count(*) n FROM loan WHERE copy_id = ? AND returned_at IS NULL",
    )
    .get(copy)
  assert.equal(abertos.n, 1)
})

test("a returned copy can go out again — closed loans leave the index", () => {
  const { copy, member } = seed("A-3", "alan@example.org")
  const primeiro = lend(copy, member)
  returnLoan(primeiro.id)

  const segundo = lend(copy, member)
  assert.notEqual(segundo.id, primeiro.id)

  // The history survives: two loans, one closed and one open.
  const todos = db
    .prepare("SELECT count(*) n FROM loan WHERE copy_id = ?")
    .get(copy)
  assert.equal(todos.n, 2)
})

test("returning twice does not overwrite the first return", () => {
  const { copy, member } = seed("A-4", "edsger@example.org")
  const loan = lend(copy, member)
  const fechado = returnLoan(loan.id)

  assert.throws(() => returnLoan(loan.id), NoSuchLoan)

  const agora = db.prepare("SELECT returned_at FROM loan WHERE id = ?").get(loan.id)
  assert.equal(agora.returned_at, fechado.returned_at)
})

test("a loan cannot point at a member who does not exist", () => {
  const { copy } = seed("A-5", "barbara@example.org")
  // Proves `PRAGMA foreign_keys = ON` actually ran: without it SQLite accepts
  // this row and the desk gets a loan owed by nobody.
  assert.throws(() => lend(copy, 999_999), /FOREIGN KEY/i)
})

test("the desk can see who has what", () => {
  const { book, copy, member } = seed("A-6", "katherine@example.org")
  lend(copy, member)

  const exemplares = copiesOf(book)
  assert.equal(exemplares.length, 1)
  assert.equal(exemplares[0].borrower, "Ada Lovelace")

  const emprestimos = openLoansOf(member)
  assert.equal(emprestimos.length, 1)
  assert.equal(emprestimos[0].title, "The Mezzanine")
})
