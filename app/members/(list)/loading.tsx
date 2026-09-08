import { PageSkeleton, RowsSkeleton } from "@/components/skeletons"

/**
 * Scoped to the members LIST by the `(list)` route group, so that the Suspense
 * boundary it creates does not cover `/members/[id]` — where it would stream
 * the shell, commit a 200, and turn that page's `notFound()` into a soft 404.
 * The measurement and the full argument are in `app/(catalogue)/loading.tsx`.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <RowsSkeleton rows={6} />
    </PageSkeleton>
  )
}
