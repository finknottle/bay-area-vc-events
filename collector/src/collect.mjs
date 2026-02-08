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

function parseGeneric(html, { source_name, source_url }) {
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
    // MVP: we don't reliably parse dates without adding more deps; store raw line.
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

  // de-dupe
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
