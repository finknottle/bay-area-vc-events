import { readFile } from 'node:fs/promises';
import { google } from 'googleapis';

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractUrlsFromText(text) {
  const t = String(text || '');
  const urls = new Set();
  // Simple URL regex; good enough for email bodies.
  const re = /https?:\/\/[^\s<>()\[\]"']+/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    let u = m[0];
    // strip common trailing punctuation
    u = u.replace(/[).,;!?]+$/, '');
    urls.add(u);
  }
  return [...urls];
}

function pickEventCandidateUrls(urls) {
  const allow = [
    'lu.ma/',
    'luma.com/',
    'eventbrite.com/e/',
    'meetup.com/',
    'partiful.com/',
    'splashthat.com/',
    'zoom.us/',
    'calendly.com/',
    'plugandplaytechcenter.com/all-events'
  ];

  const deny = [
    'google.com/url?',
    'accounts.google.com/',
    'mail.google.com/',
    'support.google.com/',
    'unsubscribe',
    'preferences'
  ];

  return urls
    .filter((u) => allow.some((a) => u.includes(a)))
    .filter((u) => !deny.some((d) => u.toLowerCase().includes(d)))
    .map((u) => u.split('#')[0])
    .map((u) => u.split('?')[0]);
}

function decodeBase64Url(data) {
  if (!data) return '';
  const s = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function gatherTextFromPayload(payload) {
  const out = [];
  const walk = (p) => {
    if (!p) return;
    if (p.body?.data) out.push(decodeBase64Url(p.body.data));
    if (Array.isArray(p.parts)) for (const part of p.parts) walk(part);
  };
  walk(payload);
  return out.join('\n');
}

export async function gmailCollectEventLinks({
  clientPath,
  tokenPath,
  maxMessages = 50,
  query = 'newer_than:30d',
  includeFrom = false
} = {}) {
  if (!clientPath || !tokenPath) return { links: [], meta: { enabled: false } };

  const clientRaw = safeJsonParse(await readFile(clientPath, 'utf8'));
  const cfg = clientRaw?.installed || clientRaw?.web;
  if (!cfg) throw new Error('Invalid Gmail OAuth client JSON: expected .installed or .web');

  const token = safeJsonParse(await readFile(tokenPath, 'utf8'));
  if (!token) throw new Error('Invalid Gmail token JSON');

  const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret);
  oauth2.setCredentials(token);

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const list = await gmail.users.messages.list({ userId: 'me', maxResults: maxMessages, q: query });
  const ids = (list.data.messages || []).map((m) => m.id).filter(Boolean);

  const links = new Set();
  const debug = [];

  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const payload = msg.data.payload;
    const headers = payload?.headers || [];
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';

    const text = gatherTextFromPayload(payload);
    const urls = extractUrlsFromText(text);
    const candidates = pickEventCandidateUrls(urls);

    for (const u of candidates) links.add(u);

    if (includeFrom && candidates.length) {
      debug.push({ id, subject, from, candidates: candidates.slice(0, 10) });
    }
  }

  return {
    links: [...links].slice(0, 100),
    meta: { enabled: true, scanned: ids.length, found: links.size, debug }
  };
}
