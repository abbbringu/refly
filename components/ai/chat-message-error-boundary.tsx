"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: unknown) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ChatMessageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("[ChatMessageErrorBoundary] Caught error:", error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            This message could not be rendered.{" "}
            {this.state.error?.message
              ? `(${this.state.error.message})`
              : "It may contain unsupported formatting."}
          </span>
        </div>
      )
    }
    return this.props.children
  }
}
