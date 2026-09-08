import Link from "next/link"
import { BookUp, Undo2 } from "lucide-react"

import { LOAN_DAYS } from "@/lib/db/loans.ts"
import { cn } from "@/lib/utils"
import { DeskConsole, type DeskMode } from "@/components/desk-console"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"
import { memberOptions } from "@/components/reads.ts"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE DESK — the screen that is open all day.
 *
 * THE MODE IS IN THE URL, AND THE SWITCH IS TWO LINKS.
 *
 * `?mode=return` rather than a `useState` toggle, for three reasons that all
 * point the same way:
 *
 *   · it works with JavaScript off, which the rest of this screen also insists
 *     on — a toggle that does nothing would strand the returns desk;
 *   · a librarian who works returns all morning can bookmark the URL, and the
 *     browser reopens it in the right mode;
 *   · one mode is on screen at a time, so "scan here" has exactly one answer.
 *     Two forms stacked would give the caret two places to be, and the caret is
 *     the whole design of this page — see `components/desk-console.tsx`.
 *
 * WHY LENDING IS THE DEFAULT rather than returning, when returns are the more
 * common transaction: lending is the one that can go wrong. A return needs one
 * scan and refuses only if the copy was not out; a loan needs a member as well,
 * and it is the one where a mis-scan means a book leaves the building against
 * the wrong name. The mode that needs attention is the one that gets it by
 * default.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Desk",
  description: "Scan to lend, scan to return.",
}

const MODES = [
  { key: "lend", label: "Lend", icon: BookUp, href: "/desk" },
  { key: "return", label: "Return", icon: Undo2, href: "/desk?mode=return" },
] as const satisfies readonly {
  key: DeskMode
  label: string
  icon: typeof BookUp
  href: string
}[]

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.mode
  const asked = Array.isArray(raw) ? raw[0] : raw

  // Anything that is not exactly "return" is lending. A hand-edited `?mode=x`
  // lands on the default rather than on a blank screen, which is the right
  // failure for a URL nobody typed on purpose.
  const mode: DeskMode = asked === "return" ? "return" : "lend"

  return (
    <PageFrame section="desk">
      <div className="space-y-8">
        <PageHeader
          title="Desk"
          description={
            mode === "lend"
              ? `Choose who is borrowing, then scan the book. Loans run ${LOAN_DAYS} days.`
              : "Scan each book as it comes back. Nothing else is needed."
          }
        />

        {/* A radio group in behaviour, links in fact. `aria-label` names the
            group; `aria-current="page"` marks the active one, which is what a
            screen reader reads and what `role="tab"` would only imitate
            without the keyboard model that goes with it. */}
        <nav aria-label="Desk mode">
          <ul className="inline-flex gap-1 rounded-xl border border-border p-1">
            {MODES.map(({ key, label, icon: Icon, href }) => {
              const current = key === mode
              return (
                <li key={key}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      // 44px tall, and wide: this is switched with a thumb,
                      // often without looking.
                      "flex min-h-11 items-center gap-2 rounded-lg px-5 text-row font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      current
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* `key={mode}` remounts the console when the mode changes, so the new
            barcode field runs its own `autoFocus`. Without it React reuses the
            subtree and the caret stays wherever it was — which on this screen
            means the next scan goes nowhere. */}
        <DeskConsole key={mode} mode={mode} members={memberOptions()} />
      </div>
    </PageFrame>
  )
}
