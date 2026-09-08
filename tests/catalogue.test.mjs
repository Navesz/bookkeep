// The catalogue, tested by trying to break it.
//
// Like tests/loans.test.mjs, this runs against a real SQLite file in a temp
// directory. The things under test here — a UNIQUE constraint, ON DELETE
// CASCADE, and how LIKE folds case — are all behaviours of the engine, so a
// mock would only assert what we already believe.
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
const carregar = (rel) => import(pathToFileURL(join(ROOT, rel)).href)

const { database, closeDatabase } = await carregar("lib/db/connection.ts")
const { lend } = await carregar("lib/db/loans.ts")
const {
  addBook,
  addCopy,
  bookById,
  search,
  removeBook,
  DuplicateIsbn,
  DuplicateBarcode,
  BookHasHistory,
} = await carregar("lib/db/books.ts")
const { addMember, memberById, memberByEmail, members, DuplicateEmail } =
  await carregar("lib/db/members.ts")
const { seed, AlreadySeeded } = await carregar("lib/db/seed.ts")

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

// Barcodes and emails are unique library-wide, so tests cannot share them.
let n = 0
const unico = () => `T${++n}`

// ─────────────────────────────────────────────────────────── the constraints

test("a duplicate ISBN is refused, and named", () => {
  addBook({
    title: "The Mezzanine",
    author: "Nicholson Baker",
    isbn: "9780679725763",
  })

  assert.throws(
    () =>
      addBook({
        title: "A Different Book",
        author: "Someone Else",
        isbn: "9780679725763",
      }),
    DuplicateIsbn
  )

  // The refusal is the DATABASE's: exactly one row carries that ISBN, whatever
  // the caller tried.
  const linhas = db
    .prepare("SELECT count(*) n FROM book WHERE isbn = ?")
    .get("9780679725763")
  assert.equal(linhas.n, 1)
})

test("books with no ISBN do not collide — NULLs are distinct in SQLite", () => {
  // The seed depends on this: fifteen pre-1970 books all carry a null ISBN.
  // If NULLs collided, the honest choice would have been impossible.
  const a = addBook({ title: "Untitled One", author: "Anon" })
  const b = addBook({ title: "Untitled Two", author: "Anon" })

  assert.notEqual(a.id, b.id)
  assert.equal(a.isbn, null)
  assert.equal(b.isbn, null)
})

test("a duplicate email is refused, and named", () => {
  addMember({ name: "Ada Lovelace", email: "ada.desk@example.org" })

  assert.throws(
    () => addMember({ name: "Ada Again", email: "ada.desk@example.org" }),
    DuplicateEmail
  )

  const linhas = db
    .prepare("SELECT count(*) n FROM member WHERE email = ?")
    .get("ada.desk@example.org")
  assert.equal(linhas.n, 1)
})

test("email case does not create a second account for one person", () => {
  // SQLite compares TEXT with BINARY collation, so without the normalisation in
  // members.ts these two are different values and both would be accepted.
  addMember({ name: "Grace Hopper", email: "Grace.Desk@Example.ORG" })

  assert.throws(
    () => addMember({ name: "Grace Again", email: "grace.desk@example.org" }),
    DuplicateEmail
  )
  assert.equal(memberByEmail("GRACE.DESK@EXAMPLE.ORG").name, "Grace Hopper")
  // Stored canonically, not merely matched canonically.
  assert.equal(
    memberByEmail("grace.desk@example.org").email,
    "grace.desk@example.org"
  )
})

test("a duplicate barcode is refused — the scanner must resolve to one object", () => {
  const livro = addBook({ title: "Barcode Fixture", author: "Anon" })
  const codigo = `DUP-${unico()}`
  addCopy(livro.id, codigo)

  assert.throws(() => addCopy(livro.id, codigo), DuplicateBarcode)
})

test("members can be found by id and listed", () => {
  const membro = addMember({
    name: "Alan Turing",
    email: "alan.desk@example.org",
  })

  assert.equal(memberById(membro.id).name, "Alan Turing")
  assert.equal(memberById(999_999), undefined)
  assert.ok(members().some((m) => m.email === "alan.desk@example.org"))
})

