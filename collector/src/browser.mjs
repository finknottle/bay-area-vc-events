import { chromium } from 'playwright';

export async function withBrowser(fn, { headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (compatible; BayAreaVCEventsBot/0.3; +https://github.com/finknottle/bay-area-vc-events)',
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(45_000);
    page.setDefaultTimeout(20_000);
    return await fn({ page, context });
  } finally {
    await browser.close();
  }
}

export async function getRenderedHtml(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // many event lists are hydrated client-side
  await page.waitForTimeout(2000);
  return await page.content();
}

export async function extractAnchors(page) {
  return await page.$$eval('a[href]', (els) =>
    els
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .map((h) => h.trim())
  );
}
