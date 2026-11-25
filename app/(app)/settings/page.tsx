"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/utils/supabase/client"
import { PROFILE_SELECT } from "@/lib/db/selects"
import type { AIUsageFeature, AIUsageSummary, Profile } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  CreditCard,
  CheckCircle2,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Save,
  Sparkles,
  Sun,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatBytes,
  getStorageUsage,
  type StorageUsage,
} from "@/lib/storage/quota"
import { PlanCtaButton } from "@/components/billing/plan-cta-button"
import { ManageBillingButton } from "@/components/billing/manage-billing-button"
import { CancelToFreeDialog } from "@/components/billing/cancel-to-free-dialog"
import { AIDataNotice } from "@/components/ai/ai-data-notice"
import {
  ACCENT_THEMES,
  type AccentTheme,
  useAccentTheme,
} from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { CHAT_MODEL_OPTIONS } from "@/lib/ai/openai"
import { isValidChatModel } from "@/types"
import { BILLING_PLAN_DETAILS } from "@/lib/billing/plans"
import { useBilling } from "@/hooks/use-billing"
import { isSelfHostedMode } from "@/lib/config/self-hosted"

type AIUsageDisplayGroup =
  | "chat"
  | "citations"
  | "ai_search"
  | "paper_processing"

const AI_USAGE_GROUP_LABELS: Record<AIUsageDisplayGroup, string> = {
  chat: "Chat",
  citations: "AI Citations",
  ai_search: "AI Search",
  paper_processing: "Paper Processing",
}

const AI_USAGE_FEATURE_GROUPS: Record<AIUsageFeature, AIUsageDisplayGroup> = {
  chat_response: "chat",
  chat_retrieval: "chat",
  ai_citation: "citations",
  ai_search: "ai_search",
  paper_auto_tag: "paper_processing",
  paper_auto_summary: "paper_processing",
  paper_indexing: "paper_processing",
  paper_chunk_indexing: "paper_processing",
}

const DEFAULT_PAPER_SUMMARY_MODEL = "openai/gpt-4o-mini"
const PAPER_SUMMARY_MODEL_STORAGE_KEY = "refly.paperSummaryModel"

const ACCENT_THEME_DETAILS: Record<
  AccentTheme,
  { label: string; chipClassName: string; buttonClassName: string }
> = {
  blue: {
    label: "Blue",
    chipClassName: "bg-[oklch(0.52_0.105_223.128)]",
    buttonClassName:
      "bg-[oklch(0.52_0.105_223.128_/_0.12)] border-[oklch(0.52_0.105_223.128_/_0.3)]",
  },
  emerald: {
    label: "Emerald",
    chipClassName: "bg-[oklch(0.56_0.14_157)]",
    buttonClassName:
      "bg-[oklch(0.56_0.14_157_/_0.12)] border-[oklch(0.56_0.14_157_/_0.3)]",
  },
  amber: {
    label: "Amber",
    chipClassName: "bg-[oklch(0.68_0.16_75)]",
    buttonClassName:
      "bg-[oklch(0.68_0.16_75_/_0.13)] border-[oklch(0.68_0.16_75_/_0.35)]",
  },
  rose: {
    label: "Rose",
    chipClassName: "bg-[oklch(0.62_0.2_20)]",
    buttonClassName:
      "bg-[oklch(0.62_0.2_20_/_0.12)] border-[oklch(0.62_0.2_20_/_0.35)]",
  },
  cyan: {
    label: "Cyan",
    chipClassName: "bg-[oklch(0.66_0.14_210)]",
    buttonClassName:
      "bg-[oklch(0.66_0.14_210_/_0.12)] border-[oklch(0.66_0.14_210_/_0.32)]",
  },
  violet: {
    label: "Violet",
    chipClassName: "bg-[oklch(0.58_0.17_290)]",
    buttonClassName:
      "bg-[oklch(0.58_0.17_290_/_0.12)] border-[oklch(0.58_0.17_290_/_0.32)]",
  },
  lime: {
    label: "Lime",
    chipClassName: "bg-[oklch(0.76_0.19_130)]",
    buttonClassName:
      "bg-[oklch(0.76_0.19_130_/_0.14)] border-[oklch(0.76_0.19_130_/_0.36)]",
  },
  coral: {
    label: "Coral",
    chipClassName: "bg-[oklch(0.66_0.2_38)]",
    buttonClassName:
      "bg-[oklch(0.66_0.2_38_/_0.12)] border-[oklch(0.66_0.2_38_/_0.34)]",
  },
}

