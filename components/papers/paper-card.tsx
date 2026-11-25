"use client"

import Link from "next/link"
import type { Paper } from "@/types"
import { createClient } from "@/utils/supabase/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, ExternalLink, FileText } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface PaperCardProps {
  paper: Paper
  onRefresh: () => void
  onPaperUpdated: (paperId: string, updates: Partial<Paper>) => void
  selected?: boolean
  onSelect?: (id: string, e: React.MouseEvent) => void
}

export function PaperCard({ paper, onRefresh, onPaperUpdated, selected, onSelect }: PaperCardProps) {
  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newValue = !paper.is_favorite
    onPaperUpdated(paper.id, { is_favorite: newValue })

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .update({ is_favorite: newValue })
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to update")
      onRefresh()
    }
  }

  const handleQuickViewPdf = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const supabase = createClient()
    const { data: file, error: fileError } = await supabase
      .from("paper_files")
      .select("file_path")
      .eq("paper_id", paper.id)
      .eq("mime_type", "application/pdf")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (fileError) {
      toast.error("Could not open PDF")
      return
    }

    if (!file?.file_path) {
      toast.info("No PDF — open the paper to attach or find one")
      return
    }

    const { data: signedData, error: signedUrlError } = await supabase.storage
      .from("papers")
      .createSignedUrl(file.file_path, 3600)

    if (signedUrlError || !signedData?.signedUrl) {
      toast.error("Could not open PDF")
      return
    }

    window.open(signedData.signedUrl, "_blank")
  }

  return (
    <div
      onClick={(e) => {
        if (onSelect) {
          e.preventDefault()
          onSelect(paper.id, e)
        }
      }}
      className="relative"
    >
      <Link href={`/paper/${paper.id}`}>
        <Card className={`group h-full transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${selected ? "ring-2 ring-primary border-primary" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] capitalize"
            >
              {paper.paper_type}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleToggleFavorite}
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  paper.is_favorite
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground"
                }`}
              />
            </Button>
          </div>
          <CardTitle className="line-clamp-2 text-base leading-snug">
            {paper.title}
          </CardTitle>
          <CardDescription className="line-clamp-1 text-xs">
            {paper.authors?.slice(0, 3).join(", ")}
            {paper.authors?.length > 3 ? " et al." : ""}
            {paper.year ? ` · ${paper.year}` : ""}
          </CardDescription>
        </CardHeader>
        {paper.abstract && (
          <CardContent className="pb-3">
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {paper.abstract}
            </p>
          </CardContent>
        )}
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(paper.created_at), {
              addSuffix: true,
            })}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleQuickViewPdf}
            >
              <FileText className="mr-1 h-3 w-3" />
              PDF
            </Button>
            {paper.doi && <ExternalLink className="h-3 w-3" />}
          </div>
        </CardFooter>
      </Card>
      </Link>
      {onSelect && (
        <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect(paper.id, {} as React.MouseEvent)}
            className="bg-background/80 backdrop-blur-sm"
          />
        </div>
      )}
    </div>
  )
}
