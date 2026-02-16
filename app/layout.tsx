import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import TopNav from "@/components/layout/TopNav";
import BottomNav from "@/components/layout/BottomNav";
import MobileTopBar from "@/components/layout/MobileTopBar";

export const metadata: Metadata = {
  title: "Jabumarket",
  description: "Buy/Sell + Services for JABU students.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        {/* Mobile header */}
        <Suspense fallback={null}>
          <MobileTopBar />
        </Suspense>

        {/* Desktop header */}
        <Suspense fallback={null}>
          <TopNav />
        </Suspense>

        <main className="mx-auto max-w-6xl px-4 py-4 pb-20 md:pb-6">
          {children}
        </main>

        <BottomNav />
      </body>
    </html>
  );
}
