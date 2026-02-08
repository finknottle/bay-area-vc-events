import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { SOURCES } from './sources.mjs';
import { stableId, isLikelyDateLine } from './util.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname, '..');
const OUT = resolve(ROOT, 'data', 'events.json');

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'bay-area-vc-events-bot/0.1 (+https://github.com/)' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

function parseJsonLdEvents(html, { source_name, source_url }) {
  const $ = cheerio.load(html);
  const out = [];

  function pushFrom(obj) {
    if (!obj || typeof obj !== 'object') return;
    const t = obj['@type'];
    if (t !== 'Event' && !(Array.isArray(t) && t.includes('Event'))) return;

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

    const rsvp = obj.url || obj.offers?.url || null;
    const id = stableId(source_name, title || rsvp || source_url, start || '');

    out.push({
      id,
      title: String(title || '(untitled)').slice(0, 200),
      start: start ? String(start) : null,
      end: end ? String(end) : null,
      timezone: 'America/Los_Angeles',
      location,
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

  const uniq = new Map(out.map(e => [e.id, e]));
  return [...uniq.values()];
}

function parseGeneric(html, { source_name, source_url }) {
  // Prefer structured extraction
  const jsonld = parseJsonLdEvents(html, { source_name, source_url });
  if (jsonld.length) return jsonld;

  // Fallback heuristic text lines
  const $ = cheerio.load(html);
  const candidates = [];
  $('h1,h2,h3,p,li').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length < 10) return;
    if (!isLikelyDateLine(t)) return;
    candidates.push(t);
  });

  const events = [];
  for (const t of candidates.slice(0, 400)) {
    const id = stableId(source_name, t);
    events.push({
      id,
      title: t.slice(0, 200),
      start: null,
      end: null,
      timezone: 'America/Los_Angeles',
      location: '',
      region: 'unknown',
      rsvp_url: null,
      source_name,
      source_url,
      tags: []
    });
  }

  const uniq = new Map(events.map(e => [e.id, e]));
  return [...uniq.values()];
}

async function main() {
  const all = [];
  const errors = [];

  for (const src of SOURCES) {
    try {
      const html = await getHtml(src.url);
      const events = parseGeneric(html, { source_name: src.name, source_url: src.url });
      all.push(...events);
    } catch (e) {
      errors.push({ source: src.name, url: src.url, error: String(e) });
      // continue
    }
  }

  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({ generated_at: new Date().toISOString(), events: all, errors }, null, 2)
  );
  console.log(`Wrote ${all.length} events to ${OUT} (${errors.length} source errors)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
