"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ReflyLogo } from "@/components/layout/refly-logo"
import { Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

function ResetPasswordForm() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [validSession, setValidSession] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const verifySession = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setValidSession(true)
        setVerifying(false)
        return
      }

      const code = searchParams.get("code")
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          setValidSession(true)
        } else {
          toast.error("Invalid or expired reset link", {
            description: "Please request a new password reset link.",
          })
        }
      }

      setVerifying(false)
    }
    verifySession()
  }, [searchParams])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("Passwords don't match")
      return
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error("Failed to reset password", { description: error.message })
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (verifying) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!validSession) {
    return (
      <div>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ReflyLogo className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Invalid or expired link</h1>
          <p className="mt-2 text-muted-foreground">
            This password reset link is no longer valid. Please request a new one.
          </p>
        </div>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/forgot-password">
            <Button className="w-full">Request new link</Button>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
          <p className="mt-2 text-muted-foreground">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
        </div>
        <div className="mt-8">
          <Button
            className="w-full"
            onClick={() => {
              router.push("/library")
              router.refresh()
            }}
          >
            Continue to Refly
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ReflyLogo className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
        <p className="text-muted-foreground">
          Choose a new password for your account.
        </p>
      </div>
      <form onSubmit={handleReset}>
        <div className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting password…
              </>
            ) : (
              "Reset password"
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  )
}

function ResetPasswordFallback() {
  return (
    <div className="flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  )
}