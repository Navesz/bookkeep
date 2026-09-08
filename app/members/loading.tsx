import { PageSkeleton, RowsSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <PageSkeleton>
      <RowsSkeleton rows={6} />
    </PageSkeleton>
  )
}
