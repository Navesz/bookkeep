import { database } from "./connection.ts"

/**
 * The people who borrow things.
 *
 * Same rule as the rest of `lib/db`: TRY, THEN TRANSLATE. `addMember` does not
 * look up the email before inserting it — it inserts, and lets the UNIQUE
 * constraint refuse. A lookup first would be two statements with a gap, and the
 * gap is where one person signing up on two desks becomes two accounts.
 */

/** Fields assigned by hand, not constructor parameter properties — see loans.ts. */
export class DuplicateEmail extends Error {
  readonly email: string

  constructor(email: string) {
    super(`a member with email ${email} already exists`)
    this.name = "DuplicateEmail"
    this.email = email
  }
}

export type Member = {
  id: number
  name: string
  email: string
  joined_at: string
}

export type NewMember = {
  name: string
  email: string
}

// The COLUMN, not the index — SQLite says `UNIQUE constraint failed:
// member.email`, measured on 3.50.4.
const DUPLICATE_EMAIL = "UNIQUE constraint failed: member.email"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * WHY THE EMAIL IS LOWERCASED BEFORE IT IS STORED.
 *
 * SQLite compares TEXT with BINARY collation by default, so `Ada@example.org`
 * and `ada@example.org` are two different values and the UNIQUE constraint
 * happily accepts both. That is one human with two library cards, two loan
 * histories, and one of them invisible to whichever spelling the desk types.
 *
 * The fix lives here rather than in schema.sql on purpose. `COLLATE NOCASE`
 * would be the database-level answer, but it folds ASCII only — it would miss
 * exactly the international addresses that motivate caring. JavaScript's
 * `toLowerCase` is full Unicode.
 *
 * This is normalisation, not a check-then-act: it canonicalises the input and
 * the single INSERT still does the refusing. The cost, stated plainly: rows
 * written by some other code path that bypasses this module are not
 * normalised, so this holds only as long as writes go through here.
 * ═════════════════════════════════════════════════════════════════════════
 */
function canonical(email: string): string {
  return email.trim().toLowerCase()
}

export function addMember(member: NewMember): Member {
  const email = canonical(member.email)
  const insert = database().prepare(
    `INSERT INTO member (name, email)
     VALUES (?, ?)
     RETURNING id, name, email, joined_at`
  )

  try {
    return insert.get(member.name.trim(), email) as Member
  } catch (error) {
    if (error instanceof Error && error.message.includes(DUPLICATE_EMAIL)) {
      throw new DuplicateEmail(email)
    }
    throw error
  }
}

export function memberById(id: number): Member | undefined {
  return database()
    .prepare("SELECT id, name, email, joined_at FROM member WHERE id = ?")
    .get(id) as Member | undefined
}

/**
 * Look someone up by email — the lookup the desk does when a card is missing.
 * The needle goes through the same `canonical` as the write, so the casing the
 * librarian happens to type never decides whether the member is found.
 */
export function memberByEmail(email: string): Member | undefined {
  return database()
    .prepare("SELECT id, name, email, joined_at FROM member WHERE email = ?")
    .get(canonical(email)) as Member | undefined
}

/**
 * Everyone, by name. Ordered so the list is stable between calls — an
 * unordered SELECT is free to reshuffle itself, and a list that reorders under
 * the cursor is a list nobody can click accurately.
 */
export function members(): Member[] {
  return database()
    .prepare("SELECT id, name, email, joined_at FROM member ORDER BY name, id")
    .all() as Member[]
}
