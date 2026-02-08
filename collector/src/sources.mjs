export const SOURCES = [
  { name: 'a16z Events', url: 'https://a16z.com/events/', kind: 'html' },
  { name: 'Lightspeed Events', url: 'https://lsvp.com/events/', kind: 'html' },
  { name: 'Pear VC', url: 'https://www.pear.vc/events', kind: 'html' },
  { name: 'Luma SF (Community)', url: 'https://lu.ma/sf', kind: 'html' },
  { name: 'Eventbrite SF Tech', url: 'https://www.eventbrite.com/d/ca--san-francisco/tech-events/', kind: 'html' },

  // NOTE: Sequoia events page currently returns 403 to non-browser clients.
  // We'll add a browser-based fetch or alternate source later.
];
