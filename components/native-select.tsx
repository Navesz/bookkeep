import { ChevronDown } from "lucide-react"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * A REAL `<select>`, AND WHY IT IS NOT `components/ui/select.tsx`.
 *
 * The shadcn `Select` is a Base UI listbox: a button, a portalled popup and a
 * hidden input that carries the value. It looks better and it needs JavaScript
 * to have a value at all. Every place this component is used — choosing the
 * borrower at the desk, choosing which copy to lend — is a field inside a form
 * that has to submit correctly with the bundle switched off, which is the claim
 * this whole app is built around.
 *
 * A native `<select>` also wins three things the styled one has to reimplement,
 * and on a phone at a counter they are the three that matter:
 *
 *   · the platform picker — the iOS wheel, the Android sheet — which is bigger
 *     and faster to hit than any popup rendered in the page;
 *   · type-ahead over the options, so typing "gra" jumps to Grace Hopper;
 *   · form autofill and the browser's own restore-on-back.
 *
 * WHAT IT COSTS: the option list cannot be styled, so the popup is the
 * platform's rather than the product's. That is a fair price for a control that
 * works before the JavaScript arrives, and it is only paid on the two screens
 * that submit.
 *
 * `appearance-none` plus a drawn chevron, because the native arrow is a
 * different shape and colour on every platform and would be the one part of the
 * form that ignores the theme. `pr-9` reserves the 36px it sits in.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function NativeSelect({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          // The height, radius, border and focus ring are copied from
          // `components/ui/input.tsx` on purpose: a select and a text field
          // side by side in the same row have to be the same object with a
          // different job, not two controls from two design systems.
          "h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-9 pl-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {/* `pointer-events-none` so a click on the chevron still opens the
          select underneath it rather than landing on a decorative icon. */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
