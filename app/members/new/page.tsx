import { MemberForm } from "@/components/member-form"
import { PageFrame } from "@/components/page-frame"
import { PageHeader } from "@/components/page-header"

/** See `app/books/new/page.tsx` for why this is dynamic despite reading nothing. */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Issue a card",
  description: "Register a new library member.",
}

export default function NewMemberPage() {
  return (
    <PageFrame section="members">
      <div className="space-y-8">
        <PageHeader
          eyebrow="Members"
          title="Issue a card"
          description="A name and an address. Everything a member borrows is recorded against the card from the moment it exists."
        />
        <MemberForm />
      </div>
    </PageFrame>
  )
}
