"use client";

import Link from "next/link";
import {
  BookOpen,
  BrainCircuit,
  Calculator,
  MessageCircle,
  MessagesSquare,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TILES = [
  {
    href: "/study/practice",
    label: "Practice",
    sublabel: "Start a session",
    icon: Zap,
    primary: true,
  },
  {
    href: "/study/materials",
    label: "Chat PDF",
    sublabel: "Open a PDF, then tap Chat",
    icon: MessageCircle,
    primary: false,
    isNew: true,
  },
  {
    href: "/study/materials",
    label: "Materials",
    sublabel: "Notes & past Qs",
    icon: BookOpen,
    primary: false,
  },
  {
    href: "/study/questions",
    label: "Q&A Forum",
    sublabel: "Ask or answer",
    icon: MessagesSquare,
    primary: false,
  },
  {
    href: "/study/gpa",
    label: "GPA Calc",
    sublabel: "Track your GPA",
    icon: Calculator,
    primary: false,
  },
  {
    href: "/study/ai-plan",
    label: "AI Plan",
    sublabel: "Build a study plan",
    icon: BrainCircuit,
    primary: false,
  },
] as const;

export function QuickActions() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
      {TILES.map(({ href, label, sublabel, icon: Icon, primary, isNew }) => (
        <Link
          key={label}
          href={href}
          className={cn(
            "flex w-[82px] flex-shrink-0 flex-col gap-2.5 rounded-3xl p-3.5 no-underline transition active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            primary
              ? "bg-[#5B35D5] text-white hover:bg-[#4526B8]"
              : "border border-border bg-card text-foreground shadow-sm hover:bg-secondary/20"
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              primary ? "bg-white/20" : "bg-[#EEEDFE] dark:bg-[#5B35D5]/15"
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px]",
                primary ? "text-white" : "text-[#5B35D5] dark:text-indigo-200"
              )}
            />
          </div>

          <div className="space-y-1">
            <p className={cn("text-[12px] font-extrabold leading-tight", primary ? "text-white" : "text-foreground")}>
              {label}
            </p>

            {isNew ? (
              <span className="w-fit rounded-md bg-[#EEEDFE] px-1.5 py-0.5 text-[9px] font-bold text-[#3B24A8] dark:bg-[#5B35D5]/15 dark:text-indigo-200">
                NEW
              </span>
            ) : null}

            <p className={cn("text-[10px] leading-tight", primary ? "text-white/60" : "text-muted-foreground")}>
              {sublabel}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
