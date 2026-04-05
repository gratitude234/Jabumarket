"use client";

import Link from "next/link";
import {
  BookOpen,
  BrainCircuit,
  MessageCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TILES = [
  {
    href: "/study/practice",
    label: "Practice",
    sub: "Start a session",
    icon: Zap,
    primary: true,
  },
  {
    href: "/study/materials",
    label: "Materials",
    sub: "Notes & past Qs",
    icon: BookOpen,
    primary: false,
  },
  {
    href: "/study/questions",
    label: "Q&A Forum",
    sub: "Ask or answer",
    icon: MessageCircle,
    primary: false,
  },
  {
    href: "/study/ai-plan",
    label: "AI Plan",
    sub: "Get a study schedule",
    icon: BrainCircuit,
    primary: false,
  },
] as const;

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TILES.map(({ href, label, sub, icon: Icon, primary }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-col gap-3 rounded-3xl p-4 no-underline transition active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            primary
              ? "bg-[#5B35D5] hover:bg-[#4526B8]"
              : "border border-border bg-card shadow-sm hover:bg-secondary/20"
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              primary ? "bg-white/20" : "bg-[#EEEDFE]"
            )}
          >
            <Icon
              className={cn("h-4.5 w-4.5", primary ? "text-white" : "text-[#5B35D5]")}
              style={{ width: 18, height: 18 }}
            />
          </div>
          <div>
            <p
              className={cn(
                "text-sm font-extrabold",
                primary ? "text-white" : "text-foreground"
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs",
                primary ? "text-white/65" : "text-muted-foreground"
              )}
            >
              {sub}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
