// app/me/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Store,
  User,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

/* --------------------------------- Types -------------------------------- */

type TabKey = "overview" | "profile" | "verification" | "account";

type VendorType = "food" | "mall" | "student" | "other";

type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type Vendor = {
  id: string;
  user_id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  vendor_type: VendorType | null;

  verified: boolean | null;
  verification_status: string | null;

  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  created_at?: string;
};

type StudyRole = "course_rep" | "dept_librarian";
type StudyStatus = "not_applied" | "pending" | "approved" | "rejected";

type StudyScope = {
  faculty_id: string | null;
  department_id: string | null;
  levels: number[] | null;
  all_levels: boolean;
};

type StudyMeResponse =
  | { ok: false; code?: string; message?: string }
  | {
      ok: true;
      status: StudyStatus;
      role: StudyRole | null;
      scope: StudyScope | null;
      rep: { created_at: string; active: boolean | null } | null;
      application:
        | null
        | {
            id: string;
            created_at: string;
            status: string;
            role: string | null;
            faculty_id: string | null;
            department_id: string | null;
            level: number | null;
            levels: number[] | null;
            decision_reason: string | null;
            note: string | null;
          };
    };

type RoleFlags = {
  // Market
  isVendor: boolean;
  isVerifiedVendor: boolean;

  // Study
  studyLoading: boolean;
  studyStatus: StudyStatus | null;
  studyRole: StudyRole | null;
  isStudyContributor: boolean; // approved rep or librarian
};

