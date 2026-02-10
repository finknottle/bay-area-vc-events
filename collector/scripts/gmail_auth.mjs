#!/usr/bin/env node
/**
 * One-time Gmail OAuth for headless deployments.
 *
 * Usage:
 *   npm run gmail:auth -- --client /path/to/gmail_oauth_client.json --out ./secrets/gmail_token.json
 *
 * This starts a temporary localhost server to capture the OAuth redirect.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import { URL } from 'node:url';
import path from 'node:path';
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

const clientPath = must(arg('client'), 'Missing --client /path/to/gmail_oauth_client.json');
const outPath = must(arg('out'), 'Missing --out /path/to/gmail_token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly'
];

const REDIRECT_HOST = '127.0.0.1';
const REDIRECT_PORT = 53682;
const REDIRECT_PATH = '/oauth2callback';
const REDIRECT_URI = `http://${REDIRECT_HOST}:${REDIRECT_PORT}${REDIRECT_PATH}`;

async function loadClient() {
  const raw = JSON.parse(await readFile(clientPath, 'utf8'));
  // Google downloads either "installed" or "web"; we expect Desktop app -> installed
  const cfg = raw.installed || raw.web;
  if (!cfg) throw new Error('Invalid client JSON: expected .installed or .web');
  const { client_id, client_secret } = cfg;
  return { client_id, client_secret };
}

async function main() {
  const { client_id, client_secret } = await loadClient();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\nOpen this URL in your browser (on this laptop):\n');
  console.log(authUrl);
  console.log(`\nWaiting for Google redirect on ${REDIRECT_URI} ...`);
  console.log('If the browser says it cannot connect, make sure you are running this on your laptop (not the VPS).');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, REDIRECT_URI);
        if (reqUrl.pathname !== REDIRECT_PATH) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const err = reqUrl.searchParams.get('error');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end(`OAuth error: ${err}`);
          server.close();
          reject(new Error(`OAuth error: ${err}`));
          return;
        }

        const c = reqUrl.searchParams.get('code');
        if (!c) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Gmail authorized. You can close this tab and return to the terminal.');

        server.close();
        resolve(c);
      } catch (e) {
        server.close();
        reject(e);
      }
    });

    server.listen(REDIRECT_PORT, REDIRECT_HOST);
    server.on('error', reject);

    // Safety timeout
    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Timed out waiting for OAuth redirect. Re-run the script.'));
    }, 5 * 60 * 1000);
  });

  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.log('\nWARNING: No refresh_token returned. Google may have skipped it if you previously consented.');
    console.log('Try re-running and ensure prompt=consent, or revoke access at https://myaccount.google.com/permissions then retry.\n');
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(tokens, null, 2));

  console.log(`\nSaved token to: ${outPath}`);
  console.log('Next: copy BOTH the client JSON and this token JSON to your VPS and mount them into Docker as read-only secrets.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