// ─────────────────────────────────────────────────────────────────── search

test("search finds a partial word in the title, and is case-insensitive", () => {
  const livro = addBook({
    title: "The Zanzibar Chronicles",
    author: "Quintus Vandermeer",
  })

  // Mid-word, not a prefix — this is the case FTS5's default tokenizer cannot
  // do, and the reason books.ts scans with LIKE instead.
  const meio = search("anziba")
  assert.equal(meio.length, 1)
  assert.equal(meio[0].id, livro.id)

  // Case folds both ways for ASCII.
  assert.equal(search("ZANZIBAR").length, 1)
  assert.equal(search("zanzibar").length, 1)
})

test("search finds by author too", () => {
  const livro = addBook({
    title: "Obscure Pamphlet",
    author: "Quintus Vandermeer",
  })

  const porAutor = search("vandermeer")
  const ids = porAutor.map((b) => b.id)
  assert.ok(
    ids.includes(livro.id),
    "the pamphlet should be found by its author"
  )
  // Both Vandermeer books, found on a needle that appears in neither title.
  assert.equal(porAutor.length, 2)
})

test("a title hit outranks a book that only matched on its author", () => {
  addBook({ title: "Vandermeer: A Life", author: "Someone Else Entirely" })

  const resultados = search("vandermeer")
  assert.equal(resultados[0].title, "Vandermeer: A Life")
})

test("an apostrophe is a character, not a syntax error", () => {
  // The specific thing that ruled FTS5 out: `MATCH "Gulliver's"` raises
  // `fts5: syntax error near "'"`. Our own seed has *Alice's Adventures in
  // Wonderland* in it, so this is not hypothetical.
  const livro = addBook({
    title: "Gulliver's Travels",
    author: "Jonathan Swift",
  })

  assert.equal(search("Gulliver's")[0].id, livro.id)
  assert.equal(search("iver's Tra")[0].id, livro.id)
})

test("a literal % in the needle is not a wildcard", () => {
  const livro = addBook({ title: "100% Cotton: A History", author: "Anon" })

  // Without the ESCAPE clause in books.ts this needle matches the whole
  // catalogue, because `%` means "anything".
  const resultados = search("100%")
  assert.equal(resultados.length, 1)
  assert.equal(resultados[0].id, livro.id)
})

test("an empty search browses the catalogue instead of erroring", () => {
  assert.ok(search("").length > 0)
  assert.ok(search("   ").length > 0)
})

test("KNOWN LIMITATION: LIKE folds case for ASCII only", () => {
  // This test documents a gap rather than a feature. SQLite's built-in LIKE
  // does not case-fold non-ASCII, so the lowercase needle misses the accented
  // name while the exact spelling finds it. books.ts says why we accepted this.
  //
  // If this test ever fails, someone has fixed it — switch it to assert the
  // better behaviour rather than restoring the gap.
  const livro = addBook({ title: "Germinal", author: "Émile Zola" })

  assert.equal(search("émile").length, 0, "lowercase é does not match É today")
  assert.equal(
    search("Émile")[0].id,
    livro.id,
    "the exact spelling still works"
  )
  assert.equal(
    search("zola")[0].id,
    livro.id,
    "the ASCII part of the name folds fine"
  )
})

// ───────────────────────────────────────────────────────────── availability

test("availability counts copies, and a copy on loan is not available", () => {
  const livro = addBook({ title: "Three Copies", author: "Anon" })
  const a = addCopy(livro.id, `AV-${unico()}`)
  addCopy(livro.id, `AV-${unico()}`)
  addCopy(livro.id, `AV-${unico()}`)
  const membro = addMember({
    name: "Katherine Johnson",
    email: "katherine.desk@example.org",
  })

  assert.deepEqual(pick(bookById(livro.id)), { copies: 3, available: 3 })

  const emprestimo = lend(a.id, membro.id)
  assert.deepEqual(pick(bookById(livro.id)), { copies: 3, available: 2 })

  // And search reports the same numbers as the detail view — one definition of
  // "available", shared by both queries.
  const resultado = search("Three Copies")[0]
  assert.deepEqual(pick(resultado), { copies: 3, available: 2 })

  // Returning it puts the copy back on the shelf.
  db.prepare("UPDATE loan SET returned_at = datetime('now') WHERE id = ?").run(
    emprestimo.id
  )
  assert.deepEqual(pick(bookById(livro.id)), { copies: 3, available: 3 })
})

