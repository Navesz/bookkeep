import { BookForm } from "@/components/book-form"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"

/**
 * A NEW CATALOGUE RECORD.
 *
 * `force-dynamic` even though this page reads nothing: `PageFrame` counts
 * overdue loans for the navigation badge, so rendering it does touch the
 * database. Without the line, Next would try to prerender that count at build
 * time and serve a number frozen at whenever the container was built.
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Add a book",
  description: "Add a title to the catalogue.",
}

export default function NewBookPage() {
  return (
    <PageFrame section="catalogue">
      <div className="space-y-8">
        <PageHeader
          eyebrow="Catalogue"
          title="Add a book"
          description="The bibliographic record — the work itself. Copies of it go on the shelf afterwards, from the book's own page."
        />
        <BookForm />
      </div>
    </PageFrame>
  )
}
