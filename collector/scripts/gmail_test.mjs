#!/usr/bin/env node
/**
 * Quick Gmail auth test (read-only).
 *
 * Usage:
 *   node scripts/gmail_test.mjs --client /run/secrets/gmail_oauth_client.json --token /run/secrets/gmail_token.json
 */

import { readFile } from 'node:fs/promises';
import { google } from 'googleapis';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function must(x, msg) {
  if (!x) throw new Error(msg);
  return x;
}

const clientPath = must(arg('client', process.env.GMAIL_OAUTH_CLIENT), 'Missing --client or GMAIL_OAUTH_CLIENT');
const tokenPath = must(arg('token', process.env.GMAIL_TOKEN), 'Missing --token or GMAIL_TOKEN');

async function main() {
  const clientRaw = JSON.parse(await readFile(clientPath, 'utf8'));
  const cfg = clientRaw.installed || clientRaw.web;
  if (!cfg) throw new Error('Invalid client JSON: expected .installed or .web');

  const token = JSON.parse(await readFile(tokenPath, 'utf8'));

  const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret);
  oauth2.setCredentials(token);

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log('Gmail profile ok:', {
    emailAddress: profile.data.emailAddress,
    messagesTotal: profile.data.messagesTotal,
    threadsTotal: profile.data.threadsTotal
  });

  const labels = await gmail.users.labels.list({ userId: 'me' });
  console.log('Labels:', (labels.data.labels || []).slice(0, 20).map(l => l.name));

  const list = await gmail.users.messages.list({ userId: 'me', maxResults: 5, q: 'newer_than:30d' });
  console.log('Recent message ids:', (list.data.messages || []).map(m => m.id));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
