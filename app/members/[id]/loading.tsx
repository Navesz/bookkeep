import { PageSkeleton, TableSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-10">
        <div className="h-20 rounded-xl border border-border" />
        <TableSkeleton rows={3} />
      </div>
    </PageSkeleton>
  )
}
