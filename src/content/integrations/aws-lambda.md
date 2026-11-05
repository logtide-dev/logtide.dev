---
title: "AWS Lambda Logging: CloudWatch and JSON Logs"
description: "How AWS Lambda logging works: CloudWatch Logs, JSON log format, cold starts, flushing, costs and retention, plus how to send Lambda logs to LogTide."
category: "infrastructure"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:awslambda"
highlights:
  - "How Lambda logs reach CloudWatch"
  - "JSON logs, cold starts and flush"
  - "CloudWatch forwarding to LogTide"
  - "Node.js SDK and Java Log4j2 paths"
relatedIntegrations:
  - "aws-lambda-java"
  - "nodejs"
  - "docker"
relatedUseCases:
  - "cost-optimization"
  - "real-time-alerting"
keywords:
  - "aws lambda logging"
  - "lambda logging"
  - "aws lambda logs"
  - "aws lambda log4j"
  - "aws lambda log4j2"
  - "serverless logging"
  - "cloudwatch alternative"
  - "lambda observability"
faqs:
  - question: "Where do AWS Lambda logs go by default?"
    answer: "Anything your function writes to stdout or stderr (console.log, a logging library, print) is captured by the Lambda runtime and sent to CloudWatch Logs, in a log group named /aws/lambda/<function-name>, with one log stream per execution environment. The execution role needs logs:CreateLogGroup, logs:CreateLogStream and logs:PutLogEvents, which the AWSLambdaBasicExecutionRole managed policy grants."
  - question: "How do I get structured JSON logs from Lambda?"
    answer: "Set the function's log format to JSON (LoggingConfig, or the console and CLI equivalent). For Node.js, the console methods are then emitted as JSON objects with timestamp, level, message and requestId. If you already log JSON with a library such as Powertools for AWS Lambda, Lambda does not double-encode it. Log-level filtering only works with JSON logs."
  - question: "Why are my Lambda logs missing after the handler returns?"
    answer: "Lambda freezes the execution environment as soon as the handler and extensions finish. Work started in the background, such as a batched log exporter with a timer, only resumes if the environment is reused. Await the flush of any buffered logger before returning from the handler."
  - question: "How do I reduce CloudWatch Logs costs for Lambda?"
    answer: "Ingestion is the main driver. Log less at INFO in production (use the application log level with JSON format), keep payloads out of log lines, and set a retention period on the log group, because the default is to keep logs indefinitely. Check the CloudWatch pricing page for current rates."
  - question: "Can I use Log4j2 on AWS Lambda?"
    answer: "Yes. Use the aws-lambda-java-log4j2 Lambda appender with a pinned, patched Log4j2 release, add log4j-layout-template-json for JSON output, and register the Log4j2 plugin cache transformer in your Maven Shade or Gradle Shadow build. Without the transformer the plugins are dropped from the fat JAR. The dedicated Java guide covers the full setup."
  - question: "How do I send AWS Lambda logs to LogTide?"
    answer: "Two practical options: call the LogTide JavaScript SDK (or the HTTP ingest API) from your handler and flush before returning, or leave Lambda writing to CloudWatch and forward the log group with a subscription filter to a small forwarder function that posts to LogTide. The forwarder needs no application code changes."
  - question: "Can I keep CloudWatch and use LogTide at the same time?"
    answer: "Yes. A subscription filter sends a copy of the log events to the forwarder while the log group keeps receiving them, so CloudWatch alarms and Logs Insights keep working. A log group can have up to five subscription filters."
---

On AWS Lambda, logging looks trivial: write to stdout and it shows up in CloudWatch. The details are what bite later: log events that arrive late or not at all after the handler returns, plain text that is hard to filter, and a log group that keeps every byte forever. This guide explains how Lambda logging actually works, then compares the options for getting logs somewhere useful, with LogTide as one of them.

