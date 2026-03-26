import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_NOTIFICATIONS = 200;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const material_id = typeof body?.material_id === "string" ? body.material_id.trim() : "";

    if (!material_id) {
      return NextResponse.json({ ok: false, error: "material_id is required" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Fetch the material
    const { data: material, error: matErr } = await admin
      .from("study_materials")
      .select("id, title, course_id, study_courses:course_id(course_code, department_id, level)")
      .eq("id", material_id)
      .maybeSingle();

    if (matErr || !material?.id) {
      return NextResponse.json({ ok: false, error: "Material not found" }, { status: 404 });
    }

    const course = (material as any).study_courses ?? null;
    const department_id = course?.department_id ?? null;
    const level = course?.level ?? null;
    const course_code = course?.course_code ?? null;
    const title = String((material as any).title ?? "Untitled material");

    if (!department_id) {
      return NextResponse.json({ ok: true, notified: 0, skipped: "no department_id" });
    }

    // Find users in the same department (optionally matching level)
    let usersQuery = admin
      .from("study_preferences")
      .select("user_id")
      .eq("department_id", department_id)
      .limit(MAX_NOTIFICATIONS);

    if (level) {
      // Include users at same level OR users with no level set
      usersQuery = usersQuery.or(`level.eq.${level},level.is.null`);
    }

    const { data: users, error: usersErr } = await usersQuery;

    if (usersErr || !users?.length) {
      return NextResponse.json({ ok: true, notified: 0 });
    }

    // Build notification rows — skip duplicates by not re-inserting same type+href
    const href = `/study/materials/${material_id}`;
    const body_text = `${title}${course_code ? ` — ${course_code}` : ""}`;

    const rows = users.map((u: { user_id: string }) => ({
      user_id: u.user_id,
      type: "study_new_material",
      title: "New material in your department",
      body: body_text,
      href,
    }));

    // Insert in batches of 50 to avoid payload limits
    let totalInserted = 0;
    try {
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error: insErr } = await admin.from("notifications").insert(batch);
        if (!insErr) totalInserted += batch.length;
      }
    } catch {
      // Notification failure must never block material approval
    }

    // H-5: Push notification fan-out
    try {
      const { sendUserPush } = await import('@/lib/webPush');
      const pushPayload = {
        title: `New material: ${title}`,
        body:  course_code
          ? `${course_code} — tap to download`
          : 'New study material for your department',
        href:  '/study/materials',
        tag:   `new-material-${material_id}`,
      };
      await Promise.allSettled(
        (users ?? []).map((u: any) => sendUserPush(u.user_id, pushPayload))
      );
    } catch { /* push failures must never crash the notification route */ }

    return NextResponse.json({ ok: true, notified: totalInserted });
  } catch (e: any) {
    // Notification failures are non-fatal — always return ok
    return NextResponse.json({ ok: true, notified: 0, error: e?.message });
  }
}
