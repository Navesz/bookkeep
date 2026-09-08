import Link from "next/link"
import { UserPlus, Users } from "lucide-react"

import { allOpenLoans } from "@/lib/db/loans.ts"
import { members } from "@/lib/db/members.ts"
import { standingOf } from "@/components/dates"
import { LinkButton } from "@/components/link-button"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * EVERYONE WHO HOLDS A CARD, with what they are holding.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO QUERIES FOR THE WHOLE PAGE, NOT ONE PER PERSON.
 *
 * The obvious build is `members()` and then `openLoansOf(person.id)` inside the
 * map — which is a query per row, and a list of four hundred members is four
 * hundred and one queries to render one screen. `allOpenLoans()` is a single
 * JOIN over everything that is out; tallying it into a `Map` here is one pass
 * over a list that is, by definition, no longer than the number of books
 * currently outside the building.
 *
 * WHY THE COUNTS ARE ON THIS SCREEN AT ALL. A bare list of names and addresses
 * is a contact book, and nobody opens a library system to read one. "3 out, 1
 * late" is the answer to the question that brought the librarian here.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Members",
  description: "Everyone who holds a library card, and what they have out.",
}

export default async function MembersPage() {
  const people = members()

  // ONE `now` for the page — see `components/due-date.tsx` for why this is a
  // prop everywhere rather than a call inside each component.
  const now = new Date()

  // `standingOf` decides "late" with the same comparison SQLite uses in
  // `overdueLoans` — `due_at < now`, on the timestamp, not on the calendar day.
  // The distinction is not academic: it is the difference between this page
  // saying a member has nothing late and `/overdue` listing their loan, for
  // every loan that fell due earlier the same day. `components/dates.ts` has
  // the measurement that caused the rule to be written down once.
  const tally = new Map<number, { out: number; late: number }>()
  for (const loan of allOpenLoans()) {
    const row = tally.get(loan.member_id) ?? { out: 0, late: 0 }
    row.out += 1
    if (standingOf(loan.due_at, now) === "overdue") row.late += 1
    tally.set(loan.member_id, row)
  }

  return (
    <PageFrame section="members">
      <div className="space-y-8">
        <PageHeader
          title="Members"
          description="Everyone who holds a card. Open a name to see what they have out and everything they have borrowed."
          actions={
            <LinkButton
              href="/members/new"
              variant="outline"
              size="lg"
              className="h-11"
            >
              <UserPlus aria-hidden />
              Issue a card
            </LinkButton>
          }
        />

        {people.length === 0 ? (
          <Empty className="border border-dashed border-border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Nobody holds a card yet</EmptyTitle>
              <EmptyDescription>
                A book can only go out to somebody, so the first card has to be
                issued before anything can be lent.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <LinkButton href="/members/new" size="lg" className="h-11">
                <UserPlus aria-hidden />
                Issue the first card
              </LinkButton>
            </EmptyContent>
          </Empty>
        ) : (
          <section aria-labelledby="members-heading" className="space-y-3">
            <h2
              id="members-heading"
              className="font-sans text-caption text-muted-foreground"
            >
              <span className="font-medium text-foreground tabular-nums">
                {people.length}
              </span>{" "}
              {people.length === 1 ? "member" : "members"}
            </h2>

            {/* No `overflow-hidden` on the container: it would clip the 3px
                focus ring of the first and last rows, which are the two a
                keyboard reaches first. The corners are rounded on the rows
                instead. */}
            <ul className="divide-y divide-border rounded-xl border border-border">
              {people.map((person) => {
                const counts = tally.get(person.id) ?? { out: 0, late: 0 }

                return (
                  <li key={person.id}>
                    <Link
                      href={`/members/${person.id}`}
                      className="flex min-h-16 flex-col gap-1 rounded-xl px-4 py-3 transition-colors outline-none first:rounded-b-none last:rounded-t-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <span className="min-w-0 space-y-0.5">
                        <span className="block font-medium text-foreground">
                          {person.name}
                        </span>
                        {/* `break-all` and not `truncate`: an address that is
                            cut off with an ellipsis cannot be read, and this is
                            the field a librarian squints at to tell two people
                            with the same name apart. */}
                        <span className="block text-row break-all text-muted-foreground">
                          {person.email}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        {counts.out === 0 ? (
                          <span className="text-row text-muted-foreground">
                            Nothing out
                          </span>
                        ) : (
                          <span className="text-row text-foreground">
                            <span className="font-medium tabular-nums">
                              {counts.out}
                            </span>{" "}
                            out
                          </span>
                        )}
                        {counts.late > 0 ? (
                          <span className="inline-flex h-5 items-center rounded-4xl bg-overdue px-2 text-caption font-medium text-overdue-foreground tabular-nums">
                            {counts.late} late
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </PageFrame>
  )
}