> **Running Java on Lambda?** Jump to [Java and Log4j2 on Lambda](#java-and-log4j2-on-lambda), or read the dedicated [AWS Lambda Log4j2 logging guide](/integrations/aws-lambda-java/).

## How Lambda logging works

Lambda captures what your function writes to stdout and stderr and sends it to CloudWatch Logs. In Node.js you can use the `console` methods or any library that writes to those streams. By default the log group is `/aws/lambda/<function-name>`, and each execution environment (a running instance of your function) writes to its own log stream.

The runtime also writes platform lines around every invocation: `START`, `END` and `REPORT`. The `REPORT` line carries `Duration`, `Billed Duration`, `Memory Size`, `Max Memory Used` and, for the first request served by a new environment, `Init Duration`.

```text
REPORT RequestId: c793869b-...  Duration: 128.83 ms  Billed Duration: 296 ms  Memory Size: 128 MB  Max Memory Used: 74 MB  Init Duration: 166.62 ms
```

Things worth knowing up front (all from the AWS documentation, linked at the end):

- The execution role needs `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents`. The `AWSLambdaBasicExecutionRole` managed policy includes them.
- Lambda adds no charge for logs, but standard CloudWatch Logs charges apply.
- Log groups are not deleted when you delete a function, and by default CloudWatch Logs keeps data indefinitely.
- You can point a function at a different log group instead of `/aws/lambda/<function-name>`.
- Logs can take a few minutes to appear after an invocation, so do not debug live incidents by refreshing the console.

## Structured logs and log levels

With the default text format, a Node.js log line is a tab-separated string: timestamp, request ID, level, message. That works for reading, not for filtering. Lambda's advanced logging controls let you switch the function to JSON and choose a log level.

```bash
aws lambda update-function-configuration \
  --function-name my-function \
  --logging-config LogFormat=JSON,ApplicationLogLevel=INFO,SystemLogLevel=WARN
```

The same settings are available as `LoggingConfig` in SAM and CloudFormation. With JSON format, the Node.js `console` methods produce objects like this:

```json
{
  "timestamp": "2025-11-01T00:21:51.358Z",
  "level": "ERROR",
  "message": "This is a warning message",
  "requestId": "93f25699-2cbf-4976-8f94-336a0aa98c6f"
}
```

Details that matter in practice:

- Every JSON log carries at least `timestamp`, `level`, `message` and `requestId`.
- `console.log({ data: 12.3 })` keeps the object as the `message`. With two arguments, `console.log('label', obj)`, Lambda stringifies the message. Pass a single object if you want queryable fields.
- Log-level filtering (`ApplicationLogLevel`) only works with JSON logs. If you already emit JSON with another library (Powertools for AWS Lambda is the one AWS documents), Lambda does not double-encode it, but the JSON needs a `level` and a valid RFC 3339 `timestamp` for filtering to apply.
- Switching to JSON can break embedded metric format (EMF) metrics emitted via `console.log`. AWS documents the fix, so test before changing a function that emits EMF.

Treat logged input as untrusted. AWS warns that logging raw event data can let an attacker forge log entries, so validate or encode what you log.

## Cold starts and when to flush

Lambda runs your code in an execution environment with three phases: Init (extensions start, the runtime bootstraps, your top-level code runs), Invoke (your handler) and Shutdown. After each invocation Lambda freezes the environment and may thaw it for the next request. AWS notes that background processes or callbacks that did not finish when the function ended resume if the environment is reused.

Two consequences for logging:

1. **Anything buffered must be flushed before the handler returns.** A logger that batches in memory and sends on a timer will not reliably send once the environment is frozen. `console.log` is safe because the runtime handles it. A third-party SDK or HTTP client is not.
2. **Cold starts show up in the `REPORT` line.** `Init Duration` appears for the first request served by a new environment, and cold start time is billed. AWS says cold starts typically affect under 1% of invocations and range from under 100 ms to over 1 second. To log them yourself, use a module-level flag, and read `AWS_LAMBDA_INITIALIZATION_TYPE` (`on-demand`, `provisioned-concurrency`, `snap-start` or `lambda-managed-instances`) to tell how the environment was started.

Provisioned concurrency and SnapStart exist to reduce cold starts. When either is enabled, Lambda also emits an `INIT_REPORT` log line on successful init.

```typescript
let coldStart = true; // module scope: set once per execution environment

export const handler = async (event: unknown, context: { awsRequestId: string }) => {
  const isCold = coldStart;
  coldStart = false;
  console.log(JSON.stringify({
    level: 'info',
    message: 'invocation started',
    requestId: context.awsRequestId,
    coldStart: isCold,
    initType: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
  }));
  // ...
};
```

## Costs and retention

CloudWatch Logs bills for ingestion, storage and queries (Logs Insights bills per GB scanned). AWS's own pricing examples use $0.50 per GB for standard log ingestion after a free allowance (source: [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), checked November 2026). Rates differ by Region and log class, so use the pricing page or the AWS Pricing Calculator for your numbers rather than a copied table.

What you can control:

- **Volume.** Set `ApplicationLogLevel` to INFO or WARN in production and do not log full request bodies.
- **Retention.** The default is to keep logs indefinitely. Set a retention period per log group:

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/my-function \
  --retention-in-days 14
```

CloudWatch does not delete expired events immediately, and AWS says it can take up to 72 hours. Marked events no longer add to archival storage costs.

## Your options

| Option | Good for | Trade-offs |
|---|---|---|
| CloudWatch Logs only, JSON format, Logs Insights | Workloads fully on AWS, small teams, short retention | Logs Insights is billed per GB scanned; covers AWS data only |
| CloudWatch plus Powertools for AWS Lambda | Consistent JSON fields in your code | A library to maintain; same storage and query model |
| Subscription filter to Kinesis, Firehose, Lambda or OpenSearch | Fan out to another system without touching function code | You run the forwarding path; standard log class only |
| Logging SDK or HTTP call from the handler | Structured events straight to a backend, without CloudWatch in the path | Must flush before return; extra network call in the invocation |
| Lambda extension using the Telemetry API | Shipping platform logs and telemetry from a layer | Extensions run in the same environment and count toward init and shutdown time |

None of these is the right answer for everyone. If your workloads, alerts and people are all inside one AWS account, CloudWatch with JSON logs and a sensible retention is simple and cheap to start with. A separate backend such as LogTide helps when you want logs from Lambda, containers and servers searchable in one place, or when you want to control retention and cost outside CloudWatch.

## Sending Lambda logs to LogTide

### Option 1: the LogTide SDK in the handler

Install the SDK:

```bash
npm install @logtide/core
```

Initialize it at module scope so it survives warm invocations, and flush in `finally` so logs ship even when the handler throws:

```typescript
// handler.ts
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'order-processor',
  environment: process.env.STAGE || 'production',
  release: process.env.APP_VERSION,
});

