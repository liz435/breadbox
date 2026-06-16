// ── Error Boundary ──────────────────────────────────────────────────────────
//
// Catches React rendering errors in child components and shows a fallback UI
// instead of crashing the entire app.

import { Component, type ReactNode } from "react"

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
  /** Panel name for the error message */
  name?: string
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-card p-4 text-center">
          <div className="rounded-full bg-red-500/10 p-3">
            <svg viewBox="0 0 24 24" className="size-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={8} x2={12} y2={12} />
              <line x1={12} y1={16} x2={12.01} y2={16} />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {this.props.name ? `${this.props.name} crashed` : "Something went wrong"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              {this.state.error?.message ?? "An unexpected error occurred"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
