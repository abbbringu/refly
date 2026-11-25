"use client"

import React, { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/utils/supabase/client"
import { FOLDER_SELECT } from "@/lib/db/selects"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

export function AppHeader() {
  const pathname = usePathname()
  const [folderPath, setFolderPath] = useState<{label: string, href: string}[]>([])

  useEffect(() => {
    const fetchFolderPath = async () => {
      const segments = pathname.split("/").filter(Boolean)
      let folderId = null
      let teamId = null

      if (segments[0] === "library" && segments[1] && !["add", "import", "recent", "favorites"].includes(segments[1])) {
        folderId = segments[1]
      } else if (segments[0] === "teams" && segments[2] === "folder" && segments[3]) {
        teamId = segments[1]
        folderId = segments[3]
      }

      if (!folderId) {
        setFolderPath([])
        return
      }

      const supabase = createClient()
      let query = supabase.from("folders").select(FOLDER_SELECT)
      query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

      const { data: folders } = await query
      if (!folders) {
        setFolderPath([])
        return
      }

      type FolderRow = { id: string; name: string; parent_id: string | null }
      const typedFolders = folders as FolderRow[]
      const folderById = new Map<string, FolderRow>(
        typedFolders.map((folder) => [folder.id, folder])
      )
      const path: { label: string; href: string }[] = []
      let currentId: string | null = folderId
       
      for (let i = 0; i < 8; i++) {
        if (!currentId) break
        const data = folderById.get(currentId)
        if (!data) break
        
        path.unshift({
          label: data.name,
          href: teamId ? `/teams/${teamId}/folder/${data.id}` : `/library/${data.id}`
        })
        currentId = data.parent_id
      }
      
      setFolderPath(path)
    }
    
    fetchFolderPath()
  }, [pathname])

  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean)
    const crumbs: { label: string; href?: string }[] = []

    if (segments[0] === "library") {
      crumbs.push({ label: "Library", href: "/library" })
      if (segments[1] === "add") crumbs.push({ label: "Add Paper" })
      else if (segments[1] === "import") crumbs.push({ label: "Import" })
      else if (segments[1] === "recent") crumbs.push({ label: "Recently Added" })
      else if (segments[1] === "favorites") crumbs.push({ label: "Favorites" })
      else if (segments[1] && folderPath.length > 0) {
        crumbs.push(...folderPath)
      } else if (segments[1] && folderPath.length === 0) {
        // Fallback before query completes
        crumbs.push({ label: "Folder", href: `/library/${segments[1]}` })
      }
    } else if (segments[0] === "paper") {
      crumbs.push({ label: "Library", href: "/library" })
      crumbs.push({ label: "Paper Details" })
    } else if (segments[0] === "teams") {
      crumbs.push({ label: "Teams", href: "/teams" })
      if (segments[1] && segments[2] !== "folder") {
         crumbs.push({ label: "Team", href: `/teams/${segments[1]}` })
      } 
      if (segments[2] === "settings") crumbs.push({ label: "Settings" })
      if (segments[2] === "folder") {
         crumbs.push({ label: "Team", href: `/teams/${segments[1]}` })
         if (folderPath.length > 0) crumbs.push(...folderPath)
         else crumbs.push({ label: "Folder", href: `/teams/${segments[1]}/folder/${segments[3]}` })
      }
    }

    return crumbs
  }

  const crumbs = getBreadcrumbs()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b glass-1 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <React.Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {!isLast && crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground md:flex glass-hover"
        onClick={() => {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true }),
          )
        }}
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
        <kbd className="ml-2 inline-flex h-5 items-center rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </Button>
    </header>
  )
}
