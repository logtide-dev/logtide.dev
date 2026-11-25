---
title: "One Log Query on Postgres, ClickHouse and MongoDB (Harder Than It Sounds)"
description: "How LogTide makes one log search return the same rows on TimescaleDB, ClickHouse and MongoDB: word rules, three index strategies and a conformance suite."
pubDate: 2026-11-25
author: "Giuseppe Pollio"
tags:
  - "databases"
  - "clickhouse"
  - "postgresql"
  - "mongodb"
keywords:
  - "log search clickhouse"
  - "clickhouse full text search logs"
  - "clickhouse ngrambf_v1 index"
  - "postgres full text search logs"
  - "pg_trgm log search"
  - "mongodb text search time series"
  - "clickhouse vs timescaledb logs"
  - "log query language"
faqs:
  - question: "Why not use each database's built-in full-text search?"
    answer: "Because each one defines a word differently. PostgreSQL's English text search stems words and drops stop words such as 'not'. MongoDB's $text operator ORs the words of a query, stems English, cannot be nested inside $or or $nor, and cannot be used at all on a time-series collection. ClickHouse's hasToken treats every non-alphanumeric ASCII byte as a separator, underscore included. Used as they are, the same query returns different logs on each engine."
  - question: "How does LogTide search logs in ClickHouse?"
    answer: "A word becomes two conditions: a lowerUTF8(message) LIKE '%word%' prefilter, served by an ngrambf_v1 skip index on the lowercased message, and an RE2 regular expression that checks the word is a whole token bounded by characters outside letters, digits and underscore. The prefilter skips granules that cannot match, and the regex makes the result exact."
  - question: "Does TimescaleDB return exactly the same results as ClickHouse and MongoDB?"
    answer: "Almost. The one documented difference is English stemming: on TimescaleDB the word 'connection' also finds 'connections', because the full-text index is still used next to an exact whole-word regex. The conformance suite lists, case by case, the extra rows TimescaleDB is allowed to return, and every other difference fails the build."
  - question: "What is a conformance suite for storage engines?"
    answer: "A fixed set of records that every engine is seeded with, plus a list of queries with the exact rows each one must return. In LogTide an in-memory reference engine defines the expected behaviour, and CI runs the same cases against real TimescaleDB, ClickHouse and MongoDB servers. If a server is unreachable in CI, the suite fails instead of skipping."
---

Search `timeout OR refused -db` in LogTide and you get the same logs back whether the instance stores them in TimescaleDB, ClickHouse or MongoDB. That sentence was not true until 1.6.0, a month ago. Before that, the same query on the same logs could return different rows depending on the storage engine, and nobody had written down what the right answer was.

This post is about how we fixed that. It is less about databases than about one boring question that turns out to be the whole problem: what is a word?

## Three engines, three opinions

LogTide started on TimescaleDB. ClickHouse arrived as a second storage engine in 0.6 and MongoDB as a third in 0.8, all behind one storage layer called reservoir (the [storage engines docs](/docs/storage-engines/) cover how to pick one). Each engine had its own search code, and each one used the full-text feature its database ships with. That sounds reasonable. It was the bug.

Here is what each database thinks a search for a word means, out of the box:

| | PostgreSQL text search | MongoDB `$text` | ClickHouse `hasToken` |
| --- | --- | --- | --- |
| Several words | AND | OR | one token per call |
| `connection` finds `connections` | yes (stemming) | yes (stemming) | no |
| `not`, `the`, `down` | dropped as stop words | dropped as stop words | matched |
| `user` finds `user_id` | yes, `_` splits words | see the last row | yes, `_` is a separator |
| Inside `$or` / `$nor` | n/a | not allowed | n/a |
| On a time-series collection | n/a | no text index possible | n/a |

None of these is wrong. They are full-text search engines built for documents, and they make choices that suit documents. Logs are not documents. If you search a log for `not`, you are probably looking for `connection not allowed`, and a search engine that throws `not` away as noise is giving you every log in the window.

