import { MarketingNav } from "@/components/layout/marketing-nav"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="marketing-shell-motion">
      <MarketingNav />
      {children}
    </div>
  )
}
