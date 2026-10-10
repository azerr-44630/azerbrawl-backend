import xss from 'xss';

export const clean = (str) => xss(String(str || '').trim());

export const normalizePhone = (raw) => {
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+994')) return digits;
  if (digits.startsWith('994')) return '+' + digits;
  if (digits.startsWith('0')) return '+994' + digits.slice(1);
  if (digits.length === 9) return '+994' + digits;
  return digits;
};
