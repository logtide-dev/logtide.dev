export const SITE_URL = 'https://logtide.dev';
export const SITE_NAME = 'LogTide';
export const SITE_DESCRIPTION = 'The Official LogTide Platform. A privacy-first, open-source alternative to Datadog and Splunk. GDPR-compliant log management with native Sigma rules and threat detection. Self-host or use our EU-based cloud.';
export const TWITTER_HANDLE = '@logtide_dev';
export const OG_LOCALE = 'en_US';

export const ORG_SCHEMA = {
  "@type": "Organization",
  "name": SITE_NAME,
  "url": SITE_URL,
  "logo": `${SITE_URL}/logo/purple.png`,
  "description": SITE_DESCRIPTION,
  "sameAs": [
    "https://github.com/logtide-dev",
    "https://x.com/Logtide_dev",
    "https://bsky.app/profile/logtide.bsky.social"
  ]
};
