// app/study/materials/[id]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MaterialDetailClient from "./MaterialDetailClient";

type Props = { params: Promise<{ id: string }> };

// ─── Server-side data fetch ──────────────────────────────────────────────────

async function getMaterial(id: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("study_materials")
    .select(
      `id, title, description, material_type, session,
       approved, downloads, up_votes, down_votes,
       file_url, file_path,
       verified, featured, created_at, uploader_email,
       study_courses (
         id, course_code, course_title,
         level, semester, faculty, department
       )`
    )
    .eq("id", id)
    .eq("approved", true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ─── Dynamic metadata for sharing ────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await getMaterial(id);
  if (!m) return { title: "Material not found — JABU Study" };

  const course = (m.study_courses as any);
  const title = m.title ?? course?.course_code ?? "Study material";
  const desc = (m.description ?? (course ? `${course.course_code} · ${course.course_title}` : ""))
    || "Study material on JABU Study Hub";
  return {
    title: `${title} — JABU Study`,
    description: desc.slice(0, 160),
    openGraph: {
      title,
      description: desc.slice(0, 160),
      type: "article",
    },
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function MaterialDetailPage({ params }: Props) {
  const { id } = await params;
  const m = await getMaterial(id);

  if (!m) notFound();

  return <MaterialDetailClient material={m as any} />;
}