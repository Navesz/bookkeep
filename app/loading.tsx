import { PageSkeleton, RowsSkeleton } from "@/components/skeletons"

/**
 * The catalogue, waiting. The search box is drawn as part of the skeleton
 * because it is the thing the reader reaches for first, and a form field that
 * appears a beat after the page around it is one that gets typed into too
 * early.
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
