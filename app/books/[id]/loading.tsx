import { PageSkeleton, TableSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-10">
        {/* The record: four labelled values in a bordered block. */}
        <div className="h-24 rounded-xl border border-border" />
        <TableSkeleton rows={3} />
      </div>
    </PageSkeleton>
  )
}
