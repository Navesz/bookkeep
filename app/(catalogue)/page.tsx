import { BookPlus } from "lucide-react"

import { search } from "@/lib/db/books.ts"
import { BookResults } from "@/components/book-results"
import { CatalogueSearch } from "@/components/catalogue-search"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { PageFrame } from "@/components/page-frame"

/**
 * THE CATALOGUE — the front door, and the search box a librarian lives in.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `force-dynamic` IS LOAD-BEARING ON EVERY PAGE IN THIS APP.
 *
 * These pages read a SQLite file in this process. Without this line Next tries
 * to prerender them at build time, which does two wrong things at once: it
 * needs a database to exist during `next build`, and — worse if it succeeds —
 * it bakes that moment's availability counts into static HTML that a returning
 * copy will never update. A catalogue that says "3 of 5 available" from
 * whenever the container was built is a catalogue that lies quietly.
 *
 * The cost is nothing measurable: the query is 2.5–3.4 ms at 5,000 books
 * (measured in `lib/db/books.ts`) against a file on the same machine, with no
 * socket in between. This is the trade SQLite-in-process exists to make.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE QUERY LIVES IN THE URL AND NOWHERE ELSE.
 *
 * `?q=` is read here, on the server, and handed to `search`. That is what makes
 * the search work with JavaScript off — the form is a `GET`, the browser writes
 * the URL, this function reads it — and it is also what makes a result page
 * something you can send to a colleague. `components/catalogue-search.tsx` only
 * ever *writes* that URL faster; it never becomes the source of truth for it.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic"

// `app/layout.tsx` sets `title.template` to "%s · bookkeep", so the product
// name is appended for us. Writing it again here would publish
// "Catalogue — bookkeep · bookkeep".
export const metadata = {
  title: "Catalogue",
  description: "Search the library by title or author.",
}

/**
 * The `LIMIT` the search runs with. It is passed down to the results so a full
 * page can say so out loud rather than silently being the top of an iceberg —
 * a librarian who cannot see that there are more matches will conclude there
 * are not.
 */
const LIMIT = 50

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  // `?q=a&q=b` is legal in a URL and arrives as an array. Taking the first
  // entry is the same thing a plain HTML form would send, and it means a
  // hand-edited or duplicated parameter degrades to a search instead of to a
  // crash on `.trim()`.
  const raw = params.q
  const query = (Array.isArray(raw) ? raw[0] : raw) ?? ""

  const books = search(query, LIMIT)

  return (
    <PageFrame section="catalogue">
      <div className="space-y-8">
        <PageHeader
          title="Catalogue"
          description="Search by title or author. Partial words match, so a fragment you half-remember is usually enough."
          actions={
            <LinkButton
              href="/books/new"
              variant="outline"
              size="lg"
              className="h-11"
            >
              <BookPlus aria-hidden />
              Add a book
            </LinkButton>
          }
        />

        {/* The results are rendered HERE, on the server, and passed into the
            client search component as children — so the row markup, the
            database module and the availability maths never cross into the
            browser bundle. All the client component does with them is dim them
            while the next set is on its way. */}
        <CatalogueSearch query={query}>
          <BookResults books={books} query={query} limit={LIMIT} />
        </CatalogueSearch>
      </div>
    </PageFrame>
  )
}
