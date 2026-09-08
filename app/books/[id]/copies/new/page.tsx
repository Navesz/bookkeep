import { notFound } from "next/navigation"

import { bookById } from "@/lib/db/books.ts"
import { Availability } from "@/components/availability"
import { CopyForm } from "@/components/copy-form"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"

/**
 * ONE MORE PHYSICAL COPY OF A BOOK THAT IS ALREADY CATALOGUED.
 *
 * THE BOOK IS LOOKED UP HERE RATHER THAN TRUSTED FROM THE URL. `/books/999/
 * copies/new` for a book that does not exist would otherwise render a form
 * whose hidden `bookId` points at nothing; the submission would then fail on a
 * `FOREIGN KEY` error, which `lib/db/books.ts` deliberately leaves untranslated
 * because it means the caller invented an id. Catching it here turns a
 * confusing failure at submit time into an honest 404 before anything is typed.
 *
 * It also lets the page say WHICH book, and how many copies there already are —
 * which is the number a librarian is checking against the pile in front of them.
 */
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const book = bookById(Number(id))
  if (!book) return { title: "Book not found" }
  return { title: `Add a copy of ${book.title}` }
}

export default async function NewCopyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const bookId = Number(id)
  if (!Number.isInteger(bookId) || bookId <= 0) notFound()

  const book = bookById(bookId)
  if (!book) notFound()

  return (
    <PageFrame section="catalogue">
      <div className="space-y-8">
        <PageHeader
          eyebrow="Add a copy"
          title={book.title}
          description={book.author}
        />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
          <span className="text-caption text-muted-foreground">
            On the shelf now
          </span>
          <Availability available={book.available} copies={book.copies} />
        </div>

        <CopyForm bookId={book.id} bookTitle={book.title} />
      </div>
    </PageFrame>
  )
}
