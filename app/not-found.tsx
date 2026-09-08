import { NotFoundNotice } from "@/components/not-found-notice"

/**
 * THE CATCH-ALL 404.
 *
 * No `PageFrame` here, and no `export const dynamic`. Next prerenders
 * `/_not-found` during `next build`, and `PageFrame` counts overdue loans for
 * its navigation badge — so wrapping this page would make a missing URL depend
 * on a database that may not exist at build time. `NotFoundNotice` touches
 * nothing.
 */
export const metadata = { title: "Not found" }

export default function NotFound() {
  return (
    <NotFoundNotice title="There is no page here">
      The address does not match anything in the system. The catalogue is the
      way back in — everything else is reachable from it.
    </NotFoundNotice>
  )
}
