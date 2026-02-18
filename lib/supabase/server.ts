import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Create a Supabase client bound to the current request's cookies.
 * This makes server components respect the signed-in session (so RLS works as expected).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        // Next.js cookie store supports delete(); fall back to set maxAge=0
        // @ts-ignore
        if (typeof cookieStore.delete === "function") {
          // @ts-ignore
          cookieStore.delete(name);
          return;
        }
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}
