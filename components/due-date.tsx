import { cn } from "@/lib/utils"
import { dueLabel, formatDay, machineDay, standingOf } from "@/components/dates"

/**
 * A due date and how it stands: the date itself, and under it the one phrase
 * that says whether anybody has to do something about it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `now` IS A PROP AND IS NEVER READ FROM THE CLOCK HERE.
 *
 * Two reasons, and the second is the one that bites.
 *
 * 1. ONE RENDER, ONE NOW. A page with eleven due dates that each call
 *    `new Date()` has eleven slightly different opinions about the present. It
 *    almost never matters and it matters exactly at midnight, where two rows on
 *    the same screen can land on different days.
 *
 * 2. HYDRATION. If this component were ever placed inside a `"use client"`
 *    subtree, the server would render "due in 1 day" and the browser — running
 *    the same code some seconds or some hours later, in another zone — could
 *    render "due today". React does not reconcile that; it discards the
 *    server's markup for that subtree. Taking `now` as a prop makes the output
 *    a pure function of props, which is the only shape that is safe on both
 *    sides of the boundary.
 *
 * WHY `<time>` AND NOT A `<span>`. `dateTime` carries the machine form
 * (`2026-09-21`) beside the human one, which is what lets a browser extension
 * or an assistive technology treat it as a date rather than as three words that
 * happen to look like one.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function DueDate({
  due,
  now,
  className,
}: {
  /** `due_at`, exactly as SQLite stores it: `YYYY-MM-DD HH:MM:SS`, UTC. */
  due: string
  now: Date
  className?: string
}) {
  const standing = standingOf(due, now)

  return (
    <span className={cn("flex flex-col gap-0.5", className)}>
      <time
        dateTime={machineDay(due)}
        className="text-row text-foreground tabular-nums"
      >
        {formatDay(due)}
      </time>
      <span
        className={cn(
          "text-caption",
          standing === "overdue"
            ? "font-medium text-overdue-foreground"
            : standing === "due-today"
              ? "font-medium text-on-loan-foreground"
              : "text-muted-foreground"
        )}
      >
        {dueLabel(due, now)}
      </span>
    </span>
  )
}

/**
 * The same fact at a glance, for the places a two-line block would not fit —
 * a member's card, a result row.
 *
 * It says the DATE for a loan that is fine and the STANDING for one that is
 * not, because those are the two different things a reader wants in the two
 * cases: "when do I get it back" versus "how bad is this".
 */
export function DueChip({
  due,
  now,
  className,
}: {
  due: string
  now: Date
  className?: string
}) {
  const standing = standingOf(due, now)
  const late = standing === "overdue"

  return (
    <span
      className={cn(
        // The three circulation colours from `app/globals.css`, used for the
        // three things they name. Each pair is a tinted paper plus the ink
        // measured to sit on it — 6.05:1 and 6.72:1 for overdue in the two
        // themes — so this is legible without any further checking.
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 text-caption font-medium whitespace-nowrap tabular-nums",
        late
          ? "bg-overdue text-overdue-foreground"
          : standing === "due-today"
            ? "bg-on-loan text-on-loan-foreground"
            : "bg-muted text-muted-foreground",
        className
      )}
    >
      {/* The visible text drops the word "due" when the date is shown on its
          own, so the chip stays short; the spoken form puts it back, because
          "21 Sep 2026" announced with no context is a date with no job. */}
      <span className="sr-only">{late ? "" : "Due "}</span>
      {late ? dueLabel(due, now) : formatDay(due)}
    </span>
  )
}
