export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function textField(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string') throw new InputError(`Please enter ${label}.`);
  const text = value.trim();
  if ((required && !text) || text.length > max) throw new InputError(`Please enter ${label} (${max} characters maximum).`);
  return text;
}
export function parseRsvp(value: Record<string, unknown>) {
  if (!isUuid(value.token)) throw new InputError('Please use your private invitation link or code.');
  if (value.website) throw new InputError('Unable to accept this response.');
  const name = textField(value.name, 'your name', 120);
  const email = textField(value.email, 'your email address', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Please enter a valid email address.');
  if (value.attending !== true && value.attending !== false) throw new InputError('Please choose whether you can attend.');
  if (!Number.isInteger(value.guests) || (value.guests as number) < 0 || (value.guests as number) > 2) throw new InputError('Please enter a valid guest count.');
  if (value.attending && (value.guests as number) < 1) throw new InputError('Please include at least one guest.');
  if (!value.attending && value.guests !== 0) throw new InputError('Guest count must be zero when declining.');
  return { token: value.token, name, email, attending: value.attending, guests: value.guests as number, message: textField(value.message, 'a message', 2000) };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
