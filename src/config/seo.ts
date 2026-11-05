export const SITE_URL = 'https://logtide.dev';
export const SITE_NAME = 'LogTide';
export const SITE_DESCRIPTION = 'Open-source log management and SIEM you can self-host or run in our EU cloud. Logs, traces and Sigma threat detection, an alternative to Datadog and Splunk.';
export const TWITTER_HANDLE = '@logtide_dev';
export const OG_LOCALE = 'en_US';

export const ORG_SCHEMA = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
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
