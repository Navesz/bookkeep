import type { ReactNode } from "react"

import { LinkButton } from "@/components/link-button"

/**
 * WHAT A "NOT FOUND" SCREEN SAYS, in one component so the three of them agree.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT DOES NOT TOUCH THE DATABASE, AND THAT IS THE POINT OF IT EXISTING.
 *
 * `components/shell.tsx` counts overdue loans to put a number on the masthead,
 * which means rendering it runs a query. Next prerenders `/_not-found` during
 * `next build`, at a moment when there may be no database file at all — so a
 * root not-found wrapped in the shell turns a missing page into a failed build.
 *
 * This frame is deliberately inert: a heading, a sentence and a link out. The
 * cost is that a 404 has no navigation bar; the alternative is a 404 that
 * cannot be built.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS A `<div>`, NOT A `<main>`.
 *
 * A full-page message wants to be the main landmark, and it already is one:
 * `app/layout.tsx` wraps every route — a not-found included — in
 * `<main id="main">`, which is what its skip link targets. A second `<main>`
 * here would nest two of them and put a duplicate `id="main"` in the document,
 * which makes "skip to content" ambiguous and the page invalid. The landmark
 * has an owner; this is content inside it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "IT MAY HAVE BEEN WITHDRAWN" IS NOT PADDING.
 *
 * The book and member not-found screens are reached from two genuinely
 * different places: a mistyped URL, and a record that was deleted from another
 * terminal while this page was open — including by this reader, one click ago,
 * from the withdraw panel. A 404 that only says "no such page" leaves the
 * second reader thinking the delete failed.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function NotFoundNotice({
  title,
  children,
  href = "/",
  action = "Back to the catalogue",
}: {
  title: string
  children: ReactNode
  href?: string
  action?: string
}) {
  return (
    <div
      // `min-h-[60svh]` rather than `min-h-svh`: this sits inside the layout's
      // `<main>`, which already has its own padding and a masthead above it, so
      // a full-viewport box would push the message off the bottom of the screen
      // by exactly the height of the header. 60% centres it in what is actually
      // left.
      className="mx-auto flex min-h-[60svh] w-full max-w-xl flex-col items-center justify-center gap-4 py-12 text-center"
    >
      {/* `404` is above the heading and hidden from the accessibility tree: it
          is a number for people who already know what it means, and spoken
          before the sentence it would be three digits of noise. */}
      <p
        aria-hidden
        className="font-mono text-mark tracking-widest text-muted-foreground"
      >
        404
      </p>
      <h1 className="text-h2">{title}</h1>
      <p className="text-lead text-pretty text-muted-foreground">{children}</p>
      <LinkButton href={href} size="lg" className="mt-2 h-11">
        {action}
      </LinkButton>
    </div>
  )
}
