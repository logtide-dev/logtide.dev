---
title: "AWS Lambda Logging: How It Works and the Practices That Matter"
description: "How AWS Lambda logging really works - CloudWatch log groups, JSON structured logs, retention, costs, and how to ship Lambda logs somewhere searchable."
pubDate: 2026-07-03
author: "LogTide Team"
tags:
  - "aws"
  - "serverless"
  - "logging"
keywords:
  - "aws lambda logging"
  - "lambda logging"
  - "logging in aws lambda"
  - "aws lambda logs"
  - "lambda logging best practices"
  - "aws lambda cloudwatch logs"
faqs:
  - question: "Where do AWS Lambda logs go by default?"
    answer: "Everything your function writes to stdout or stderr is captured by the Lambda runtime and sent to CloudWatch Logs, into a log group named /aws/lambda/<function-name>. Each concurrent execution environment writes to its own log stream inside that group. There is no way to disable this pipeline, but since late 2023 you can point a function at a custom log group."
  - question: "How do I enable JSON structured logging in Lambda?"
    answer: "Set the function's logging configuration to JSON format (LoggingConfig with LogFormat: JSON via the console, CLI, or IaC). The runtime then emits its own system logs as JSON, and for Node.js and Python the built-in console/logging calls are automatically wrapped in JSON objects with timestamp, level, and request ID - no logging library required."
  - question: "How much does Lambda logging cost?"
    answer: "Lambda itself charges nothing for logging, but CloudWatch Logs does: $0.50/GB ingested (standard class), $0.03/GB-month stored, and $0.005/GB scanned by every CloudWatch Logs Insights query. A chatty function logging 5 GB/day costs about $75/month in ingestion alone - before you run a single search. Setting a retention policy and filtering log levels are the two fastest cost levers."
  - question: "How do I stop losing Lambda logs at the end of an invocation?"
    answer: "Logs written to stdout are safe - the runtime captures them synchronously. The risk is with agents and SDKs that buffer logs in memory and send them over the network: Lambda freezes the execution environment as soon as the handler returns, so any unsent buffer sits frozen (or is lost if the environment is reclaimed). Always flush your log buffer before returning from the handler."
  - question: "How do I change the log level of a Lambda function without redeploying?"
    answer: "If the function uses JSON log format, Lambda's application log level setting filters logs at the platform level - change it in the function configuration and it takes effect on the next invocation, no code change needed. For text-format functions, the common pattern is reading a LOG_LEVEL environment variable in your logger setup; updating an environment variable also requires no code deploy."
---

Lambda logging looks trivial - `console.log` and the output shows up in CloudWatch. Then the bill arrives, an incident happens, and you discover the logs you need are unstructured text spread across forty log streams, the debug lines that would have helped were never written, and the stack trace is split across twelve CloudWatch events.

This guide covers how Lambda logging actually works under the hood, the platform features most teams don't turn on, and the practices that make serverless logs useful during an incident instead of merely present.

## How Lambda logging actually works

There is no agent to install and no file to tail. The pipeline is built into the service:

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

fn: "Your handler\nstdout / stderr" { class: src }
rt: "Lambda runtime\ncaptures & batches" { class: hub }
cw: "CloudWatch Logs\n/aws/lambda/<fn>" { class: src }
out1: "Subscription filter\n→ forwarder / Firehose" { class: dest }
out2: "Logs Insights\n(billed per GB scanned)" { class: dest }

fn -> rt { class: flow }
rt -> cw { class: flow }
cw -> out1 { class: flow }
cw -> out2 { class: flow }
```

The details that matter:

- **Everything on stdout/stderr is captured.** `console.log`, `print`, a stray `System.out.println` from a dependency - all of it becomes log events. You pay ingestion for every byte.
- **One log group per function** (`/aws/lambda/<function-name>`), **one log stream per execution environment**. A function running at concurrency 50 writes to 50 interleaved streams - which is why grepping a single stream during an incident misses most of the picture.
- **Log group retention defaults to "never expire."** Nobody notices until the storage line item grows for two years. Set a retention policy on day one.
- **The execution environment freezes between invocations.** Anything your code buffered in memory but hadn't sent yet stays frozen with it. This is the single most common cause of "missing" logs when teams ship logs over HTTP from inside the handler.

## Turn on JSON log format - it's free and most teams don't

Since late 2023, Lambda has native **structured JSON logging** (part of what AWS calls advanced logging controls). You enable it per function - no code change:

```bash
aws lambda update-function-configuration \
  --function-name order-processor \
  --logging-config LogFormat=JSON,ApplicationLogLevel=INFO,SystemLogLevel=WARN
