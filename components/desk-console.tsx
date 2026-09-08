"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CircleAlert, CircleCheck, LoaderCircle, ScanLine } from "lucide-react"

import { lendCopyState, returnCopyState } from "@/components/form-actions"
import type { Loan } from "@/lib/db/loans.ts"
import { cn } from "@/lib/utils"
import { formatDay, parseTimestamp } from "@/components/dates"
import type { Submission } from "@/components/form-actions"
import { useFormAction, valueFor } from "@/components/form-state"
import { NativeSelect } from "@/components/native-select"
import type { MemberOption } from "@/components/reads.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type DeskMode = "lend" | "return"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE DESK — designed for somebody who is looking at the book, not the screen.
 *
 * Everything odd about this component comes from one observation: at a
 * circulation desk the librarian's eyes are on the object and their hands are
 * on a scanner. A scanner is a keyboard that types eight characters very fast
 * and then presses Enter. So the design constraints are:
 *
 *   1. THE CARET MUST ALWAYS BE IN THE BARCODE FIELD. If it is anywhere else,
 *      the next scan goes into the void, or worse, into the member picker.
 *      That is why the field is autofocused on load and why the form REMOUNTS
 *      after every submission (`key={attempt}`) — a remount re-runs `autoFocus`,
 *      which is the only reliable way to get focus back after a server action
 *      without racing React's own restoration.
 *
 *   2. THE FIELD MUST BE EMPTY AFTERWARDS, WHETHER OR NOT IT WORKED. This is
 *      the one place in the app where a refused form does NOT keep what was
 *      typed. A scanner does not clear a field before it types: a retained
 *      `BK-0001-2` plus the next scan is `BK-0001-2BK-0004-1`, which fails
 *      differently and confusingly. So the barcode is cleared always and the
 *      rejected value is repeated in the message instead, where it can be read
 *      rather than re-scanned.
 *
 *   3. THE MEMBER MUST NOT BE CLEARED. Someone with four books is one card and
 *      four scans; re-picking the name each time is the software making them
 *      repeat themselves. `valueFor` returns the last submitted value on
 *      success as well as on failure, which is exactly this case.
 *
 *   4. FEEDBACK MUST BE LOUD AND IT MUST PERSIST. One result is not enough —
 *      by the time they look up, three books have gone through. The running
 *      list below keeps the last eight, so the answer to "did that one go
 *      through?" is on the screen rather than in the past.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WITH JAVASCRIPT OFF IT IS STILL A DESK.
 *
 * The mode switch is two links, not a state toggle, so `?mode=return` is a URL
 * the browser can reach on its own. The forms are `useActionState` forms, which
 * React renders as real `POST` targets: no bundle, no problem — scan, press
 * Enter, the page comes back with the outcome rendered. What is lost is the
 * running list (there is no session to accumulate it in) and the automatic
 * refocus. Both are conveniences on top of a desk that works.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** One line of the running list. Built from a completed submission. */
type Entry = {
  attempt: number
  ok: boolean
  barcode: string
  message: string
}

export function DeskConsole({
  mode,
  members,
}: {
  mode: DeskMode
  members: MemberOption[]
}) {
  return mode === "return" ? <ReturnDesk /> : <LendDesk members={members} />
}

// ── lending ───────────────────────────────────────────────────────────────

