"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { FOLDER_SELECT, PAPER_SEARCH_SELECT } from "@/lib/db/selects"
import type { Folder as FolderType, Paper, Team } from "@/types"
import { getMapIcon } from "@/lib/entity-appearance"
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Folder,
  FileText,
  Search,
  Settings2,
  Users,
} from "lucide-react"

interface ChatContextSelectorProps {
  selectedFolders: string[]
  setSelectedFolders: (ids: string[]) => void
  selectedPapers: string[]
  setSelectedPapers: (ids: string[]) => void
  contextTeam: string
  setContextTeam: (id: string) => void
  teams: Team[]
}

interface PaperFolderRelation {
  paper_id: string
  folder_id: string
}

export function ChatContextSelector({
  selectedFolders,
  setSelectedFolders,
  selectedPapers,
  setSelectedPapers,
  contextTeam,
  setContextTeam,
  teams,
}: ChatContextSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  
  const [folders, setFolders] = useState<FolderType[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [relations, setRelations] = useState<PaperFolderRelation[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch data when team context changes
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const supabase = createClient()
      
      const folderQuery = supabase.from("folders").select(FOLDER_SELECT).order("position")
      const paperQuery = supabase.from("papers").select(PAPER_SEARCH_SELECT).order("created_at", { ascending: false }).limit(200)
      
      if (contextTeam === "personal") {
        folderQuery.is("team_id", null)
        paperQuery.is("team_id", null)
      } else {
        folderQuery.eq("team_id", contextTeam)
        paperQuery.eq("team_id", contextTeam)
      }

      const [foldersRes, papersRes, relsRes] = await Promise.all([
        folderQuery,
        paperQuery,
        supabase.from("paper_folders").select("paper_id, folder_id")
      ])
      
      if (foldersRes.data) setFolders(foldersRes.data)
      if (papersRes.data) setPapers(papersRes.data as Paper[])
      if (relsRes.data) setRelations(relsRes.data)
      
      setLoading(false)
    }
    
    if (open) {
      loadData()
    }
  }, [contextTeam, open])

  // Build tree structure
  const rootFolders = folders.filter((f) => !f.parent_id)
  
  const getSubFolders = (parentId: string) => folders.filter((f) => f.parent_id === parentId)
  
  const getFolderPapers = (folderId: string) => {
    const paperIds = relations.filter(r => r.folder_id === folderId).map(r => r.paper_id)
    return papers.filter(p => paperIds.includes(p.id))
  }

  const getUncategorizedPapers = () => {
    const categorizedIds = new Set(relations.map(r => r.paper_id))
    return papers.filter(p => !categorizedIds.has(p.id))
  }

  const toggleFolder = (folderId: string, checked: boolean) => {
    if (checked) {
      setSelectedFolders([...selectedFolders, folderId])
    } else {
      setSelectedFolders(selectedFolders.filter(id => id !== folderId))
    }
  }

  const togglePaper = (paperId: string, checked: boolean) => {
    if (checked) {
      setSelectedPapers([...selectedPapers, paperId])
    } else {
      setSelectedPapers(selectedPapers.filter(id => id !== paperId))
    }
  }

  // Filter items by search
  const matchesSearch = (text: string) => {
    if (!search) return true
    return text.toLowerCase().includes(search.toLowerCase())
  }

  const renderFolderNode = (folder: FolderType, depth = 0) => {
    const subs = getSubFolders(folder.id)
    const folderPapers = getFolderPapers(folder.id)
    
    const hasMatchingContent = matchesSearch(folder.name) || 
      folderPapers.some(p => matchesSearch(p.title)) ||
      subs.some(s => matchesSearch(s.name))

    if (!hasMatchingContent && search) return null

    const isSelected = selectedFolders.includes(folder.id)
    const Icon = getMapIcon(folder.icon)
    const iconColor = folder.color ?? undefined
    
    return (
      <div key={folder.id} className="flex flex-col">
        <div 
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <Checkbox 
            checked={isSelected} 
            onCheckedChange={(c) => toggleFolder(folder.id, !!c)} 
            className="w-4 h-4 rounded-[4px]"
          />
          <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor }} />
          <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
        </div>
        
        {/* Render Subfolders */}
        {subs.map(s => renderFolderNode(s, depth + 1))}
        
        {/* Render Papers inside this folder */}
        {folderPapers.map(paper => {
          if (!matchesSearch(paper.title) && search) return null
          const isPaperSelected = selectedPapers.includes(paper.id)
          return (
            <div 
              key={paper.id}
              className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <Checkbox 
                checked={isPaperSelected || isSelected} 
                disabled={isSelected} // disabled because selecting folder implies selecting paper
                onCheckedChange={(c) => togglePaper(paper.id, !!c)}
                className="w-4 h-4 rounded-[4px]" 
              />
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate flex-1" title={paper.title}>
                {paper.title}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const uncategorized = getUncategorizedPapers()
  const totalSelected = selectedFolders.length + selectedPapers.length
  const searchModeLabel = totalSelected === 0 ? "Everything" : `${totalSelected} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 bg-background border-border/60 hover:bg-muted/50">
          <Settings2 className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-muted-foreground">Context:</span>
          <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 ml-1 h-5 px-1.5 rounded-sm">
            {totalSelected === 0 ? "Everything" : `${totalSelected} Selected`}
          </Badge>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent align="start" className="w-[360px] p-0 shadow-xl border-border/60" sideOffset={8}>
        {/* Header - Workspace Selector */}
        <div className="p-3 border-b bg-muted/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold tracking-tight">Select Context</h4>
            {totalSelected > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedFolders([])
                  setSelectedPapers([])
                }}
              >
                Clear all
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <select 
              className="text-sm bg-transparent border-none outline-none focus:ring-0 w-full text-foreground font-medium cursor-pointer"
              value={contextTeam}
              onChange={(e) => {
                setContextTeam(e.target.value)
                setSelectedFolders([])
                setSelectedPapers([])
              }}
            >
              <option value="personal">Personal Workspace</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search folders and papers..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-background border-border/60"
            />
          </div>
        </div>

        <ScrollArea className="h-[300px] p-2">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
              Loading workspace...
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* Root Folders */}
              {rootFolders.map(folder => renderFolderNode(folder))}
              
              {/* Uncategorized Papers */}
              {uncategorized.map(paper => {
                if (!matchesSearch(paper.title) && search) return null
                const isPaperSelected = selectedPapers.includes(paper.id)
                return (
                  <div key={paper.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md">
                    <Checkbox 
                      checked={isPaperSelected} 
                      onCheckedChange={(c) => togglePaper(paper.id, !!c)}
                      className="w-4 h-4 rounded-[4px]" 
                    />
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground truncate flex-1" title={paper.title}>
                      {paper.title}
                    </span>
                  </div>
                )
              })}
              
              {!loading && folders.length === 0 && papers.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No folders or papers found in this workspace.
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        
        <div className="p-2 border-t bg-muted/10">
          <div className="mb-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-[11px] text-muted-foreground">
            Mode: <span className="font-medium text-foreground">{searchModeLabel}</span>
            {totalSelected === 0 ? (
              <span> · broad retrieval, higher token usage</span>
            ) : (
              <span> · narrower retrieval, lower token usage</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-2">
            AI will only search through the folders and papers you explicitly select. If nothing is selected, the entire workspace is searched.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
