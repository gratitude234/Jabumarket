// POST — Toggle an upvote on a study material.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { id: materialId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('study_material_ratings')
    .select('id')
    .eq('material_id', materialId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await admin.from('study_material_ratings').delete()
      .eq('material_id', materialId).eq('user_id', user.id);
    // Decrement: read-modify-write is acceptable here (non-critical counter)
    const { data: mat } = await admin
      .from('study_materials').select('up_votes').eq('id', materialId).maybeSingle();
    await admin.from('study_materials')
      .update({ up_votes: Math.max(0, ((mat as any)?.up_votes ?? 1) - 1) })
      .eq('id', materialId);
    return NextResponse.json({ ok: true, voted: false });
  } else {
    await admin.from('study_material_ratings')
      .insert({ material_id: materialId, user_id: user.id, vote: 1 });
    const { data: mat } = await admin
      .from('study_materials').select('up_votes').eq('id', materialId).maybeSingle();
    await admin.from('study_materials')
      .update({ up_votes: ((mat as any)?.up_votes ?? 0) + 1 })
      .eq('id', materialId);
    return NextResponse.json({ ok: true, voted: true });
  }
}
