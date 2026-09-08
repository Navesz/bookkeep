import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { Issue } from "@/lib/validation.ts"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"

/**
 * ONE TEXT FIELD, WIRED CORRECTLY, IN ONE PLACE.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP BEING GOT WRONG.
 *
 * A field that reports an error has four things that must agree, and three of
 * them are invisible:
 *
 *   · `<label htmlFor>` ↔ `<input id>` — without it the control has no
 *     accessible name and voice control cannot address it by the word printed
 *     beside it;
 *   · `aria-invalid` — what makes a screen reader say "invalid" when the caret
 *     lands in the box, rather than leaving the reader to discover it;
 *   · `aria-describedby` pointing at the error's `id` — what makes it read the
 *     REASON at the same moment, instead of an error that is only visible;
 *   · the visible red, which is the only one anybody notices missing.
 *
 * Written out per field, across three forms and nine boxes, that is nine
 * chances to connect three of the four. Here it is impossible to have the
 * error text and not have it described, because both come from the same
 * argument.
 *
 * `aria-describedby` ALSO CARRIES THE HINT, not just the error, and the order
 * matters: description first, then error. A screen reader reads them in the
 * order of the ids, and "must be 13 digits. This ISBN's check digit is wrong."
 * is the useful order — the rule, then what happened.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function TextField({
  id,
  label,
  description,
  issue,
  optional,
  className,
  ...props
}: Omit<ComponentProps<"input">, "id"> & {
  id: string
  label: ReactNode
  /** The rule, shown before anyone gets it wrong. */
  description?: ReactNode
  /** The refusal from the last submission, if this field caused one. */
  issue?: Issue
  /** Marks the field as not required, in words rather than by omission. */
  optional?: boolean
}) {
  const describedBy = [
    description ? `${id}-description` : null,
    issue ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Field data-invalid={issue ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? (
          // "Optional" in words, not a missing asterisk. Marking the required
          // fields instead would mean the reader has to notice an absence, and
          // an asterisk is a symbol whose meaning is a convention nobody was
          // taught.
          <span className="font-normal text-muted-foreground">Optional</span>
        ) : null}
      </FieldLabel>

      <Input
        id={id}
        aria-invalid={issue ? true : undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        // `h-11` for the 44px target the rest of the app is built to; the
        // component's own default is 32px, which is a desktop-only size.
        className={cn("h-11", className)}
        {...props}
      />

      {description ? (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      ) : null}

      {issue ? (
        // `FieldError` carries `role="alert"`, so the message is announced when
        // it appears rather than only when the field is next visited.
        <FieldError id={`${id}-error`}>{issue.message}</FieldError>
      ) : null}
    </Field>
  )
}
