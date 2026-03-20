import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppChrome from "@/components/layout/AppChrome";

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Jabumarket",
  description: "Buy, sell & find services around JABU.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jabumarket",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    title: "Jabumarket",
    description: "Buy, sell & find services around JABU.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        {/* page glow */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-52 -left-52 h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <AppChrome>{children}</AppChrome>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}