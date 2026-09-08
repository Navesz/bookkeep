import { PageSkeleton, RowsSkeleton } from "@/components/skeletons"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * WHY THIS LIVES IN A ROUTE GROUP INSTEAD OF BESIDE THE PAGE.
 *
 * A `loading.tsx` is a Suspense boundary, and a Suspense boundary makes the
 * route STREAM: the shell is flushed to the browser before the page finishes
 * rendering. The response status is committed with that shell — so by the time
 * a page calls `notFound()`, the 200 has already gone out and the not-found
 * screen is served as a soft 404.
 *
 * That is not a theory. Measured on the production build:
 *
 *   with app/loading.tsx        /books/999 → 200
 *   without app/loading.tsx     /books/999 → 404
 *
 * A boundary at `app/loading.tsx` covers every route under it, so one file at
 * the root turned every "no such book" and "no such member" in the application
 * into a 200. A route group is the App Router's own answer: `(catalogue)` adds
 * nothing to the URL — this page is still `/` — and it scopes the boundary to
 * exactly this segment. `/books/[id]` and `/members/[id]` sit outside it and
 * keep their real 404.
 *
 * The same trick is used at `app/members/(list)/`. `/desk` and `/overdue` need
 * no group: nothing beneath them can be not-found.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The search box is drawn as part of the skeleton because it is the thing the
 * reader reaches for first, and a form field that appears a beat after the page
 * around it is one that gets typed into too early.
 * ═════════════════════════════════════════════════════════════════════════
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="h-11 flex-1 rounded-lg bg-muted" />
          <div className="h-11 w-24 rounded-lg bg-muted" />
        </div>
        <RowsSkeleton rows={8} />
      </div>
    </PageSkeleton>
  )
}