type SettingsSection = {
  id: "general" | "appearance" | "ai" | "billing" | "usage"
  label: string
  description: string
  icon: LucideIcon
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    label: "General",
    description: "Profile and security",
    icon: User,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Mode and accent color",
    icon: Palette,
  },
  {
    id: "ai",
    label: "AI",
    description: "Model preferences",
    icon: Sparkles,
  },
  {
    id: "billing",
    label: "Plan & Billing",
    description: "Subscription and renewals",
    icon: CreditCard,
  },
  {
    id: "usage",
    label: "Usage",
    description: "Storage and AI activity",
    icon: Sparkles,
  },
]

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAIPreferences, setSavingAIPreferences] = useState(false)
  const [resumingSubscription, setResumingSubscription] = useState(false)
  const [cancelToFreeOpen, setCancelToFreeOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null)
  const [aiUsage, setAIUsage] = useState<AIUsageSummary | null>(null)
  const [billingBanner, setBillingBanner] = useState<
    "success" | "cancelled" | null
  >(null)
  const [activeSection, setActiveSection] =
    useState<SettingsSection["id"]>("general")
  const [paperSummaryModel, setPaperSummaryModel] = useState<string>(
    DEFAULT_PAPER_SUMMARY_MODEL
  )
  const { theme, setTheme } = useTheme()
  const { accentTheme, setAccentTheme } = useAccentTheme()
  const billing = useBilling()
  const selfHosted = isSelfHostedMode()
  const visibleSections = selfHosted
    ? SETTINGS_SECTIONS.filter((section) => section.id !== "billing")
    : SETTINGS_SECTIONS

  useEffect(() => {
    const load = async () => {
      const checkoutSessionId = new URLSearchParams(window.location.search).get(
        "session_id"
      )
      const billingResult = new URLSearchParams(window.location.search).get(
        "billing"
      )
      if (billingResult === "cancelled") {
        setBillingBanner("cancelled")
        window.history.replaceState(null, "", "/settings")
      }
      if (checkoutSessionId) {
        try {
          const response = await fetch("/api/billing/sync-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: checkoutSessionId }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to sync checkout")
          }
          setBillingBanner("success")
          toast.success("Billing updated")
          window.history.replaceState(null, "", "/settings")
        } catch (syncError: unknown) {
          const message =
            syncError instanceof Error ? syncError.message : "Unknown error"
          toast.error("Could not sync billing", { description: message })
        }
      }

      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .single()
      if (data) {
        setProfile(data)
        setFullName(data.full_name || "")
        const preferredModel = data.paper_summary_model
        const localFallbackModel =
          typeof window !== "undefined"
            ? window.localStorage.getItem(PAPER_SUMMARY_MODEL_STORAGE_KEY)
            : null
        setPaperSummaryModel(
          typeof preferredModel === "string" && isValidChatModel(preferredModel)
            ? preferredModel
            : typeof localFallbackModel === "string" &&
                isValidChatModel(localFallbackModel)
              ? localFallbackModel
              : DEFAULT_PAPER_SUMMARY_MODEL
        )
      }

      try {
        const usage = await getStorageUsage(supabase)
        setStorageUsage(usage)
      } catch (usageError: unknown) {
        const message =
          usageError instanceof Error ? usageError.message : "Unknown error"
        toast.error("Could not load storage usage", {
          description: message,
        })
      }

      try {
        const response = await fetch("/api/settings/ai-usage")
        if (!response.ok) {
          throw new Error("Failed to load AI usage")
        }
        const { data: aiUsageData } = await response.json()
        setAIUsage(aiUsageData || null)
      } catch (aiUsageError: unknown) {
        const message =
          aiUsageError instanceof Error ? aiUsageError.message : "Unknown error"
        toast.error("Could not load AI usage", {
          description: message,
        })
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id as SettingsSection["id"]
            setActiveSection(id)
          }
        }
      },
      {
        rootMargin: "-25% 0px -60% 0px",
        threshold: 0.1,
      }
    )

    for (const section of SETTINGS_SECTIONS) {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [loading])

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile.id)

    if (error) {
      toast.error("Failed to save")
    } else {
      toast.success("Profile updated")
    }
    setSaving(false)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const handlePasswordChange = async () => {
    window.location.href = "/forgot-password"
  }

  const handleSaveAIPreferences = async () => {
    if (!profile) return

    if (!isValidChatModel(paperSummaryModel)) {
      toast.error("Invalid model selection")
      return
    }

    setSavingAIPreferences(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ paper_summary_model: paperSummaryModel })
      .eq("id", profile.id)

    if (error) {
      const missingColumn =
        error.code === "42703" || error.message.includes("paper_summary_model")
      if (missingColumn) {
        window.localStorage.setItem(
          PAPER_SUMMARY_MODEL_STORAGE_KEY,
          paperSummaryModel
        )
        toast.success("AI preferences saved locally")
      } else {
        toast.error("Failed to save AI preferences")
      }
    } else {
      window.localStorage.setItem(
        PAPER_SUMMARY_MODEL_STORAGE_KEY,
        paperSummaryModel
      )
      toast.success("AI preferences saved")
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              paper_summary_model: paperSummaryModel,
            }
          : prev
      )
    }
    setSavingAIPreferences(false)
  }

  const handleResumeSubscription = async () => {
    setResumingSubscription(true)
    try {
      const response = await fetch("/api/billing/resume", { method: "POST" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to resume subscription")
      }
      toast.success("Subscription resumed")
      setProfile((prev) =>
        prev ? { ...prev, cancel_at_period_end: false } : prev
      )
      await billing.refetch()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to resume subscription"
      toast.error("Could not resume subscription", { description: message })
    } finally {
      setResumingSubscription(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const initials = fullName
    ? fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (profile?.email?.slice(0, 2).toUpperCase() ?? "?")

  const usedBytes = storageUsage?.total_bytes || 0
  const limitBytes = storageUsage?.limit_bytes ?? null
  const remainingBytes = storageUsage?.remaining_bytes ?? null
  const usagePercent = limitBytes
    ? Math.min((usedBytes / limitBytes) * 100, 100)
    : 0
  const aiUsageWindowStart = aiUsage?.windowStart
    ? new Date(aiUsage.windowStart).toLocaleDateString()
    : null
  const aiUsageWindowEnd = aiUsage?.windowEnd
    ? new Date(aiUsage.windowEnd).toLocaleDateString()
    : null

  const formatTokens = (value: number) => value.toLocaleString()
  const formatUsd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value)
  const aiUsageCapPercent = aiUsage?.limit.monthlyLimitUsd
    ? Math.min(
        (aiUsage.limit.currentUsageUsd / aiUsage.limit.monthlyLimitUsd) * 100,
        100
      )
    : 0
  const totalEstimatedCostUsd = aiUsage?.totals.estimatedCostUsd || 0
  const aiBudgetLimitUsd = aiUsage?.limit.monthlyLimitUsd || 0
  const aiRemainingBudgetPercent = aiBudgetLimitUsd
    ? Math.max(0, 100 - aiUsageCapPercent)
    : 0
  const formatPercent = (value: number) => `${Math.round(value)}%`
  const aggregatedAIUsage = aiUsage
    ? Array.from(
        aiUsage.byFeature.reduce(
          (map, item) => {
            const group = AI_USAGE_FEATURE_GROUPS[item.feature]
            const existing = map.get(group) || {
              group,
              label: AI_USAGE_GROUP_LABELS[group],
              requestCount: 0,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              topModels: [] as string[],
            }

            existing.requestCount += item.requestCount
            existing.promptTokens += item.promptTokens
            existing.completionTokens += item.completionTokens
            existing.totalTokens += item.totalTokens
            existing.estimatedCostUsd += item.estimatedCostUsd
            for (const model of item.topModels) {
              if (!existing.topModels.includes(model)) {
                existing.topModels.push(model)
              }
            }

            existing.topModels = existing.topModels.slice(0, 3)
            map.set(group, existing)
            return map
          },
          new Map<
            AIUsageDisplayGroup,
            {
              group: AIUsageDisplayGroup
              label: string
              requestCount: number
              promptTokens: number
              completionTokens: number
              totalTokens: number
              estimatedCostUsd: number
              topModels: string[]
            }
          >()
        )
      )
        .map(([, item]) => item)
        .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    : []
  const currentBillingPlan = billing.plan
  const currentBillingPlanDetails = BILLING_PLAN_DETAILS[currentBillingPlan]
  const renewalDateLabel = billing.renewalDate
    ? new Date(billing.renewalDate).toLocaleDateString()
    : null
  const pendingBillingPlanDetails = billing.pendingPlan
    ? BILLING_PLAN_DETAILS[billing.pendingPlan]
    : null
  const pendingBillingEffectiveDate = billing.pendingPlanEffectiveAt
    ? new Date(billing.pendingPlanEffectiveAt).toLocaleDateString()
    : renewalDateLabel
  const billingStatus =
    billing.billingStatus ||
    (currentBillingPlan === "free" ? "Not subscribed" : "Active")

  const handleSectionNav = (sectionId: SettingsSection["id"]) => {
    const target = document.getElementById(sectionId)
    if (!target) return
    setActiveSection(sectionId)
    target.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {billingBanner ? (
        <div
          className={cn(
            "glass-1 flex items-start gap-3 rounded-2xl border p-4 text-sm",
            billingBanner === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          )}
        >
          {billingBanner === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {billingBanner === "success"
                ? `Welcome to ${currentBillingPlanDetails.name}`
                : "Subscription setup was cancelled"}
            </p>
            <p className="mt-1 opacity-80">
              {billingBanner === "success"
                ? "Your subscription is active and your plan limits have been updated."
                : "No billing changes were made."}
            </p>
          </div>
          <button
            className="text-xs font-medium underline"
            onClick={() => setBillingBanner(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account and preferences.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleSignOut}
          disabled={signingOut}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {signingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          Sign out
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8 lg:gap-10">
        <aside className="md:sticky md:top-24 md:self-start">
          <div className="glass-1 rounded-2xl border border-border/50 bg-background/70 p-3 backdrop-blur-sm">
            <p className="px-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Jump to section
            </p>
            <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
              {visibleSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSectionNav(section.id)}
                    className={cn(
                      "flex min-w-fit items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors md:min-w-0",
                      isActive
                        ? "bg-primary/12 text-foreground ring-1 ring-primary/25"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium">
                        {section.label}
                      </span>
                      <span className="block text-xs opacity-80">
                        {section.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

        <div className="w-full min-w-0 space-y-12">
          <div id="general" className="scroll-mt-24 space-y-6">
            {/* Profile */}
            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
                <CardDescription>
                  Your public profile information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-lg text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{fullName || "No name set"}</p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.email}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="glass-1"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={profile?.email || ""}
                    disabled
                    className="glass-1 opacity-60"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed.
                  </p>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="glass-hover"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
            {/* Security */}
            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">Security</CardTitle>
                <CardDescription>
                  Manage your password and account security.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={handlePasswordChange}
                  className="glass-hover"
                >
                  Reset password
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  We&apos;ll send a password reset link to your email.
                </p>
              </CardContent>
            </Card>
          </div>

          <div id="appearance" className="scroll-mt-24 space-y-6">
            {/* Appearance */}
            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>
                  Choose your interface mode and color theme.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Mode
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant={theme === "light" ? "default" : "outline"}
                      className="glass-hover justify-start"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="mr-2 h-4 w-4" />
                      Light
                    </Button>
                    <Button
                      type="button"
                      variant={theme === "dark" ? "default" : "outline"}
                      className="glass-hover justify-start"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="mr-2 h-4 w-4" />
                      Dark
                    </Button>
                    <Button
                      type="button"
                      variant={theme === "system" ? "default" : "outline"}
                      className="glass-hover justify-start"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="mr-2 h-4 w-4" />
                      System
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Color theme
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {ACCENT_THEMES.map((item) => {
                      const details = ACCENT_THEME_DETAILS[item]
                      const selected = accentTheme === item

                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAccentTheme(item)}
                          className={cn(
                            "glass-1 flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                            details.buttonClassName,
                            selected
                              ? "text-foreground ring-1 ring-primary/40"
                              : "text-foreground/90 hover:text-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "h-3 w-3 rounded-full",
                              details.chipClassName
                            )}
                          />
                          <span className="font-medium">{details.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Palette className="h-3.5 w-3.5" />
                    Theme applies instantly and is saved for your next visit.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div id="ai" className="scroll-mt-24 space-y-6">
            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">AI Preferences</CardTitle>
                <CardDescription>
                  Choose which model generates Paper AI Summary &amp; Notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AIDataNotice>
                  AI features may send paper metadata, abstracts, extracted PDF
                  text, notes, chat messages, and search queries to OpenAI,
                  OpenRouter, and routed model providers. Avoid using AI
                  features for content you do not want processed by those
                  providers.
                </AIDataNotice>
                <div className="space-y-2">
                  <Label htmlFor="paper-summary-model">
                    Paper summary model
                  </Label>
                  <Select
                    value={paperSummaryModel}
                    onValueChange={setPaperSummaryModel}
                  >
                    <SelectTrigger id="paper-summary-model" className="glass-1">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHAT_MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This model is used when generating paper-level AI summary
                    notes.
                  </p>
                </div>

                <Button
                  onClick={handleSaveAIPreferences}
                  disabled={savingAIPreferences}
                  className="glass-hover"
                >
                  {savingAIPreferences ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save AI Preferences
                </Button>
              </CardContent>
            </Card>
          </div>

          {!selfHosted && (
            <div id="billing" className="scroll-mt-24 space-y-6">
              <Card className="glass-2">
                <CardHeader>
                  <CardTitle className="text-base">Billing</CardTitle>
                  <CardDescription>
                    Manage your subscription, renewals, and plan changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="glass-1 rounded-2xl border border-border/50 bg-primary/5 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <p className="text-lg font-semibold text-foreground">
                            {currentBillingPlanDetails.name} Plan
                          </p>
                          <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                            {billingStatus}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {currentBillingPlanDetails.priceLabel} ·{" "}
                          {currentBillingPlanDetails.storageLabel} storage ·{" "}
                          {currentBillingPlanDetails.aiBudgetLabel}
                        </p>
                        {renewalDateLabel ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Next billing date: {renewalDateLabel}
                          </p>
                        ) : null}
                        {pendingBillingPlanDetails ? (
                          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                            {currentBillingPlanDetails.name} stays active now.{" "}
                            {pendingBillingPlanDetails.name} starts on{" "}
                            {pendingBillingEffectiveDate || "your renewal date"}.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-w-[180px] flex-col gap-2">
                        {pendingBillingPlanDetails ? (
                          <Button variant="outline" disabled>
                            {pendingBillingPlanDetails.name} scheduled
                          </Button>
                        ) : currentBillingPlan !== "pro" ? (
                          <PlanCtaButton
                            plan={currentBillingPlan === "free" ? "plus" : "pro"}
                            cta={
                              currentBillingPlan === "free"
                                ? "Upgrade to Plus"
                                : "Upgrade to Pro"
                            }
                            featured
                          />
                        ) : (
                          <PlanCtaButton plan="plus" cta="Downgrade to Plus" />
                        )}
                        {billing.stripeCustomerId ? (
                          <>
                            <ManageBillingButton label="Manage payment" />
                            {currentBillingPlan !== "free" &&
                            !billing.cancelAtPeriodEnd &&
                            billing.pendingPlan !== "free" ? (
                              <Button
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                                onClick={() => setCancelToFreeOpen(true)}
                              >
                                Cancel to Free
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {(billing.cancelAtPeriodEnd ||
                      billing.pendingPlan === "free") && (
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">
                          Your subscription will cancel at the end of the current
                          billing period.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button
                            size="sm"
                            onClick={handleResumeSubscription}
                            disabled={resumingSubscription}
                          >
                            {resumingSubscription ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Resume subscription
                          </Button>
                          <span className="text-xs opacity-80">
                            You can still manage cancellation and payment methods
                            in Stripe.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {currentBillingPlan !== "free" ? (
                    <CancelToFreeDialog
                      open={cancelToFreeOpen}
                      onOpenChange={setCancelToFreeOpen}
                      currentPlan={currentBillingPlan}
                      renewalDate={billing.renewalDate}
                      onChanged={async () => {
                        setProfile((prev) =>
                          prev ? { ...prev, cancel_at_period_end: true } : prev
                        )
                        await billing.refetch()
                      }}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          <div id="usage" className="scroll-mt-24 space-y-6">
            {/* Storage and Plan */}
            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">Storage Usage</CardTitle>
                <CardDescription>
                  Files, notes, paper metadata, and chat history count toward
                  your plan quota.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="glass-1 rounded-xl border border-border/40 bg-primary/5 p-4">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {selfHosted ? "Deployment mode" : "Current plan"}
                  </p>
                  <p className="mt-1 text-base font-semibold capitalize">
                    {selfHosted ? "Self-hosted (Unlimited)" : storageUsage?.plan || billing.plan}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">Total used</p>
                    <p className="text-xs text-muted-foreground">
                      {limitBytes === null
                        ? "Unlimited"
                        : `${formatBytes(limitBytes)} limit`}
                    </p>
                  </div>
                  <p className="text-2xl font-bold">{formatBytes(usedBytes)}</p>
                  {limitBytes !== null && (
                    <Progress
                      value={usagePercent}
                      className="h-2 border border-border/60 bg-muted/70 [&>div]:bg-primary/70"
                    />
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Used: {formatBytes(usedBytes)}</span>
                    <span>
                      Left:{" "}
                      {remainingBytes === null
                        ? "Unlimited"
                        : formatBytes(remainingBytes)}
                    </span>
                  </div>
                  {storageUsage?.is_over_limit && (
                    <p className="text-xs text-red-600">
                      You are currently above your plan storage limit.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                    <p className="text-[11px] tracking-wide uppercase">Files</p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatBytes(storageUsage?.file_bytes || 0)}
                    </p>
                  </div>
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                    <p className="text-[11px] tracking-wide uppercase">Notes</p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatBytes(storageUsage?.note_bytes || 0)}
                    </p>
                  </div>
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                    <p className="text-[11px] tracking-wide uppercase">
                      Metadata
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatBytes(storageUsage?.metadata_bytes || 0)}
                    </p>
                  </div>
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                    <p className="text-[11px] tracking-wide uppercase">
                      Chat history
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatBytes(storageUsage?.chat_bytes || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-2">
              <CardHeader>
                <CardTitle className="text-base">AI Usage</CardTitle>
                <CardDescription>
                  Estimated AI requests, token usage, and model cost by feature.
                  {aiUsageWindowStart && aiUsageWindowEnd
                    ? ` Current billing month: ${aiUsageWindowStart} to ${aiUsageWindowEnd}.`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="glass-1 rounded-xl border border-border/40 bg-primary/5 p-4">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      Budget used
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {formatPercent(aiUsageCapPercent)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cost: {formatUsd(aiUsage?.limit.currentUsageUsd || 0)}
                    </p>
                  </div>
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 p-4">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      Estimated cost
                    </p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {formatUsd(totalEstimatedCostUsd)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {aiBudgetLimitUsd
                        ? `${formatPercent((totalEstimatedCostUsd / aiBudgetLimitUsd) * 100)} of limit`
                        : "No monthly cap"}
                    </p>
                  </div>
                  <div className="glass-1 rounded-xl border border-border/40 bg-background/50 p-4">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      Budget left
                    </p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {formatPercent(aiRemainingBudgetPercent)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cost left: {formatUsd(aiUsage?.limit.remainingUsd || 0)}
                    </p>
                  </div>
                </div>

                {aiUsage && !selfHosted ? (
                  <div className="glass-1 rounded-xl border border-border/40 bg-primary/5 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                          Monthly AI budget
                        </p>
                        <p className="mt-1 text-base font-semibold text-foreground capitalize">
                          {aiUsage.limit.plan} plan
                        </p>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {formatUsd(aiUsage.limit.currentUsageUsd)} /{" "}
                        {formatUsd(aiUsage.limit.monthlyLimitUsd)}
                      </p>
                    </div>
                    <Progress
                      value={aiUsageCapPercent}
                      className="mt-3 h-2 border border-border/60 bg-muted/70 [&>div]:bg-primary/70"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Remaining: {formatUsd(aiUsage.limit.remainingUsd)}
                      </span>
                      <span>Resets monthly</span>
                    </div>
                    {aiUsage.limit.isExceeded ? (
                      <p className="mt-2 text-xs text-red-600">
                        You&apos;ve reached this month&apos;s AI usage cap for
                        your plan.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      Where tokens are going
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Each chat turn can create multiple AI requests, for
                      example one retrieval embedding request and one response
                      generation request. AI requests may include workspace
                      content needed for the selected feature, such as PDF
                      excerpts, notes, metadata, search queries, and chat
                      history. Cost is estimated from recorded model pricing and
                      token counts.
                    </p>
                  </div>
                  {aggregatedAIUsage.length > 0 ? (
                    <div className="space-y-2">
                      {aggregatedAIUsage.map((item) => (
                        <div
                          key={item.group}
                          className="glass-1 rounded-xl border border-border/40 bg-background/50 p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                {item.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Cost: {formatUsd(item.estimatedCostUsd)}
                                {" · "}
                                {item.requestCount} request
                                {item.requestCount === 1 ? "" : "s"}
                                {item.topModels.length > 0
                                  ? ` · ${item.topModels.join(", ")}`
                                  : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-foreground">
                                {formatPercent(
                                  totalEstimatedCostUsd
                                    ? (item.estimatedCostUsd /
                                        totalEstimatedCostUsd) *
                                        100
                                    : 0
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                of AI spend
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <div>
                              <p className="tracking-wide uppercase">
                                Input tokens
                              </p>
                              <p className="mt-1 text-sm font-medium text-foreground">
                                {formatTokens(item.promptTokens)}
                              </p>
                            </div>
                            <div>
                              <p className="tracking-wide uppercase">
                                Output tokens
                              </p>
                              <p className="mt-1 text-sm font-medium text-foreground">
                                {formatTokens(item.completionTokens)}
                              </p>
                            </div>
                            <div>
                              <p className="tracking-wide uppercase">Total</p>
                              <p className="mt-1 text-sm font-medium text-foreground">
                                {formatTokens(item.totalTokens)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="glass-1 rounded-xl border border-dashed border-border/50 px-4 py-6 text-sm text-muted-foreground">
                      No AI usage recorded yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
