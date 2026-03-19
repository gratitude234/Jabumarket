// app/vendor/layout.tsx
// Server-side auth guard for all /vendor/* routes.
// Redirects unauthenticated users to /login and non-food-vendors to /me.

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ReactNode } from 'react';

export default async function VendorLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', user.id)
    .eq('vendor_type', 'food')
    .maybeSingle();

  if (!vendor) redirect('/me');

  return <>{children}</>;
}
