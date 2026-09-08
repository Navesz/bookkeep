import { PageSkeleton } from "@/components/skeletons"

/**
 * The desk's skeleton draws the scanner field at its real height (56px) and the
 * mode switch above it. This is the one screen where the shapes matter: a
 * librarian starts scanning the moment the page looks ready, and a field that
 * moves 20px between the skeleton and the real thing is a scan typed into
 * nothing.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-8">
        <div className="inline-flex gap-1 rounded-xl border border-border p-1">
          <div className="h-11 w-28 rounded-lg bg-muted" />
          <div className="h-11 w-28 rounded-lg bg-muted" />
        </div>
        <div className="h-14 max-w-xl rounded-lg bg-muted" />
      </div>
    </PageSkeleton>
  )
}
