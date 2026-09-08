import { cn } from "@/lib/utils"
import { standingOf } from "@/components/dates"

/**
 * WHERE ONE COPY IS: on the shelf, out on loan, or out and late.
 *
 * THREE STATES AND NOT TWO, because "on loan" and "overdue" call for different
 * moves — the first is the system working, the second is a phone call. They
 * come from two different facts: whether there is an open loan at all, and
 * whether its due date has passed. Collapsing them would leave the desk with a
 * copies table on which nothing is ever urgent.
 *
 * THE THREE COLOURS ARE `--shelved`, `--on-loan` and `--overdue` from
 * `app/globals.css`, used for exactly the three things they are named after.
 * Each is a tinted paper with an ink measured to sit on it — 7.58:1, 6.38:1 and
 * 6.05:1 in the light theme — so nothing here needs re-checking against a
 * contrast tool. And the badge always carries WORDS: the hue is a second
 * signal, never the only one.
 */
export function CopyStatus({
  due,
  now,
  className,
}: {
  /**
   * The open loan's `due_at`, or `null` when the copy is on the shelf. The
   * nullability IS the availability — see `copiesOf` in `lib/db/loans.ts`,
   * where the LEFT JOIN leaves these columns null for a copy nobody has.
   */
  due: string | null
  /** Passed in, never read from the clock here — see `components/due-date.tsx`. */
  now: Date
  className?: string
}) {
  const state = due === null ? "shelved" : standingOf(due, now)

  const label =
    state === "shelved"
      ? "On the shelf"
      : state === "overdue"
        ? "Overdue"
        : "On loan"

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 text-caption font-medium whitespace-nowrap",
        state === "shelved"
          ? "bg-shelved text-shelved-foreground"
          : state === "overdue"
            ? "bg-overdue text-overdue-foreground"
            : "bg-on-loan text-on-loan-foreground",
        className
      )}
    >
      {label}
    </span>
  )
}
