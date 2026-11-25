"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { AuthChangeEvent } from "@supabase/supabase-js"
import { createClient } from "@/utils/supabase/client"
import { PROFILE_SELECT } from "@/lib/db/selects"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SearchCommandDialog } from "@/components/search/search-command"
import { GlobalQuickAdd } from "@/components/papers/global-quick-add"
import type { Profile } from "@/types"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace("/login")
        return
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login")
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="app-backdrop flex h-screen w-full">
        <AppSidebar profile={profile} />
        <div className="flex flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 overflow-auto p-6">
            <Suspense fallback={null}>{children}</Suspense>
          </main>
        </div>
      </div>
      <SearchCommandDialog />
      <GlobalQuickAdd />
    </SidebarProvider>
  )
}