let coldStart = true;

export const handler = async (event: any, context: any) => {
  const isCold = coldStart;
  coldStart = false;
  const base = { requestId: context.awsRequestId, coldStart: isCold };
  const startedAt = Date.now();

  hub.captureLog('info', 'invocation started', base);

  try {
    const result = await processOrder(event);
    hub.captureLog('info', 'invocation completed', {
      ...base,
      duration: Date.now() - startedAt,
    });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    hub.captureError(error as Error, base);
    throw error; // let Lambda record the failure
  } finally {
    await hub.flush(); // before Lambda freezes the environment
  }
};

async function processOrder(event: any) {
  return { orderId: event.orderId, status: 'processed' };
}
```

The DSN carries the API host and project key. Set it as the `LOGTIDE_DSN` environment variable, or better, read it from Secrets Manager or SSM Parameter Store, since AWS recommends against keeping credentials in plain environment variables. The SDK batches by default (100 events or 5 seconds) with retries and a circuit breaker, see the [JavaScript SDK reference](/docs/sdks/nodejs/). In Lambda the explicit `flush()` is what matters.

Your function needs outbound network access to the LogTide host. A function attached to a VPC without a NAT gateway or a VPC endpoint cannot reach the public internet.

If you would rather not add a dependency, call the ingest API with `fetch` (Node.js 18 and later runtimes include it). The schema is on the [API reference](/docs/api/):

```typescript
await fetch(`${process.env.LOGTIDE_API_URL}/api/v1/ingest`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.LOGTIDE_API_KEY!,
  },
  body: JSON.stringify({
    logs: [{
      time: new Date().toISOString(),
      service: process.env.AWS_LAMBDA_FUNCTION_NAME,
      level: 'info',
      message: 'order processed',
      metadata: { requestId: context.awsRequestId },
    }],
  }),
});
```

### Option 2: forward CloudWatch logs

If you cannot change the function code, leave it logging to CloudWatch and subscribe the log group to a forwarder function. CloudWatch gzips the batch and Lambda receives it base64 encoded in `awslogs.data`. AWS says events usually reach a subscription within a few minutes, and that delivery is at least once, so duplicates are possible.

```typescript
// cloudwatch-forwarder.ts
import { gunzipSync } from 'zlib';

const URL = `${process.env.LOGTIDE_API_URL}/api/v1/ingest`;
const KEY = process.env.LOGTIDE_API_KEY!;

const LEVELS: Record<string, string> = {
  trace: 'debug', debug: 'debug', info: 'info',
  warn: 'warn', warning: 'warn', error: 'error', fatal: 'critical',
};

