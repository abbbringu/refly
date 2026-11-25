import { cn } from "@/lib/utils"

type ReflyLogoProps = React.ComponentPropsWithoutRef<"svg">

export function ReflyLogo({ className, ...props }: ReflyLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-4 w-4", className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="5" r="2.4" fill="currentColor" />
      <circle cx="18.65" cy="9.82" r="2.4" fill="currentColor" />
      <circle cx="16.12" cy="17.69" r="2.4" fill="currentColor" />
      <circle cx="7.88" cy="17.69" r="2.4" fill="currentColor" />
      <circle cx="3.35" cy="9.82" r="2.4" fill="currentColor" />
      <circle cx="12" cy="12" r="3.1" fill="currentColor" />
    </svg>
  )
}
