// ── API key dialog (CLI/desktop) ─────────────────────────────────────────
//
// In CLI/desktop mode the agent runs on the user's own Anthropic API key.
// When none is configured this dialog collects one and POSTs it to
// /api/config/anthropic-key, which persists it to ~/.dreamer/config.json and
// applies it to the running server (no restart needed). On success we refresh
// the auth snapshot so the gate re-reads `hasApiKey` and the dialog closes.
//
// Opened on boot when `mode === "dev" && !hasApiKey`, and re-opened mid-
// session via the `dreamer:open-api-key` window event — dispatched when a
// chat request 428s with `no_api_key` (see toolbar/use-chat-messages.ts).

import { useState, useCallback } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { API_ORIGIN } from "@dreamer/config"
import { resolveFetchOptions } from "@/project/api-client"
import { refreshCurrentUser, useCurrentUser } from "@/auth/use-current-user"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const OPEN_API_KEY_EVENT = "dreamer:open-api-key"

type ApiKeyDialogProps = {
  open: boolean
  onClose: () => void
}

export function ApiKeyDialog({ open, onClose }: ApiKeyDialogProps) {
  const { hasApiKey } = useCurrentUser()
  const [key, setKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    const trimmed = key.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_ORIGIN}/api/config/anthropic-key`,
        resolveFetchOptions({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        }),
      )
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `Request failed (${res.status})`)
      }
      await refreshCurrentUser()
      setKey("")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key")
    } finally {
      setSaving(false)
    }
  }, [key, saving, onClose])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-5 py-3">
            <Dialog.Title className="text-sm font-semibold text-foreground">
              {hasApiKey ? "Change your Anthropic API key" : "Add your Anthropic API key"}
            </Dialog.Title>
          </div>
          <div className="space-y-4 px-5 py-4">
            <Dialog.Description className="text-xs leading-relaxed text-muted-foreground">
              Breadbox's AI runs on your own Anthropic API key. It's stored locally at{" "}
              <code className="text-foreground">~/.dreamer/config.json</code> and never
              leaves this machine except to call Anthropic.
              {hasApiKey ? " Entering a new key replaces the one currently saved." : ""}
            </Dialog.Description>
            <form onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-3">
              <Input
                type="password"
                autoFocus
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              {error ? <p className="text-xs text-red-400">{error}</p> : null}
              <div className="flex items-center justify-between gap-3">
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Get an API key →
                </a>
                <Button type="submit" size="sm" disabled={!key.trim() || saving}>
                  {saving ? "Saving…" : hasApiKey ? "Update key" : "Save key"}
                </Button>
              </div>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
