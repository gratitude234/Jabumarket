import type { Metadata } from "next";
import "./globals.css";
import AppChrome from "@/components/layout/AppChrome";

export const metadata: Metadata = {
  title: "Jabumarket",
  description: "Buy/Sell + Services for JABU students.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        {/* page glow */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-52 -left-52 h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
