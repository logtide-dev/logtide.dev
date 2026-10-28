// Star count for the header button, fetched once per build. The site must
// still build offline (Docker, CI without network), so any failure returns
// null and the button renders without a number.

let cached: Promise<number | null> | undefined;

async function fetchStars(): Promise<number | null> {
  try {
    const res = await fetch('https://api.github.com/repos/logtide-dev/logtide', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export function getGitHubStars(): Promise<number | null> {
  cached ??= fetchStars();
  return cached;
}

export function formatStars(stars: number): string {
  return stars >= 1000 ? `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(stars);
}
