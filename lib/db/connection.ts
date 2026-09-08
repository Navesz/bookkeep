import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The only place that opens the database.
 *
 * WHY `node:sqlite` AND NOT `better-sqlite3`. The house rule is that a
 * built-in wins when it does the job, and Node 24 ships SQLite 3.50.4 in the
 * standard library. The alternative is a native module: a compiler on every
 * machine that installs, prebuilt binaries per platform in CI, and a rebuild
 * every time Node bumps its ABI. For a library-management app that is a lot of
 * moving parts bought with nothing.
 *
 * THE PRICE, STATED: `node:sqlite` is marked experimental, so its API can
 * change between Node minors, and it prints an ExperimentalWarning on every
 * boot. That is why every call into it is behind this file — swapping to
 * `better-sqlite3` means rewriting this module and nothing else, because both
 * expose the same `prepare/run/get/all` shape. The bet is cheap to lose.
 *
 * WHY A SINGLE CONNECTION AND NOT A POOL. SQLite is a file, not a server; a
 * pool would be several handles fighting over one lock. One handle in WAL mode
 * lets readers work while a writer writes, which is the concurrency this app
 * actually has: a few librarians at a desk, not a fleet.
 */

let handle: DatabaseSync | null = null

/** Where the file lives. Overridable so tests can use their own. */
export const DATABASE_PATH =
  process.env.BOOKKEEP_DATABASE ?? join(process.cwd(), "bookkeep.db")

export function database(path: string = DATABASE_PATH): DatabaseSync {
  if (handle) return handle

  const db = new DatabaseSync(path)

  // FOREIGN KEYS ARE OFF BY DEFAULT IN SQLITE, and they are off per
  // connection, not per file. Every `REFERENCES` in schema.sql is decoration
  // until this line runs — a loan could point at a copy that was deleted and
  // nothing would complain. It is the first statement for that reason.
  db.exec("PRAGMA foreign_keys = ON")

  // WAL lets a reader and a writer work at once instead of blocking each
  // other. `synchronous = NORMAL` is the pairing the SQLite docs recommend
  // with WAL: it gives up durability only for a machine that loses power
  // mid-write, and keeps it for a process that crashes.
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")

  // Applied on every boot, not once: schema.sql is idempotent, and a database
  // that repairs its own shape at startup cannot drift from the file that
  // describes it.
  db.exec(readFileSync(join(import.meta.dirname, "schema.sql"), "utf8"))

  handle = db
  return db
}

/** Tests open and close their own file; production never calls this. */
export function closeDatabase() {
  handle?.close()
  handle = null
}
