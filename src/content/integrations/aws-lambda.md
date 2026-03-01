---
title: "AWS Lambda Logging Integration"
description: "Send AWS Lambda function logs to LogTide using the JavaScript SDK, CloudWatch forwarding, or Lambda extensions for cost-effective serverless observability."
category: "infrastructure"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:awslambda"
highlights:
  - "SDK-based structured logging"
  - "CloudWatch log forwarding"
  - "Cold start tracking"
  - "Cost savings vs CloudWatch"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases:
  - "cost-optimization"
  - "real-time-alerting"
keywords:
  - "lambda logging"
  - "aws lambda logs"
  - "serverless logging"
  - "lambda log management"
  - "cloudwatch alternative"
  - "lambda observability"
---

AWS Lambda functions generate logs that end up in CloudWatch by default, but searching, alerting, and retaining those logs can be expensive and cumbersome. This guide shows you how to send Lambda logs directly to LogTide using the JavaScript SDK, forward them from CloudWatch, or use Lambda extensions -- giving you structured queries, real-time alerting, and significant cost savings.

## Why use LogTide with AWS Lambda?

- **Cost reduction**: CloudWatch Logs charges $0.50/GB ingested and $0.005/GB scanned. LogTide is self-hosted with predictable storage costs
- **Structured queries**: Search Lambda logs with field-based queries instead of CloudWatch's limited filter syntax
- **Cross-service correlation**: Link Lambda logs with API Gateway, ECS, and other service logs in one place
- **Real-time alerting**: Get notified on errors, cold starts, and timeouts without CloudWatch Alarms
- **Cold start tracking**: Automatically detect and measure cold start duration
- **Retention control**: Keep logs as long as you need without escalating CloudWatch storage costs
- **SIEM integration**: LogTide's built-in SIEM capabilities detect security anomalies in Lambda invocations

## Prerequisites

- AWS account with Lambda functions
- Node.js 18+ runtime (for SDK approach)
- LogTide instance with DSN or API key
- AWS SAM CLI or CDK (optional, for deployment)

## Approach 1: LogTide SDK (Recommended)

The LogTide JavaScript SDK provides the most structured approach with automatic batching, cold start detection, and context propagation.

### Installation

Add the SDK to your Lambda function:

```bash
npm install @logtide/core
```

### Basic Lambda Handler

```typescript
// handler.ts
import { hub } from '@logtide/core';

// Initialize outside the handler (persists across warm invocations)
hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'order-processor',
  environment: process.env.STAGE || 'production',
  release: process.env.APP_VERSION,
  batchSize: 50,
  flushInterval: 1000,  // Flush quickly for Lambda
});

let isColdStart = true;

export const handler = async (event: any, context: any) => {
  const startTime = Date.now();

  // Track cold starts
  if (isColdStart) {
    hub.captureLog('info', 'Cold start detected', {
      functionName: context.functionName,
      memorySize: context.memoryLimitInMB,
      runtime: process.version,
      coldStart: true,
    });
    isColdStart = false;
  }

  hub.captureLog('info', 'Lambda invocation started', {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    remainingTime: context.getRemainingTimeInMillis(),
  });

  try {
    // Your business logic
    const result = await processOrder(event);

    hub.captureLog('info', 'Lambda invocation completed', {
      requestId: context.awsRequestId,
      duration: Date.now() - startTime,
      result: 'success',
    });

    // Flush before Lambda freezes the execution environment
    await hub.flush();

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    hub.captureError(error as Error, {
      extra: {
        requestId: context.awsRequestId,
        event: JSON.stringify(event),
        remainingTime: context.getRemainingTimeInMillis(),
      },
      tags: {
        functionName: context.functionName,
      },
    });

    // Always flush on error
    await hub.flush();

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function processOrder(event: any) {
  // Business logic here
  return { orderId: event.orderId, status: 'processed' };
}
```

### API Gateway Integration

For Lambda functions behind API Gateway:

```typescript
// api-handler.ts
import { hub } from '@logtide/core';

hub.init({
  dsn: process.env.LOGTIDE_DSN,
  service: 'api-gateway-handler',
  environment: process.env.STAGE,
});

let isColdStart = true;

export const handler = async (event: any, context: any) => {
  const startTime = Date.now();

  // Parse API Gateway event
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.requestContext?.http?.path;
  const sourceIp = event.requestContext?.identity?.sourceIp
    || event.requestContext?.http?.sourceIp;
  const userAgent = event.headers?.['User-Agent']
    || event.headers?.['user-agent'];

  hub.captureLog('info', `${method} ${path}`, {
    requestId: context.awsRequestId,
    httpMethod: method,
    path: path,
    sourceIp: sourceIp,
    userAgent: userAgent,
    coldStart: isColdStart,
    queryString: event.queryStringParameters,
  });

  isColdStart = false;

  try {
    const result = await routeRequest(method, path, event);

    hub.captureLog('info', `${method} ${path} ${result.statusCode}`, {
      requestId: context.awsRequestId,
      statusCode: result.statusCode,
      duration: Date.now() - startTime,
    });

    await hub.flush();
    return result;
  } catch (error) {
    hub.captureError(error as Error, {
      extra: { requestId: context.awsRequestId, method, path },
    });
    await hub.flush();

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function routeRequest(method: string, path: string, event: any) {
  // Your routing logic
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
```

