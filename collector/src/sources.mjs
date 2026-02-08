export const SOURCES = [
  { name: 'a16z Events', url: 'https://a16z.com/events/', kind: 'html' },
  { name: 'Lightspeed Events', url: 'https://lsvp.com/events/', kind: 'html' },

  // Community / event platforms
  // (These are examples; we'll tune + expand.)
  { name: 'Pear VC (site)', url: 'https://pear.vc/', kind: 'html' },
  { name: 'Luma (homepage)', url: 'https://lu.ma/', kind: 'html' },

  // NOTE: Sequoia events page currently returns 403 to non-browser clients.
  // We'll add a browser-based fetch or alternate source later.
];