function LendDesk({ members }: { members: MemberOption[] }) {
  const { state, submit, pending } = useFormAction(lendCopyState)
  const log = useRunningLog(state, describeLend(members))

  if (members.length === 0) {
    return (
      <p className="text-lead text-muted-foreground">
        Nobody holds a library card yet, so there is nobody to lend to.{" "}
        <Link
          href="/members/new"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Issue the first card
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <form action={submit} key={state?.attempt ?? 0} className="space-y-4">
        {/* `items-start` and NOT `items-end`. Only the barcode column carries a
            hint under it, so aligning the bottoms pushed the member picker 19px
            below the field beside it — measured at 1440px. Aligning the tops
            lines the two LABELS up, which is the row the eye actually reads,
            and the select is given the scan field's own 56px so the bottoms
            come out level as well. */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-start">
          <div className="space-y-2">
            <Label htmlFor="desk-member" className="text-row">
              Lending to
            </Label>
            <NativeSelect
              id="desk-member"
              name="memberId"
              required
              // Kept across submissions on purpose — see (3) above.
              defaultValue={valueFor(state, "memberId")}
              className="h-14 text-base"
            >
              <option value="">Choose a member…</option>
              {members.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <BarcodeField
            id="desk-lend-barcode"
            label="Scan the book"
            pending={pending}
            action="Lend"
          />
        </div>
      </form>

      <Outcome state={state} describe={describeLend(members)} verb="Lent" />
      <RunningLog entries={log} />
    </div>
  )
}

// ── returning ─────────────────────────────────────────────────────────────

function ReturnDesk() {
  const { state, submit, pending } = useFormAction(returnCopyState)
  const log = useRunningLog(state, describeReturn)

  return (
    <div className="space-y-6">
      <form action={submit} key={state?.attempt ?? 0}>
        <div className="max-w-xl">
          <BarcodeField
            id="desk-return-barcode"
            label="Scan the book coming back"
            pending={pending}
            action="Return"
          />
        </div>
      </form>

      <Outcome state={state} describe={describeReturn} verb="Returned" />
      <RunningLog entries={log} />
    </div>
  )
}

// ── the scanner field ─────────────────────────────────────────────────────

function BarcodeField({
  id,
  label,
  pending,
  action,
}: {
  id: string
  label: string
  pending: boolean
  action: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-row">
        {label}
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={id}
            name="barcode"
            required
            // `autoFocus` is the point of the whole screen, and the form's
            // `key` is what re-fires it after each submission.
            autoFocus
            // Never re-seeded — the field is empty after every submission,
            // because a scanner types over whatever is already there. See (2).
            defaultValue=""
            placeholder="BK-0001-1"
            // All four off: a barcode is not a word. Autocorrect on a phone
            // will happily turn `BK-0001-1` into something else between the
            // scan and the submit.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            /**
             * ENTER SUBMITS, EXPLICITLY, RATHER THAN BY IMPLICIT SUBMISSION.
             *
             * A barcode scanner is a keyboard that types eight characters and
             * presses Enter, so this key IS the interface of this screen — it
             * is not a convenience for people who prefer not to reach for the
             * mouse. The browser would do it on its own: a form with a submit
             * button implicitly submits on Enter in a text field.
             *
             * It is written out anyway because implicit submission is the one
             * behaviour on this page that could not be verified. Driving the
             * page through the automation harness, a synthesised Enter never
             * produces a `submit` event — and a control experiment with a plain
             * `<form><input><button type="submit">` injected into the same page
             * behaved identically, which says the harness cannot dispatch the
             * key with enough fidelity rather than that the app is broken. An
             * untestable path on the one screen a librarian uses all day is a
             * path that will be broken by some later change and noticed by the
             * librarian rather than by the tests.
             *
             * `preventDefault` is what keeps this from being a double
             * submission: it suppresses the browser's own implicit submit, so
             * exactly one goes through. Without it, in a browser where both
             * fire, the second lend would come back "already on loan" against
             * a book that had just gone out correctly.
             *
             * `isComposing` guards the IME: while a Japanese or Chinese input
             * method is composing, Enter commits the candidate and must not
             * reach the form.
             */
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
            // `h-14` and `text-lg` because this is read at arm's length, from
            // an angle, by somebody who is mostly looking somewhere else. The
            // monospace face makes `0`/`O` and `1`/`l` different shapes, which
            // is the difference between checking a barcode and guessing at it.
            className="h-14 pl-10 font-mono text-lg tracking-wide"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          aria-disabled={pending}
          className="h-14 px-6 text-base"
        >
          {pending ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : null}
          {action}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        A scanner types the barcode and presses Enter, which submits this form —
        there is nothing to click.
      </p>
    </div>
  )
}

// ── the outcome, and the list of the ones before it ───────────────────────

function Outcome<T>({
  state,
  describe,
  verb,
}: {
  state: Submission<T> | null
  describe: (state: Submission<T>) => string
  verb: string
}) {
  const ok = state?.result.ok === true

  return (
    // The region is rendered on EVERY pass, empty when there is nothing to
    // say. A live region that appears already holding text is not announced by
    // most of the assistive stack — the change has to happen inside a region
    // that was already being watched.
    <div
      role="status"
      aria-live="polite"
      // `min-h-20` reserves the space so the running list below does not jump
      // up and down by 80px between scans. At a desk that movement is the thing
      // that makes you lose your place.
      className="min-h-20"
    >
      {state ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            ok
              ? "border-brand-border/40 bg-brand-subtle text-brand-subtle-foreground"
              : "border-overdue-foreground/30 bg-overdue text-overdue-foreground"
          )}
        >
          {ok ? (
            <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <p className="font-sans text-h4">
              {ok ? verb : "Not done"}
              {/* The barcode is repeated in the message rather than left in
                  the field, which is what makes clearing the field safe. */}
              {state.values.barcode ? (
                <span className="ml-2 font-mono text-mark">
                  {state.values.barcode}
                </span>
              ) : null}
            </p>
            <p className="text-row">{describe(state)}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RunningLog({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null

  return (
    <section aria-labelledby="desk-log-heading" className="space-y-2">
      <h2
        id="desk-log-heading"
        className="font-sans text-caption text-muted-foreground"
      >
        This session
      </h2>
      {/* NOT `aria-live`. The `Outcome` above already announces each result,
          and a second live region repeating it would say everything twice. This
          list is for going back and checking with your eyes. */}
      <ol className="divide-y divide-border rounded-xl border border-border">
        {entries.map((entry) => (
          <li
            key={entry.attempt}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-row"
          >
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center rounded-4xl px-2 text-caption font-medium",
                entry.ok
                  ? "bg-shelved text-shelved-foreground"
                  : "bg-overdue text-overdue-foreground"
              )}
            >
              {entry.ok ? "Done" : "Refused"}
            </span>
            <span className="font-mono text-mark">{entry.barcode || "—"}</span>
            <span className="min-w-0 text-muted-foreground">
              {entry.message}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── the messages ──────────────────────────────────────────────────────────

/**
 * `lendCopy` returns the `Loan` row and nothing else — no title, no member
 * name — so the sentence is assembled here from what the page already knows:
 * the member list it rendered the picker from, and the due date the database
 * computed. Looking the title up would be another query for a line of prose.
 */
function describeLend(members: MemberOption[]) {
  return (state: Submission<Loan>): string => {
    if (!state.result.ok) return state.result.issues[0].message
    const loan = state.result.data
    const who = members.find((person) => person.id === loan.member_id)
    return `${who?.name ?? "The member"} has it until ${formatDay(loan.due_at)}.`
  }
}

/**
 * The returned loan carries both dates, so the desk can say the one thing that
 * matters after a book comes back: whether it was late, and by how much. That
 * is the moment a fine would be taken, and it is invisible on every other
 * screen because by then the loan is closed.
 */
function describeReturn(state: Submission<Loan>): string {
  if (!state.result.ok) return state.result.issues[0].message

  const loan = state.result.data
  if (!loan.returned_at) return "Back on the shelf."

  const days = Math.floor(
    (parseTimestamp(loan.returned_at).getTime() -
      parseTimestamp(loan.due_at).getTime()) /
      86_400_000
  )

  if (days < 0) return "Back on the shelf, inside its loan period."
  if (days === 0) return "Back on the shelf, on the day it was due."
  return `Back on the shelf — ${days === 1 ? "1 day" : `${days} days`} late.`
}

/**
 * The last eight outcomes, newest first.
 *
 * `useActionState` only ever holds the LATEST result, so keeping a history
 * means recording each one as it arrives. `attempt` is what makes that safe: it
 * increases by one per completed submission, so the effect can tell a genuinely
 * new result from a re-render caused by anything else. Without it, a parent
 * re-render would append the same entry again.
 */
function useRunningLog<T>(
  state: Submission<T> | null,
  describe: (state: Submission<T>) => string
): Entry[] {
  const [entries, setEntries] = useState<Entry[]>([])
  const lastLogged = useRef(0)

  useEffect(() => {
    if (!state || state.attempt === lastLogged.current) return
    lastLogged.current = state.attempt

    const entry: Entry = {
      attempt: state.attempt,
      ok: state.result.ok,
      barcode: state.values.barcode ?? "",
      message: describe(state),
    }

    setEntries((previous) => [entry, ...previous].slice(0, 8))
    // `describe` is rebuilt on every render for the lend desk (it closes over
    // the member list), so it is deliberately not a dependency: including it
    // would run this effect on every render and the `attempt` guard would be
    // doing all the work anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return entries
}
