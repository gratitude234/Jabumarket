"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Store, PlusSquare, User } from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/vendors", label: "Vendors", icon: Store },
  { href: "/post", label: "Post", icon: PlusSquare },
  { href: "/me", label: "Me", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-white">
      <div className="mx-auto max-w-6xl px-2">
        <div className="grid grid-cols-5 h-14">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex flex-col items-center justify-center gap-1 text-xs",
                  "no-underline",
                  active ? "text-black font-medium" : "text-zinc-500",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