The 1.6.0 changelog lists what users actually saw. On MongoDB, free-text search matched any of the words instead of all of them. On TimescaleDB, searching `user` also matched `user_id`, and common words such as `down` or `not` found nothing useful. On ClickHouse, a word was not always matched as a whole word, and phrases were not case-insensitive in every alphabet. Same product, same logs, three answers.

## Writing the contract down first

The fix started with a spec, not with code. One definition of a word, used by every engine and by the parser:

```ts
// packages/shared/src/log-query/tokenize.ts
const WORD_RUN = /[\p{L}\p{N}_]+/gu;

export function tokenizeWords(text: string): string[] {
  return text.toLowerCase().match(WORD_RUN) ?? [];
}
```

A word is a maximal run of Unicode letters, digits and underscores, compared case-insensitively. From there the rules of the [query syntax](/docs/query-syntax/) follow:

- A **word** matches a whole token of the message. `user` matches `User login succeeded`, not `user_id` and not `/api/v1/users`.
- A **"quoted phrase"** is a case-insensitive substring. `"conn"` matches `connection`, `connections` and `Connection refused`.
- `-word` excludes, `OR` (uppercase) groups alternatives, and everything else is ANDed.
- Things that are obviously not words, like `10.0.0.1`, `/api/v1/users` or `error-prone`, are searched as phrases, so pasting a fragment of a log line does what you expect.

Underscores belong to words because log messages are full of identifiers (`user_id`, `order_total`, `ECONNREFUSED_RETRY`), and splitting them makes searches for the prefix noisy. Unicode letters belong to words because ошибка and échoué are words too, and LogTide is built for European teams.

The parser turns the query into a small structure (`all`, `anyOf`, `none`), and each engine only has to translate that structure. The hard part is making three very different databases agree on the definition above without giving up their indexes.

## TimescaleDB: a regex, with the full-text index as a guest

On PostgreSQL, a word becomes a case-insensitive regex with word boundaries, `\m` and `\M`, which treat letters, digits and `_` as word characters, the same ones as the contract. A plain regex would be a sequential scan, so when the `pg_trgm` extension is available the logs table gets a trigram GIN index on `message`, and PostgreSQL can use it to narrow the rows before running the regex.

The English full-text index is still there, ORed in next to the regex:

```ts
// packages/reservoir/src/engines/timescale/text-query.ts
function tokenSql(token: string, b: Binder): string {
  const regex = `message ~* ${b.bind(`\\m${escapePgRegex(token)}\\M`)}`;
  if (!FTS_TOKEN.test(token)) return regex;
  // The full-text expression must stay identical to idx_logs_fulltext.
  const fts = `to_tsvector('english', message) @@ plainto_tsquery('english', ${b.bind(token)})`;
  return `(${regex} OR (${fts} AND strpos(message, '_') = 0))`;
}
```

Two details in there took a while to get right. The full-text branch only runs for plain ASCII tokens (`FTS_TOKEN` is `^[a-z0-9]+$`), because the English configuration has nothing useful to say about Cyrillic or CJK. And it only applies to messages without an underscore, because PostgreSQL's default parser splits `user_id` into `user` and `id`. Without the `strpos` guard, `user` would match `user_id` again through the back door.

What is left is stemming: on TimescaleDB, `connection` also finds `connections`. We decided to keep that as the one documented difference between engines, because it is useful and it only ever adds rows that are clearly related. It is the only exception, and it is written down in the tests, as you will see below.

Phrases are simpler: `message ILIKE '%...%'` with `%`, `_` and `\` escaped, so a user typing `100%` does not get a wildcard.

## ClickHouse: a cheap prefilter and an exact check

ClickHouse has `hasToken`, which looks like the obvious choice and is not. Its separators are every non-alphanumeric ASCII byte, underscore included, so `user` would match `user_id`. It also has no notion of Unicode letters as word characters.

So a word in ClickHouse becomes two conditions:

```ts
// packages/reservoir/src/engines/clickhouse/text-query.ts
const NON_WORD = '[^\\p{L}\\p{N}_]';

