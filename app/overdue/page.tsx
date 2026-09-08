import Link from "next/link"
import { CircleCheck } from "lucide-react"

import { LOAN_DAYS, overdueLoans } from "@/lib/db/loans.ts"
import { formatDay, machineDay } from "@/components/dates"
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
 * ═════════════════════════════════════════════════════════════════════════
 * WHAT IS LATE — the first screen of the day.
 *
 * OLDEST FIRST, AND THAT IS THE WHOLE INFORMATION ARCHITECTURE OF THIS PAGE.
 * `overdueLoans()` orders by `due_at` ascending, so the top row is the loan
 * that has been out longest — the one where the next action is a phone call
 * rather than a note. Sorting by borrower or by title would each be defensible
 * and would both bury the worst case somewhere in the middle.
 *
 * `days_overdue` IS COMPUTED BY SQLITE, NOT HERE. `lib/db/loans.ts` does the
 * subtraction with `julianday()` inside the same statement as the `WHERE`, so
 * the "now" that decides a row belongs in this list is the same "now" that
 * counts how late it is. Two `new Date()` calls either side of a query are two
 * instants, and at the boundary they disagree about whether a row exists.
 *
 * The consequence worth stating: there is no `is_overdue` column and no job at
 * midnight to set one. A loan goes late because the world moved, not because
 * anything wrote a row.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Overdue",
  description: "Loans that are past their due date, oldest first.",
}

export default async function OverduePage() {
  const late = overdueLoans()

  return (
    <PageFrame section="overdue">
      <div className="space-y-8">
        <PageHeader
          title="Overdue"
          description={
            late.length === 0
              ? "Nothing is past its due date."
              : "Past their due date, longest first. The top of this list is the one to chase."
          }
        />

        {late.length === 0 ? (
          <Empty className="border border-dashed border-border py-12">
            <EmptyHeader>
              {/* The cloth green, not the red: this is the good state. It is
                  the one place in the application where `--shelved` is used
                  for something that is not a copy. */}
              <EmptyMedia
                variant="icon"
                className="bg-shelved text-shelved-foreground"
              >
                <CircleCheck aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Nothing is late</EmptyTitle>
              <EmptyDescription>
                Every copy that is out is still inside its {LOAN_DAYS}-day
                loan period. This screen fills itself as due dates pass; there
                is nothing to do here until it does.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <section aria-labelledby="late-heading" className="space-y-3">
            <h2
              id="late-heading"
              className="font-sans text-caption text-muted-foreground"
            >
              <span className="font-medium text-foreground tabular-nums">
                {late.length}
              </span>{" "}
              {late.length === 1 ? "loan is late" : "loans are late"}
            </h2>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="pl-0">
                    Book
                  </TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">
                    Copy
                  </TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">
                    With
                  </TableHead>
                  <TableHead scope="col">Late by</TableHead>
                  <TableHead scope="col" className="pr-0 text-right">
                    <span className="sr-only">Action</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {late.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableHead
                      scope="row"
                      className="py-3 pl-0 align-top font-normal whitespace-normal"
                    >
                      {/* Links into the search rather than to `/books/<id>`:
                          `OverdueLoan` carries `copy_id` but not `book_id`, and
                          a link built from the wrong key would resolve to the
                          wrong book. The same note is on the member page. */}
                      <Link
                        href={`/?q=${encodeURIComponent(loan.title)}`}
                        className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
                      >
                        {loan.title}
                      </Link>
                      <span className="block text-caption text-muted-foreground">
                        {loan.author}
                      </span>
                      {/* Barcode and borrower move under the title at the
                          widths where their own columns are not rendered, so
                          nothing is lost and the table never scrolls sideways —
                          which is what would clip the Return button's focus
                          ring. */}
                      <span className="block font-mono text-mark text-muted-foreground lg:hidden">
                        {loan.barcode}
                      </span>
                      <span className="block text-caption text-muted-foreground sm:hidden">
                        {loan.member_name}
                      </span>
                    </TableHead>

                    <TableCell className="hidden py-3 align-top font-mono text-mark lg:table-cell">
                      {loan.barcode}
                    </TableCell>

                    <TableCell className="hidden py-3 align-top text-row sm:table-cell">
                      <Link
                        href={`/members/${loan.member_id}`}
                        className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:underline"
                      >
                        {loan.member_name}
                      </Link>
                    </TableCell>

                    <TableCell className="py-3 align-top">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-row font-medium text-overdue-foreground tabular-nums">
                          {/* `days_overdue` is truncated toward zero, so a loan
                              that went late within the last twenty-four hours
                              arrives as 0. "0 days" is not a sentence anybody
                              says; "since today" is what it means. */}
                          {loan.days_overdue === 0
                            ? "Since today"
                            : loan.days_overdue === 1
                              ? "1 day"
                              : `${loan.days_overdue} days`}
                        </span>
                        <time
                          dateTime={machineDay(loan.due_at)}
                          className="text-caption text-muted-foreground tabular-nums"
                        >
                          due {formatDay(loan.due_at)}
                        </time>
                      </span>
                    </TableCell>

                    <TableCell className="py-3 pr-0 text-right align-top">
                      <ReturnCopyButton
                        loanId={loan.id}
                        barcode={loan.barcode}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </div>
    </PageFrame>
  )
}
