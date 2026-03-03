// app/study/materials/my/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ExternalLink, Loader2, ShieldCheck, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { Card, EmptyState, PageHeader } from "../../_components/StudyUI";

type MaterialType = "past_question" | "handout" | "slides" | "note" | "timetable" | "other";

type CourseMini = {
  course_code: string;
  course_title: string | null;
  level: number | null;
  semester: string | null;
};

type Item = {
  id: string;
  title: string | null;
  material_type: MaterialType | null;
  session: string | null;
  approved: boolean | null;
  created_at: string;
  updated_at: string | null;
  file_url: string | null;
  file_path: string | null;
  description: string | null; // used as rejection note fallback
  study_courses?: CourseMini | null;
};

type ApiResponse = { ok: boolean; items?: Item[]; error?: string; code?: string };

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ approved, note }: { approved: boolean | null; note?: string | null }) {
  // We don't have a dedicated rejected flag in every DB; we use "approved=false" + optional note as a soft rejection.
  const looksRejected = approved === false && !!(note || "").trim();
  if (approved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Approved
      </span>
    );
  }
  if (looksRejected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        <XCircle className="h-3.5 w-3.5" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      <Clock3 className="h-3.5 w-3.5" /> Pending review
    </span>
  );
}

export default function MyUploadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function getTokenOrRedirect() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/study/materials/my")}`);
      return null;
    }
    return token;
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      const res = await fetch("/api/study/materials/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load uploads");
      setItems(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const approved = items.filter((i) => !!i.approved).length;
    const pending = items.filter((i) => !i.approved && !((i.description || "").trim())).length;
    const rejected = items.filter((i) => !i.approved && !!((i.description || "").trim())).length;
    return { total, approved, pending, rejected };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
      <PageHeader
        title="My uploads"
        subtitle="Track what you’ve uploaded, and see when it’s approved."
        right={
          <Link
            href="/study/materials/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            <ShieldCheck className="h-4 w-4" />
            Upload another
          </Link>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/study" className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:text-black">
          <ArrowLeft className="h-4 w-4" />
          Back to Study
        </Link>

        <div className="hidden items-center gap-2 text-xs text-neutral-600 md:flex">
          <span className="rounded-full bg-neutral-100 px-2 py-1">Total: {stats.total}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Approved: {stats.approved}</span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Pending: {stats.pending}</span>
          <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">Rejected: {stats.rejected}</span>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{err}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your uploads…
        </div>
      ) : items.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ShieldCheck}
            title="No uploads yet"
            description="When you upload materials, they’ll appear here with their review status."
            actions={
              <Link
                href="/study/materials/upload"
                className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
              >
                Upload a material
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => {
            const c = it.study_courses;
            const courseLine = c
              ? `${c.course_code}${c.level ? ` • ${c.level}L` : ""}${c.semester ? ` • ${String(c.semester).toUpperCase()}` : ""}`
              : "Course";

            return (
              <Card key={it.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-neutral-900">{it.title || "Untitled material"}</p>
                      <StatusPill approved={it.approved ?? false} note={it.description} />
                    </div>

                    <p className="mt-1 text-xs text-neutral-600">{courseLine}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                      <span className="rounded-lg bg-neutral-100 px-2 py-1">{it.material_type || "other"}</span>
                      {it.session ? <span className="rounded-lg bg-neutral-100 px-2 py-1">{it.session}</span> : null}
                      <span className="rounded-lg bg-neutral-100 px-2 py-1">Uploaded {formatDate(it.created_at)}</span>
                    </div>

                    {!it.approved && (it.description || "").trim() ? (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                        <p className="font-semibold">Rejection note</p>
                        <p className="mt-1">{it.description}</p>
                        <p className="mt-2 text-rose-700">Fix it and re-upload from the Upload page.</p>
                      </div>
                    ) : null}
                  </div>

                  {it.file_url ? (
                    <a
                      href={`/api/study/materials/${it.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View file
                    </a>
                  ) : (
                    <span className="shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      File not linked yet
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
