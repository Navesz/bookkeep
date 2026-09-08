import { notFound } from "next/navigation"
import { BookCopy } from "lucide-react"

import { bookById } from "@/lib/db/books.ts"
import { allOpenLoans } from "@/lib/db/loans.ts"
import { Availability } from "@/components/availability"
import { CopiesTable, type CopyLine } from "@/components/copies-table"
import { formatDay, machineDay } from "@/components/dates"
import { LendCopyForm } from "@/components/lend-copy-form"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { copyRowsOf, memberOptions } from "@/components/reads.ts"
import { PageFrame } from "@/components/page-frame"
import { WithdrawBookForm } from "@/components/withdraw-book-form"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * ONE BOOK: the bibliographic record above, the physical objects below.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE PAGE IS TWO HALVES, AND WHY THAT IS THE SCHEMA SHOWING THROUGH.
 *
 * `book` is the WORK — a title, an author, a year. `copy` is the OBJECT on the
 * shelf, with a barcode and possibly somebody's name against it. That split is
 * what makes "is it available?" a question with an answer at all (see the note
 * in `lib/db/schema.sql`), and the page is laid out to match it: nothing in the
 * top half changes when a copy goes out, and everything in the bottom half
 * does.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO QUERIES, NOT ONE PER ROW.
 *
 * `copyRowsOf` lists every copy including the ones on the shelf; `allOpenLoans`
 * is the single JOIN that says who has what, and it is indexed into a `Map` by
 * `copy_id` here. The alternative — `copiesOf` alone — carries the borrower's
 * NAME but not their id, so every borrower on this page would be plain text
 * where it should be a link to their record. Two queries and a map is the price
 * of the copies table being navigable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `?lend=` IS READ HERE AND PASSED DOWN.
 *
 * Each shelved row links to `?lend=<barcode>#lend-a-copy`. Reading it on the
 * server is what makes the panel preselect that copy with JavaScript switched
 * off, and it is why lending is a panel rather than a dialog — the whole
 * argument is in `components/lend-copy-form.tsx`.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const book = bookById(Number(id))
  // A title for a page that is about to 404 would be a lie in the browser tab
  // for the half-second before the not-found renders.
  if (!book) return { title: "Book not found" }
  // The product name is appended by `title.template` in `app/layout.tsx`.
  return {
    title: book.title,
    description: `${book.title} by ${book.author}: copies, availability and loans.`,
  }
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams

  // `Number("12abc")` is `NaN` and `Number("")` is `0`; neither is a book id,
  // and both would otherwise reach SQLite as a binding it cannot use. One
  // guard turns every malformed URL into the same honest 404.
  const bookId = Number(id)
  if (!Number.isInteger(bookId) || bookId <= 0) notFound()

  const book = bookById(bookId)
  if (!book) notFound()

  const openByCopy = new Map(
    allOpenLoans().map((loan) => [loan.copy_id, loan] as const)
  )

  const copies: CopyLine[] = copyRowsOf(bookId).map((copy) => ({
    id: copy.id,
    barcode: copy.barcode,
    loan: openByCopy.get(copy.id),
  }))

  const available = copies
    .filter((copy) => copy.loan === undefined)
    .map(({ id: copyId, barcode }) => ({ id: copyId, barcode }))

  const rawLend = query.lend
  const preselect = Array.isArray(rawLend) ? rawLend[0] : rawLend

  // ONE `now` FOR THE WHOLE PAGE. Eleven copies each calling `new Date()` is
  // eleven slightly different opinions about the present, and at midnight two
  // rows on one screen can land on different days.
  const now = new Date()

  return (
    <PageFrame section="catalogue">
      <div className="space-y-10">
        {/* NO BREADCRUMB HERE, and its absence is a decision.
            A "‹ Catalogue" trail is the reflex on a detail page, and on this
            one it would sit about 40px under a "Catalogue" tab that is already
            in the section navigation, is already marked `aria-current`, and
            already goes to the same URL. Two controls with the same label and
            the same destination, one above the other, is not orientation — it
            is one extra stop for every keyboard and screen-reader user, on
            every book in the library. */}
        <PageHeader
          eyebrow="Book"
          title={book.title}
          description={book.author}
          actions={
            <LinkButton
              href={`/books/${book.id}/copies/new`}
              variant="outline"
              size="lg"
              className="h-11"
            >
              <BookCopy aria-hidden />
              Add a copy
            </LinkButton>
          }
        />

        {/* The record. A `<dl>` and not a table: these are five labelled
            values about one thing, which is what a description list is for,
            and it lets the pairs reflow from one column to four without the
            row-and-column semantics a table would promise and not keep. */}
        <section aria-labelledby="record-heading" className="space-y-3">
          <h2 id="record-heading" className="font-sans text-h4">
            The record
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Entry label="Author">{book.author}</Entry>
            <Entry label="Published">
              {book.published_year ? (
                <span className="tabular-nums">{book.published_year}</span>
              ) : (
                <Unknown>Not recorded</Unknown>
              )}
            </Entry>
            <Entry label="ISBN">
              {book.isbn ? (
                <span className="font-mono text-mark">{book.isbn}</span>
              ) : (
                // NOT "—". An absent ISBN is a fact about the book, not a gap
                // in the form: the number was introduced in 1970 and most of
                // this catalogue predates it. `lib/db/seed.ts` argues the case
                // at length for why a plausible-looking fake would be worse.
                <Unknown>None — published before ISBNs</Unknown>
              )}
            </Entry>
            <Entry label="Added">
              <time
                dateTime={machineDay(book.added_at)}
                className="tabular-nums"
              >
                {formatDay(book.added_at)}
              </time>
            </Entry>
          </dl>
        </section>

        <section aria-labelledby="copies-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="copies-heading" className="font-sans text-h4">
              Copies
            </h2>
            <Availability available={book.available} copies={book.copies} />
          </div>

          {copies.length === 0 ? (
            <Empty className="border border-dashed border-border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookCopy aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No copies on the shelf</EmptyTitle>
                <EmptyDescription>
                  This title is in the catalogue but the library does not hold a
                  physical copy of it — a book on order looks exactly like this.
                  Add one and it becomes lendable.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <LinkButton
                  href={`/books/${book.id}/copies/new`}
                  size="lg"
                  className="h-11"
                >
                  <BookCopy aria-hidden />
                  Add the first copy
                </LinkButton>
              </EmptyContent>
            </Empty>
          ) : (
            <CopiesTable copies={copies} now={now} bookId={book.id} />
          )}
        </section>

        {copies.length > 0 ? (
          // `scroll-mt-(--header-offset)` reads the SAME custom property that
          // `app/globals.css` sets `html { scroll-padding-top }` from, so the
          // sticky masthead is cleared by one number defined in one place.
          //
          // It is written as a custom-property utility rather than as
          // `scroll-mt-header`, which was the first attempt and silently
          // generated nothing: `--spacing-header` is declared inside
          // `@theme inline`, so Tailwind inlines it at build time and never
          // emits it as a variable the spacing scale can name. The computed
          // `scroll-margin-top` was 0px — a class that reads correctly and does
          // nothing, which is the worst kind to leave in.
          <section
            id="lend-a-copy"
            aria-labelledby="lend-heading"
            className="scroll-mt-(--header-offset) space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
          >
            <div>
              <h2 id="lend-heading" className="font-sans text-h4">
                Lend a copy
              </h2>
              <p className="mt-1 text-row text-muted-foreground">
                {available.length > 0
                  ? "Choose which copy is going out and who is taking it."
                  : "Every copy of this book is out. It can be lent again as soon as one comes back."}
              </p>
            </div>

            {available.length > 0 ? (
              <LendCopyForm
                available={available}
                members={memberOptions()}
                preselect={preselect}
              />
            ) : null}
          </section>
        ) : null}

        <WithdrawBookForm bookId={book.id} title={book.title} />
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

function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}
