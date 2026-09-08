import { NotFoundNotice } from "@/components/not-found-notice"

export const metadata = { title: "Member not found" }

export default function MemberNotFound() {
  return (
    <NotFoundNotice
      title="No member with that card"
      href="/members"
      action="Back to the members"
    >
      Nobody in the system has this id. The list of members is the way to find
      the right one.
    </NotFoundNotice>
  )
}
