/**
 * Turning SQLite's timestamps into something a librarian can read.
 *
 * This is a `.ts` under `components/` rather than under `lib/` because that is
 * where this agent's boundary runs; if the file ever moves, nothing here has to
 * change but the import path.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * TRAP 1 — `new Date("2026-09-07 23:25:00")` IS NOT UTC.
 *
 * `datetime('now')` in SQLite returns `YYYY-MM-DD HH:MM:SS`: a space instead of
 * a `T`, and no zone suffix. That is not an ISO 8601 date-time, so V8 falls
 * back to its implementation-defined parser, and the implementation-defined
 * answer is LOCAL TIME. On a machine at UTC+2 every due date shifts two hours
 * earlier, which is invisible for eleven days and then decides — wrongly, on
 * the fourteenth — whether a loan is overdue at nine in the morning.
 *
 * `parseTimestamp` puts the `T` and the `Z` back. It is the only place in the
 * front end that turns a database string into a `Date`, so the fix is made once
 * rather than at each of the six call sites that used to want it.
 *
 * TRAP 2 — THE SERVER AND THE BROWSER MUST AGREE ON THE STRING.
 *
 * These pages are server components, so a date is formatted on the server and
 * shipped as text; React then re-renders on the client during hydration for any
 * component marked `"use client"`. `toLocaleDateString()` with no arguments
 * asks the runtime for its locale and its zone, and the server's answer is not
 * the visitor's — the classic hydration mismatch, which React repairs by
 * throwing the server's HTML away.
 *
 * Both arguments are therefore pinned: `en-GB` for the order (7 Sep 2026, which
 * cannot be misread as a month like 09/07 can), and `UTC` for the zone, which
 * is the zone the database writes in. The cost is stated plainly: a librarian
 * west of Greenwich late in the evening sees tomorrow's date on a loan made
 * today. The alternative is dates that disagree with the `due_at` the database
 * is comparing against, and a due date that disagrees with the rule that
 * enforces it is worse than a due date that is six hours ahead.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** One day, in milliseconds. Named because `86_400_000` in a diff is noise. */
const DAY = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD HH:MM:SS` (SQLite, UTC) → a `Date` that actually means that. */
export function parseTimestamp(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`)
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

/** `7 Sep 2026`. The form used everywhere a date is shown on its own. */
export function formatDay(value: string): string {
  return DAY_FORMAT.format(parseTimestamp(value))
}

/**
 * The machine-readable half of a `<time>` element: `2026-09-07`.
 *
 * A `<time datetime>` that a screen reader or a browser extension can parse
 * costs one `slice` and is the difference between "7 Sep 2026" being a date and
 * being three words.
 */
export function machineDay(value: string): string {
  return value.slice(0, 10)
}

/**
 * Whole days from `now` to `due`, counted between CALENDAR DAYS and not between
 * instants.
 *
 * The distinction is the whole point. A loan due at 09:00 tomorrow is 0.6 days
 * away by subtraction, which rounds to zero and reads "due today" — on a day it
 * is not due. Truncating both sides to midnight UTC first makes the answer the
 * one a person would give: tomorrow is 1, regardless of the hour it is asked.
 *
 * Negative means overdue.
 */
export function daysUntil(due: string, now: Date): number {
  const at = parseTimestamp(due)
  const dueDay = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )

  return Math.round((dueDay - today) / DAY)
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * "LATE" IS DECIDED THE WAY THE DATABASE DECIDES IT, AND ONLY THAT WAY.
 *
 * `lib/db/loans.ts` selects overdue loans with `l.due_at < datetime('now')` —
 * an instant-by-instant comparison, done as a string because SQLite's
 * `YYYY-MM-DD HH:MM:SS` is fixed-width, zero-padded and big-endian, so
 * lexicographic order IS chronological order.
 *
 * The first version of this file decided lateness a different way: by whole
 * calendar days, `daysUntil(due, now) < 0`. That is a defensible rule and it is
 * a SECOND rule, and the two disagree for exactly one population — loans that
 * fell due earlier today. Measured on the seed: a loan due at 02:57 showed as
 * "3 loans are late" on `/overdue`, which the database had counted, and as
 * "1 out" with no late badge on `/members`, which this file had counted. Same
 * screenful, two answers, and no way for a librarian to tell which was true.
 *
 * So this function now asks the same question in the same terms. `daysUntil`
 * survives untouched because whole days are the right unit for the PHRASE
 * ("due in 3 days") — it just no longer gets a vote on whether something is
 * late.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function sqliteStamp(now: Date): string {
  // `toISOString` gives `2026-09-08T02:57:30.123Z`; SQLite writes
  // `2026-09-08 02:57:30`. Swapping the `T` and cutting at 19 characters drops
  // both the milliseconds and the `Z`, leaving two strings that compare.
  return now.toISOString().replace("T", " ").slice(0, 19)
}

export function isLate(due: string, now: Date): boolean {
  return due < sqliteStamp(now)
}

/** How a due date stands relative to now. Three states, no fourth. */
export type DueStanding = "overdue" | "due-today" | "on-time"

export function standingOf(due: string, now: Date): DueStanding {
  if (isLate(due, now)) return "overdue"
  // Not late, but the due date is today: the copy is expected back before
  // closing. It is not a problem yet and it is not "in 3 days" either.
  if (daysUntil(due, now) === 0) return "due-today"
  return "on-time"
}

/**
 * The sentence next to a due date: "due in 3 days", "due today", "6 days
 * overdue".
 *
 * Singular and plural are both written out rather than appending an `s`,
 * because "1 days overdue" is the kind of detail that makes software look like
 * it was not finished — and this string sits on the first screen of the day.
 */
export function dueLabel(due: string, now: Date): string {
  const days = daysUntil(due, now)

  // The late branch is asked FIRST and asks `isLate`, not the day count. A loan
  // that fell due at nine this morning is late and its day count is 0 — reading
  // the number first would print "due today" beside a row that `/overdue` is
  // listing as late.
  if (isLate(due, now)) {
    if (days === 0) return "overdue since today"
    if (days === -1) return "1 day overdue"
    return `${-days} days overdue`
  }

  if (days === 0) return "due today"
  if (days === 1) return "due tomorrow"
  return `due in ${days} days`
}

/**
 * How long ago something happened, for the join date and the acquisition date
 * — places where the exact day matters less than the order of magnitude.
 */
export function sinceLabel(value: string, now: Date): string {
  const days = -daysUntil(value, now)

  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  if (days < 365) {
    const months = Math.round(days / 30)
    return months === 1 ? "1 month ago" : `${months} months ago`
  }
  const years = Math.round(days / 365)
  return years === 1 ? "1 year ago" : `${years} years ago`
}
