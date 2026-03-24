"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/layout/TopNav";
import BottomNav from "@/components/layout/BottomNav";
import MobileTopBar from "@/components/layout/MobileTopBar";
import { subscribeToPush } from "@/components/ServiceWorkerRegister";
import PWAInstallBanner from "@/components/PWAInstallBanner";

const APP_CONTAINER =
  "mx-auto w-full max-w-6xl px-4 md:px-6 lg:max-w-7xl lg:px-8";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") || pathname?.startsWith("/study-admin");
  const isConversationPage = /^\/inbox\/[^/]+$/.test(pathname ?? "");

  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)
  const [showNotifPrompt, setShowNotifPrompt] = useState(false)

  useEffect(() => {
    // Listen for SW update events dispatched by ServiceWorkerRegister
    const handleUpdate = (e: Event) => {
      const worker = (e as CustomEvent<{ worker: ServiceWorker }>).detail.worker
      setUpdateWorker(worker)
    }
    window.addEventListener('sw-update-available', handleUpdate)
    return () => window.removeEventListener('sw-update-available', handleUpdate)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem('jm_notif_dismissed') === '1') return

    // Track visit count
    const visitCount = parseInt(localStorage.getItem('jm_visit_count') ?? '0') + 1
    localStorage.setItem('jm_visit_count', String(visitCount))

    const hasListed = localStorage.getItem('jm_has_listed') === '1'
    if (visitCount >= 3 || hasListed) {
      setShowNotifPrompt(true)
    }
  }, [])

  async function requestNotificationPermission() {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      const reg = await navigator.serviceWorker.ready
      await subscribeToPush(reg)
    }
    setShowNotifPrompt(false)
    localStorage.setItem('jm_notif_dismissed', '1')
  }

  function dismissNotificationPrompt() {
    localStorage.setItem('jm_notif_dismissed', '1')
    setShowNotifPrompt(false)
  }

  // ✅ IMPORTANT
  // Admin pages have their own layout (AdminGate/AdminShell).
  // If we wrap /admin routes with AppChrome, they inherit the app container
  // (max-width, padding, TopNav spacing), which breaks dashboard UI.
  // So for /admin routes, render children directly.
  if (isAdmin) return <>{children}</>;

  return (
    <>
      <Suspense fallback={null}>
        <MobileTopBar />
      </Suspense>

      <Suspense fallback={null}>
        <TopNav />
      </Suspense>

      <main className={isConversationPage ? "" : [APP_CONTAINER, "py-6 md:py-8", "pb-20 md:pb-8"].join(" ")}>
        {children}
      </main>

      <BottomNav />

      {/* SW update toast */}
      {updateWorker && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
            <p className="text-sm font-semibold text-foreground">
              App updated
            </p>
            <button
              onClick={() => {
                updateWorker.postMessage({ type: 'SKIP_WAITING' })
                window.location.reload()
              }}
              className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      <PWAInstallBanner />

      {/* Notification permission prompt */}
      {showNotifPrompt && !updateWorker && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
            <div className="text-xl">🔔</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Get notified instantly
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Know when buyers message you or prices drop.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={dismissNotificationPrompt}
                className="text-xs text-muted-foreground"
              >
                Not now
              </button>
              <button
                onClick={requestNotificationPermission}
                className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}