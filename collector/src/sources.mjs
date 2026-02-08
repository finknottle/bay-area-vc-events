export const SOURCES = [
  { name: 'a16z Events', url: 'https://a16z.com/events/', kind: 'html' },
  // Sequoia events page currently returns 403 to non-browser clients.
  // We'll add a browser-based fetch or an alternate feed later.

  { name: 'Lightspeed Events', url: 'https://lsvp.com/events/', kind: 'html' }

  // Greylock + Accel don't appear to have stable public /events pages (were 404 at time of setup).
  // We'll add alternate sources (e.g., Luma collections, Eventbrite org pages, or newsletters) next.
];
