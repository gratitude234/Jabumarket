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


export type RiderRow = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  zone: string | null;
  fee_note: string | null;
  is_available: boolean;
  verified: boolean;
  created_at: string | null;
};

export type DeliveryStatus =
  | "requested"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type DeliveryRow = {
  id: string;
  listing_id: string | null;
  vendor_id: string | null;
  buyer_phone: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  note: string | null;
  rider_id: string | null;
  status: DeliveryStatus;
  created_at: string | null;
};
