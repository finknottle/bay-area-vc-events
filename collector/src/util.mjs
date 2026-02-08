import crypto from 'node:crypto';

export function stableId(...parts) {
  const raw = parts.filter(Boolean).map(s => String(s).trim()).join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function isLikelyDateLine(s) {
  const t = (s || '').toLowerCase();
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return months.some(m => t.includes(m));
}

export function isBayAreaLocation(location) {
  const s = (location || '').toLowerCase();
  const keywords = [
    'san francisco','palo alto','mountain view','menlo park','redwood city','san jose',
    'oakland','berkeley','sunnyvale','cupertino','bay area'
  ];
  return keywords.some(k => s.includes(k));
}