export function wordRegex(token: string): string {
  return `(?i)(^|${NON_WORD})${escapeRe2(token)}($|${NON_WORD})`;
}

const token = (value: string): string =>
  `(lowerUTF8(message) LIKE ${param(wordLikePattern(value))} AND match(message, ${param(wordRegex(value))}))`;
```

The `LIKE` is the cheap part. The table has an `ngrambf_v1(3, 32768, 3, 0)` skip index on `lowerUTF8(message)`, a bloom filter of 3-grams per granule, so ClickHouse can skip every granule that cannot contain the lowercased word. The RE2 `match` then runs only on what survives and decides whether the hit is a whole token. The `LIKE` alone would be wrong, the regex alone would be slow. Phrases only need the `LIKE`.

The detail I like least, and the one that best shows the whole problem, is Greek sigma. Lowercase sigma has two forms, σ in the middle of a word and ς at the end. JavaScript's `toLowerCase()` applies that context rule, ClickHouse's `lowerUTF8` does not: it always maps Σ to σ. If the app lowercases the pattern one way and the database lowercases the column the other way, the prefilter silently drops rows that the regex would have matched. So the pattern is lowercased one code point at a time to mimic `lowerUTF8`, and in word prefilters both sigma forms become `_`, LIKE's single-character wildcard. The prefilter is allowed to let too much through, never too little. The regex does the exact check.

One honest limitation: the lowercase ngram index was added in 1.6.0 without rewriting existing data, so it only covers logs written after the upgrade. Older parts still return correct results, they just skip fewer granules.

## MongoDB: never `$text`

MongoDB was the engine where the built-in option was least usable. `$text` ORs the words of a query, stems English and drops stop words, which is three contract violations in one operator. It also cannot appear inside `$or` or `$nor`, which is how exclusions and OR groups are expressed. And the decisive one: LogTide stores logs in a time-series collection by default on MongoDB 5 and later, and time-series collections cannot have a text index at all.

So MongoDB gets the same regex as ClickHouse, as a `$regex` clause:

```ts
// packages/reservoir/src/engines/mongodb/text-query.ts
function tokenClause(token: string): Document {
  return { message: { $regex: `(?:^|${NON_WORD})${escapeRegex(token)}(?:$|${NON_WORD})`, $options: 'i' } };
}
```

An `all` term is a clause in the filter's `$and`, an `anyOf` group becomes an `$or`, and every excluded term goes into one `$nor`. There is no full-text index to lean on here, so the only narrowing comes from the rest of the query, mainly the project and the time range. That is the trade-off we accepted for MongoDB: correct first, and the time range does most of the narrowing.

Put side by side, the three translations of the word `timeout` look like this:

| Engine | Narrowing | Exact check |
| --- | --- | --- |
| TimescaleDB | `pg_trgm` GIN index (plus English full-text index) | `message ~* '\mtimeout\M'` |
| ClickHouse | `lowerUTF8(message) LIKE '%timeout%'` on an `ngrambf_v1` index | RE2 `match` with `\p{L}\p{N}_` boundaries |
| MongoDB | time range and project filters | `$regex` with the same boundaries, `i` option |

## The part that actually keeps it working: a conformance suite

Writing three translators that agree is the easy half. Keeping them in agreement while shipping features every week is the hard half. Every new filter, every bug fix in one engine, is a chance for the others to drift.

The answer in reservoir is a conformance suite with three pieces.

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

corpus: "Fixed corpus\nlogs, spans, traces, metrics" { class: src }
cases: "Cases\nquery → expected fixture ids" { class: src }
ref: "Reference engine\nin memory, no database" { class: hub }
ts: "TimescaleDB" { class: dest }
ch: "ClickHouse" { class: dest }
mg: "MongoDB" { class: dest }

corpus -> ref { class: flow }
corpus -> ts { class: flow }
corpus -> ch { class: flow }
corpus -> mg { class: flow }
cases -> ref { class: flow; label: "unit tests" }
cases -> ts { class: flow; label: "CI" }
cases -> ch { class: flow; label: "CI" }
cases -> mg { class: flow; label: "CI" }
```

