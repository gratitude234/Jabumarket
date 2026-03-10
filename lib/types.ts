export type ListingType = "product" | "service";

export type ListingRow = {
  id: string;
  vendor_id: string | null;
  title: string;
  description: string | null;
  listing_type: ListingType;
  category: string;
  price: number | null;
  price_label: string | null;
  location: string | null;
  image_url: string | null;
  /** Multi-image support — array of public URLs. Falls back to [image_url] if absent. */
  image_urls?: string[] | null;
  negotiable: boolean | null;
  status: "active" | "sold" | "inactive";
  created_at: string | null;
};

export type VendorType = "food" | "mall" | "student" | "other";

export type VendorVerificationStatus =
  | "unverified"
  | "requested"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended";

// Vendors can be joined in different places with different column sets,
// so most fields are optional here for flexibility.
export type VendorRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  location?: string | null;
  vendor_type?: VendorType | null;

  // Legacy flag (keep for backwards compatibility)
  verified?: boolean | null;

  // New verification system
  verification_status?: VendorVerificationStatus | null;
  verification_requested_at?: string | null;
  verified_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
};

export type VendorVerificationRequestRow = {
  id: string;
  vendor_id: string;
  status: "requested" | "under_review" | "approved" | "rejected";
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type VendorVerificationDocRow = {
  id: string;
  vendor_id: string;
  doc_type: string;
  file_path: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Study Hub — Practice engine types (moved from usePracticeEngine.ts — Step 2.5)
// ---------------------------------------------------------------------------

export type QuizSet = {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  level: string | null;
  time_limit_minutes: number | null;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number | null;
};

export type QuizOption = {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number | null;
};

export type ReviewTab = "all" | "wrong" | "flagged" | "unanswered";
export type CourierRow = {
  id: string;
  name: string;
  whatsapp: string;
  phone: string | null;
  base_location: string | null;
  areas_covered: string | null;
  hours: string | null;
  price_note: string | null;
  verified: boolean;
  active: boolean;
  featured?: boolean | null;
  created_at: string | null;
};

// Delivery agents directory / verification
export type RiderRow = {
  id: string;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  zone: string | null;
  fee_note: string | null;
  is_available: boolean | null;
  verified: boolean;
  created_at: string | null;
};
export type DeliveryStatus = "open" | "accepted" | "picked_up" | "delivered" | "cancelled";

export type DeliveryRequestRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  vendor_id: string | null;
  rider_id: string | null;
  dropoff: string;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
};