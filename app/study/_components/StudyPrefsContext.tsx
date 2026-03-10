"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export type Prefs = {
  faculty?: string | null;
  department?: string | null;
  level?: number | null;
  faculty_id?: string | null;
  department_id?: string | null;
  semester?: string | null;
  session?: string | null;
};

export type RepRole = "course_rep" | "dept_librarian" | null;
export type RepStatus = "not_applied" | "pending" | "approved" | "rejected";

type RepMeResponse =
  | {
      ok: true;
      status: RepStatus;
      role: RepRole;
      scope: {
        faculty_id: string | null;
        department_id: string | null;
        levels: number[] | null;
        all_levels: boolean;
      } | null;
    }
  | { ok: false; code?: string; message?: string };

export type RepState = {
  loading: boolean;
  status: RepStatus;
  role: RepRole;
  scope: RepMeResponse extends { ok: true } ? RepMeResponse["scope"] : null;
};

// ── Context shape ─────────────────────────────────────────────────────────────

interface StudyPrefsCtx {
  /** True while auth + prefs are still resolving on first load */
  loading: boolean;
  /** Authenticated user id — null until auth resolves */
  userId: string | null;
  /** Authenticated user email — null until auth resolves */
  userEmail: string | null;
  /** Human-readable display name derived from auth metadata */
  displayName: string | null;
  /** Saved study preferences for this user — null if not yet set */
  prefs: Prefs | null;
  /** True when the user has at least one meaningful pref set */
  hasPrefs: boolean;
  /** Rep / librarian application state */
  rep: RepState;
  /**
   * Update the semester in prefs state locally (after an upsert).
   * Used by StudyHomeClient after applySuggestedSemester() succeeds.
   */
  updateSemester: (semester: string, session: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const StudyPrefsContext = createContext<StudyPrefsCtx | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function StudyPrefsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [rep, setRep] = useState<RepState>({
    loading: true,
    status: "not_applied",
    role: null,
    scope: null,
  });

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      // ── Auth ───────────────────────────────────────────────────────────────
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (!mounted) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      // Resolve human-readable display name from auth metadata
      const meta = user.user_metadata as Record<string, unknown> | null | undefined;
      const resolvedName =
        (meta?.full_name as string | undefined) ||
        (meta?.name as string | undefined) ||
        (meta?.preferred_username as string | undefined) ||
        (user.email ? user.email.split("@")[0].replace(/[._-]+/g, " ") : null);
      setDisplayName(resolvedName ?? null);

      // ── Rep status + Prefs — run in parallel ──────────────────────────────
      const repPromise = fetch("/api/study/rep-applications/me", {
        cache: "no-store",
      })
        .then((r) => r.json() as Promise<RepMeResponse>)
        .catch(() => null);

      const prefsPromise = supabase
        .from("study_preferences")
        .select(
          "level, faculty_id, department_id, semester, session," +
            " faculty:study_faculties(name), department:study_departments(name)"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      const [repJson, prefsRes] = await Promise.all([repPromise, prefsPromise]);

      if (!mounted) return;

      // ── Rep state ──────────────────────────────────────────────────────────
      if (repJson && (repJson as any).ok) {
        const ok = repJson as Extract<RepMeResponse, { ok: true }>;
        setRep({ loading: false, status: ok.status, role: ok.role, scope: ok.scope });
      } else {
        setRep((p) => ({ ...p, loading: false }));
      }

      // ── Prefs ──────────────────────────────────────────────────────────────
      if (!prefsRes.error && prefsRes.data) {
        const d = prefsRes.data as any;
        setPrefs({
          faculty:        d.faculty?.name    ?? null,
          department:     d.department?.name ?? null,
          level:          d.level            ?? null,
          faculty_id:     d.faculty_id       ?? null,
          department_id:  d.department_id    ?? null,
          semester:       d.semester         ?? null,
          session:        d.session          ?? null,
        });
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [router]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasPrefs = useMemo(
    () =>
      !!(
        prefs?.faculty_id ||
        prefs?.department_id ||
        prefs?.faculty ||
        prefs?.department ||
        prefs?.level
      ),
    [prefs]
  );

  // ── Helpers exposed to consumers ───────────────────────────────────────────
  function updateSemester(semester: string, session: string) {
    setPrefs((p) => ({ ...(p ?? {}), semester, session }));
  }

  return (
    <StudyPrefsContext.Provider
      value={{
        loading,
        userId,
        userEmail,
        displayName,
        prefs,
        hasPrefs,
        rep,
        updateSemester,
      }}
    >
      {children}
    </StudyPrefsContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Access auth, prefs, and rep state from any component inside StudyPrefsProvider.
 *
 * @throws if called outside of a StudyPrefsProvider
 */
export function useStudyPrefs(): StudyPrefsCtx {
  const ctx = useContext(StudyPrefsContext);
  if (!ctx) {
    throw new Error("useStudyPrefs must be used inside <StudyPrefsProvider>");
  }
  return ctx;
}