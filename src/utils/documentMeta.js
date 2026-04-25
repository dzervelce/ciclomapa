/** Default SEO copy (aligned with in-app "Par" messaging). Keep in sync with public/index.html defaults. */
export const DEFAULT_PAGE_TITLE = 'Velokarte';
const SITE_URL = 'https://velokarte.pocs.dev';

export const DEFAULT_META_DESCRIPTION =
  'Latvijas riteņbraucēju karte: atrodiet veloceļus, plānojiet drošākus maršrutus un apskatiet velosipēdu novietnes un servisus tuvumā.';

const MAX_DESCRIPTION_LENGTH = 160;

function truncateDescription(text) {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1).trim()}…`;
}

function primaryPlaceLabel(area) {
  if (!area || typeof area !== 'string') return '';
  return area.split(',')[0].trim();
}

/**
 * Updates document title and meta description when the map city (area) changes.
 * Open Graph / Twitter tags stay on the default homepage values from index.html.
 */
export function updateDocumentMeta(area, citySlug = null) {
  const label = primaryPlaceLabel(area);

  document.title = label ? `${label} — ${DEFAULT_PAGE_TITLE}` : DEFAULT_PAGE_TITLE;

  const description = label
    ? truncateDescription(
        `${label} Velokartē: riteņbraucēju karte, kurā atrast veloceļus, plānot drošākus maršrutus un apskatīt velo novietnes un servisus tuvumā.`
      )
    : DEFAULT_META_DESCRIPTION;

  const meta =
    document.querySelector('meta[name="description"]') ||
    document.querySelector('meta[name="Description"]');
  if (meta) {
    meta.setAttribute('content', description);
  }

  const canonicalHref = citySlug ? `${SITE_URL}/${encodeURIComponent(citySlug)}` : `${SITE_URL}/`;
  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag) {
    canonicalTag.setAttribute('href', canonicalHref);
  }

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', canonicalHref);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', document.title);

  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute('content', description);

  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', document.title);

  const twitterDescription = document.querySelector('meta[name="twitter:description"]');
  if (twitterDescription) twitterDescription.setAttribute('content', description);
}
