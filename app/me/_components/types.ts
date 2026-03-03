// app/me/_components/types.ts

export type TabKey = "overview" | "profile" | "verification" | "account";

export type VendorType = "food" | "mall" | "student" | "other";

export type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export type Vendor = {
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

export type StudyRole = "course_rep" | "dept_librarian";
export type StudyStatus = "not_applied" | "pending" | "approved" | "rejected";

export type StudyScope = {
  faculty_id: string | null;
  department_id: string | null;
  levels: number[] | null;
  all_levels: boolean;
};

export type StudyMeResponse =
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

export type RoleFlags = {
  // Market
  isVendor: boolean;
  isVerifiedVendor: boolean;

  // Study
  studyLoading: boolean;
  studyStatus: StudyStatus | null;
  studyRole: StudyRole | null;
  isStudyContributor: boolean;
};