### Lambda Layer for Shared Configuration

Package the LogTide SDK as a Lambda Layer for reuse across functions:

```bash
# Create layer directory
mkdir -p logtide-layer/nodejs
cd logtide-layer/nodejs

# Install SDK
npm init -y
npm install @logtide/core

# Package the layer
cd ..
zip -r logtide-layer.zip nodejs/
```

Deploy the layer:

```bash
aws lambda publish-layer-version \
  --layer-name logtide-sdk \
  --zip-file fileb://logtide-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --description "LogTide JavaScript SDK for structured logging"
```

Attach to your function:

```bash
aws lambda update-function-configuration \
  --function-name my-function \
  --layers arn:aws:lambda:us-east-1:123456789:layer:logtide-sdk:1
```

## Approach 2: CloudWatch to LogTide Forwarding

For existing Lambda functions where you cannot modify the code, forward logs from CloudWatch to LogTide using a forwarder Lambda.

### Forwarder Lambda Function

```typescript
// cloudwatch-forwarder.ts
import { gunzipSync } from 'zlib';

const LOGTIDE_API_URL = process.env.LOGTIDE_API_URL!;
const LOGTIDE_API_KEY = process.env.LOGTIDE_API_KEY!;

interface CloudWatchLogsEvent {
  awslogs: {
    data: string;
  };
}

interface LogEvent {
  id: string;
  timestamp: number;
  message: string;
}

interface DecodedPayload {
  logGroup: string;
  logStream: string;
  logEvents: LogEvent[];
}

export const handler = async (event: CloudWatchLogsEvent) => {
  // Decode and decompress CloudWatch log data
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const decompressed = gunzipSync(payload);
  const data: DecodedPayload = JSON.parse(decompressed.toString());

  // Extract function name from log group
  // Format: /aws/lambda/function-name
  const functionName = data.logGroup.replace('/aws/lambda/', '');

  // Transform log events
  const logs = data.logEvents.map((logEvent) => {
    const parsed = parseLogMessage(logEvent.message);
    return {
      timestamp: new Date(logEvent.timestamp).toISOString(),
      service: functionName,
      level: parsed.level,
      message: parsed.message,
      requestId: parsed.requestId,
      source: 'cloudwatch',
      logGroup: data.logGroup,
      logStream: data.logStream,
      ...parsed.metadata,
    };
  });

  // Ship to LogTide
  const response = await fetch(`${LOGTIDE_API_URL}/api/v1/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGTIDE_API_KEY,
    },
    body: JSON.stringify({ logs }),
  });

  if (!response.ok) {
    console.error(`LogTide ingest failed: ${response.status} ${await response.text()}`);
    throw new Error(`LogTide ingest failed: ${response.status}`);
  }

  return { processed: logs.length };
};

