"use server"

import {
  createBook,
  createCopy,
  createMember,
  lendCopy,
  returnCopy,
  returnLoanById,
  withdrawBook,
  type ActionResult,
} from "@/app/actions"
import type { Book, Copy } from "@/lib/db/books.ts"
import type { Loan } from "@/lib/db/loans.ts"
import type { Member } from "@/lib/db/members.ts"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE ADAPTERS BETWEEN `app/actions.ts` AND `useActionState`, AND WHY THEY
 * HAVE TO BE SERVER FUNCTIONS.
 *
 * Every mutation in `app/actions.ts` is `(FormData) => Promise<ActionResult>`.
 * `useActionState` calls its action as `(previousState, formData)`. Something
 * has to bridge the two, and `app/actions.ts` itself suggests the obvious
 * bridge in a comment:
 *
 *   useActionState(async (_previous, form) => lendCopy(form), null)
 *
 * THAT BRIDGE SILENTLY BREAKS THE FORMS WITHOUT JAVASCRIPT, and it took
 * inspecting the DOM to notice. An arrow function written inside a client
 * component is a CLIENT function; React cannot give the `<form>` a real POST
 * target for one, so it renders
 *
 *   <form action="javascript:throw new Error('React form unexpectedly submitted.')"
 *         method="get">
 *
 * — measured, in this app, on the desk. With a bundle running it works
 * perfectly, which is why it survives review. With the bundle off, pressing
 * Enter submits a form whose action is a `javascript:` URL that throws: nothing
 * is lent, nothing is said, and the page sits there. Every form in the
 * application, dead, on the one failure mode this project promised to survive.
 *
 * Progressive enhancement needs the function passed to `useActionState` to BE a
 * server function, so React can emit a real endpoint and replay the submission.
 * That is what this file is: the same two-argument shape, declared `"use
 * server"`, so `action` on the rendered form becomes a POST to the action
 * handler and the no-JavaScript path is the same code path.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE RESULT IS SPREAD INTO A NEW OBJECT — `{ ...result.data }`.
 *
 * `node:sqlite` returns rows with a NULL PROTOTYPE. React refuses to serialise
 * one across the server/client boundary ("Classes or null prototypes are not
 * supported"), and here it would have to cross TWICE: out to the browser as the
 * new state, and back again as `previous` on the next submission. The spread
 * rebuilds the row with `Object.prototype` and makes both directions legal. It
 * is one line and it is the difference between a form that works and a 500 the
 * second time somebody uses it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE SUBMITTED VALUES COME BACK WITH THE RESULT.
 *
 * A form that rejects your input and then empties itself is the most hated
 * interaction in software, and React 19 will do it if left alone: an
 * uncontrolled form is reset once its action settles. Right on success — the
 * next book gets a clean form — and wrong on failure, where the only thing that
 * changed is that one field was refused. Capturing the `FormData` here means
 * the form can re-seed itself from the state, and because this runs on the
 * server it does so on the no-JavaScript path too.
 *
 * `attempt` counts submissions. A form keys itself on it to be certain the new
 * defaults are taken, rather than depending on React's reset having happened to
 * run; the desk uses it to tell a genuinely new outcome from a re-render.
 * ═════════════════════════════════════════════════════════════════════════
 */

export type Submission<T> = {
  result: ActionResult<T>
  /** Exactly what was posted, so a refused form can re-seed itself. */
  values: Record<string, string>
  /** 1 for the first submission, 2 for the second… Never resets. */
  attempt: number
}

/**
 * `FormData` can hold `File` objects. None of these forms has a file input, so
 * a `File` arriving means a malformed or tampered submission; it is dropped
 * rather than stringified into `"[object File]"` and shown back to somebody as
 * if they had typed it.
 */
function textValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") values[name] = value
  }
  return values
}

async function run<T extends object>(
  action: (form: FormData) => Promise<ActionResult<T>>,
  previous: Submission<T> | null,
  form: FormData
): Promise<Submission<T>> {
  const result = await action(form)

  return {
    result: result.ok ? { ok: true, data: { ...result.data } } : result,
    values: textValues(form),
    attempt: (previous?.attempt ?? 0) + 1,
  }
}

// Every export in a `"use server"` module must be an async function, so these
// are written out one per action rather than produced by a factory. The
// repetition buys the thing a factory cannot give: each one has a name React
// can reference from the form's `action` attribute.

export async function createBookState(
  previous: Submission<Book> | null,
  form: FormData
): Promise<Submission<Book>> {
  return run(createBook, previous, form)
}

export async function createCopyState(
  previous: Submission<Copy> | null,
  form: FormData
): Promise<Submission<Copy>> {
  return run(createCopy, previous, form)
}

export async function createMemberState(
  previous: Submission<Member> | null,
  form: FormData
): Promise<Submission<Member>> {
  return run(createMember, previous, form)
}

export async function lendCopyState(
  previous: Submission<Loan> | null,
  form: FormData
): Promise<Submission<Loan>> {
  return run(lendCopy, previous, form)
}

export async function returnCopyState(
  previous: Submission<Loan> | null,
  form: FormData
): Promise<Submission<Loan>> {
  return run(returnCopy, previous, form)
}

export async function returnLoanState(
  previous: Submission<Loan> | null,
  form: FormData
): Promise<Submission<Loan>> {
  return run(returnLoanById, previous, form)
}

export async function withdrawBookState(
  previous: Submission<{ id: number }> | null,
  form: FormData
): Promise<Submission<{ id: number }>> {
  return run(withdrawBook, previous, form)
}
