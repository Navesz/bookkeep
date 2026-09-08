import Link from "next/link"
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"

/**
 * A button that is really a link.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS A LINK AND NOT A BUTTON WITH `router.push`.
 *
 * Everything in this app that NAVIGATES is an `<a href>`: it works with
 * JavaScript off, it opens in a new tab on a middle click or ⌘-click, it shows
 * its destination in the status bar, and it is what a screen reader announces
 * as a link rather than as a control that does something unspecified. A
 * `<button onClick={() => router.push(…)}>` has none of those and looks
 * identical, which is why it keeps getting written.
 *
 * `nativeButton={false}` IS NOT OPTIONAL, and it is the reason this wrapper
 * exists rather than the four-prop incantation being repeated at nine call
 * sites. Base UI's `Button` assumes it renders a real `<button>` and warns,
 * loudly and at runtime, when a `render` prop replaces it with an anchor:
 *
 *   "A component that acts as a button expected a native <button> because the
 *    `nativeButton` prop is true. Rendering a non-<button> removes native
 *    button semantics, which can impact forms and accessibility."
 *
 * The warning is right — the two elements really do behave differently, most
 * visibly on the Space key, which activates a button and scrolls the page on a
 * link. Telling Base UI that this one is an anchor is what makes it stop
 * pretending otherwise and add the keyboard handling an anchor needs.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function LinkButton({
  href,
  scroll,
  ...props
}: Omit<ComponentProps<typeof Button>, "render" | "nativeButton"> & {
  href: string
  /**
   * `false` tells the App Router not to move the scroll position itself.
   *
   * It exists for one link: the "Lend" beside a shelved copy, which navigates
   * to `?lend=<barcode>#lend-a-copy` and then relies on the lend panel to
   * focus the member picker and bring itself into view. Next's own scroll
   * handling runs AFTER the render that triggers that effect, so with the
   * default it would scroll the page back to the top a frame later —
   * measured: the panel focused correctly and `scrollY` stayed 0.
   */
  scroll?: boolean
}) {
  return (
    <Button
      {...props}
      nativeButton={false}
      render={<Link href={href} scroll={scroll} />}
    />
  )
}
