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
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true // iOS Safari non-standard property
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
