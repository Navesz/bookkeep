"use client"

import { useActionState } from "react"

import type { Submission } from "@/components/form-actions"
import type { Issue } from "@/lib/validation.ts"

/**
 * THE CLIENT HALF OF THE FORM PLUMBING: one hook and four readers, so the six
 * forms do not each invent them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ACTION IS PASSED THROUGH UNCHANGED, AND THAT IS THE WHOLE POINT.
 *
 * This hook does not wrap the action in an arrow function, does not adapt its
 * arguments and does not touch its result. It cannot: the moment a client
 * function stands between `useActionState` and a server function, React loses
 * the ability to give the `<form>` a real POST endpoint and the form stops
 * working without JavaScript. The adapting happens in
 * `components/form-actions.ts`, on the server, where it is allowed to.
 *
 * What is left here is genuinely just a rename — `submit` reads better than the
 * second element of a tuple at six call sites — plus the four small readers
 * below, which every form would otherwise write out by hand.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useFormAction<T>(
  action: (
    previous: Submission<T> | null,
    form: FormData
  ) => Promise<Submission<T>>
) {
  const [state, submit, pending] = useActionState<
    Submission<T> | null,
    FormData
  >(action, null)

  return { state, submit, pending }
}

/** The issue attached to one named field, if the last submission raised one. */
export function issueFor<T>(
  state: Submission<T> | null,
  field: string
): Issue | undefined {
  if (!state || state.result.ok) return undefined
  return state.result.issues.find((issue) => issue.field === field)
}

/**
 * The issues that belong to the form as a whole rather than to any one field.
 *
 * `field: null` is `lib/validation.ts`'s way of saying "this is about the
 * submission, not about a box" — a copy that is already out, a book that
 * somebody else withdrew while this page was open. They have nowhere to be
 * rendered inline, so they go in a banner at the top of the form.
 */
export function formIssues<T>(state: Submission<T> | null): Issue[] {
  if (!state || state.result.ok) return []
  return state.result.issues.filter((issue) => issue.field === null)
}

/**
 * What was posted in one field last time.
 *
 * It answers on success as well as on failure, and the caller decides which it
 * wants, because the two cases genuinely differ per field. A refused form
 * re-seeds everything — nothing should be retyped because one box was wrong. A
 * form that succeeded clears the fields describing the *thing* (the title, the
 * barcode) and keeps the ones describing the *situation*: the member borrowing
 * four books in a row is still the same member, and making a librarian re-pick
 * them four times is the software not paying attention.
 */
export function valueFor<T>(
  state: Submission<T> | null,
  field: string
): string {
  return state?.values[field] ?? ""
}

/** `valueFor`, but only after a refusal — the "clear it on success" case. */
export function retainedValue<T>(
  state: Submission<T> | null,
  field: string
): string {
  if (!state || state.result.ok) return ""
  return state.values[field] ?? ""
}
