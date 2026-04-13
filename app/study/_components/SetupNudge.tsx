"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, UserCircle, X } from "lucide-react";

interface SetupNudgeProps {
  onDismiss: () => void;
}

const DISMISS_KEY = "jabu:setupNudgeDismissed";

export default function SetupNudge({ onDismiss }: SetupNudgeProps) {
  const [dismissed, setDismissed] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {}
    setResolved(true);
  }, []);

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
    onDismiss();
  }

  if (!resolved || dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#AFA9EC] bg-[#EEEDFE] px-4 py-3.5 dark:border-[#5B35D5]/40 dark:bg-[#5B35D5]/10">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5B35D5]">
        <UserCircle className="h-4 w-4 text-white" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-[#3C3489] dark:text-indigo-200">
          Personalise your Study Hub
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#534AB7] dark:text-indigo-300">
          Set your faculty, department and level to see materials, practice sets and Q&amp;A for your exact courses.
        </p>

        <Link
          href="/study/onboarding"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-extrabold text-white no-underline transition hover:bg-[#4526B8]"
        >
          Set up now
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#5B35D5] transition hover:bg-[#5B35D5]/15 dark:text-indigo-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