**A fixed corpus.** 38 log lines and a set of spans, traces and metrics that every engine is seeded with, chosen to sit on the edges: `TIMEOUT EXCEEDED` in capitals, `connections pool size is 10` next to `Connection refused by upstream db`, a Cyrillic message, a CJK one, a URL, an IP, a hyphenated word, metadata with dotted keys and nested objects. Results are mapped back to fixture ids by project, timestamp and message, never by the ids an engine generates, so the assertions are identical everywhere.

**A list of cases.** Each case is a query and the exact fixture ids it must return. The text query suite alone has 35 of them:

```ts
{ id: 'T02', title: 'a word does not match longer words', q: 'connection', expected: ['L02'], timescaleMayAlsoMatch: ['L04', 'L06'] },
{ id: 'T12', title: 'a CJK word must be a whole token', q: '東京', expected: [] },
{ id: 'T13', title: 'a CJK phrase matches inside a token', q: '"東京"', expected: ['L10'] },
{ id: 'T14', title: 'underscores belong to words', q: 'user_id', expected: ['L11'] },
{ id: 'T16', title: 'English stop words still match', q: 'not', expected: ['L11'] },
{ id: 'T33', title: 'lowercase or is a word', q: 'timeout or refused', expected: [] },
```

Note `timescaleMayAlsoMatch`. That is the stemming exception, and it is the only way an engine is allowed to differ: per case, by listing the exact extra rows. TimescaleDB may return `connections pool size is 10` for `connection`. It may not return anything else, and ClickHouse and MongoDB may not return it at all. Field filters have their own suite with 51 cases, and there are suites for histograms, facets, metadata key discovery, top values, sessions, spans and traces, and metrics.

**A reference engine.** An in-memory implementation of the same interface, over plain arrays, with no database. Its text and metadata matching uses the same function that filters live tail on the server. It does two jobs: the whole suite runs in unit tests without any database, and it is the executable definition of the semantics. When the spec and an engine disagree, the reference engine is where the argument ends.

In CI, the same cases then run against real TimescaleDB, ClickHouse and MongoDB containers with `RESERVOIR_CONFORMANCE_REQUIRED=1`. Locally, an unreachable database skips the engine so you can work on one at a time. In CI it fails the build. A conformance suite that quietly skips when Docker hiccups is a conformance suite that stops existing the first week nobody looks.

## What it cost

The search code is not where the time went. The three translators are around a hundred lines each. The time went into the cases: deciding, for every edge, what the right answer is, and then making each engine agree with it. Details like the sigma rule or the underscore guard on PostgreSQL's full-text branch are what that looks like in practice: none of them is visible in a design document, all of them show up as a failing case.

It also cost some behaviour users had got used to. MongoDB users who relied on "any word matches" now get "every word matches". TimescaleDB users who searched `user` and got `user_id` too now get exactly `user`. Both changes are spelled out in the 1.6.0 changelog, because they break things for someone, even if the new behaviour is the one everybody assumed they had.

And it costs something every time we add a filter, because a new feature now means new cases and three implementations that pass them. That is the point. Supporting three storage engines is a decision you pay for on every feature, forever, and the conformance suite is just the receipt.

If you take one thing from this: when two systems are supposed to behave the same, the difficult work is writing down what "the same" means, as data, before writing the second implementation. The code that follows from a good table of cases is the easy part.

The reservoir package, the conformance corpus and every case quoted here are in the [LogTide repository](https://github.com/logtide-dev/logtide) under `packages/reservoir`. If you find a query that returns different logs on two engines, that is a bug and I would like to hear about it: open an issue with the query and the engine.