export const handler = async (event: { awslogs: { data: string } }) => {
  const payload = JSON.parse(
    gunzipSync(Buffer.from(event.awslogs.data, 'base64')).toString(),
  );
  const service = String(payload.logGroup).replace('/aws/lambda/', '');

  const logs = payload.logEvents
    .map((e: { timestamp: number; message: string }) => toLog(e, service, payload))
    .filter((l: { message: string }) => l.message);

  for (let i = 0; i < logs.length; i += 500) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
      body: JSON.stringify({ logs: logs.slice(i, i + 500) }),
    });
    if (!res.ok) throw new Error(`LogTide ingest failed: ${res.status}`);
  }
  return { processed: logs.length };
};

function toLog(e: { timestamp: number; message: string }, service: string, p: any) {
  const base = { time: new Date(e.timestamp).toISOString(), service };
  const meta = { logGroup: p.logGroup, logStream: p.logStream, source: 'cloudwatch' };
  const text = e.message.trim();

  // REPORT line (text format): duration, memory, init duration
  if (text.startsWith('REPORT RequestId:')) {
    const num = (re: RegExp) => Number(text.match(re)?.[1]);
    const init = text.match(/Init Duration: ([\d.]+) ms/)?.[1];
    return {
      ...base, level: 'info', message: 'lambda report',
      metadata: {
        ...meta,
        requestId: text.match(/RequestId: ([\w-]+)/)?.[1],
        duration: num(/Duration: ([\d.]+) ms/),
        billedDuration: num(/Billed Duration: (\d+) ms/),
        maxMemoryUsed: num(/Max Memory Used: (\d+) MB/),
        coldStart: Boolean(init),
        initDuration: init ? Number(init) : undefined,
      },
    };
  }
  // START and END lines add noise, skip them
  if (text.startsWith('START RequestId:') || text.startsWith('END RequestId:')) {
    return { ...base, level: 'debug', message: '', metadata: meta };
  }

  // JSON log format: timestamp, level, message, requestId
  try {
    const j = JSON.parse(text);
    const msg = typeof j.message === 'string' ? j.message : JSON.stringify(j.message);
    return {
      ...base,
      level: LEVELS[String(j.level).toLowerCase()] ?? 'info',
      message: msg,
      metadata: { ...meta, requestId: j.requestId, ...(typeof j.message === 'object' ? j.message : {}) },
    };
  } catch {
    // Text format: "<timestamp>\t<requestId>\t<LEVEL>\t<message>"
    const m = text.match(/^\S+\t([\w-]+)\t(\w+)\t([\s\S]*)$/);
    return {
      ...base,
      level: m ? (LEVELS[m[2].toLowerCase()] ?? 'info') : 'info',
      message: m ? m[3] : text,
      metadata: { ...meta, requestId: m?.[1] },
    };
  }
}
```

LogTide rejects empty messages, which is why START and END lines are dropped by the filter. Deploy the forwarder and subscribe a log group with SAM:

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  LogTideApiUrl:
    Type: String
  LogTideApiKey:
    Type: String
    NoEcho: true

Resources:
  LogTideForwarder:
    Type: AWS::Serverless::Function
    Properties:
      Handler: cloudwatch-forwarder.handler
      Runtime: nodejs22.x
      Timeout: 60
      MemorySize: 256
      Environment:
        Variables:
          LOGTIDE_API_URL: !Ref LogTideApiUrl
          LOGTIDE_API_KEY: !Ref LogTideApiKey

  ForwarderPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref LogTideForwarder
      Action: lambda:InvokeFunction
      Principal: logs.amazonaws.com
      SourceArn: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/my-function:*"

  LogSubscription:
    Type: AWS::Logs::SubscriptionFilter
    DependsOn: ForwarderPermission
    Properties:
      LogGroupName: /aws/lambda/my-function
      FilterPattern: ""
      DestinationArn: !GetAtt LogTideForwarder.Arn
```

Do not subscribe the forwarder's own log group to itself: every log line it writes would trigger another invocation. For a high-volume log group, put Kinesis Data Streams or Firehose between CloudWatch and the forwarder so you control batching and retries. If the destination returns a retryable error, CloudWatch Logs keeps retrying for up to 24 hours.

Once the logs are in LogTide you can search them with fields. See [Query Syntax](/docs/query-syntax/):

```text
service:order-processor coldStart:true
service:order-processor level:error
initDuration:*
```

## Java and Log4j2 on Lambda

Java is a common Lambda runtime, and "AWS Lambda log4j2" is a frequent search because the default setup breaks in non-obvious ways. In short:

- Use the `aws-lambda-java-log4j2` artifact, which provides a `Lambda` appender that hands each event to the Lambda runtime logger, so multiline stack traces arrive as one CloudWatch event.
- Add `log4j-layout-template-json` yourself for JSON output. It does not arrive transitively.
- Never use the old `aws-lambda-java-log4j` artifact (Log4j 1.x), and pin a patched Log4j2 release. Lambda managed Java runtimes do not bundle Log4j2, so the version in your JAR is the one that runs.
- Register the Log4j2 plugin cache transformer in Maven Shade or Gradle Shadow. Without it, a fat JAR keeps only one copy of `Log4j2Plugins.dat`, the `Lambda` appender silently disappears and Log4j2 falls back to an error-only default.

A minimal `log4j2.xml` for text and JSON:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration>
  <Appenders>
    <Lambda name="Lambda" format="${env:AWS_LAMBDA_LOG_FORMAT:-TEXT}">
      <LambdaTextFormat>
        <PatternLayout>
          <pattern>%d{yyyy-MM-dd HH:mm:ss} %X{AWSRequestId} %-5p %c{1} - %m%n</pattern>
        </PatternLayout>
      </LambdaTextFormat>
      <LambdaJSONFormat>
        <JsonTemplateLayout eventTemplateUri="classpath:LambdaLayout.json" />
      </LambdaJSONFormat>
    </Lambda>
  </Appenders>
  <Loggers>
    <Root level="${env:LOG_LEVEL:-${env:AWS_LAMBDA_LOG_LEVEL:-INFO}}">
      <AppenderRef ref="Lambda" />
    </Root>
  </Loggers>
</Configuration>
```

The dependency versions, the Shade and Shadow configuration, a check for the plugin cache and the LogTide JVM options are in the [AWS Lambda Log4j2 guide](/integrations/aws-lambda-java/). For a vendor-neutral walkthrough with SnapStart and troubleshooting, read [AWS Lambda Java Log4j2: setup, JSON logs and Maven shade fix](/blog/aws-lambda-java-log4j2/). The CloudWatch forwarder above works unchanged for Java functions, because it only reads the log group.

## EU data residency

CloudWatch log groups live in the AWS Region of the function, so choosing an EU Region for the function keeps the log group there. A subscription filter or an SDK call then sends a copy to wherever the receiving system runs. That is the part to check:

- **LogTide Cloud:** LogTide's DPA and sub-processor list state that its infrastructure is hosted in Strasbourg, France (OVH), and that customer personal data is not transferred outside the EU/EEA. Billing data processed by Stripe is the documented exception. See the [DPA](/legal/dpa/) and [sub-processors](/legal/subprocessors/).
- **Self-hosted LogTide:** logs stay in whichever Region or data center you deploy it in.

This describes where data is stored, not who may be compelled to disclose it. For GDPR, NIS2 or DORA questions, take the details from your own legal review. The [on-premise log management for EU compliance](/blog/on-premise-log-management-eu-compliance/) article covers the distinction.

## Troubleshooting

- **No logs in CloudWatch at all:** check the execution role permissions and whether the function was pointed at a different log group.
- **Logs from the SDK are missing:** confirm `await hub.flush()` runs in every path, including errors, and that the function timeout leaves time for the flush. A function that times out cannot flush.
- **SDK logs never arrive from a VPC function:** add a NAT gateway or a route to your LogTide host.
- **Forwarder runs but nothing appears:** check the forwarder's own log group, the subscription (`aws logs describe-subscription-filters --log-group-name /aws/lambda/my-function`) and the API key.
- **Duplicate events from the forwarder:** subscription delivery is at least once, so occasional duplicates are expected.
- **`coldStart` is always true:** the flag must be declared outside the handler.

## Sources

- [Sending Lambda function logs to CloudWatch Logs](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html)
- [Log and monitor Node.js Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html)
- [Understanding the Lambda execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html)
- [Lambda environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
- [Working with log groups and log streams](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html)
- [Real-time processing of log data with subscriptions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions.html)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) (checked November 2026)

## Next steps

- [AWS Lambda Java logging with Log4j2](/integrations/aws-lambda-java/): shading, the Lambda appender and flush patterns
- [AWS Lambda logging best practices](/blog/aws-lambda-logging-best-practices/)
- [LogTide vs AWS CloudWatch](/vs/aws-cloudwatch/): feature and cost comparison
- [Node.js SDK reference](/integrations/nodejs/)
- [Cost optimization](/use-cases/cost-optimization/) and [real-time alerting](/use-cases/real-time-alerting/)