function parseLogMessage(message: string) {
  // Parse Lambda platform messages
  if (message.startsWith('START RequestId:')) {
    const requestId = message.match(/RequestId: ([\w-]+)/)?.[1];
    return { level: 'info', message: 'Lambda invocation started', requestId, metadata: {} };
  }

  if (message.startsWith('END RequestId:')) {
    const requestId = message.match(/RequestId: ([\w-]+)/)?.[1];
    return { level: 'info', message: 'Lambda invocation ended', requestId, metadata: {} };
  }

  if (message.startsWith('REPORT RequestId:')) {
    const requestId = message.match(/RequestId: ([\w-]+)/)?.[1];
    const duration = message.match(/Duration: ([\d.]+) ms/)?.[1];
    const billedDuration = message.match(/Billed Duration: (\d+) ms/)?.[1];
    const memoryUsed = message.match(/Max Memory Used: (\d+) MB/)?.[1];
    const memorySize = message.match(/Memory Size: (\d+) MB/)?.[1];
    const initDuration = message.match(/Init Duration: ([\d.]+) ms/)?.[1];

    return {
      level: 'info',
      message: `Lambda report: ${duration}ms, ${memoryUsed}MB used`,
      requestId,
      metadata: {
        duration: parseFloat(duration || '0'),
        billedDuration: parseInt(billedDuration || '0'),
        memoryUsed: parseInt(memoryUsed || '0'),
        memorySize: parseInt(memorySize || '0'),
        coldStart: !!initDuration,
        initDuration: initDuration ? parseFloat(initDuration) : undefined,
      },
    };
  }

  // Try to parse as JSON (structured application logs)
  try {
    const parsed = JSON.parse(message.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z]+\t[\w-]+\t(INFO|WARN|ERROR|DEBUG)\t/, ''));
    return {
      level: parsed.level || 'info',
      message: parsed.message || message,
      requestId: parsed.requestId,
      metadata: parsed,
    };
  } catch {
    // Plain text log
    const level = message.includes('ERROR') ? 'error'
      : message.includes('WARN') ? 'warn'
      : 'info';
    return { level, message: message.trim(), requestId: undefined, metadata: {} };
  }
}
```

### Deploy the Forwarder

Using AWS SAM:

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
      Runtime: nodejs20.x
      Timeout: 60
      MemorySize: 256
      Environment:
        Variables:
          LOGTIDE_API_URL: !Ref LogTideApiUrl
          LOGTIDE_API_KEY: !Ref LogTideApiKey

  # Subscribe to a Lambda function's log group
  LogSubscription:
    Type: AWS::Logs::SubscriptionFilter
    Properties:
      LogGroupName: /aws/lambda/my-function
      FilterPattern: ""
      DestinationArn: !GetAtt LogTideForwarder.Arn

  # Permission for CloudWatch to invoke the forwarder
  ForwarderPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref LogTideForwarder
      Action: lambda:InvokeFunction
      Principal: logs.amazonaws.com
      SourceArn: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/my-function:*"
```

Deploy:

```bash
sam build && sam deploy \
  --parameter-overrides \
    LogTideApiUrl=https://your-logtide-host \
    LogTideApiKey=your-api-key
```

### Subscribe Multiple Functions

Use a script to subscribe all Lambda log groups:

```bash
#!/bin/bash
FORWARDER_ARN="arn:aws:lambda:us-east-1:123456789:function:LogTideForwarder"

# List all Lambda log groups
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/" \
  --query 'logGroups[].logGroupName' \
  --output text | tr '\t' '\n' | while read log_group; do

  echo "Subscribing: $log_group"

  aws logs put-subscription-filter \
    --log-group-name "$log_group" \
    --filter-name "logtide-forwarder" \
    --filter-pattern "" \
    --destination-arn "$FORWARDER_ARN"
done
```

## Approach 3: HTTP API Direct (Lightweight)

For minimal overhead without the full SDK:

```typescript
// lightweight-logger.ts
const LOGTIDE_API_URL = process.env.LOGTIDE_API_URL!;
const LOGTIDE_API_KEY = process.env.LOGTIDE_API_KEY!;

const logBuffer: any[] = [];

export function log(level: string, message: string, metadata: Record<string, any> = {}) {
  logBuffer.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: process.env.AWS_LAMBDA_FUNCTION_NAME,
    ...metadata,
  });
}

export async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logs = logBuffer.splice(0);

  await fetch(`${LOGTIDE_API_URL}/api/v1/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGTIDE_API_KEY,
    },
    body: JSON.stringify({ logs }),
  });
}
```

Usage:

```typescript
import { log, flushLogs } from './lightweight-logger';

export const handler = async (event: any, context: any) => {
  log('info', 'Processing request', { requestId: context.awsRequestId });

  try {
    const result = await doWork(event);
    log('info', 'Request processed', { requestId: context.awsRequestId });
    await flushLogs();
    return result;
  } catch (error) {
    log('error', (error as Error).message, { requestId: context.awsRequestId });
    await flushLogs();
    throw error;
  }
};
```

## AWS CDK Deployment

### CDK Stack with LogTide Integration

```typescript
// lib/lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // LogTide SDK Layer
    const logtideLayer = new lambda.LayerVersion(this, 'LogTideLayer', {
      code: lambda.Code.fromAsset('layers/logtide'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'LogTide JavaScript SDK',
    });

    // Application function
    const orderProcessor = new nodejs.NodejsFunction(this, 'OrderProcessor', {
      entry: 'src/handlers/order-processor.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      layers: [logtideLayer],
      environment: {
        LOGTIDE_DSN: process.env.LOGTIDE_DSN || '',
        STAGE: 'production',
      },
      logRetention: logs.RetentionDays.THREE_DAYS,  // Reduce CloudWatch costs
    });

    // Forwarder function (for functions you can't modify)
    const forwarder = new nodejs.NodejsFunction(this, 'LogTideForwarder', {
      entry: 'src/handlers/cloudwatch-forwarder.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        LOGTIDE_API_URL: process.env.LOGTIDE_API_URL || '',
        LOGTIDE_API_KEY: process.env.LOGTIDE_API_KEY || '',
      },
    });

    // Subscribe forwarder to a log group
    new logs.SubscriptionFilter(this, 'LogSubscription', {
      logGroup: orderProcessor.logGroup,
      destination: new cdk.aws_logs_destinations.LambdaDestination(forwarder),
      filterPattern: logs.FilterPattern.allEvents(),
    });
  }
}
```

## Cold Start Monitoring

Track cold starts to understand Lambda performance:

### Detection Rules in LogTide

```
service:order-processor AND coldStart:true
```

### Cold Start Dashboard Queries

```
# Cold start count by function
service:* AND coldStart:true | count by service