```

Three things you get:

1. **Automatic JSON wrapping.** On Node.js and Python runtimes, the built-in `console.*` / `logging` calls are emitted as JSON objects with `timestamp`, `level`, and `requestId` attached. Multiline messages - including stack traces - arrive as a *single* log event instead of one event per line.
2. **Platform-level log filtering.** `ApplicationLogLevel` drops logs below the threshold *before* they reach CloudWatch, so `DEBUG` noise in production stops costing $0.50/GB. Change it in configuration, not in code.
3. **Quieter system logs.** `SystemLogLevel=WARN` suppresses the `START`/`END`/`REPORT` chatter for routine invocations.

If you take one thing from this article, take this: **JSON format plus a retention policy** fixes the two most common Lambda logging mistakes with zero code.

## Best practices that survive contact with production

### Log structured fields, not sentences

`"Order 4521 failed for customer 812 after retry"` can only be grepped. `{"msg": "order_failed", "orderId": 4521, "customerId": 812, "retries": 1}` can be filtered, aggregated, and alerted on. Every runtime has a near-zero-cost way to do this - `console.log` with an object on Node.js (with JSON format enabled), `logger.info(..., extra={...})` on Python, a JSON layout on Java.

### Correlate everything with the request ID

`context.awsRequestId` is the thread that ties an invocation's logs together across retries and services. Attach it to every log line (JSON format does this automatically) and propagate it to downstream calls so one ID follows the request through API Gateway, your function, and whatever the function calls.

### Don't log the event payload

`console.log(JSON.stringify(event))` on every invocation is the classic serverless anti-pattern: it duplicates your ingestion volume, and event payloads are exactly where PII lives (user emails in API Gateway bodies, records in Kinesis batches). Log the fields you need - IDs, types, sizes - not the object.

### Track cold starts explicitly

A module-scope boolean is all it takes, and it turns "the API is sometimes slow" from a mystery into a query:

```typescript
let coldStart = true;

export const handler = async (event: any, context: any) => {
  console.log({ msg: "invocation_start", coldStart, requestId: context.awsRequestId });
  coldStart = false;
  // ...
};
```

### Flush before the freeze

If you ship logs from inside the handler with any batching SDK or agent, the handler returning is a cliff edge: the environment freezes mid-buffer. Await a flush as the last step before returning - it's one HTTP round-trip, typically 10-50 ms in-region. (Runtime-specific patterns, including the Java/Log4j2 case, are covered in the guides linked below.)

### Mind the runtime-specific traps

- **Node.js**: with JSON format enabled, plain `console.log` is fine - you don't need a logging library for structure. Without it, use one (pino is the usual choice) or stack traces will fragment.
- **Python**: the stdlib `logging` module integrates with JSON format directly; resist the urge to `print()`.
- **Java**: Log4j2 inside Lambda has real sharp edges - the plugin cache gets destroyed by JAR shading and the Lambda appender silently vanishes. We wrote a dedicated guide: [AWS Lambda Java logging with Log4j2](/integrations/aws-lambda-java/).

## The part nobody budgets for: reading the logs

CloudWatch ingestion is $0.50/GB, storage $0.03/GB-month - and **every CloudWatch Logs Insights query costs $0.005 per GB scanned**. Debugging an incident across a month of logs for a busy function can cost more than the ingestion did, and the interactive experience (per-log-group selection, KQL-ish syntax, no live tail worth the name) is not where you want to be at 3 a.m.

That's why most teams eventually forward Lambda logs somewhere built for search. The standard options:

| Route | How | Good for |
|---|---|---|
| Subscription filter → forwarder | CloudWatch pushes matching events to a small forwarder function | No code changes, works for the whole fleet |
| Lambda extension | Telemetry API sidecar ships logs directly, can bypass CloudWatch | Cutting CloudWatch ingestion costs entirely |
| SDK from the handler | Structured logs with your own fields, sent directly | Richest data, new services |

All three patterns are covered step-by-step in our [AWS Lambda integration guide](/integrations/aws-lambda/). The SDK route, for reference, is a few lines with the [LogTide JavaScript SDK](/docs/sdks/nodejs/):

```typescript
import { hub } from '@logtide/core';

// Outside the handler - reused across warm invocations
hub.init({ dsn: process.env.LOGTIDE_DSN, service: 'order-processor' });

export const handler = async (event: any, context: any) => {
  hub.captureLog('info', 'invocation_start', { requestId: context.awsRequestId });

  const result = await processOrder(event);

  await hub.flush(); // before the environment freezes
  return result;
};
```

Self-hosted LogTide gives you field-based queries, live tail, and alerting on those logs with no per-GB ingestion fee and no per-query scan charge - the full comparison is in [LogTide vs CloudWatch](/vs/aws-cloudwatch/).

## Checklist

- [ ] JSON log format enabled (`LogFormat=JSON`)
- [ ] `ApplicationLogLevel` set per environment - `DEBUG` never ships to production
- [ ] Retention policy on every log group
- [ ] Request ID on every log line, propagated downstream
- [ ] Event payloads not logged wholesale
- [ ] Cold starts tracked
- [ ] Buffers flushed before the handler returns
- [ ] A search story that doesn't bill you per query

---

**Related guides:**

- [AWS Lambda integration](/integrations/aws-lambda/) - SDK, forwarding, and extension setup for LogTide
- [AWS Lambda Java logging with Log4j2](/integrations/aws-lambda-java/) - shading, appenders, and flush patterns for the JVM
- [LogTide vs AWS CloudWatch](/vs/aws-cloudwatch/) - feature and cost comparison
