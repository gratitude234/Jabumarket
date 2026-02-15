export type ListingType = "product" | "service";

export type Listing = {
  id: string;
  title: string;
  type: ListingType;
  category: string;
  price: number | null;
  priceLabel?: string;
  location: string;
  createdAt: string;
  imageUrl: string;
  negotiable?: boolean;
  description?: string;
  whatsapp?: string;
  sellerName?: string;
};

export const CATEGORIES = [
  "Phones",
  "Laptops",
  "Fashion",
  "Provisions",
  "Food",
  "Beauty",
  "Services",
  "Repairs",
  "Tutoring",
  "Others",
];

export const DUMMY_LISTINGS: Listing[] = [
  {
    id: "l1",
    title: "iPhone 11 (UK Used) - 64GB",
    type: "product",
    category: "Phones",
    price: 320000,
    location: "JABU Campus",
    createdAt: "2h ago",
    imageUrl:
      "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=1200&q=60",
    negotiable: true,
    sellerName: "Student Seller",
    whatsapp: "2348012345678",
    description:
      "Clean UK used iPhone 11. Battery health is good, everything works perfectly. Comes with charger. Serious buyers only.",
  },
  {
    id: "l2",
    title: "HP EliteBook 840 G5 (8GB/256SSD)",
    type: "product",
    category: "Laptops",
    price: 280000,
    location: "Iperu",
    createdAt: "5h ago",
    imageUrl:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=60",
    sellerName: "Campus Gadget Hub",
    whatsapp: "2348098765432",
    description:
      "Solid laptop for school + coding. 8GB RAM, 256GB SSD, good battery. Delivery within campus available.",
  },
  {
    id: "l3",
    title: "Laundry Service (Pickup & Delivery)",
    type: "service",
    category: "Services",
    price: null,
    priceLabel: "From ₦1,000",
    location: "JABU Campus",
    createdAt: "Today",
    imageUrl:
      "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1200&q=60",
    sellerName: "FreshFold Laundry",
    whatsapp: "2348033344455",
    description:
      "Quick wash, iron and fold. Pickup & delivery within campus. Same day service available depending on load.",
  },
  {
    id: "l4",
    title: "Student Provisions: Noodles, Eggs, Bread",
    type: "product",
    category: "Provisions",
    price: null,
    priceLabel: "Retail prices",
    location: "JABU Campus",
    createdAt: "Yesterday",
    imageUrl:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=60",
    sellerName: "Blessed Provisions",
    whatsapp: "2348077788899",
    description:
      "Affordable provisions for students. Bulk discount available. Delivery within campus for orders above ₦3,000.",
  },
];