test("a book with no copies is still in the catalogue, at 0 of 0", () => {
  const livro = addBook({ title: "On Order, Not Yet Arrived", author: "Anon" })

  assert.deepEqual(pick(bookById(livro.id)), { copies: 0, available: 0 })
  assert.equal(search("On Order").length, 1)
})

test("bookById returns undefined for an id that is not there", () => {
  assert.equal(bookById(999_999), undefined)
})

function pick(livro) {
  return { copies: livro.copies, available: livro.available }
}

// ────────────────────────────────────────────────────────────────── cascade

test("deleting a book takes its copies with it — the pragma is real", () => {
  const livro = addBook({ title: "Doomed Edition", author: "Anon" })
  addCopy(livro.id, `CA-${unico()}`)
  addCopy(livro.id, `CA-${unico()}`)

  const antes = db
    .prepare("SELECT count(*) n FROM copy WHERE book_id = ?")
    .get(livro.id)
  assert.equal(antes.n, 2)

  assert.equal(removeBook(livro.id), true)

  // ON DELETE CASCADE is written in schema.sql, but it is inert unless
  // `PRAGMA foreign_keys = ON` ran on THIS connection. Without connection.ts's
  // first statement these two copies survive their book and the shelf keeps
  // objects no catalogue entry explains.
  const depois = db
    .prepare("SELECT count(*) n FROM copy WHERE book_id = ?")
    .get(livro.id)
  assert.equal(depois.n, 0)
  assert.equal(bookById(livro.id), undefined)
})

test("a book that has ever been lent cannot be withdrawn", () => {
  const livro = addBook({ title: "Has A Past", author: "Anon" })
  const exemplar = addCopy(livro.id, `HP-${unico()}`)
  const membro = addMember({
    name: "Edsger Dijkstra",
    email: "edsger.desk@example.org",
  })
  lend(exemplar.id, membro.id)

  // `loan.copy_id` has no ON DELETE, so the loan rows block the cascade. That is
  // the schema choosing history over tidiness.
  assert.throws(() => removeBook(livro.id), BookHasHistory)
  assert.ok(bookById(livro.id), "the book is still there after the refusal")
})

test("removing a book that does not exist is false, not an error", () => {
  assert.equal(removeBook(999_999), false)
})

// ───────────────────────────────────────────────────────────────────── seed
// Last on purpose: seed() adds fifteen books, and the search assertions above
// count rows.

test("the seed fills an empty library and refuses to run twice", () => {
  const antes = db.prepare("SELECT count(*) n FROM book").get().n

  const resumo = seed()
  assert.equal(resumo.books, 15)
  assert.equal(db.prepare("SELECT count(*) n FROM book").get().n, antes + 15)

  // Seeded books are searchable by partial title and by author.
  assert.ok(search("ockingbird").length === 0)
  assert.equal(search("prejud")[0].title, "Pride and Prejudice")
  assert.ok(search("dickens").some((b) => b.title === "Great Expectations"))

  // Wuthering Heights is the library's only copy and it is out.
  const wuthering = search("Wuthering")[0]
  assert.deepEqual(pick(wuthering), { copies: 1, available: 0 })
  // Pride and Prejudice is partly out.
  assert.deepEqual(pick(search("Pride and Prejudice")[0]), {
    copies: 3,
    available: 2,
  })

  // Every seeded ISBN is null — invented ones would be a lie other systems trust.
  const inventados = db
    .prepare(
      "SELECT count(*) n FROM book WHERE isbn IS NOT NULL AND title = 'Dracula'"
    )
    .get()
  assert.equal(inventados.n, 0)

  // A second run is refused by the barcode constraint, and rolls back whole:
  // without the transaction the first book would survive the failed copy.
  const contagem = db.prepare("SELECT count(*) n FROM book").get().n
  assert.throws(() => seed(), AlreadySeeded)
  assert.equal(db.prepare("SELECT count(*) n FROM book").get().n, contagem)
})
