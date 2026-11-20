import { formatMoney, toDecimalString } from './money';
import { firstName } from './text';

const VPA = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isVpa(value: string): boolean {
  return VPA.test(value.trim());
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '').slice(0, 15);
  return plus ? `+${digits}` : digits;
}

export function isPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/** Digits for wa.me: country code required, so a bare 10-digit Indian number gets 91. */
export function waNumber(phone: string, currency: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!phone.trim().startsWith('+') && digits.length === 10 && currency === 'INR') return `91${digits}`;
  return digits.replace(/^0+/, '');
}

export function upiLink(params: { vpa: string; name?: string; amount?: number; note?: string }): string | null {
  if (!isVpa(params.vpa)) return null;
  const query = [`pa=${encodeURIComponent(params.vpa.trim())}`];
  if (params.name) query.push(`pn=${encodeURIComponent(params.name.slice(0, 50))}`);
  if (params.amount && params.amount > 0) query.push(`am=${toDecimalString(params.amount)}`);
  query.push('cu=INR');
  if (params.note) query.push(`tn=${encodeURIComponent(params.note.slice(0, 50))}`);
  return `upi://pay?${query.join('&')}`;
}

export function whatsappLink(phone: string, text: string, currency: string): string | null {
  const number = waNumber(phone, currency);
  if (number.length < 7) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function smsLink(phone: string, text: string, ios: boolean): string | null {
  const number = normalizePhone(phone);
  if (!isPhone(number)) return null;
  return `sms:${number}${ios ? '&' : '?'}body=${encodeURIComponent(text)}`;
}

export function reminderMessage(params: {
  friend: string;
  amount: number;
  currency: string;
  myName: string;
  myUpi: string;
}): string {
  const first = firstName(params.friend);
  const amount = formatMoney(params.amount, params.currency, { sign: 'never' });
  const lines = [`Hey ${first}! Just a friendly reminder about the ${amount} you owe me \u{1F642}`];
  if (params.currency === 'INR' && isVpa(params.myUpi)) {
    lines.push(`You can pay me on UPI: ${params.myUpi.trim()}`);
  }
  lines.push(params.myName.trim() ? `Thanks! \u2014 ${params.myName.trim()}` : 'Thanks!');
  return lines.join('\n');
}
