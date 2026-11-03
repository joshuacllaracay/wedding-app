import { wedding } from '../config/wedding';

// Shared by the new-invitation result, Copy link, and QR downloads.
// The browser's current origin can be a protected Vercel deployment.
export function invitationLink(token: string): string {
  const url = new URL('/', wedding.invitationSiteUrl);
  url.searchParams.set('invite', token);
  return url.href;
}
