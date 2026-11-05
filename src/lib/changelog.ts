// Releases are published per minor version: /changelog/v1-6/ holds 1.6.0, 1.6.1
// and so on, each with its own anchor. Single-patch pages were too thin to be
// worth indexing. nginx 301s the old /changelog/v1-6-2/ URLs to these pages.
export function releaseGroupSlug(id: string): string | null {
  const match = /^v(\d+)-(\d+)-\d+$/.exec(id);
  return match ? `v${match[1]}-${match[2]}` : null;
}

export function releaseUrl(id: string): string {
  const group = releaseGroupSlug(id);
  return group ? `/changelog/${group}/#${id}` : '/changelog/';
}
