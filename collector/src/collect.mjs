import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { SOURCES } from './sources.mjs';
import { stableId, isLikelyDateLine } from './util.mjs';
import { withBrowser, getRenderedHtml, extractAnchors } from './browser.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname, '..');
const OUT = resolve(ROOT, 'data', 'events.json');
const OUT_SITE = resolve(ROOT, 'site', 'events.json');

async function getHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BayAreaVCEventsBot/0.2; +https://github.com/finknottle/bay-area-vc-events)'
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

function parseJsonLdEvents(html, { source_name, source_url }) {
  const $ = cheerio.load(html);
  const out = [];

  function priceFromOffers(offers) {
    if (!offers) return null;
    const o = Array.isArray(offers) ? offers[0] : offers;
    if (!o || typeof o !== 'object') return null;

    // Common JSON-LD patterns
    if (o.price === 0 || o.price === '0') return 'Free';
    if (o.price != null && o.priceCurrency) return `${o.priceCurrency}${o.price}`;
    if (o.price != null) return String(o.price);

    return null;
  }

  function pushFrom(obj) {
    if (!obj || typeof obj !== 'object') return;
    const t = obj['@type'];
    const types = Array.isArray(t) ? t : [t];
    const isEvent = types.some((x) => typeof x === 'string' && x.toLowerCase().includes('event'));
    if (!isEvent) return;

    const title = obj.name || obj.headline || '';
    const start = obj.startDate || null;
    const end = obj.endDate || null;

    let location = '';
    const loc = obj.location;
    if (typeof loc === 'string') location = loc;
    else if (loc && typeof loc === 'object') {
      if (loc.name) location = loc.name;
      const addr = loc.address;
      if (addr) {
        if (typeof addr === 'string') location += (location ? ' — ' : '') + addr;
        else if (typeof addr === 'object') {
          const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean);
          if (parts.length) location += (location ? ' — ' : '') + parts.join(', ');
        }
      }
    }

    const rsvp = obj.url || obj.offers?.url || obj.mainEntityOfPage?.url || null;
    const price = priceFromOffers(obj.offers) || null;

    const id = stableId(source_name, title || rsvp || source_url, start || '');

    out.push({
      id,
      title: String(title || '(untitled)').slice(0, 200),
      start: start ? String(start) : null,
      end: end ? String(end) : null,
      timezone: 'America/Los_Angeles',
      location,
      city: null,
      price,
      region: 'unknown',
      rsvp_url: rsvp ? String(rsvp) : null,
      source_name,
      source_url,
      tags: []
    });
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const x of parsed) pushFrom(x);
      } else if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
        for (const x of parsed['@graph']) pushFrom(x);
      } else {
        pushFrom(parsed);
      }
    } catch {
      // ignore
    }
  });

  const uniq = new Map(out.map((e) => [e.id, e]));
  return [...uniq.values()];
}

function parseGeneric(html, { source_name, source_url }) {
  // Prefer structured extraction
  const jsonld = parseJsonLdEvents(html, { source_name, source_url });
  if (jsonld.length) return jsonld;

  // Fallback heuristic text lines (MVP)
  const $ = cheerio.load(html);
  const candidates = [];
  $('h1,h2,h3,p,li').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length < 10) return;
    if (!isLikelyDateLine(t)) return;
    candidates.push(t);
  });

  const events = [];
  for (const t of candidates.slice(0, 250)) {
    const id = stableId(source_name, t);
    events.push({
      id,
      title: t.slice(0, 200),
      start: null,
      end: null,
      timezone: 'America/Los_Angeles',
      location: '',
      city: null,
      price: null,
      region: 'unknown',
      rsvp_url: null,
      source_name,
      source_url,
      tags: []
    });
  }

  const uniq = new Map(events.map((e) => [e.id, e]));
  return [...uniq.values()];
}

function extractLinks(html, baseUrl, predicate) {
  const $ = cheerio.load(html);
  const hrefs = new Set();
  $('a[href]').each((_, el) => {
    const h = String($(el).attr('href') || '').trim();
    if (!h) return;
    try {
      const u = new URL(h, baseUrl).toString();
      if (predicate(u)) hrefs.add(u);
    } catch {
      // ignore
    }
  });
  return [...hrefs.values()];
}

