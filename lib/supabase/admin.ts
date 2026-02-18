import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

if (!serviceRoleKey) {
  // We don't throw at module load to avoid crashing builds where env isn't set yet (e.g. CI).
  // The caller will see a clear error if they try to use the admin client without the key.
}

/**
 * Admin (service-role) Supabase client for SERVER-ONLY usage.
 * Bypasses RLS. Never import this in client components.
 */
export function createSupabaseAdminClient() {
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in your .env.local / Vercel env vars."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
