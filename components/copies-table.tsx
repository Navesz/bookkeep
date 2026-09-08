import Link from "next/link"

import type { OpenLoan } from "@/lib/db/loans.ts"
import { dueLabel } from "@/components/dates"
import { CopyStatus } from "@/components/copy-status"
import { DueDate } from "@/components/due-date"
import { LinkButton } from "@/components/link-button"
import { ReturnCopyButton } from "@/components/return-copy-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** One physical copy, with the open loan against it when there is one. */
export type CopyLine = {
  id: number
  barcode: string
  loan: OpenLoan | undefined
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE COPIES TABLE — the part of the book page that is actually operated.
 *
 * HOW IT SURVIVES 375px WITHOUT SCROLLING SIDEWAYS.
 *
 * Five columns do not fit on a phone, and the usual answer — let the table
 * scroll horizontally — is the one thing the brief for this app rules out,
 * because a scrolling column CLIPS THE FOCUS RING of whatever inside it has
 * focus. The keyboard would move to a Return button that is drawn half outside
 * its own container.
 *
 * The other usual answer is to turn every `<tr>` into a block on small screens.
 * That is worse than it looks: `display: block` on a table element removes its
 * table role from the accessibility tree in Chrome and Firefox, so the phone
 * layout would quietly stop being a table for exactly the readers who most
 * needed it to be one.
 *
 * So the STRUCTURE never changes and two columns are simply not rendered below
 * their breakpoint — `hidden sm:table-cell` on the header and the cell
 * together, which takes them out of the accessibility tree as well as off the
 * screen. Nothing is lost, because what those columns held is repeated inside
 * the status cell at exactly the widths where they are gone. At any one
 * viewport each fact is present once.
 *
 * WHAT IS LEFT AT 375px: the barcode, the status with its two extra lines, and
 * the action.
 *
 * THAT WAS NOT ENOUGH ON ITS OWN, and the reason is a default worth knowing:
 * `TableCell` in `components/ui/table.tsx` sets `whitespace-nowrap`. Every one
 * of those extra lines was therefore unbreakable, the widest —
 * "1 day overdue · 7 Sept 2026" — pushed the row past 375px, and the table
 * scrolled sideways inside its own `overflow-x-auto` wrapper. Which is the one
 * outcome all of the above was arranged to avoid: the Return button, and its
 * focus ring, half outside the box.
 *
 * So the status cell is `whitespace-normal` — it is the only cell here holding
 * a sentence rather than a token — and the mobile due line drops the date and
 * keeps the standing. "1 day overdue" is what decides what happens next; the
 * calendar date is available one breakpoint up and on the loan itself.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function CopiesTable({
  copies,
  now,
  bookId,
}: {
  copies: CopyLine[]
  /** One instant for the whole render — see `components/due-date.tsx`. */
  now: Date
  bookId: number
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* `pl-1`/`pr-1` AND NOT `pl-0`/`pr-0`, WHICH IS ABOUT FOCUS RINGS
                AGAIN. `Table` in `components/ui/table.tsx` wraps every table in
                `overflow-x-auto`, and `overflow: auto` clips its content box
                whether or not it is actually scrolling. A control flush against
                the first or last column edge therefore loses the 3px of ring
                drawn outside it — the Return button on every row, and the book
                title link on the member page. Four pixels of inset is invisible
                against a 72rem page and is the whole fix. */}
          {/* Every header is a real `<th scope="col">` — that is what lets a
              screen reader say "Status: On loan" when the reader moves onto a
              cell, instead of reading a bare word with no column attached. */}
          <TableHead scope="col" className="pl-1">
            Copy
          </TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" className="hidden sm:table-cell">
            With
          </TableHead>
          <TableHead scope="col" className="hidden md:table-cell">
            Due back
          </TableHead>
          <TableHead scope="col" className="pr-1 text-right">
            {/* The action column's heading is spoken and not shown: a visible
                "Action" over a column of identical buttons tells a sighted
                reader nothing, and an unlabelled column tells a screen reader
                nothing at all. */}
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {copies.map(({ id, barcode, loan }) => (
          <TableRow key={id}>
            {/* `scope="row"` because the barcode is what identifies this row —
                it is the number printed on the sticker, and it is the header
                for everything else on the line. */}
            <TableHead
              scope="row"
              className="py-3 pl-1 align-top font-mono text-mark font-normal"
            >
              {barcode}
            </TableHead>

            {/* `whitespace-normal` overrides the component's `nowrap`: this is
                the only cell carrying prose, and on a phone it carries three
                lines of it. */}
            <TableCell className="py-3 align-top whitespace-normal">
              <div className="flex flex-col items-start gap-1">
                <CopyStatus due={loan?.due_at ?? null} now={now} />

                {/* THE SAME TWO FACTS AS THE HIDDEN COLUMNS, at the widths
                    where those columns are not rendered. `sm:hidden` and
                    `md:hidden` mirror the `hidden sm:table-cell` and
                    `hidden md:table-cell` above exactly, so each fact appears
                    once at every viewport and never twice. */}
                {loan ? (
                  <>
                    <span className="text-caption text-muted-foreground sm:hidden">
                      {loan.member_name}
                    </span>
                    <span className="text-caption text-muted-foreground md:hidden">
                      {dueLabel(loan.due_at, now)}
                    </span>
                  </>
                ) : null}
              </div>
            </TableCell>

            <TableCell className="hidden py-3 align-top text-row sm:table-cell">
              {loan ? (
                // NO `outline-none` ON AN INLINE LINK. It was there, paired
                // with `focus-visible:underline` — which looks like a focus
                // style and is not one, because it is identical to the hover
                // state this link already has. `outline-none` also removes the
                // `:focus-visible { outline: 2px solid var(--ring) }` that
                // `app/globals.css` sets as the safety net for everything that
                // is not a shadcn component. Left alone, that net does the job.
                <Link
                  href={`/members/${loan.member_id}`}
                  className="rounded-sm underline-offset-4 hover:underline"
                >
                  {loan.member_name}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>

            <TableCell className="hidden py-3 align-top md:table-cell">
              {loan ? (
                <DueDate due={loan.due_at} now={now} />
              ) : (
                <span className="text-row text-muted-foreground">—</span>
              )}
            </TableCell>

            <TableCell className="py-3 pr-1 text-right align-top">
              {loan ? (
                <ReturnCopyButton loanId={loan.id} barcode={barcode} />
              ) : (
                // A LINK, not a button that opens a dialog. It carries the
                // barcode into the lend panel below as `?lend=…` and jumps to
                // it — so it preselects the right copy with JavaScript off,
                // and the resulting URL can be reloaded or shared.
                <LinkButton
                  href={`/books/${bookId}?lend=${encodeURIComponent(barcode)}#lend-a-copy`}
                  // The panel does its own scrolling and focusing — see
                  // `components/lend-copy-form.tsx`. Left to itself the router
                  // would undo it a frame later.
                  scroll={false}
                  variant="outline"
                  size="sm"
                  className="h-11 px-2.5 sm:px-3"
                >
                  Lend
                  <span className="sr-only"> copy {barcode}</span>
                </LinkButton>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
