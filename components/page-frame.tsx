import Link from "next/link"
import type { ReactNode } from "react"
import { AlarmClock, Library, ScanLine, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { overdueLoans } from "@/lib/db/loans.ts"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE SECTION NAVIGATION, AND THE VERTICAL RHYTHM EVERY SCREEN SHARES.
 *
 * WHAT THIS IS *NOT*, AND WHY THAT CHANGED MID-BUILD.
 *
 * This began as a whole app shell — skip link, masthead, `<main>`, footer —
 * because `app/layout.tsx` belongs to another agent and had none of those. It
 * now has all of them: a skip link, a sticky 4rem header with the mark, the
 * wordmark, a repository link and the theme toggle, and a `<main id="main">`
 * that is already the 72rem container.
 *
 * So this component was cut down to the one thing the layout does not and
 * cannot know: WHICH OF THE FOUR SECTIONS the current page belongs to. Keeping
 * the rest would have shipped two skip links, two `<header>`s and — worst of
 * the three — two elements with `id="main"`, which makes the layout's skip link
 * ambiguous and invalid.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ACTIVE SECTION IS A PROP, NOT `usePathname`.
 *
 * The usual way to light up the current tab is a `"use client"` nav that reads
 * the pathname. That would make the navigation — which is on every screen — the
 * only reason this app ships client-side JavaScript for its chrome, and it
 * would light up nothing at all until hydration finished.
 *
 * Every page already knows which section it is. Passing `section` is one word
 * at each of the nine call sites and it is correct in the HTML that leaves the
 * server, which is the thing that has to be right with JavaScript off.
 *
 * It also handles what `usePathname` gets wrong without extra code: `/books/12`
 * belongs to the Catalogue section, and a prefix match on `/` would have
 * matched every route in the app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ICONS DISAPPEAR BELOW `sm`, AND THE NUMBER IS 343px.
 *
 * Four labels with their icons measure about 396px. A 375px phone gives 343px
 * once the layout's `px-4` is taken off, so the strip would scroll and the last
 * tab — Overdue, the one that matters at opening time — would be the one off
 * the edge. Without the icons the same four labels measure about 300px and all
 * four are reachable without moving anything. The icons return at `sm`, where
 * there is room for them to help rather than to crowd.
 * ═════════════════════════════════════════════════════════════════════════
 */

export type Section = "catalogue" | "desk" | "members" | "overdue"

const SECTIONS = [
  { key: "catalogue", href: "/", label: "Catalogue", icon: Library },
  { key: "desk", href: "/desk", label: "Desk", icon: ScanLine },
  { key: "members", href: "/members", label: "Members", icon: Users },
  { key: "overdue", href: "/overdue", label: "Overdue", icon: AlarmClock },
] as const satisfies readonly {
  key: Section
  href: string
  label: string
  icon: typeof Library
}[]

export function PageFrame({
  section,
  children,
}: {
  section: Section
  children: ReactNode
}) {
  // Counted once, here, rather than in each page: the number is on the
  // navigation, so it is on every screen, and a second query per page would be
  // a second answer that can disagree with this one inside the same render.
  //
  // "Late" is decided by SQLite — `due_at < datetime('now')` inside
  // `overdueLoans` — not by comparing against a JavaScript `Date`. Two clocks
  // is how the badge says 6 and the screen it links to lists 7.
  const late = overdueLoans().length

  return (
    <div className="space-y-8">
      {/* `-mt-2` pulls the strip up into the layout's `py-8`, so the tabs sit
          close under the masthead they continue rather than floating in the
          middle of the gap. The rule underneath is the full width of the
          container, which is what makes the active tab's 2px mark read as a
          tab and not as an underline. */}
      <nav aria-label="Sections" className="-mt-2 border-b border-border">
        {/* `overflow-x-auto` is the safety net for 320px, and `pb-px` gives the
            focus ring somewhere to be: a ring is drawn 3px outside its element,
            and a scroll container clips whatever leaves it. Without the pixel,
            tabbing to a tab would show a ring with its bottom edge sliced off. */}
        <ul className="-mb-px flex items-stretch gap-0.5 overflow-x-auto pb-px">
          {SECTIONS.map(({ key, href, label, icon: Icon }) => {
            const current = key === section

            return (
              <li key={key} className="flex">
                <Link
                  href={href}
                  // `aria-current="page"` is what tells a screen reader which
                  // section it is in. The rule under the tab and the ink-black
                  // label say the same thing to everyone else — never colour
                  // alone, and never weight alone either.
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    // `min-h-11` is the 44px touch target this app is built to.
                    "flex min-h-11 items-center gap-1.5 rounded-t-lg border-b-2 px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    current
                      ? "border-brand font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden className="hidden size-4 shrink-0 sm:block" />
                  {label}
                  {key === "overdue" && late > 0 ? (
                    <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-4xl bg-overdue px-1.5 text-xs font-medium text-overdue-foreground tabular-nums">
                      {late}
                      {/* "Overdue 6" is six of what? The unit is spoken here
                          and hidden from sight, where the screen it links to
                          supplies it. */}
                      <span className="sr-only"> loans late</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {children}
    </div>
  )
}
