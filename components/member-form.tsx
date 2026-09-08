"use client"

import Link from "next/link"
import { LoaderCircle, UserPlus } from "lucide-react"

import { createMemberState } from "@/components/form-actions"
import { FormIssues, SuccessNotice } from "@/components/form-notices"
import {
  formIssues,
  issueFor,
  retainedValue,
  useFormAction,
} from "@/components/form-state"
import { TextField } from "@/components/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

/**
 * ISSUING A LIBRARY CARD.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ADDRESS FIELD IS `type="email"`, AND THAT IS NOT ONLY VALIDATION.
 *
 * The browser's own check is the least of it — `lib/validation.ts` does the
 * real one, and the database has the last word with a `UNIQUE` constraint. What
 * the type buys is the KEYBOARD: on a phone it puts `@` and `.` on the first
 * layer, which is the difference between typing an address and hunting for two
 * characters. `autoComplete="email"` is the same argument for a desktop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE HINT SAYS THE CASING DOES NOT MATTER.
 *
 * `lib/db/members.ts` lowercases every address before it is stored, precisely
 * so `Ada@example.org` and `ada@example.org` cannot become two people with two
 * halves of one borrowing history. That is invisible from here, and a librarian
 * who does not know it will hesitate over a card that reads `A.Lovelace@…`.
 * One sentence removes the hesitation.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function MemberForm() {
  const { state, submit, pending } = useFormAction(createMemberState)
  const added = state?.result.ok ? state.result.data : null

  return (
    <form
      action={submit}
      key={state?.attempt ?? 0}
      className="max-w-2xl space-y-6"
    >
      <FormIssues issues={formIssues(state)} />

      <SuccessNotice>
        {added ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{added.name} now holds a card.</span>
            <Link
              href={`/members/${added.id}`}
              className="underline underline-offset-4"
            >
              Open the record
            </Link>
          </span>
        ) : null}
      </SuccessNotice>

      <FieldGroup>
        <TextField
          id="member-name"
          name="name"
          label="Name"
          required
          autoFocus
          autoComplete="name"
          defaultValue={retainedValue(state, "name")}
          issue={issueFor(state, "name")}
        />

        <TextField
          id="member-email"
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="ada@example.org"
          description="One card per address. Capitals do not matter — the address is stored in lower case, so one person cannot end up with two cards and half a history on each."
          defaultValue={retainedValue(state, "email")}
          issue={issueFor(state, "email")}
        />
      </FieldGroup>

      <Button type="submit" size="lg" aria-disabled={pending} className="h-11">
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <UserPlus aria-hidden />
        )}
        Issue the card
      </Button>
    </form>
  )
}
