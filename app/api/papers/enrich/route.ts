import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { PAPER_SELECT } from "@/lib/db/selects"
import { cookies } from "next/headers"
import {
  fetchDOI,
  fetchArxiv,
  fetchPubMed,
  preferPublishedVersionForArxiv,
  searchArxivByTitleAndAuthors,
  type FetchedMetadata,
} from "@/lib/papers/fetch-metadata"
import { persistRemotePdfForPaper } from "@/lib/papers/persist-remote-pdf"
import { discoverPdfCandidates } from "@/lib/papers/discover-pdf-url"
import { extractArxivId } from "@/lib/papers/extract-arxiv-id"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { aiSearchProvider } from "@/lib/ai/search"
import { hasAIAccess } from "@/lib/plans"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

function isArxivUrl(value: string | null | undefined): boolean {
  if (!value) return false
  return /https?:\/\/(www\.)?arxiv\.org\//i.test(value)
}

function isArxivDoi(value: string | null | undefined): boolean {
  if (!value) return false
  return /10\.48550\/arxiv\./i.test(value)
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimit = checkApiRateLimit(request, user.id, "indexing")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, billing_status, billing_grace_until, plan_renewal_at")
    .eq("id", user.id)
    .maybeSingle()

  const plan = getEffectiveBillingPlan(profile)

  const body = await request.json()
  const { paperId, fetchPdf = false } = body

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId" }, { status: 400 })
  }

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select(PAPER_SELECT)
    .eq("id", paperId)
    .single()

  if (paperError) {
    console.error("Paper lookup failed:", paperError)
    return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
  }

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 })
  }

  if (paper.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const metadata: Record<string, unknown> =
    (paper.metadata as Record<string, unknown>) || {}
  const doi: string | null = paper.doi
  const pubmedId: string | null =
    (metadata.pubmed_id as string) || null

  const arxivId: string | null = extractArxivId({
    doi: paper.doi,
    url: paper.url,
    metadata,
    title: paper.title,
    abstract: paper.abstract,
  })

  let enriched = false
  let enrichSource: string | null = null
  let fetchedData: FetchedMetadata | null = null

  const normalizedTitle = paper.title?.trim()

  // Stage 1: Run high-confidence primary lookups in parallel (DOI + arXiv)
  const stage1Lookups: { source: string; promise: Promise<FetchedMetadata | null> }[] = []

  if (doi) {
    stage1Lookups.push({ source: "doi", promise: fetchDOI(doi) })
  }
  if (arxivId) {
    stage1Lookups.push({ source: "arxiv", promise: fetchArxiv(arxivId) })
  }

  if (stage1Lookups.length > 0) {
    const settled = await Promise.allSettled(stage1Lookups.map((l) => l.promise))
    const stage1Results = new Map<string, FetchedMetadata | null>()

    stage1Lookups.forEach((lookup, i) => {
      const result = settled[i]
      if (result.status === "fulfilled") {
        stage1Results.set(lookup.source, result.value)
      }
    })

    // Prefer DOI, but check if arXiv has a better published version
    fetchedData = stage1Results.get("doi") || null

    if (
      fetchedData &&
      arxivId &&
      (isArxivDoi(doi) ||
        isArxivUrl(fetchedData.url) ||
        fetchedData.paper_type === "preprint")
    ) {
      const arxivData = stage1Results.get("arxiv")
      if (arxivData) {
        try {
          const preferredFromArxiv = await preferPublishedVersionForArxiv(
            arxivData
          )
          if (
            preferredFromArxiv &&
            ((!fetchedData.doi && preferredFromArxiv.doi) ||
              (isArxivDoi(fetchedData.doi) &&
                !isArxivDoi(preferredFromArxiv.doi)) ||
              (isArxivUrl(fetchedData.url) &&
                !!preferredFromArxiv.url &&
                !isArxivUrl(preferredFromArxiv.url)))
          ) {
            fetchedData = preferredFromArxiv
          }
        } catch {}
      }
    }

    if (!fetchedData && arxivId) {
      const arxivData = stage1Results.get("arxiv")
      if (arxivData) {
        try {
          fetchedData = await preferPublishedVersionForArxiv(arxivData)
        } catch {}
      }
    }
  }

  // Stage 2: Only run lower-confidence lookups if stage 1 found nothing
  if (!fetchedData) {
    const stage2Lookups: { source: string; promise: Promise<FetchedMetadata | null> }[] = []

    if (pubmedId) {
      stage2Lookups.push({ source: "pubmed", promise: fetchPubMed(pubmedId) })
    }
    if (normalizedTitle && normalizedTitle !== "Untitled") {
      stage2Lookups.push({
        source: "arxiv_search",
        promise: searchArxivByTitleAndAuthors(
          normalizedTitle,
          paper.authors || []
        ),
      })
    }

    if (stage2Lookups.length > 0) {
      const settled = await Promise.allSettled(stage2Lookups.map((l) => l.promise))
      const stage2Results = new Map<string, FetchedMetadata | null>()

      stage2Lookups.forEach((lookup, i) => {
        const result = settled[i]
        if (result.status === "fulfilled") {
          stage2Results.set(lookup.source, result.value)
        }
      })

      if (pubmedId) {
        fetchedData = stage2Results.get("pubmed") || null
      }

      if (!fetchedData && normalizedTitle && normalizedTitle !== "Untitled") {
        const searchData = stage2Results.get("arxiv_search")
        if (searchData) {
          try {
            fetchedData = await preferPublishedVersionForArxiv(searchData)
          } catch {}
        }
      }
    }
  }

  if (fetchedData) {
    const updates: Record<string, unknown> = {}

    if (
      (!paper.title || paper.title === "Untitled") &&
      fetchedData.title &&
      fetchedData.title !== "Untitled"
    ) {
      updates.title = fetchedData.title
    }
    if (
      (!paper.authors || paper.authors.length === 0) &&
      fetchedData.authors &&
      fetchedData.authors.length > 0
    ) {
      updates.authors = fetchedData.authors
    }
    if (!paper.year && fetchedData.year) {
      updates.year = fetchedData.year
    }
    if (!paper.abstract && fetchedData.abstract) {
      updates.abstract = fetchedData.abstract
    }
    if (
      fetchedData.url &&
      (
        !paper.url ||
        (isArxivUrl(paper.url) && !isArxivUrl(fetchedData.url))
      )
    ) {
      updates.url = fetchedData.url
    }
    if (
      fetchedData.doi &&
      (!doi || (isArxivDoi(doi) && !isArxivDoi(fetchedData.doi)))
    ) {
      updates.doi = fetchedData.doi
    }
    if (
      fetchedData.paper_type &&
      fetchedData.paper_type !== paper.paper_type &&
      (!paper.paper_type || paper.paper_type === "preprint")
    ) {
      updates.paper_type = fetchedData.paper_type
    }

    const mergedMetadata: Record<string, unknown> = {
      ...metadata,
      ...(fetchedData.metadata || {}),
    }
    if (arxivId && !mergedMetadata.arxiv_id) {
      mergedMetadata.arxiv_id = arxivId
    }
    if (Object.keys(mergedMetadata).length > 0) {
      updates.metadata = mergedMetadata
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("papers")
        .update(updates)
        .eq("id", paperId)

      if (!updateError) {
        enriched = true
        enrichSource = doi
          ? "doi"
          : arxivId
            ? "arxiv"
            : pubmedId
              ? "pubmed"
              : "arxiv_search"
      }
    }
  } else if (arxivId && !(metadata.arxiv_id)) {
    const { error: updateError } = await supabase
      .from("papers")
      .update({
        metadata: { ...metadata, arxiv_id: arxivId },
      })
      .eq("id", paperId)

    if (!updateError) {
      enriched = true
      enrichSource = "extracted"
    }
  }

  let pdfResolved = false
  let pdfSource: string | null = null

  if (fetchPdf) {
    const { data: existingFiles } = await supabase
      .from("paper_files")
      .select("id")
      .eq("paper_id", paperId)
      .eq("mime_type", "application/pdf")
      .limit(1)

    if (existingFiles && existingFiles.length > 0) {
      pdfResolved = true
      pdfSource = "already_exists"
    } else {
      const candidates = await discoverPdfCandidates({
        doi: paper.doi || fetchedData?.doi,
        url: paper.url || fetchedData?.url,
        metadata: {
          arxiv_id: arxivId || (metadata.arxiv_id as string | undefined),
          source_url: metadata.source_url as string | undefined,
        },
      })

      for (const candidate of candidates) {
        const result = await persistRemotePdfForPaper({
          supabase,
          userId: user.id,
          paperId: paper.id,
          pdfUrl: candidate.url,
          teamId: paper.team_id,
        })

        if (result.stored) {
          pdfResolved = true
          pdfSource = candidate.source
          break
        }
      }

      if (!pdfResolved && fetchedData?.pdf_url) {
        const result = await persistRemotePdfForPaper({
          supabase,
          userId: user.id,
          paperId: paper.id,
          pdfUrl: fetchedData.pdf_url,
          teamId: paper.team_id,
        })
        if (result.stored) {
          pdfResolved = true
          pdfSource = "metadata"
        }
      }
    }
  }

  let updatedPaper = paper
  if (enriched) {
    try {
      if (hasAIAccess(plan, "ai_search")) {
        await assertWithinAIUsageLimit({
          supabase,
          userId: user.id,
          plan,
          planRenewalAt: profile?.plan_renewal_at || null,
        })

        await aiSearchProvider.indexPaper(
          { ...paper, ...updatedPaper },
          supabase,
          {
            userId: user.id,
            teamId: updatedPaper.team_id,
            feature: "paper_indexing",
          }
        )
      }
    } catch {}

    const { data: fresh } = await supabase
      .from("papers")
      .select(PAPER_SELECT)
      .eq("id", paperId)
      .single()
    if (fresh) updatedPaper = fresh
  }

  return NextResponse.json({
    enriched,
    enrichSource,
    pdfResolved,
    pdfSource,
    paper: updatedPaper,
  })
}
