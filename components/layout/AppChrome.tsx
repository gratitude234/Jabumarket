"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/layout/TopNav";
import BottomNav from "@/components/layout/BottomNav";
import MobileTopBar from "@/components/layout/MobileTopBar";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

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

      <main
        className={["mx-auto max-w-6xl px-4 py-6", "pb-20 md:pb-8"].join(" ")}
      >
        {children}
      </main>

      <BottomNav />
    </>
  );
}
