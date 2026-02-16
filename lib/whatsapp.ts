export function getWhatsAppLink(phone: string, text: string) {
  const safe = String(phone ?? "").replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  // wa.me requires country code (e.g., 234...)
  return `https://wa.me/${safe}?text=${msg}`;
}
