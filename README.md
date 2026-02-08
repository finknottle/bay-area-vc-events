# Bay Area VC Events Monitor

Monitors venture capital / startup community websites for upcoming events in the San Francisco Bay Area, publishes a simple events website, and sends a weekly “interesting events” digest.

## MVP
- Collect events from a seed list of VC / community sources
- Normalize into `data/events.json`
- Publish a simple site from that JSON (GitHub Pages)
- Weekly digest summarizing next-week events + RSVP-required items

## Repo structure
- `collector/` — scrapers + normalization
- `data/` — generated JSON output
- `site/` — static site (built from `data/events.json`)
- `.github/workflows/` — scheduled refresh + deploy

## Development (local)
1. Create venv
2. Run collector
3. Run site locally

(Instructions will be filled in as the scaffold lands.)
