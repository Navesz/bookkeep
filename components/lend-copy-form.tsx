"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { BookUp, LoaderCircle } from "lucide-react"

import { lendCopyState } from "@/components/form-actions"
import { formatDay } from "@/components/dates"
import { FormIssues, SuccessNotice } from "@/components/form-notices"
import {
  formIssues,
  issueFor,
  useFormAction,
  valueFor,
} from "@/components/form-state"
import { NativeSelect } from "@/components/native-select"
import type { MemberOption } from "@/components/reads.ts"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * LENDING FROM THE BOOK PAGE: pick a copy, pick a member, hand it over.
 *
 * WHY THIS IS A PANEL AND NOT A DIALOG BEHIND EACH ROW'S BUTTON.
 *
 * A dialog is the instinctive answer and it fails the first requirement this
 * app has: a dialog exists only once JavaScript is running. With the bundle
 * off, a per-row "Lend" that opens nothing is a dead control on the page that
 * matters most.
 *
 * So lending is a form that is always on the page, and each shelved row links
 * to it — `?lend=BK-0003-1#lend-a-copy`. The link is an ordinary navigation:
 * the server reads the parameter, preselects that copy, and the browser jumps
 * to the panel. It preselects with JavaScript off, it preselects on a shared
 * link, and it survives a reload. The dialog version of this does none of the
 * three.
 *
 * THE MEMBER STAYS SELECTED AFTER A SUCCESSFUL LOAN and the copy does not.
 * Someone at the desk with four books is one member and four barcodes, so
 * re-picking the name each time is the software making them repeat themselves;
 * re-picking the copy is the software confirming what it just did. `valueFor`
 * and the empty string, respectively — see `components/form-state.ts`.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function LendCopyForm({
  available,
  members,
  preselect,
}: {
  /** Only the copies that are on the shelf. An empty list hides the form. */
  available: { id: number; barcode: string }[]
  members: MemberOption[]
  /** The barcode named by `?lend=`, if the reader arrived from a row. */
  preselect?: string
}) {
  const { state, submit, pending } = useFormAction(lendCopyState)
  const memberField = useRef<HTMLSelectElement>(null)

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ARRIVING FROM A ROW: PUT THE READER WHERE THE NEXT DECISION IS.
   *
   * A row's "Lend" is a link to `?lend=<barcode>#lend-a-copy`, and two things
   * about that did not work on their own. Both were found by clicking it.
   *
   * 1. THE FRAGMENT DID NOT SCROLL. On a client-side navigation the URL
   *    changed to `#lend-a-copy` and the page stayed at the top — measured:
   *    `scrollY` 0 with the panel's top at 797px. The browser only acts on a
   *    fragment during a document load, and this was a router transition into
   *    a streaming render; there is no moment at which the target both exists
   *    and the browser is still deciding where to scroll.
   *
   * 2. THE SELECT KEPT THE OLD COPY. `defaultValue` seeds an uncontrolled
   *    control ONCE, at mount. Clicking a second row changed `preselect` from
   *    `BK-0001-3` to `BK-0001-2` and the select went on showing the first —
   *    a form that says it will lend a copy other than the one whose button
   *    was pressed, which is the worst kind of wrong: plausible.
   *
   * The `key` below fixes the second by remounting the form whenever the
   * requested copy changes. This effect fixes the first, and does slightly
   * more than scrolling: it moves FOCUS to the member picker, which is the
   * next decision — the copy has just been chosen by the link. Focus brings
   * the element into view by itself, so a keyboard user and a mouse user end
   * up in the same place, which a bare `scrollIntoView` would not achieve.
   *
   * The scroll is still done explicitly, with `preventScroll` on the focus, so
   * the panel's HEADING is what lands under the masthead rather than the
   * select — `scroll-mt-(--header-offset)` on the section is the 4rem that
   * keeps it out from under the sticky header.
   * ═══════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    if (!preselect) return
    memberField.current?.focus({ preventScroll: true })
    document.getElementById("lend-a-copy")?.scrollIntoView({ block: "start" })
  }, [preselect])

  const barcodeIssue = issueFor(state, "barcode")
  const memberIssue = issueFor(state, "memberId")

  const lent = state?.result.ok ? state.result.data : null
  const borrower = lent
    ? members.find((person) => person.id === lent.member_id)
    : undefined

  if (members.length === 0) {
    return (
      <p className="text-row text-muted-foreground">
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
    <form
      action={submit}
      // TWO REASONS TO REMOUNT, hence two parts to the key.
      //
      // `attempt` — React 19 resets an uncontrolled form once its action
      // settles, which would throw away the values a refused form needs to
      // keep. Rebuilding from the state that was just computed takes the
      // decision away from React's reset.
      //
      // `preselect` — a `defaultValue` is read at mount and never again, so
      // clicking "Lend" on a second row would leave the first row's barcode
      // selected. See the effect above.
      key={`${preselect ?? ""}:${state?.attempt ?? 0}`}
      className="space-y-4"
    >
      <FormIssues issues={formIssues(state)} />

      <SuccessNotice>
        {lent ? (
          <>
            Lent to {borrower?.name ?? "the member"} — due{" "}
            {formatDay(lent.due_at)}.
          </>
        ) : null}
      </SuccessNotice>

      {/* `items-end` so the button's baseline lines up with the bottom of the
          two fields rather than with their labels. `sm:grid-cols-[…]` gives the
          copy column its content width and lets the member column take the
          rest: a barcode is a fixed 9 characters and a name is not. */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
        <Field data-invalid={barcodeIssue ? true : undefined}>
          <FieldLabel htmlFor="lend-barcode">Copy</FieldLabel>
          <NativeSelect
            id="lend-barcode"
            name="barcode"
            required
            defaultValue={valueFor(state, "barcode") || preselect || ""}
            aria-invalid={barcodeIssue ? true : undefined}
            aria-describedby={barcodeIssue ? "lend-barcode-error" : undefined}
            className="font-mono text-mark"
          >
            {/* An empty first option, so the control starts with nothing chosen
                rather than silently defaulting to whichever copy happens to
                sort first. `required` then makes the browser refuse an empty
                submission before it costs a round trip. */}
            <option value="">Choose a copy…</option>
            {available.map((copy) => (
              <option key={copy.id} value={copy.barcode}>
                {copy.barcode}
              </option>
            ))}
          </NativeSelect>
          {barcodeIssue ? (
            <FieldError id="lend-barcode-error">
              {barcodeIssue.message}
            </FieldError>
          ) : null}
        </Field>

        <Field data-invalid={memberIssue ? true : undefined}>
          <FieldLabel htmlFor="lend-member">Member</FieldLabel>
          <NativeSelect
            id="lend-member"
            ref={memberField}
            name="memberId"
            required
            defaultValue={valueFor(state, "memberId")}
            aria-invalid={memberIssue ? true : undefined}
            aria-describedby={memberIssue ? "lend-member-error" : undefined}
          >
            <option value="">Choose a member…</option>
            {members.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
          {memberIssue ? (
            <FieldError id="lend-member-error">
              {memberIssue.message}
            </FieldError>
          ) : null}
        </Field>

        <Button
          type="submit"
          size="lg"
          aria-disabled={pending}
          className="h-11"
        >
          {pending ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : (
            <BookUp aria-hidden />
          )}
          Lend
        </Button>
      </div>
    </form>
  )
}
