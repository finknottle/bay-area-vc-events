export const SOURCES = [
  { name: 'a16z Events', url: 'https://a16z.com/events/', kind: 'html' },
  { name: 'Lightspeed Events', url: 'https://lsvp.com/events/', kind: 'html' },
  { name: 'Pear VC', url: 'https://www.pear.vc/events', kind: 'html' },

  // New sources
  { name: 'Plug and Play — All Events', url: 'https://www.plugandplaytechcenter.com/all-events', kind: 'html' },
  { name: 'Bay Area Founders Club (Substack)', url: 'https://bayareafoundersclub.substack.com/', kind: 'html' },

  // Luma calendars (rendered client-side) — use browser collector
  { name: 'Luma — pear.vc', url: 'https://luma.com/pear.vc', kind: 'luma_calendar' },
  { name: 'Luma — usr-LeHV7SEMDPComtM', url: 'https://luma.com/user/usr-LeHV7SEMDPComtM', kind: 'luma_calendar' },
  { name: 'Luma — SFSFEvents', url: 'https://luma.com/SFSFEvents', kind: 'luma_calendar' },
  { name: 'Luma — single event seed', url: 'https://luma.com/11l05xui', kind: 'luma_event' },

  // Eventbrite discovery page → deep-crawl detail pages
  { name: 'Eventbrite SF Tech', url: 'https://www.eventbrite.com/d/ca--san-francisco/tech-events/', kind: 'eventbrite_listing' },

  // X account monitoring (best-effort, unauthenticated)
  { name: 'X: Menlo Ventures', url: 'https://x.com/MenloVentures', kind: 'x_account' },
  { name: 'X: a16z', url: 'https://x.com/a16z', kind: 'x_account' },
  { name: 'X: Maven', url: 'https://x.com/mavenvc', kind: 'x_account' },
  { name: 'X: First Round', url: 'https://x.com/firstround', kind: 'x_account' },
  { name: 'X: NFX', url: 'https://x.com/NFX', kind: 'x_account' },
  { name: 'X: Pear', url: 'https://x.com/pearvc', kind: 'x_account' }
];
