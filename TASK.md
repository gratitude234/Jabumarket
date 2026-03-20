Read CLAUDE.md first. Then read:
- components/layout/AppChrome.tsx
- components/ServiceWorkerRegister.tsx

List files you will modify before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 1 — Capture beforeinstallprompt globally
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create: components/PWAInstallProvider.tsx

'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PWAInstallContext = {
  canInstall: boolean
  triggerInstall: () => Promise<'accepted' | 'dismissed' | null>
  isInstalled: boolean
}

const ctx = createContext<PWAInstallContext>({
  canInstall: false,
  triggerInstall: async () => null,
  isInstalled: false,
})

export function usePWAInstall() {
  return useContext(ctx)
}

export default function PWAInstallProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [deferredPrompt,
    setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }

    // Capture the prompt — Chrome fires this when eligibility
    // criteria are met. Store it for later use.
    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Also detect post-install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  async function triggerInstall() {
    if (!deferredPrompt) return null
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome
  }

  return (
    <ctx.Provider
      value={{
        canInstall: !!deferredPrompt,
        triggerInstall,
        isInstalled,
      }}
    >
      {children}
    </ctx.Provider>
  )
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 2 — Wrap layout with the provider
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/layout.tsx

Import PWAInstallProvider and wrap AppChrome with it:

  <PWAInstallProvider>
    <AppChrome>{children}</AppChrome>
  </PWAInstallProvider>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 3 — Show install banner at the right moment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create: components/PWAInstallBanner.tsx

'use client'

import { useEffect, useState } from 'react'
import { usePWAInstall } from './PWAInstallProvider'
import { X, Download } from 'lucide-react'

const DISMISSED_KEY = 'jm_install_banner_dismissed'
const VISIT_KEY = 'jm_visit_count'

export default function PWAInstallBanner() {
  const { canInstall, triggerInstall, isInstalled } =
    usePWAInstall()
  const [show, setShow] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (isInstalled) return
    if (!canInstall) return
    if (localStorage.getItem(DISMISSED_KEY)) return

    // Track visits — show after 2nd visit
    const visits = parseInt(
      localStorage.getItem(VISIT_KEY) ?? '0', 10
    ) + 1
    localStorage.setItem(VISIT_KEY, String(visits))

    // Show immediately on 2nd+ visit if prompt is available
    if (visits >= 2) {
      // Small delay so it doesn't feel jarring on page load
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }
  }, [canInstall, isInstalled])

  if (!show || isInstalled) return null

  async function handleInstall() {
    setInstalling(true)
    const outcome = await triggerInstall()
    setInstalling(false)
    if (outcome === 'accepted') {
      setShow(false)
    }
  }

  function handleDismiss() {
    setShow(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50
      flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm
        rounded-2xl border border-border bg-card shadow-lg p-3
        flex items-center gap-3">
        <img
          src="/icon-192.png"
          alt=""
          className="h-10 w-10 rounded-xl shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Install Jabumarket
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fast, offline-ready, no app store needed
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="grid h-7 w-7 place-items-center
              rounded-full text-muted-foreground
              hover:bg-secondary"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="inline-flex items-center gap-1.5
              rounded-xl bg-zinc-900 px-3 py-1.5
              text-xs font-bold text-white
              hover:bg-zinc-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 4 — Add banner to AppChrome
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: components/layout/AppChrome.tsx

Import PWAInstallBanner and render it inside AppChrome,
just before the closing tag:

  <PWAInstallBanner />

It renders nothing until Chrome fires beforeinstallprompt
AND the user has visited twice, so it's safe to always mount.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 5 — iOS install instructions banner
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
iOS Safari never fires beforeinstallprompt — there's no API.
Show a manual guide instead.

In components/PWAInstallBanner.tsx, add iOS detection and
a separate banner for Safari users:

  // Detect iOS Safari
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isSafari = /^((?!chrome|android).)*safari/i.test(
    navigator.userAgent
  )
  const isIOSSafari = isIOS && isSafari

Add this check in the useEffect:
  // For iOS Safari — no beforeinstallprompt exists
  // Show manual guide after 2nd visit if not dismissed
  if (isIOSSafari && visits >= 2 &&
      !localStorage.getItem(DISMISSED_KEY) &&
      !standalone) {
    const t = setTimeout(() => setShowIOS(true), 3000)
    return () => clearTimeout(t)
  }

Add a separate state: const [showIOS, setShowIOS] = useState(false)

Render iOS banner when showIOS is true:

  {showIOS && (
    <div className="fixed bottom-20 left-0 right-0 z-50
      flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm
        rounded-2xl border border-border bg-card shadow-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            Install Jabumarket on iPhone
          </p>
          <button
            onClick={() => {
              setShowIOS(false)
              localStorage.setItem(DISMISSED_KEY, '1')
            }}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ol className="mt-2 space-y-1 text-xs
          text-muted-foreground list-decimal pl-4">
          <li>Tap the <strong className="text-foreground">
            Share</strong> button at the bottom of Safari
          </li>
          <li>Scroll down and tap <strong
            className="text-foreground">
            "Add to Home Screen"
          </strong></li>
          <li>Tap <strong className="text-foreground">
            Add
          </strong> — done!</li>
        </ol>
      </div>
    </div>
  )}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Implement tasks in order 1–5
- Read every file before editing
- No `any` types except where the browser API forces it
  (navigator.standalone — note with a comment)
- No new dependencies
- After all tasks: list every file created or modified,
  confirm each task number done