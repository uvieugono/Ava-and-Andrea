// How people reach GymTrack when they cannot sign in. The mailbox is never shown on a page.
export const SUPPORT_WHATSAPP_DISPLAY = '0704 065 5667';
export const SUPPORT_WHATSAPP_INTERNATIONAL = '2347040655667';

/** A wa.me link that opens a chat with this number and the message typed in. */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  const international = digits.startsWith('0') ? `234${digits.slice(1)}` : /^[789]\d{9}$/.test(digits) ? `234${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}
