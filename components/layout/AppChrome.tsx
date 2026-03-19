"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/layout/TopNav";
import BottomNav from "@/components/layout/BottomNav";
import MobileTopBar from "@/components/layout/MobileTopBar";

const APP_CONTAINER =
  "mx-auto w-full max-w-6xl px-4 md:px-6 lg:max-w-7xl lg:px-8";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") || pathname?.startsWith("/study-admin");

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

      <main className={[APP_CONTAINER, "py-6 md:py-8", "pb-20 md:pb-8"].join(" ")}>
        {children}
      </main>

      <BottomNav />
    </>
  );
}