async function collectFromLumaCalendar(src) {
  // Luma calendars are client-rendered; use browser to pull event links.
  return await withBrowser(async ({ page }) => {
    const html = await getRenderedHtml(page, src.url);

    // Find any lu.ma event URLs in rendered HTML
    const anchors = await extractAnchors(page);
    const links = anchors
      .map((h) => {
        try {
          return new URL(h, src.url).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const eventLinks = Array.from(
      new Set(
        links.filter((u) => /^https:\/\/lu\.ma\/[a-z0-9]+$/i.test(u) && !u.includes('/home'))
      )
    ).slice(0, 40);

    const events = [];
    for (const link of eventLinks) {
      try {
        // event page should contain JSON-LD
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        const evHtml = await page.content();
        const parsed = parseJsonLdEvents(evHtml, { source_name: src.name, source_url: link });
        for (const e of parsed) {
          e.rsvp_url = e.rsvp_url || link;
          e.source_url = link;
          events.push(e);
        }
      } catch {
        // skip
      }
    }

    // fallback: try JSON-LD directly from calendar if present
    if (!events.length) {
      const parsed = parseJsonLdEvents(html, { source_name: src.name, source_url: src.url });
      events.push(...parsed);
    }

    return events;
  });
}

async function collectFromEventbriteListing(src) {
  const html = await getHtml(src.url);
  const links = extractLinks(html, src.url, (u) => u.includes('eventbrite.com/e/'))
    .map((u) => u.split('?')[0])
    .slice(0, 40);

  const events = [];
  for (const link of links) {
    try {
      const evHtml = await getHtml(link);
      const parsed = parseJsonLdEvents(evHtml, { source_name: src.name, source_url: link });
      for (const e of parsed) {
        e.rsvp_url = e.rsvp_url || link;
        e.source_url = link;
        events.push(e);
      }
    } catch {
      // skip
    }
  }
  return events;
}

async function collectFromLumaEvent(src) {
  return await withBrowser(async ({ page }) => {
    await page.goto(src.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const html = await page.content();
    const parsed = parseJsonLdEvents(html, { source_name: src.name, source_url: src.url });
    for (const e of parsed) {
      e.rsvp_url = e.rsvp_url || src.url;
      e.source_url = src.url;
    }
    return parsed;
  });
}

async function collectFromXAccount(src) {
  // Best-effort: load profile, extract outbound links to known event platforms.
  const EVENT_DOMAINS = [
    'lu.ma/',
    'luma.com/',
    'eventbrite.com/e/',
    'meetup.com/',
    'partiful.com/',
    'splashthat.com/',
    'tinyurl.com/',
    'bit.ly/'
  ];

  return await withBrowser(async ({ page }) => {
    await page.goto(src.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const anchors = await extractAnchors(page);
    const links = anchors
      .map((h) => {
        try {
          return new URL(h, src.url).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const candidates = Array.from(
      new Set(
        links
          .filter((u) => EVENT_DOMAINS.some((d) => u.includes(d)))
          .map((u) => u.split('?')[0])
      )
    ).slice(0, 25);

    const events = [];
    for (const link of candidates) {
      // Only ingest pages we can parse into dated events.
      try {
        // Luma event pages will be handled by browser
        if (/^https:\/\/(lu\.ma|luma\.com)\/[a-z0-9]+$/i.test(link)) {
          await page.goto(link, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1500);
          const html = await page.content();
          const parsed = parseJsonLdEvents(html, { source_name: src.name, source_url: link });
          for (const e of parsed) {
            e.rsvp_url = e.rsvp_url || link;
            e.source_url = link;
            e.tags = [...(e.tags || []), 'from_x'];
            events.push(e);
          }
          continue;
        }

        // Eventbrite etc: fetch HTML normally
        const evHtml = await getHtml(link);
        const parsed = parseJsonLdEvents(evHtml, { source_name: src.name, source_url: link });
        for (const e of parsed) {
          e.rsvp_url = e.rsvp_url || link;
          e.source_url = link;
          e.tags = [...(e.tags || []), 'from_x'];
          events.push(e);
        }
      } catch {
        // ignore
      }
    }

    return events;
  });
}

async function main() {
  const all = [];
  const errors = [];

  for (const src of SOURCES) {
    try {
      if (src.kind === 'luma_calendar') {
        const events = await collectFromLumaCalendar(src);
        all.push(...events);
        continue;
      }

      if (src.kind === 'luma_event') {
        const events = await collectFromLumaEvent(src);
        all.push(...events);
        continue;
      }

      if (src.kind === 'eventbrite_listing') {
        const events = await collectFromEventbriteListing(src);
        all.push(...events);
        continue;
      }

      if (src.kind === 'x_account') {
        const events = await collectFromXAccount(src);
        all.push(...events);
        continue;
      }

      const html = await getHtml(src.url);
      const events = parseGeneric(html, { source_name: src.name, source_url: src.url });
      all.push(...events);
    } catch (e) {
      errors.push({ source: src.name, url: src.url, error: String(e) });
    }
  }

  // De-dupe globally
  const uniq = new Map();
  for (const e of all) {
    uniq.set(e.id, e);
  }

  const payload = JSON.stringify({ generated_at: new Date().toISOString(), events: [...uniq.values()], errors }, null, 2);

  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(OUT, payload);

  // GitHub Pages serves the static site; keep a copy of the dataset next to index.html
  await mkdir(resolve(ROOT, 'site'), { recursive: true });
  await writeFile(OUT_SITE, payload);

  console.log(`Wrote ${uniq.size} events to ${OUT} and ${OUT_SITE} (${errors.length} source errors)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