/* -------------------------------- Helpers -------------------------------- */

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function initials(nameOrEmail?: string | null) {
  const s = (nameOrEmail ?? "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function pillTone(kind: "good" | "warn" | "base") {
  if (kind === "good") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (kind === "warn") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

function normalizePhone(input?: string | null) {
  if (!input) return "";
  return input.replace(/[^\d+]/g, "").trim();
}

function defaultVendorNameFromEmail(email?: string | null) {
  const e = (email ?? "").trim();
  if (!e) return "My Store";
  const local = e.split("@")[0] ?? "My Store";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .slice(0, 40);
}

/* ---------------------------------- Page --------------------------------- */

function MeInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);

  const [study, setStudy] = useState<StudyMeResponse | null>(null);
  const [studyLoading, setStudyLoading] = useState(true);

  const activeTab = (sp.get("tab") as TabKey) || "overview";

  const roles: RoleFlags = useMemo(() => {
    const isVendor = !!vendor?.id;
    const isVerifiedVendor = !!vendor?.verified || vendor?.verification_status === "verified";

    let studyStatus: StudyStatus | null = null;
    let studyRole: StudyRole | null = null;
    let isStudyContributor = false;

    if (study && "ok" in study && study.ok === true) {
      studyStatus = study.status;
      studyRole = study.role;
      isStudyContributor = study.status === "approved" && !!study.role;
    }

    return {
      isVendor,
      isVerifiedVendor,
      studyLoading,
      studyStatus,
      studyRole,
      isStudyContributor,
    };
  }, [vendor, study, studyLoading]);

  async function loadAll() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    const nextMe: Me = {
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata as any)?.full_name ?? null,
    };

    const { data: v, error: vErr } = await supabase
      .from("vendors")
      .select(
        "id,user_id,name,whatsapp,phone,location,vendor_type,verified,verification_status,verified_at,rejected_at,rejection_reason,created_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    setMe(nextMe);
    setVendor(vErr ? null : ((v as any) ?? null));
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadAll();
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function loadStudyRole() {
      setStudyLoading(true);
      try {
        const res = await fetch("/api/study/rep-applications/me", { method: "GET" });
        const json = (await res.json()) as StudyMeResponse;
        if (!mounted) return;
        setStudy(json);
      } catch (e: any) {
        if (!mounted) return;
        setStudy({ ok: false, message: e?.message ?? "Failed to load study role" });
      } finally {
        if (mounted) setStudyLoading(false);
      }
    }

    loadStudyRole();
    return () => {
      mounted = false;
    };
  }, []);

  function setTab(tab: TabKey) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const displayName = me?.full_name || vendor?.name || "My Account";
  const displaySub = me?.email || "—";

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">
        {/* Sticky mini top bar (mobile-first) */}
        <div className="sticky top-0 z-20 -mx-4 mb-3 bg-zinc-50/85 px-4 pt-2 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900">Account</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // quick refresh of local data
                  loadAll();
                }}
                className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                aria-label="Refresh"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>

              <Link
                href="/settings"
                className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-3">
            <Tabs active={activeTab} onChange={setTab} />
          </div>
        </div>

        {loading ? (
          <MeSkeleton />
        ) : (
          <>
            <HeaderCard
              name={displayName}
              sub={displaySub}
              avatarText={initials(displayName || me?.email)}
              roles={roles}
              vendorName={vendor?.name ?? null}
            />

            <div className="mt-4">
              <QuickActions roles={roles} />
            </div>

            <div className="mt-6 space-y-4">
              {activeTab === "overview" && <OverviewTab roles={roles} vendor={vendor} study={study} />}

              {activeTab === "profile" && (
                <ProfileTab
                  roles={roles}
                  me={me}
                  vendor={vendor}
                  onVendorUpdated={(v) => setVendor(v)}
                  onMeUpdated={(m) => setMe(m)}
                />
              )}

              {activeTab === "verification" && (
                <VerificationTab roles={roles} vendor={vendor} onVendorUpdated={(v) => setVendor(v)} />
              )}

              {activeTab === "account" && <AccountTab me={me} onSignOut={signOut} />}
            </div>

            <div className="mt-6 text-center text-xs text-zinc-500">
              Tip: keep your profile updated so Study & Market feels personal.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Improved UI Parts ----------------------------- */

function MeSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-2xl bg-zinc-100" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-44 rounded bg-zinc-100" />
            <div className="mt-2 h-4 w-56 rounded bg-zinc-100" />
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 rounded-full bg-zinc-100" />
              <div className="h-6 w-28 rounded-full bg-zinc-100" />
              <div className="h-6 w-24 rounded-full bg-zinc-100" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="h-[78px] rounded-2xl border bg-white p-3 shadow-sm">
          <div className="h-4 w-20 rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-28 rounded bg-zinc-100" />
        </div>
        <div className="h-[78px] rounded-2xl border bg-white p-3 shadow-sm">
          <div className="h-4 w-24 rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-28 rounded bg-zinc-100" />
        </div>
        <div className="h-[78px] rounded-2xl border bg-white p-3 shadow-sm">
          <div className="h-4 w-20 rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-28 rounded bg-zinc-100" />
        </div>
        <div className="h-[78px] rounded-2xl border bg-white p-3 shadow-sm">
          <div className="h-4 w-24 rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-28 rounded bg-zinc-100" />
        </div>
      </div>

      <div className="h-40 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="h-4 w-28 rounded bg-zinc-100" />
        <div className="mt-3 space-y-2">
          <div className="h-10 rounded-xl bg-zinc-100" />
          <div className="h-10 rounded-xl bg-zinc-100" />
          <div className="h-10 rounded-xl bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

function SectionCard(props: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  tone?: "base" | "success" | "danger" | "warn";
}) {
  const tone =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50/40"
      : props.tone === "danger"
      ? "border-rose-200 bg-rose-50/40"
      : props.tone === "warn"
      ? "border-amber-200 bg-amber-50/40"
      : "border-zinc-200 bg-white";

  return (
    <div className={cn("rounded-3xl border p-4 shadow-sm", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{props.title}</div>
          {props.desc ? <div className="mt-1 text-sm text-zinc-600">{props.desc}</div> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function InlinePill(props: { icon: React.ReactNode; label: string; tone: "good" | "warn" | "base" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        pillTone(props.tone)
      )}
    >
      <span className="text-zinc-800">{props.icon}</span>
      {props.label}
    </span>
  );
}

/* ----------------------------- UI Components ----------------------------- */

function HeaderCard(props: {
  name: string;
  sub: string;
  avatarText: string;
  roles: RoleFlags;
  vendorName: string | null;
}) {
  const { roles } = props;

  const studyPill = roles.studyLoading ? (
    <InlinePill icon={<BookOpen className="h-3.5 w-3.5" />} label="Study…" tone="base" />
  ) : roles.isStudyContributor ? (
    <InlinePill
      icon={<BookOpen className="h-3.5 w-3.5" />}
      label={roles.studyRole === "dept_librarian" ? "Dept Librarian" : "Course Rep"}
      tone="good"
    />
  ) : roles.studyStatus && roles.studyStatus !== "not_applied" ? (
    <InlinePill
      icon={<BookOpen className="h-3.5 w-3.5" />}
      label={roles.studyStatus === "pending" ? "Rep: pending" : "Rep: rejected"}
      tone="warn"
    />
  ) : null;

  const marketPill = roles.isVerifiedVendor ? (
    <InlinePill icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Verified vendor" tone="good" />
  ) : roles.isVendor ? (
    <InlinePill icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Vendor (unverified)" tone="warn" />
  ) : (
    <InlinePill icon={<User className="h-3.5 w-3.5" />} label="Student" tone="base" />
  );

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-lg font-semibold text-zinc-700">
          {props.avatarText}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-zinc-900">{props.name}</h1>
          <p className="mt-1 truncate text-sm text-zinc-600">{props.sub}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {roles.isVendor ? (
              <InlinePill icon={<Store className="h-3.5 w-3.5" />} label="Market" tone="base" />
            ) : null}
            {studyPill}
            {marketPill}
          </div>

          {roles.isVendor && props.vendorName ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
              <Building2 className="h-3.5 w-3.5" />
              Store: <span className="font-semibold text-zinc-700">{props.vendorName}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QuickActions({ roles }: { roles: RoleFlags }) {
  const cards = [
    {
      href: roles.isVendor ? "/my-listings" : "/market",
      icon: <LayoutDashboard className="h-4 w-4" />,
      title: roles.isVendor ? "My Listings" : "Explore Market",
      desc: roles.isVendor ? "Manage your products" : "Browse products & vendors",
    },
    roles.isStudyContributor
      ? {
          href: "/study/materials/upload",
          icon: <FileText className="h-4 w-4" />,
          title: "Upload Material",
          desc: "Add course files",
        }
      : {
          href: "/study",
          icon: <BookOpen className="h-4 w-4" />,
          title: "Study",
          desc: "Materials & practice",
        },
    roles.isStudyContributor
      ? {
          href: "/study/materials/my",
          icon: <BookOpen className="h-4 w-4" />,
          title: "My Uploads",
          desc: "Track approval status",
        }
      : roles.studyStatus && roles.studyStatus !== "not_applied"
      ? {
          href: "/study/apply-rep",
          icon: <ShieldCheck className="h-4 w-4" />,
          title: "My Application",
          desc: roles.studyStatus === "pending" ? "Waiting for review" : "See rejection reason",
        }
      : {
          href: "/study/apply-rep",
          icon: <ShieldCheck className="h-4 w-4" />,
          title: "Become a Rep",
          desc: "Apply for upload access",
        },
    roles.isVendor
      ? {
          href: "/me?tab=verification",
          icon: <Store className="h-4 w-4" />,
          title: "Verification",
          desc: "Upload docs & request",
        }
      : {
          href: "/support",
          icon: <ChevronRight className="h-4 w-4" />,
          title: "Help & Support",
          desc: "Get assistance fast",
        },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <Link
          key={c.title}
          href={c.href}
          className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm transition active:scale-[0.99] hover:bg-zinc-50"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl border border-zinc-200 bg-white p-2">
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
              <div className="mt-0.5 text-xs text-zinc-600">{c.desc}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Tabs(props: { active: TabKey; onChange: (t: TabKey) => void }) {
  const items: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "profile", label: "Profile" },
    { key: "verification", label: "Verification" },
    { key: "account", label: "Account" },
  ];

  return (
    <div className="relative">
      {/* mobile-first segmented control */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((it) => {
          const isActive = props.active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => props.onChange(it.key)}
              className={cn(
                "whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-semibold transition",
                isActive
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {it.label}
            </button>
          );
        })}
      </div>

      {/* subtle hint for horizontal scroll */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-zinc-50/95 to-transparent" />
    </div>
  );
}

/* --------------------------------- Tabs --------------------------------- */

function OverviewTab({
  roles,
  vendor,
  study,
}: {
  roles: RoleFlags;
  vendor: Vendor | null;
  study: StudyMeResponse | null;
}) {
  const studySummary = roles.studyLoading
    ? "Loading your contributor status…"
    : study && "ok" in study && study.ok
    ? `Status: ${study.status}${study.role ? ` • Role: ${study.role}` : ""}`
    : "Couldn’t load your study status right now.";

  const marketSummary = roles.isVendor
    ? `Store: ${vendor?.name ?? "—"} • ${vendor?.verified ? "Verified" : "Not verified"}`
    : "Create a vendor profile and start posting listings.";

  return (
    <div className="space-y-4">
      <SectionCard
        title="Your hub"
        desc="Everything about your identity, Study role and Market profile lives here."
      >
        <ul className="space-y-2 text-sm text-zinc-700">
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Update your name & profile details
          </li>
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Track Study contributor status & uploads
          </li>
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Track vendor verification (if you sell)
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="JABU Study"
        desc={studySummary}
        right={
          <Link
            href={roles.isStudyContributor ? "/study/materials/my" : "/study"}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Open
          </Link>
        }
      >
        {roles.studyLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-2xl bg-zinc-100" />
            <div className="h-10 rounded-2xl bg-zinc-100" />
          </div>
        ) : study && "ok" in study && study.ok ? (
          <div className="grid grid-cols-2 gap-2">
            {study.status === "approved" ? (
              <>
                <Link
                  href="/study/materials/upload"
                  className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Upload material
                </Link>
                <Link
                  href="/study/materials/my"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  My uploads
                </Link>
              </>
            ) : (
              <Link
                href="/study/apply-rep"
                className="col-span-2 inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Manage application
              </Link>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-700">Try refreshing from the top.</div>
        )}
      </SectionCard>

      <SectionCard
        title="JABU Market"
        desc={marketSummary}
        right={
          <Link
            href={roles.isVendor ? "/my-listings" : "/market"}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            {roles.isVendor ? "My listings" : "Explore"}
          </Link>
        }
      >
        {roles.isVendor ? (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/me?tab=verification"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Verification
            </Link>
            <Link
              href="/my-listings"
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Manage listings
            </Link>
          </div>
        ) : (
          <Link
            href="/post"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Become a vendor
          </Link>
        )}
      </SectionCard>
    </div>
  );
}

function ProfileTab({
  roles,
  me,
  vendor,
  onVendorUpdated,
  onMeUpdated,
}: {
  roles: RoleFlags;
  me: Me | null;
  vendor: Vendor | null;
  onVendorUpdated: (v: Vendor) => void;
  onMeUpdated: (m: Me) => void;
}) {
  /* Account identity */
  const [fullName, setFullName] = useState(me?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const nameDirty = (me?.full_name ?? "") !== fullName;

  useEffect(() => setFullName(me?.full_name ?? ""), [me?.id]);

  async function saveName() {
    const next = fullName.trim();
    if (!next) return;

    setSavingName(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { full_name: next } });
      if (error) throw error;

      onMeUpdated({
        id: data.user?.id ?? me?.id ?? "",
        email: data.user?.email ?? me?.email ?? null,
        full_name: (data.user?.user_metadata as any)?.full_name ?? next,
      });
    } finally {
      setSavingName(false);
    }
  }

  /* Vendor profile (only if vendor exists) */
  const [vendorForm, setVendorForm] = useState({
    name: "",
    whatsapp: "",
    phone: "",
    location: "",
    vendor_type: "student" as VendorType,
  });

  const [vendorTouched, setVendorTouched] = useState({
    name: false,
    whatsapp: false,
    phone: false,
    location: false,
  });

  const [vendorSaving, setVendorSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error" | "info"; text: string } | null>(
    null
  );

  // collapsible sections (mobile-first)
  const [openSection, setOpenSection] = useState<"identity" | "vendor" | "study">("identity");

  useEffect(() => {
    if (!vendor) return;
    setVendorForm({
      name: vendor.name ?? "",
      whatsapp: vendor.whatsapp ?? "",
      phone: vendor.phone ?? "",
      location: vendor.location ?? "",
      vendor_type: (vendor.vendor_type ?? "student") as VendorType,
    });
    setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
  }, [vendor?.id]);

  const vendorValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    const name = vendorForm.name.trim();
    const whatsappDigits = normalizePhone(vendorForm.whatsapp);
    const phoneDigits = normalizePhone(vendorForm.phone);

    if (!name) errors.name = "Store/Display name is required.";
    if (vendorForm.whatsapp.trim() && whatsappDigits.length < 7)
      errors.whatsapp = "Enter a valid WhatsApp number.";
    if (vendorForm.phone.trim() && phoneDigits.length < 7)
      errors.phone = "Enter a valid phone number.";

    return { errors, canSave: Object.keys(errors).length === 0 };
  }, [vendorForm]);

  const vendorDirty = useMemo(() => {
    if (!vendor) return false;
    return (
      (vendor.name ?? "") !== vendorForm.name ||
      (vendor.whatsapp ?? "") !== vendorForm.whatsapp ||
      (vendor.phone ?? "") !== vendorForm.phone ||
      (vendor.location ?? "") !== vendorForm.location ||
      (vendor.vendor_type ?? "student") !== vendorForm.vendor_type
    );
  }, [vendor, vendorForm]);

  async function saveVendor() {
    if (!vendor) return;

    setVendorTouched({ name: true, whatsapp: true, phone: true, location: true });
    if (!vendorValidation.canSave) {
      setBanner({ type: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setVendorSaving(true);
    setBanner(null);

    try {
      const payload = {
        name: vendorForm.name.trim(),
        whatsapp: vendorForm.whatsapp.trim() || null,
        phone: vendorForm.phone.trim() || null,
        location: vendorForm.location.trim() || null,
        vendor_type: vendorForm.vendor_type,
      };

      const { error } = await supabase.from("vendors").update(payload).eq("id", vendor.id);
      if (error) throw error;

      onVendorUpdated({ ...vendor, ...payload } as any);
      setBanner({ type: "success", text: "Vendor profile saved." });
      setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Save failed." });
    } finally {
      setVendorSaving(false);
    }
  }

  function cancelVendor() {
    if (!vendor) return;
    setVendorForm({
      name: vendor.name ?? "",
      whatsapp: vendor.whatsapp ?? "",
      phone: vendor.phone ?? "",
      location: vendor.location ?? "",
      vendor_type: (vendor.vendor_type ?? "student") as VendorType,
    });
    setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
    setBanner(null);
  }

  /* Study profile */
  type Semester = "first" | "second" | "summer";
  type FacultyRow = { id: string; name: string; sort_order?: number | null };
  type DeptRow = {
    id: string;
    faculty_id: string;
    display_name?: string | null;
    official_name?: string | null;
    sort_order?: number | null;
  };

  const [studyLoading, setStudyLoading] = useState(true);
  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const [studyForm, setStudyForm] = useState({
    faculty_id: "",
    department_id: "",
    faculty: "",
    department: "",
    level: 100,
    semester: "first" as Semester,
  });

  const [studySaving, setStudySaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStudyPrefs() {
      setStudyLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) return;

        const facRes = await supabase
          .from("study_faculties_clean")
          .select("id,name,sort_order")
          .order("sort_order", { ascending: true });

        const prefRes = await supabase
          .from("study_user_preferences")
          .select("faculty_id,department_id,faculty,department,level,semester")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        setFaculties((facRes.data ?? []) as any);

        const d: any = prefRes.data ?? null;
        if (d) {
          const hasIds = typeof d.faculty_id === "string" && typeof d.department_id === "string";
          setManualMode(!hasIds && (!!d.faculty || !!d.department));

          setStudyForm((s) => ({
            ...s,
            faculty_id: d.faculty_id ?? "",
            department_id: d.department_id ?? "",
            faculty: d.faculty ?? "",
            department: d.department ?? "",
            level: typeof d.level === "number" ? d.level : 100,
            semester: (d.semester as Semester) || "first",
          }));
        }
      } finally {
        if (mounted) setStudyLoading(false);
      }
    }

    loadStudyPrefs();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDepts() {
      if (manualMode) return;
      if (!studyForm.faculty_id) {
        setDepartments([]);
        return;
      }

      const depRes = await supabase
        .from("study_departments_clean")
        .select("id,faculty_id,display_name,official_name,sort_order")
        .eq("faculty_id", studyForm.faculty_id)
        .order("sort_order", { ascending: true });

      if (!mounted) return;
      setDepartments((depRes.data ?? []) as any);
    }

    loadDepts();
    return () => {
      mounted = false;
    };
  }, [manualMode, studyForm.faculty_id]);

  const studyValid = useMemo(() => {
    const lvlOk = [100, 200, 300, 400, 500, 600, 700].includes(Number(studyForm.level));
    if (!lvlOk) return false;
    if (!studyForm.semester) return false;

    if (manualMode) return !!studyForm.faculty.trim() && !!studyForm.department.trim();
    return !!studyForm.faculty_id && !!studyForm.department_id;
  }, [studyForm, manualMode]);

  async function saveStudy() {
    setStudySaving(true);
    setBanner(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;

      const level = Number(studyForm.level);
      const semester = studyForm.semester;

      const selectedFaculty = manualMode
        ? studyForm.faculty.trim()
        : faculties.find((f) => f.id === studyForm.faculty_id)?.name ?? "";

      const selectedDeptRow = manualMode
        ? null
        : departments.find((d) => d.id === studyForm.department_id) ?? null;

      const selectedDepartment = manualMode
        ? studyForm.department.trim()
        : String(selectedDeptRow?.display_name || selectedDeptRow?.official_name || "").trim();

      const payload: any = {
        user_id: user.id,
        faculty: selectedFaculty,
        department: selectedDepartment,
        level,
        semester,
        updated_at: new Date().toISOString(),
        faculty_id: manualMode ? null : studyForm.faculty_id,
        department_id: manualMode ? null : studyForm.department_id,
      };

      const prefRes = await supabase.from("study_user_preferences").upsert(payload);
      if (prefRes.error) throw prefRes.error;

      const normalized: any = {
        user_id: user.id,
        level,
        updated_at: new Date().toISOString(),
        faculty_id: manualMode ? null : studyForm.faculty_id,
        department_id: manualMode ? null : studyForm.department_id,
      };

      const normRes = await supabase.from("study_preferences").upsert(normalized);
      if (normRes.error) throw normRes.error;

      setBanner({ type: "success", text: "Study profile saved." });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Couldn’t save study profile." });
    } finally {
      setStudySaving(false);
    }
  }

  const vendErr = vendorValidation.errors;

  const hasSaveBar = nameDirty || vendorDirty;

  return (
    <div className="space-y-4">
      {banner ? (
        <Banner type={banner.type} text={banner.text} />
      ) : null}

      {/* Collapsible sections reduce scrolling + cognitive load on mobile */}
      <CollapsibleSection
        open={openSection === "identity"}
        onToggle={() => setOpenSection((s) => (s === "identity" ? "study" : "identity"))}
        title="Account identity"
        subtitle="Your name shows across the app."
      >
        <div className="grid gap-2">
          <Field
            label="Full name"
            value={fullName}
            onChange={setFullName}
            placeholder="e.g. Gratitude Developers"
          />

          {nameDirty ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFullName(me?.full_name ?? "")}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                disabled={savingName}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveName}
                className={cn(
                  "w-full rounded-2xl px-3 py-3 text-sm font-semibold",
                  savingName ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
                disabled={savingName || !fullName.trim()}
              >
                {savingName ? "Saving…" : "Save name"}
              </button>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">
              Email: <span className="font-semibold text-zinc-700">{me?.email ?? "—"}</span>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === "vendor"}
        onToggle={() => setOpenSection((s) => (s === "vendor" ? "study" : "vendor"))}
        title="Vendor profile"
        subtitle={roles.isVendor ? "What customers see in your store." : "Create a vendor profile to sell."}
        disabled={!roles.isVendor}
      >
        {roles.isVendor && vendor ? (
          <>
            <div className="grid gap-3">
              <Field
                label="Store / Display name"
                value={vendorForm.name}
                onChange={(v) => setVendorForm((s) => ({ ...s, name: v }))}
                onBlur={() => setVendorTouched((t) => ({ ...t, name: true }))}
                placeholder={defaultVendorNameFromEmail(me?.email)}
                error={vendorTouched.name ? vendErr.name : undefined}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="WhatsApp"
                  value={vendorForm.whatsapp}
                  onChange={(v) => setVendorForm((s) => ({ ...s, whatsapp: v }))}
                  onBlur={() => setVendorTouched((t) => ({ ...t, whatsapp: true }))}
                  placeholder="+234 801 234 5678"
                  error={vendorTouched.whatsapp ? vendErr.whatsapp : undefined}
                />
                <Field
                  label="Phone"
                  value={vendorForm.phone}
                  onChange={(v) => setVendorForm((s) => ({ ...s, phone: v }))}
                  onBlur={() => setVendorTouched((t) => ({ ...t, phone: true }))}
                  placeholder="+234 701 234 5678"
                  error={vendorTouched.phone ? vendErr.phone : undefined}
                />
              </div>

              <Field
                label="Location"
                value={vendorForm.location}
                onChange={(v) => setVendorForm((s) => ({ ...s, location: v }))}
                onBlur={() => setVendorTouched((t) => ({ ...t, location: true }))}
                placeholder="e.g. JABU Campus / Male Hostels"
                error={vendorTouched.location ? vendErr.location : undefined}
              />

              <div>
                <div className="text-xs font-semibold text-zinc-700">Vendor type</div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["food", "mall", "student", "other"] as VendorType[]).map((t) => {
                    const active = vendorForm.vendor_type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setVendorForm((s) => ({ ...s, vendor_type: t }))}
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-sm font-semibold capitalize transition",
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {vendorDirty ? (
              <SaveBar
                text={!vendorValidation.canSave ? "Fix errors to save" : "Unsaved vendor changes"}
                onCancel={cancelVendor}
                onSave={saveVendor}
                saving={vendorSaving}
                canSave={vendorValidation.canSave}
                saveLabel="Save vendor"
              />
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">Not a vendor yet? Create a vendor profile to sell on JabuMarket.</p>
            <Link
              href="/post"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Become a vendor
            </Link>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === "study"}
        onToggle={() => setOpenSection((s) => (s === "study" ? "identity" : "study"))}
        title="Study profile"
        subtitle="Personalizes Study: courses, materials and “For you”."
      >
        {studyLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-2xl bg-zinc-100" />
            <div className="h-10 rounded-2xl bg-zinc-100" />
            <div className="h-10 rounded-2xl bg-zinc-100" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-zinc-700">Mode</div>
              <button
                type="button"
                onClick={() => setManualMode((v) => !v)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                {manualMode ? "Use official list" : "Can’t find mine? Type manually"}
              </button>
            </div>

            {!manualMode ? (
              <>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Faculty</div>
                  <select
                    value={studyForm.faculty_id}
                    onChange={(e) =>
                      setStudyForm((s) => ({
                        ...s,
                        faculty_id: e.target.value,
                        department_id: "",
                      }))
                    }
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="">Select faculty</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Department</div>
                  <select
                    value={studyForm.department_id}
                    onChange={(e) =>
                      setStudyForm((s) => ({ ...s, department_id: e.target.value }))
                    }
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-400"
                    disabled={!studyForm.faculty_id}
                  >
                    <option value="">
                      {studyForm.faculty_id ? "Select department" : "Pick faculty first"}
                    </option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.display_name || d.official_name || "").trim()}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <Field
                  label="Faculty (manual)"
                  value={studyForm.faculty}
                  onChange={(v) => setStudyForm((s) => ({ ...s, faculty: v }))}
                  placeholder="e.g. Science"
                />
                <Field
                  label="Department (manual)"
                  value={studyForm.department}
                  onChange={(v) => setStudyForm((s) => ({ ...s, department: v }))}
                  placeholder="e.g. Computer Science"
                />
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Level</div>
                <select
                  value={String(studyForm.level)}
                  onChange={(e) =>
                    setStudyForm((s) => ({ ...s, level: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-400"
                >
                  {[100, 200, 300, 400, 500, 600, 700].map((lv) => (
                    <option key={lv} value={lv}>
                      {lv} Level
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Semester</div>
                <select
                  value={studyForm.semester}
                  onChange={(e) =>
                    setStudyForm((s) => ({ ...s, semester: e.target.value as any }))
                  }
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-400"
                >
                  <option value="first">1st Semester</option>
                  <option value="second">2nd Semester</option>
                  <option value="summer">Summer</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={saveStudy}
              disabled={!studyValid || studySaving}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-2xl px-3 py-3 text-sm font-semibold",
                !studyValid || studySaving
                  ? "bg-zinc-200 text-zinc-600"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {studySaving ? "Saving…" : "Save study profile"}
            </button>

            {!studyValid ? (
              <p className="text-xs text-zinc-500">
                Complete faculty + department and ensure level/semester are selected.
              </p>
            ) : null}
          </div>
        )}
      </CollapsibleSection>

      {/* Name save bar (separate from vendor bar) */}
      {hasSaveBar && nameDirty ? (
        <SaveBar
          text="Unsaved name change"
          onCancel={() => setFullName(me?.full_name ?? "")}
          onSave={saveName}
          saving={savingName}
          canSave={!!fullName.trim()}
          saveLabel="Save name"
        />
      ) : null}
    </div>
  );
}

function VerificationTab({
  roles,
  vendor,
  onVendorUpdated,
}: {
  roles: RoleFlags;
  vendor: Vendor | null;
  onVendorUpdated: (v: Vendor) => void;
}) {
  type RequestStatus = "requested" | "under_review" | "approved" | "rejected";
  type RequestRow = {
    id: string;
    vendor_id: string;
    status: RequestStatus;
    note: string | null;
    rejection_reason: string | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
  };

  type DocRow = {
    id: string;
    vendor_id: string;
    doc_type: string;
    file_path: string;
    created_at: string;
  };

  const BUCKET = "vendor-verification";

  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<RequestRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [banner, setBanner] = useState<{ type: "success" | "error" | "info"; text: string } | null>(
    null
  );

  const [docType, setDocType] = useState("id_card");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [note, setNote] = useState("");
  const [requesting, setRequesting] = useState(false);

  const isVerified = !!vendor?.verified || vendor?.verification_status === "verified";
  const pending = req?.status === "requested" || req?.status === "under_review";
  const canUploadDocs = !isVerified && !pending;
  const canDeleteDocs = !isVerified && !pending;

  const canRequest =
    !!vendor?.id && !isVerified && !pending && !!docs.length && (!req || req.status === "rejected");

  const step = useMemo(() => {
    if (isVerified) return 4;
    if (!req) return 1;
    if (req.status === "requested") return 2;
    if (req.status === "under_review") return 3;
    if (req.status === "approved") return 4;
    if (req.status === "rejected") return 1;
    return 1;
  }, [req, isVerified]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setBanner(null);
      setReq(null);
      setDocs([]);

      if (!roles.isVendor || !vendor?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data: r, error: rErr } = await supabase
          .from("vendor_verification_requests")
          .select("id,vendor_id,status,note,rejection_reason,created_at,reviewed_at,reviewed_by")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (rErr) throw rErr;
        const latest = (r?.[0] ?? null) as any;

        const { data: d, error: dErr } = await supabase
          .from("vendor_verification_docs")
          .select("id,vendor_id,doc_type,file_path,created_at")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false });

        const docsRows = dErr ? [] : ((d ?? []) as any);

        if (!mounted) return;
        setReq(latest);
        setDocs(docsRows);
      } catch (e: any) {
        if (!mounted) return;
        setBanner({ type: "error", text: e?.message ?? "Failed to load verification data." });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [roles.isVendor, vendor?.id]);

  async function refreshStatus() {
    if (!roles.isVendor || !vendor?.id) return;

    const { data: r, error: rErr } = await supabase
      .from("vendor_verification_requests")
      .select("id,vendor_id,status,note,rejection_reason,created_at,reviewed_at,reviewed_by")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!rErr) {
      const latest = (r?.[0] ?? null) as any;
      setReq(latest);
    }

    const { data: v2 } = await supabase
      .from("vendors")
      .select("verified,verification_status,verified_at,rejected_at,rejection_reason")
      .eq("id", vendor.id)
      .maybeSingle();

    if (v2) onVendorUpdated({ ...vendor, ...(v2 as any) });
  }

  useEffect(() => {
    if (!roles.isVendor || !vendor?.id) return;
    if (isVerified) return;

    const t = setInterval(() => {
      refreshStatus();
    }, 8000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.isVendor, vendor?.id, isVerified]);

  async function openDoc(path: string) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Could not open document." });
    }
  }

  async function deleteDoc(doc: { id: string; file_path: string }) {
    if (!vendor?.id) return;
    if (!canDeleteDocs) {
      setBanner({ type: "info", text: "You can’t delete documents while a request is pending review." });
      return;
    }

    setBanner(null);

    try {
      const { error: delRowErr } = await supabase
        .from("vendor_verification_docs")
        .delete()
        .eq("id", doc.id)
        .eq("vendor_id", vendor.id);

      if (delRowErr) throw delRowErr;

      await supabase.storage.from(BUCKET).remove([doc.file_path]);

      setDocs((prev) => prev.filter((x) => x.id !== doc.id));
      setBanner({ type: "success", text: "Document deleted." });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Delete failed." });
    }
  }

  async function uploadDoc() {
    if (!vendor?.id) return;
    if (!file) {
      setBanner({ type: "error", text: "Choose a file to upload." });
      return;
    }
    if (!canUploadDocs) {
      setBanner({ type: "info", text: "Uploads are locked while your request is being reviewed." });
      return;
    }

    setUploading(true);
    setBanner(null);

    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const safeType = docType.replace(/[^\w-]/g, "_");
      const path = `${vendor.id}/${Date.now()}_${safeType}.${ext}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("vendor_verification_docs")
        .insert({ vendor_id: vendor.id, doc_type: docType, file_path: path })
        .select("id,vendor_id,doc_type,file_path,created_at")
        .single();

      if (insErr) throw insErr;

      setDocs((prev) => [row as any, ...prev]);
      setFile(null);
      setBanner({ type: "success", text: "Document uploaded." });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function submitRequest() {
    if (!vendor?.id) return;

    if (!docs.length) {
      setBanner({ type: "error", text: "Upload at least one document before requesting verification." });
      return;
    }
    if (!canRequest) {
      setBanner({ type: "info", text: "You already have a pending request, or you’re verified." });
      return;
    }

    setRequesting(true);
    setBanner(null);

    try {
      const { data: created, error: cErr } = await supabase
        .from("vendor_verification_requests")
        .insert({
          vendor_id: vendor.id,
          status: "requested",
          note: note.trim() || null,
          rejection_reason: null,
        })
        .select("id,vendor_id,status,note,rejection_reason,created_at,reviewed_at,reviewed_by")
        .single();

      if (cErr) throw cErr;

      await supabase.from("vendors").update({ verification_status: "requested" }).eq("id", vendor.id);

      setReq(created as any);
      setNote("");
      setBanner({ type: "success", text: "Verification requested. You’ll be reviewed soon." });

      onVendorUpdated({
        ...vendor,
        verification_status: "requested",
        verified: false,
      });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Request failed." });
    } finally {
      setRequesting(false);
    }
  }

  if (!roles.isVendor || !vendor) {
    return (
      <SectionCard title="Verification" desc="Verification is only for vendors.">
        <p className="text-sm text-zinc-700">
          Create a vendor profile to request verification.
        </p>
        <Link
          href="/post"
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Become a vendor
        </Link>
      </SectionCard>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded-2xl bg-zinc-100" />
        <div className="h-28 rounded-3xl bg-zinc-100" />
        <div className="h-44 rounded-3xl bg-zinc-100" />
      </div>
    );
  }

  if (isVerified) {
    return (
      <div className="space-y-4">
        <SectionCard title="✅ Vendor verified" desc="Customers will see your verified badge." tone="success">
          <div className="rounded-2xl border border-emerald-200 bg-white p-3 text-sm text-emerald-900">
            <div>
              <span className="text-emerald-700">Store:</span>{" "}
              <span className="font-semibold">{vendor?.name ?? "—"}</span>
            </div>
            <div className="mt-1">
              <span className="text-emerald-700">Verified at:</span>{" "}
              <span className="font-semibold">{vendor?.verified_at ?? "—"}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Next" desc="Improve your store profile and listings.">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/me?tab=profile"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Edit profile
            </Link>
            <Link
              href="/my-listings"
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-3 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              My listings
            </Link>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner ? <Banner type={banner.type} text={banner.text} /> : null}

      <Stepper step={step} req={req} vendor={vendor} />

      <SectionCard
        title="1) Upload documents"
        desc="Upload clear proof to speed approval (ID card, student ID, business doc, etc)."
        right={
          pending ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
              Locked
            </span>
          ) : (
            <button
              type="button"
              onClick={() => refreshStatus()}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </button>
          )
        }
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <div className="text-xs font-semibold text-zinc-700">Doc type</div>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={cn(
                "mt-1 w-full rounded-2xl border bg-white px-3 py-3 text-sm outline-none",
                canUploadDocs ? "border-zinc-200 focus:border-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-400"
              )}
              disabled={!canUploadDocs}
            >
              <option value="id_card">ID Card</option>
              <option value="student_id">Student ID</option>
              <option value="business_doc">Business Document</option>
              <option value="utility_bill">Utility Bill</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block sm:col-span-2">
            <div className="text-xs font-semibold text-zinc-700">File</div>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={!canUploadDocs}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={cn(
                "mt-1 w-full rounded-2xl border bg-white px-3 py-3 text-sm outline-none",
                !canUploadDocs ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-200 focus:border-zinc-400"
              )}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={uploadDoc}
          disabled={uploading || !file || !canUploadDocs}
          className={cn(
            "mt-3 inline-flex w-full items-center justify-center rounded-2xl px-3 py-3 text-sm font-semibold",
            uploading || !file || !canUploadDocs
              ? "bg-zinc-200 text-zinc-600"
              : "bg-zinc-900 text-white hover:bg-zinc-800"
          )}
        >
          {uploading ? "Uploading…" : "Upload document"}
        </button>

        {pending ? (
          <p className="mt-2 text-xs text-zinc-500">
            While review is pending, uploads/deletions are locked to keep your submission stable.
          </p>
        ) : null}

        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-700">Uploaded documents</div>
          {docs.length ? (
            <div className="mt-2 space-y-2">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {d.doc_type.replace(/_/g, " ")}
                    </div>
                    <div className="truncate text-xs text-zinc-500">{d.file_path}</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openDoc(d.file_path)}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      View
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteDoc({ id: d.id, file_path: d.file_path })}
                      disabled={!canDeleteDocs}
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-xs font-semibold",
                        !canDeleteDocs
                          ? "border-zinc-200 bg-zinc-100 text-zinc-400"
                          : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">No documents uploaded yet.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="2) Request verification"
        desc="Admins will review your docs and approve or reject with a reason."
        right={
          req ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
              Status: {req.status.replace(/_/g, " ")}
            </span>
          ) : null
        }
      >
        {req?.status === "rejected" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <div className="font-semibold">Rejected</div>
            <div className="mt-1">
              Reason:{" "}
              <span className="font-medium">
                {req.rejection_reason || vendor.rejection_reason || "—"}
              </span>
            </div>
            <div className="mt-2 text-rose-700">Fix your docs/details and submit a new request.</div>
          </div>
        ) : null}

        {req && (req.status === "requested" || req.status === "under_review" || req.status === "approved") ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
            <div className="font-semibold">Request in progress</div>
            <div className="mt-1 text-zinc-700">
              Your request is <span className="font-semibold">{req.status.replace(/_/g, " ")}</span>. No need to submit again.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <div className="text-xs font-semibold text-zinc-700">Note (optional)</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything admins should know? e.g. ‘I’m a campus vendor at male hostel gate.’"
                className="mt-1 min-h-[96px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>

            <button
              type="button"
              onClick={submitRequest}
              disabled={!canRequest || requesting}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-2xl px-3 py-3 text-sm font-semibold",
                !canRequest || requesting ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {requesting ? "Submitting…" : "Request verification"}
            </button>

            {!docs.length ? (
              <p className="text-xs text-zinc-500">Upload at least one document to enable request.</p>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Current status" desc="A quick summary of where you are right now.">
        <p className="text-sm text-zinc-700">
          {isVerified
            ? "✅ You’re verified."
            : req
            ? `Your latest request is: ${req.status.replace(/_/g, " ")}.`
            : "No request submitted yet."}
        </p>
      </SectionCard>
    </div>
  );
}

function Stepper({ step, req, vendor }: { step: number; req: any; vendor: Vendor }) {
  const steps = [
    { n: 1, title: "Upload", desc: "Add documents" },
    { n: 2, title: "Request", desc: "Submit" },
    { n: 3, title: "Review", desc: "Admin checks" },
    { n: 4, title: "Result", desc: "Approved/Rejected" },
  ];

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Verification</div>
          <div className="mt-1 text-sm text-zinc-600">
            Status:{" "}
            <span className="font-semibold text-zinc-800">
              {vendor.verified || vendor.verification_status === "verified"
                ? "verified"
                : req?.status
                ? String(req.status).replace(/_/g, " ")
                : "not started"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
          Step {step}/4
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {steps.map((s) => {
          const done = s.n < step;
          const active = s.n === step;
          return (
            <div key={s.n} className="min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl border px-2 py-2 text-xs font-semibold",
                  done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600"
                )}
              >
                {s.title}
              </div>
              <div className="mt-1 truncate text-[11px] text-zinc-500">{s.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountTab({ me, onSignOut }: { me: Me | null; onSignOut: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Account" desc="Your sign-in identity">
        <p className="text-sm text-zinc-700">
          Email: <span className="font-semibold">{me?.email ?? "—"}</span>
        </p>
      </SectionCard>

      <button
        onClick={onSignOut}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}

/* ----------------------------- Small UI Utils ----------------------------- */

function Banner(props: { type: "success" | "error" | "info"; text: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 text-sm shadow-sm",
        props.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : props.type === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-zinc-200 bg-white text-zinc-800"
      )}
      role="status"
    >
      {props.text}
    </div>
  );
}

function SaveBar(props: {
  text: string;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  saveLabel: string;
}) {
  return (
    <div className="sticky bottom-3 z-10">
      <div className="rounded-3xl border border-zinc-200 bg-white/90 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-zinc-700">{props.text}</div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onCancel}
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              disabled={props.saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onSave}
              disabled={props.saving || !props.canSave}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm font-semibold",
                props.saving || !props.canSave
                  ? "bg-zinc-200 text-zinc-600"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {props.saving ? "Saving…" : props.saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection(props: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const disabled = !!props.disabled;

  return (
    <div className={cn("rounded-3xl border shadow-sm", disabled ? "border-zinc-200 bg-white" : "border-zinc-200 bg-white")}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) props.onToggle();
        }}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-4 text-left",
          disabled ? "cursor-default" : "hover:bg-zinc-50"
        )}
        aria-expanded={props.open}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{props.title}</div>
          {props.subtitle ? (
            <div className="mt-1 text-sm text-zinc-600">{props.subtitle}</div>
          ) : null}
          {disabled ? (
            <div className="mt-1 text-xs text-zinc-500">Available after you become a vendor.</div>
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-zinc-500 transition",
            props.open ? "rotate-180" : "rotate-0",
            disabled ? "opacity-40" : "opacity-100"
          )}
        />
      </button>

      {props.open && !disabled ? (
        <div className="border-t border-zinc-200 px-4 pb-4 pt-4">{props.children}</div>
      ) : null}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-zinc-700">{props.label}</div>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        placeholder={props.placeholder}
        className={cn(
          "mt-1 w-full rounded-2xl border bg-white px-3 py-3 text-sm text-zinc-900 outline-none",
          props.error ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-400"
        )}
      />
      {props.error ? <div className="mt-1 text-xs font-medium text-rose-700">{props.error}</div> : null}
    </label>
  );
}

export default function MePage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-4xl px-4 py-6">Loading…</div>}>
      <MeInner />
    </Suspense>
  );
}