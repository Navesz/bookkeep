import { NotFoundNotice } from "@/components/not-found-notice"

/**
 * REACHED FROM TWO PLACES, AND THE SENTENCE HAS TO COVER BOTH.
 *
 * A mistyped or stale URL is the obvious one. The other is a withdrawal that
 * has just SUCCEEDED: the action re-renders this route, `bookById` finds
 * nothing, and `notFound()` puts the reader here — with JavaScript and without
 * it, for the same reason. See the note in
 * `components/withdraw-book-form.tsx` for why that is the destination rather
 * than a redirect.
 *
 * So the wording has to work as confirmation for one reader and as an
 * explanation for the other. "There is no record here any more" is true of both
 * and reads as an answer to either question; a bare "no such book" would leave
 * the first reader wondering whether the withdrawal had failed.
 */
export const metadata = { title: "Book not found" }

export default function BookNotFound() {
  return (
    <NotFoundNotice title="There is no record here any more">
      Either this book was never in the catalogue, or it has been withdrawn —
      which takes the record and every copy of it in one action. The catalogue
      will show which.
    </NotFoundNotice>
  )
}
