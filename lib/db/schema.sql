-- The whole database, in one file, applied on every boot.
--
-- WHY ONE FILE AND NOT A MIGRATION CHAIN, yet: a chain is the right answer the
-- day the schema has to change under data that already exists. It is the wrong
-- answer today, because it would be a chain of one link plus the machinery to
-- run it. This file is idempotent (`IF NOT EXISTS` everywhere), so booting
-- twice is safe. The day the first ALTER is needed, this file becomes
-- `0001-initial.sql` and the runner arrives with it.

-- ─────────────────────────────────────────────────────────── the catalogue

-- The bibliographic record: the *work*, not the object on the shelf.
CREATE TABLE IF NOT EXISTS book (
  id             INTEGER PRIMARY KEY,
  title          TEXT    NOT NULL,
  author         TEXT    NOT NULL,
  -- Nullable on purpose. ISBN was born in 1970; a library that refuses books
  -- older than that is a library that refuses its own rare shelf.
  isbn           TEXT    UNIQUE,
  published_year INTEGER,
  added_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- The physical object. One book, many copies — this split is what makes
-- "is it available?" a question with an answer. A catalogue without it can
-- only say whether the library *knows* the book, not whether you can take it
-- home.
CREATE TABLE IF NOT EXISTS copy (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  -- What is printed on the sticker. Unique across the library, because that is
  -- what the scanner reads and it must resolve to exactly one shelf object.
  barcode     TEXT    NOT NULL UNIQUE,
  acquired_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS member (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  email     TEXT    NOT NULL UNIQUE,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────── the lending

CREATE TABLE IF NOT EXISTS loan (
  id          INTEGER PRIMARY KEY,
  copy_id     INTEGER NOT NULL REFERENCES copy(id),
  member_id   INTEGER NOT NULL REFERENCES member(id),
  lent_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  due_at      TEXT    NOT NULL,
  -- NULL means the copy is still out. It is the only marker of "open", and
  -- the index below turns that into a rule the database keeps.
  returned_at TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- THE ONE RULE THIS SYSTEM EXISTS TO KEEP: a copy cannot be lent twice.
--
-- It is a PARTIAL UNIQUE INDEX, and that choice is the whole point. The
-- obvious implementation is application code — "select open loans for this
-- copy; if none, insert" — and it is wrong in a way that testing does not
-- catch: two librarians scanning the same barcode at the same moment both read
-- zero, both insert, and the shelf now owes two people the same object. The
-- window is milliseconds and it opens exactly on the busy afternoon when two
-- people are working the desk.
--
-- Here the second INSERT fails. Not because someone remembered to check, but
-- because the row cannot exist. `WHERE returned_at IS NULL` is what makes it
-- work: closed loans are outside the index, so the same copy can be lent again
-- after it comes back, and its history stays whole.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_copy
  ON loan (copy_id) WHERE returned_at IS NULL;

-- Reading paths. The catalogue is searched by title and author far more often
-- than by anything else, and a member's history is the second screen anyone
-- opens at the desk.
CREATE INDEX IF NOT EXISTS book_title  ON book (title);
CREATE INDEX IF NOT EXISTS book_author ON book (author);
CREATE INDEX IF NOT EXISTS copy_book   ON copy (book_id);
CREATE INDEX IF NOT EXISTS loan_member ON loan (member_id);
