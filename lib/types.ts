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
  negotiable: boolean | null;
  status: "active" | "sold" | "inactive";
  created_at: string | null;
};

export type VendorType = "food" | "mall" | "student" | "other";

// Vendors can be joined in different places with different column sets,
// so most fields are optional here for flexibility.
export type VendorRow = {
  id: string;
  name?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  location?: string | null;
  verified?: boolean | null;
  vendor_type?: VendorType | null;
  verification_requested?: boolean | null;
};

// Delivery / courier directory (lightweight: no delivery "orders" in-app)
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

// Riders (delivery guys directory / verification)
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
