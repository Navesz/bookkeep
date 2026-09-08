import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpen, History } from "lucide-react"

import { loanHistoryOf } from "@/lib/db/loans.ts"
import { memberById } from "@/lib/db/members.ts"
import { formatDay, machineDay, sinceLabel } from "@/components/dates"
import { DueDate } from "@/components/due-date"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"
import { ReturnCopyButton } from "@/components/return-copy-button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * ONE MEMBER: what they are holding, and everything they have ever held.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE QUERY, SPLIT IN JAVASCRIPT — and why that is not the usual mistake.
 *
 * The page shows two lists, so the reflex is two queries: `openLoansOf` for the
 * top and something else for the bottom. `loanHistoryOf` already returns both —
 * open loans first, then closed, most recent first — and `returned_at IS NULL`
 * is exactly what separates them. Partitioning an array that has already been
 * fetched costs one pass; running a second query costs a second definition of
 * "open", which is the thing that eventually disagrees with the first.
 *
 * `overdue` ARRIVES AS 0 OR 1, NOT AS A BOOLEAN. SQLite has no boolean type and
 * `node:sqlite` hands the integer straight back — `lib/db/loans.ts` says so in
 * as many words and declines to translate it for one column. So the comparison
 * below is `=== 1`, deliberately, rather than a truthiness test that would also
 * pass for the string "0" if the driver ever changed its mind.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const person = memberById(Number(id))
  if (!person) return { title: "Member not found" }
  return {
    title: person.name,
    description: `${person.name}: open loans and borrowing history.`,
  }
}

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // `Number("12abc")` is `NaN` and `Number("")` is `0`; neither is a member id,
  // and both would reach SQLite as a binding it cannot use.
  const memberId = Number(id)
  if (!Number.isInteger(memberId) || memberId <= 0) notFound()

  const person = memberById(memberId)
  if (!person) notFound()

  const history = loanHistoryOf(memberId)
  const out = history.filter((loan) => loan.returned_at === null)
  const past = history.filter((loan) => loan.returned_at !== null)
  const late = out.filter((loan) => loan.overdue === 1).length

  const now = new Date()

  return (
    <PageFrame section="members">
      <div className="space-y-10">
        <PageHeader
          eyebrow="Member"
          title={person.name}
          description={<span className="break-all">{person.email}</span>}
        />

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-border p-4 sm:grid-cols-3">
          <Entry label="Card issued">
            <time
              dateTime={machineDay(person.joined_at)}
              className="tabular-nums"
            >
              {formatDay(person.joined_at)}
            </time>
            <span className="ml-1.5 text-muted-foreground">
              ({sinceLabel(person.joined_at, now)})
            </span>
          </Entry>
          <Entry label="Out now">
            <span className="tabular-nums">{out.length}</span>
            {late > 0 ? (
              <span className="ml-2 inline-flex h-5 items-center rounded-4xl bg-overdue px-2 text-caption font-medium text-overdue-foreground tabular-nums">
                {late} late
              </span>
            ) : null}
          </Entry>
          <Entry label="Borrowed in total">
            <span className="tabular-nums">{history.length}</span>
          </Entry>
        </dl>

        <section aria-labelledby="out-heading" className="space-y-4">
          <h2 id="out-heading" className="font-sans text-h4">
            Out now
          </h2>

          {out.length === 0 ? (
            <Empty className="border border-dashed border-border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpen aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Nothing out</EmptyTitle>
                <EmptyDescription>
                  {person.name} is not holding anything from the library right
                  now.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="pl-1">
                    Book
                  </TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">
                    Copy
                  </TableHead>
                  <TableHead scope="col">Due back</TableHead>
                  <TableHead scope="col" className="pr-1 text-right">
                    <span className="sr-only">Action</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {out.map((loan) => (
                  <TableRow key={loan.id}>
                    {/* `scope="row"` — the title is what names this line. */}
                    <TableHead
                      scope="row"
                      className="py-3 pl-1 align-top font-normal whitespace-normal"
                    >
                      {/* The title goes straight to the book. It used to go to
                          `/?q=<title>` because `LoanRecord` selected the title
                          from `book` without selecting its key, and a link
                          built from `copy_id` would have resolved — to the
                          WRONG book, which is worse than no link. The query now
                          carries `b.id AS book_id`, so the guess is gone. */}
                      <Link
                        href={`/books/${loan.book_id}`}
                        className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {loan.title}
                      </Link>
                      <span className="block text-caption text-muted-foreground">
                        {loan.author}
                      </span>
                      {/* The barcode moves under the title where its own
                          column is not rendered — the same trick as the copies
                          table, and for the same reason: a table that scrolls
                          sideways clips the focus ring of whatever is inside
                          it. */}
                      <span className="block font-mono text-mark text-muted-foreground sm:hidden">
                        {loan.barcode}
                      </span>
                    </TableHead>
                    <TableCell className="hidden py-3 align-top font-mono text-mark sm:table-cell">
                      {loan.barcode}
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <DueDate due={loan.due_at} now={now} />
                    </TableCell>
                    <TableCell className="py-3 pr-1 text-right align-top">
                      <ReturnCopyButton
                        loanId={loan.id}
                        barcode={loan.barcode}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section aria-labelledby="history-heading" className="space-y-4">
          <h2 id="history-heading" className="font-sans text-h4">
            History
          </h2>

          {past.length === 0 ? (
            <Empty className="border border-dashed border-border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Nothing returned yet</EmptyTitle>
                <EmptyDescription>
                  Closed loans appear here — what was borrowed, when it went out
                  and when it came back.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="pl-1">
                    Book
                  </TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Copy
                  </TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">
                    Taken out
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="pr-1 text-right sm:text-left"
                  >
                    Returned
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableHead
                      scope="row"
                      className="py-3 pl-1 align-top font-normal whitespace-normal"
                    >
                      <span className="block text-foreground">
                        {loan.title}
                      </span>
                      <span className="block text-caption text-muted-foreground">
                        {loan.author}
                      </span>
                      <span className="block text-caption text-muted-foreground sm:hidden">
                        Taken out {formatDay(loan.lent_at)}
                      </span>
                    </TableHead>
                    <TableCell className="hidden py-3 align-top font-mono text-mark text-muted-foreground md:table-cell">
                      {loan.barcode}
                    </TableCell>
                    <TableCell className="hidden py-3 align-top text-row tabular-nums sm:table-cell">
                      <time dateTime={machineDay(loan.lent_at)}>
                        {formatDay(loan.lent_at)}
                      </time>
                    </TableCell>
                    <TableCell className="py-3 pr-1 text-right align-top text-row tabular-nums sm:text-left">
                      {/* `returned_at` is non-null for every row in this list —
                          that is what put it here — but TypeScript cannot know
                          that from a `filter`, so the fallback is written out
                          rather than asserted away with a `!`. */}
                      <time
                        dateTime={
                          loan.returned_at ? machineDay(loan.returned_at) : ""
                        }
                      >
                        {loan.returned_at ? formatDay(loan.returned_at) : "—"}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </PageFrame>
  )
}

function Entry({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-row text-foreground">{children}</dd>
    </div>
  )
}
