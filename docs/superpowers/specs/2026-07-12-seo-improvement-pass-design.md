# SEO Improvement Pass — Design

**Date:** 2026-07-12
**Trigger:** Analysis of Google Search Console export `reports/logtide.dev-Performance-on-Search-2026-07-12`
**Scope decision:** "Intervento ampio" (broad), changelog left untouched.

## Diagnosis (data-driven)

Last 3 months: 76 clicks / 2,568 impressions. **87% of clicks are brand** (`logtide`). Impressions grew +15% vs the prior export but clicks stayed flat and CTR fell — the growth came from pages that convert ~0 clicks (changelog, aws-lambda). Concrete findings the plan targets:

1. **Log4j2 cannibalization (highest impact).** The ~370-impression non-brand cluster (`log4j aws lambda`, `aws lambda log4j2`, `aws lambda java log4j2 maven`, …) lands on the *generic* `/integrations/aws-lambda/` page at **position ~58**, while the dedicated, high-quality `/integrations/aws-lambda-java/` page (1,523 words, correct FAQs, shading/CVE/Maven coverage) gets almost no impressions. Google picked the wrong page.
2. **Metadata error.** `aws-lambda-java.md` carries `sdk: "kotlin"` (page is about Java). The `sdk` enum has no `java` value; field is unused for display.
3. **Low CTR on striking-distance docs** (top-5, ~0 clicks): getting-started, architecture, authentication, storage-engines, deployment, api. Descriptions are generic.
4. **Historical non-canonical URLs in GSC** (`http://…`, missing trailing slash). Astro config already emits canonical `https` + trailing-slash URLs and nginx 301s handle the rest — verification only, no fabricated fix.

## Workstreams

**A — Fix Log4j2 cannibalization (priority 1)**
- Strengthen internal links *to* `/integrations/aws-lambda-java/` with query-matching anchor text (`AWS Lambda Log4j2`, `log4j aws lambda`) from: the generic aws-lambda guide, the `aws-lambda-logging-best-practices` blog post.
- Disambiguate the generic aws-lambda page: keep the Java callout prominent, add a Next-Steps link to the Java guide, avoid competing on log4j terms.
- Fix `sdk: kotlin → java` (add `java` to the content-config enum).

**B — CTR quick-wins**
- Rewrite `description` (and lightly enrich `title`) on the striking-distance docs pages to be benefit-driven and keyword-aligned, without keyword-stuffing.

**C — Technical SEO verification**
- Confirm the generated sitemap contains only canonical `https` + trailing-slash URLs; confirm no internal `http://` or slash-less links exist. (Verification, minimal/no code change.)

**D — Structured data**
- **HowTo schema intentionally NOT added** — Google deprecated HowTo rich results (Sept 2023); markup would add noise with zero rich-result benefit. Instead verify existing TechArticle + BreadcrumbList + FAQPage schema stays valid across edited pages.

**E — Non-brand `/vs/` reinforcement**
- Reinforce existing comparison pages for impression-bearing queries (`papertrail alternative` → `/vs/papertrail/`, `self hosted log management` → `/self-hosted-log-management/`, GCP/Azure pricing → respective `/vs/` pages). No new pages.

## Non-goals / honesty notes
- No ranking guarantees: on an early-stage, brand-dominated site, on-page changes help but will not move a page from position 58 to 5 on their own. Authority/backlinks are the ceiling.
- Changelog untouched (free brand visibility in top-10).

## Verification
- `pnpm build` must pass (content-config schema + Astro).
- Spot-check edited pages' `<title>`/`<meta description>` and JSON-LD render.
