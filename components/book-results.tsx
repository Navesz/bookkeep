import Link from "next/link"
import { BookPlus, Library, SearchX } from "lucide-react"

import type { BookWithAvailability } from "@/lib/db/books.ts"
import { Availability } from "@/components/availability"
import { LinkButton } from "@/components/link-button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * The catalogue's result list, and the two ways it can be empty.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "NO RESULTS" AND "NO BOOKS" ARE DIFFERENT SCREENS.
 *
 * Both render zero rows and that is the only thing they have in common. "No
 * results" means the search was wrong and the next move is to change it; "no
 * books" means the library is new and the next move is to catalogue something.
 * Showing the same box for both offers a "clear search" button to someone who
 * never searched, and an empty page to someone whose only problem was a typo.
 *
 * A THIRD STATE THAT IS NOT AN EMPTY STATE: a book with zero copies. It is a
 * result, it is listed, and it says "No copies on the shelf" — see
 * `components/availability.tsx`. Filtering it out would hide the on-order
 * titles from the only screen that could tell anyone they exist.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function BookResults({
  books,
  query,
  limit,
}: {
  books: BookWithAvailability[]
  /** What was searched for. Empty string means browsing, not searching. */
  query: string
  /** The `LIMIT` the query ran with, so a full page can say it is truncated. */
  limit: number
}) {
  const searching = query !== ""

  if (books.length === 0) {
    return searching ? <NoResults query={query} /> : <NoBooks />
  }

  return (
    <section aria-labelledby="results-heading" className="space-y-3">
      {/* ONE `aria-live` REGION, ALWAYS IN THE DOM.
          With JavaScript on, typing replaces this list without a page load, and
          nothing about that reaches a screen reader by itself — the caret never
          left the search box. The count is the smallest true sentence about
          what just happened, so it is what gets announced. `polite` and not
          `assertive`: it must wait for the letter being typed to finish being
          spoken, not interrupt it.

          It is a heading as well as a live region, so the list is reachable by
          heading navigation and `aria-labelledby` above has something to name
          the section with. */}
      <h2
        id="results-heading"
        aria-live="polite"
        // `font-sans` overrides the base layer, which sets the reading serif on
        // every `h1`-`h3`. That is right for a page title and wrong for this:
        // it is a heading only so the list is reachable by heading navigation
        // and so `aria-labelledby` has something to point at. Set in Literata
        // at 13px it reads as a pull quote sitting above a table.
        className="font-sans text-caption text-muted-foreground"
      >
        {searching ? (
          <>
            <span className="font-medium text-foreground tabular-nums">
              {books.length}
            </span>{" "}
            {books.length === 1 ? "book matches" : "books match"}{" "}
            <span className="text-foreground">“{query}”</span>
          </>
        ) : (
          <>
            Browsing{" "}
            <span className="font-medium text-foreground tabular-nums">
              {books.length}
            </span>{" "}
            {books.length === 1 ? "book" : "books"}
          </>
        )}
        {books.length === limit ? (
          <span className="text-muted-foreground">
            {" "}
            — the first {limit}; narrow the search to see further
          </span>
        ) : null}
      </h2>

      {/* NO `overflow-hidden` ON THIS CONTAINER, and that is deliberate.
          Rounding the corners of a divided list usually means clipping the
          children, and clipping the children means clipping the 3px focus ring
          of whichever row has focus — most visibly the first and the last,
          which are the two a keyboard reaches first. The corners are rounded on
          the rows themselves instead, so nothing has to be cut. */}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {books.map((book) => (
          <li key={book.id}>
            <Link
              href={`/books/${book.id}`}
              // The whole row is the target. `min-h-16` keeps it well past the
              // 44px floor even for a one-line title, so a thumb aiming at a
              // list of twenty does not need to aim at all.
              className="flex min-h-16 flex-col gap-1 rounded-xl px-4 py-3 outline-none transition-colors first:rounded-b-none last:rounded-t-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <span className="min-w-0 space-y-0.5">
                {/* `font-medium` and full colour on the title, muted on the
                    author: the two are scanned differently — the title is
                    matched against what the reader is looking for, the author
                    only confirms it. Same size, different weight, so the list
                    reads as one column of titles rather than two columns of
                    equals. */}
                <span className="block font-medium text-balance text-foreground">
                  {book.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {book.author}
                  {book.published_year ? (
                    <>
                      {" · "}
                      <span className="tabular-nums">
                        {book.published_year}
                      </span>
                    </>
                  ) : null}
                </span>
              </span>

              <Availability
                available={book.available}
                copies={book.copies}
                className="shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NoResults({ query }: { query: string }) {
  /**
   * THE ACCENT HINT, AND WHY IT IS CONDITIONAL.
   *
   * `lib/db/books.ts` states the limitation outright: SQLite's built-in `LIKE`
   * folds case for ASCII only, so `bronte` does not find *Brontë* and `emile`
   * does not find *Émile*. The seed contains both names deliberately, so this
   * is a real dead end a librarian will hit on their first week, not a
   * theoretical one.
   *
   * The hint only appears when the query is plain unaccented letters, because
   * that is the only case where it could be the explanation. Someone who
   * already typed `Brontë` and found nothing has a different problem, and
   * telling them to try an accent they used is the software not listening.
   */
  const couldBeAccents = /^[a-z ]+$/i.test(query)

  return (
    <Empty className="border border-dashed border-border py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden />
        </EmptyMedia>
        <EmptyTitle>No book matches “{query}”</EmptyTitle>
        <EmptyDescription>
          Search runs over titles and authors, and matches part of a word — so
          a fragment is usually safer than a full title.
          {couldBeAccents ? (
            <>
              {" "}
              Accented letters are not folded: <em>Brontë</em> will not be found
              by typing <em>Bronte</em>.
            </>
          ) : null}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* A link, not a button with an onClick: it clears the search by going
            to the URL that has no query, which works with JavaScript off and is
            the same thing the address bar would do. */}
        <LinkButton href="/" variant="outline" size="lg" className="h-11">
          Show the whole catalogue
        </LinkButton>
      </EmptyContent>
    </Empty>
  )
}

function NoBooks() {
  return (
    <Empty className="border border-dashed border-border py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Library aria-hidden />
        </EmptyMedia>
        <EmptyTitle>The catalogue is empty</EmptyTitle>
        <EmptyDescription>
          Nothing has been catalogued yet. Add the first book and it will appear
          here, with a count of how many copies are on the shelf.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <LinkButton href="/books/new" size="lg" className="h-11">
          <BookPlus aria-hidden />
          Add a book
        </LinkButton>
      </EmptyContent>
    </Empty>
  )
}