# Average init duration
service:* AND initDuration:>0 | avg(initDuration) by service

# Cold start rate
service:* AND coldStart:true | count / total_count * 100
```

### Reducing Cold Starts

Log provisioned concurrency usage:

```typescript
hub.captureLog('info', 'Function initialized', {
  coldStart: isColdStart,
  provisionedConcurrency: !!process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
  initType: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
});
```

## Cost Comparison

### CloudWatch vs LogTide

For a workload generating 100GB of logs per month:

| Cost Component | CloudWatch | LogTide (self-hosted) |
|----------------|------------|----------------------|
| Log ingestion | $50.00/mo ($0.50/GB) | $0 |
| Log storage (3 months) | $9.00/mo ($0.03/GB) | ~$3/mo (EBS) |
| Log queries | $2.50/mo ($0.005/GB scanned) | $0 |
| Alarms (10 alarms) | $1.00/mo | $0 (built-in) |
| Insights queries | $0.005/GB scanned | $0 |
| **Total** | **~$62.50/mo** | **~$3/mo + compute** |

Compute costs for a LogTide instance vary, but a single `t3.medium` ($30/mo) can handle well over 100GB of logs per month.

### Reducing CloudWatch Costs

When using LogTide, reduce CloudWatch retention to minimize storage costs:

```bash
# Set retention to 1 day (minimum for subscription filters)
aws logs put-retention-policy \
  --log-group-name /aws/lambda/my-function \
  --retention-in-days 1
```

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| SDK overhead | ~2ms per invocation | Batched writes, async flush |
| Flush time | 10-50ms | Depends on network to LogTide |
| Memory overhead | ~3MB | SDK in Lambda memory |
| Cold start impact | ~50ms | One-time SDK initialization |
| Forwarder latency | 1-5 seconds | CloudWatch subscription delay |

## Troubleshooting

### Logs not appearing in LogTide (SDK approach)

1. Verify the DSN is set correctly:
   ```bash
   aws lambda get-function-configuration \
     --function-name my-function \
     --query 'Environment.Variables.LOGTIDE_DSN'
   ```

2. Ensure `hub.flush()` is called before the handler returns:
   ```typescript
   // Always flush before returning
   await hub.flush();
   return response;
   ```

3. Check Lambda timeout -- if the function times out, the flush may not complete. Increase timeout or reduce `flushInterval`.

### Forwarder Lambda errors

1. Check forwarder CloudWatch logs:
   ```bash
   aws logs tail /aws/lambda/LogTideForwarder --follow
   ```

2. Verify the forwarder has network access to your LogTide instance (VPC configuration, security groups).

3. Check subscription filter status:
   ```bash
   aws logs describe-subscription-filters \
     --log-group-name /aws/lambda/my-function
   ```

### High forwarder invocation costs

Batch logs by increasing the subscription filter buffer:

```bash
# The forwarder processes logs in batches automatically.
# If invocation frequency is too high, consider adding a
# Kinesis Data Stream as a buffer between CloudWatch and the forwarder.
```

### Missing cold start data

Cold start detection relies on the `isColdStart` flag. Ensure it is declared outside the handler:

```typescript
// This MUST be outside the handler function
let isColdStart = true;

export const handler = async (event: any, context: any) => {
  // Use isColdStart here, then set to false
  isColdStart = false;
};
```

## Next Steps

- [Node.js SDK Reference](/integrations/nodejs) - Full SDK documentation
- [Docker Integration](/integrations/docker) - Containerized Lambda alternatives
- [Cost Optimization](/use-cases/cost-optimization) - Reduce your logging costs
- [Real-Time Alerting](/use-cases/real-time-alerting) - Alert on Lambda errors and timeouts
