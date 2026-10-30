---
title: "AWS Lambda Java Logging with Log4j2"
description: "Set up Log4j2 logging in AWS Lambda Java functions and ship structured logs to LogTide. Covers the Lambda appender, JSON layout, and CloudWatch forwarding."
category: "infrastructure"
difficulty: "medium"
sdk: "java"
brandIcon: "simple-icons:awslambda"
highlights:
  - "Log4j2 Lambda appender setup"
  - "Structured JSON logging"
  - "CloudWatch forwarding to LogTide"
  - "Cold start & flush patterns"
relatedIntegrations:
  - "aws-lambda"
  - "spring-boot"
relatedUseCases:
  - "cost-optimization"
  - "real-time-alerting"
keywords:
  - "log4j aws lambda"
  - "aws lambda log4j2"
  - "aws lambda java logging"
  - "lambda log4j2 example"
  - "java lambda cloudwatch logs"
  - "log4j2 lambda appender"
faqs:
  - question: "How do I use Log4j2 in an AWS Lambda Java function?"
    answer: "Add aws-lambda-java-log4j2, log4j-api, log4j-core and log4j-layout-template-json to your build, include a log4j2.xml with a Lambda appender (LambdaTextFormat and LambdaJSONFormat children) in src/main/resources, and register the Log4j2 plugin cache transformer in your Maven Shade or Gradle Shadow configuration. Without the transformer, Log4j2 plugins are silently dropped from the fat JAR and Log4j2 falls back to its default error-only configuration."
  - question: "Why are my Log4j2 logs not appearing in CloudWatch?"
    answer: "The most common cause is a missing Log4j2 plugin cache transformer in the shaded JAR (plugins like the Lambda appender get lost during packaging, and only ERROR lines in the default format come through). Others are a log4j2.xml that is not on the classpath, a missing log4j-layout-template-json dependency, or a logger level (or the function's ApplicationLogLevel) filtering the messages out. Enable Log4j2 internal status logging with -Dlog4j2.debug=true to see which configuration file is actually loaded."
  - question: "Is Log4j2 safe to use in AWS Lambda after Log4Shell?"
    answer: "Yes, as long as you use a patched release (2.17.1 or later fixes CVE-2021-44228 Log4Shell and the follow-up CVEs; use the latest 2.x, currently 2.25.5). Lambda managed Java runtimes do not bundle Log4j2, so the version in your JAR is the one that runs. Pin it explicitly in your build file and verify the resolved version with your dependency tree before deploying."
  - question: "How do I send AWS Lambda Java logs to LogTide?"
    answer: "Two options: keep Log4j2 writing to CloudWatch and forward log groups to LogTide with a subscription filter, or call the LogTide JVM SDK directly from your handler for structured logs with metadata. The SDK approach gives richer fields; the forwarding approach requires zero code changes to existing functions."
  - question: "Does logging add latency or cold start time to a Java Lambda?"
    answer: "Log4j2 initializes during the init phase when a static logger is first created, and a small log4j2.xml without a packages attribute keeps that cheap; measure the Init Duration in your REPORT line rather than trusting generic numbers. The LogTide SDK batches logs in memory and flushes asynchronously; calling flush() once before the handler returns adds a single HTTP round-trip, typically 10-50 ms inside the same region."
---

Java is one of the most popular Lambda runtimes for enterprise workloads, and Log4j2 is the de-facto logging framework for it. But getting Log4j2 to behave inside Lambda - and getting those logs somewhere you can actually search them - trips up a lot of teams: plugins disappear during JAR shading, multiline stack traces get split into separate CloudWatch events, and CloudWatch Logs Insights bills you for every query.

This guide covers the correct Log4j2 setup for AWS Lambda Java functions, structured JSON logging, and two ways to ship those logs to LogTide for real search, alerting, and retention without per-query costs.

> **Security note:** pin Log4j2 explicitly (2.25.5 here) and never rely on transitive resolution. Versions before 2.15.0 are vulnerable to [CVE-2021-44228 (Log4Shell)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228), and Lambda managed Java runtimes do not bundle Log4j2, so the version in your JAR is the one that runs.

This page covers shipping Java Lambda logs to LogTide. For the full vendor-neutral Log4j2 tutorial (log level control, Gradle, SnapStart, troubleshooting), see [AWS Lambda Java Log4j2: setup, JSON logs and Maven shade fix](/blog/aws-lambda-java-log4j2/).

## Why Java Lambda logging is harder than it should be

- **Shading breaks Log4j2 plugins.** Log4j2 discovers appenders via a binary plugin cache (`Log4j2Plugins.dat`). A default Maven Shade or Gradle Shadow build keeps only one copy of it, so the Lambda appender silently vanishes and Log4j2 falls back to its default error-only console configuration.
- **Multiline stack traces fragment.** Written with plain `System.out`, each line of a stack trace becomes a separate CloudWatch event. The Lambda appender emits one event per log call.
- **CloudWatch costs scale with usage.** $0.50/GB ingestion plus $0.005/GB scanned per Logs Insights query adds up fast for chatty Java services.
- **No structured querying.** Filtering on context values or custom fields in CloudWatch requires fragile filter patterns instead of field-based search.

## Step 1: Correct Log4j2 setup for Lambda

### Dependencies

**Maven:**

```xml
<properties>
  <log4j.version>2.25.5</log4j.version>
</properties>

<dependencies>
  <dependency>
    <groupId>com.amazonaws</groupId>
    <artifactId>aws-lambda-java-core</artifactId>
    <version>1.4.1</version>
  </dependency>
  <dependency>
    <groupId>com.amazonaws</groupId>
    <artifactId>aws-lambda-java-log4j2</artifactId>
    <version>1.6.5</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-api</artifactId>
    <version>${log4j.version}</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>${log4j.version}</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-layout-template-json</artifactId>
    <version>${log4j.version}</version>
  </dependency>
</dependencies>
```

`log4j-layout-template-json` is required for JSON format. `aws-lambda-java-log4j2` only declares it as a test dependency, so it does not arrive transitively. Avoid `aws-lambda-java-log4j2` 1.6.3, which had a regression that dropped logs, and never use the old `aws-lambda-java-log4j` artifact (Log4j 1.x).

**Gradle (Kotlin DSL):**

```kotlin
dependencies {
    implementation("com.amazonaws:aws-lambda-java-core:1.4.1")
    implementation("com.amazonaws:aws-lambda-java-log4j2:1.6.5")
    implementation("org.apache.logging.log4j:log4j-api:2.25.5")
    implementation("org.apache.logging.log4j:log4j-core:2.25.5")
    implementation("org.apache.logging.log4j:log4j-layout-template-json:2.25.5")
}
```

### log4j2.xml with the Lambda appender

Place this in `src/main/resources/log4j2.xml`. The `Lambda` appender hands each formatted event to the Lambda runtime's own logger, so every log entry - including multiline stack traces - arrives in CloudWatch as a single event:

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
    <Logger name="software.amazon.awssdk" level="WARN" />
  </Loggers>
</Configuration>
```

`format` picks the active child layout: `JSON` selects `LambdaJSONFormat`, anything else selects `LambdaTextFormat`. Set the function's log format to JSON (`LoggingConfig LogFormat=JSON`) so `AWS_LAMBDA_LOG_FORMAT` is `JSON`. `LambdaLayout.json` is a template shipped inside `aws-lambda-java-log4j2`. Do not add a `packages=` attribute to `<Configuration>`; it triggers classpath scanning and is unnecessary when the plugin cache is intact.

### The shading transformer (the step everyone misses)

Without this, your fat JAR loses the Log4j2 plugin cache and the Lambda appender stops working. The maintained transformer is published by Apache Logging Services:

**Maven Shade:**

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-shade-plugin</artifactId>
  <version>3.6.2</version>
  <dependencies>
    <dependency>
      <groupId>org.apache.logging.log4j</groupId>
      <artifactId>log4j-transform-maven-shade-plugin-extensions</artifactId>
      <version>0.2.0</version>
    </dependency>
  </dependencies>
  <executions>
    <execution>
      <phase>package</phase>
      <goals><goal>shade</goal></goals>
      <configuration>
        <createDependencyReducedPom>false</createDependencyReducedPom>
        <transformers>
          <transformer implementation="org.apache.logging.log4j.maven.plugins.shade.transformer.Log4j2PluginCacheFileTransformer" />
          <transformer implementation="org.apache.maven.plugins.shade.resource.ServicesResourceTransformer" />
          <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
            <manifestEntries>
              <Multi-Release>true</Multi-Release>
            </manifestEntries>
          </transformer>
        </transformers>
      </configuration>
    </execution>
  </executions>
</plugin>
```

**Gradle Shadow** users register `Log4j2PluginsCacheFileTransformer` in `shadowJar` (package names differ between Shadow major versions, so check the release notes for yours). Either way, verify the result instead of trusting the build:

```bash
unzip -p target/your-function.jar \
  META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat \
  | strings | grep -iE "LambdaAppender|JsonTemplateLayout"
```

You should see entries for both. If the output is empty, the transformer is not applied.

### Logging from your handler

```java
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import org.apache.logging.log4j.CloseableThreadContext;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

public class OrderHandler implements RequestHandler<OrderEvent, String> {
    private static final Logger logger = LogManager.getLogger(OrderHandler.class);

    @Override
    public String handleRequest(OrderEvent event, Context context) {
        // AWSRequestId is added by the Lambda runtime; no need to set it yourself
        try (CloseableThreadContext.Instance ctx =
                 CloseableThreadContext.put("orderId", event.getOrderId())) {
            logger.info("Processing order");
            try {
                // business logic
                logger.info("Order processed successfully");
                return "OK";
            } catch (RuntimeException e) {
                logger.error("Order processing failed", e);
                throw e;
            }
        }
    }
}
```

The Lambda runtime puts `AWSRequestId` in Log4j2's context map on every invocation. `CloseableThreadContext` restores the previous context when the block exits, so custom fields do not leak into the next request on the same reused thread. Context values are strings.

At this point you have clean, structured Log4j2 logs in CloudWatch. Now let's make them searchable.

## Step 2, Option A: Forward CloudWatch logs to LogTide

Zero code changes - keep Log4j2 exactly as configured above and forward the function's log group to LogTide with a CloudWatch subscription filter and a small forwarder function.

This is the same pattern used for Node.js functions, so follow the forwarder setup in the [AWS Lambda integration guide](/integrations/aws-lambda/#approach-2-cloudwatch-to-logtide-forwarding). The JSON layout from Step 1 pays off here: each event is already structured JSON, so the forwarder can map `level`, `message`, and your context fields (such as `orderId`) into LogTide's structured metadata instead of shipping opaque text lines. Set the function's log format to JSON for this; in text format the forwarder only sees plain lines.

**Choose this approach when** you have many existing Java functions, you can't modify their code, or you want CloudWatch to remain the primary sink with LogTide as the search and alerting layer.

## Step 2, Option B: LogTide JVM SDK from the handler

For the richest structured data, log directly to LogTide using the [Kotlin/Java SDK](/docs/sdks/kotlin/) (JVM 17+, works from plain Java via interop).

```kotlin
dependencies {
    implementation("io.github.logtide-dev:logtide-core:0.9.8")
}
```

Initialize the client **outside** the handler so it's reused across warm invocations, and flush before returning so no logs are lost when the execution environment freezes:

```kotlin
import dev.logtide.sdk.LogTideClient
import dev.logtide.sdk.models.LogTideClientOptions
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import kotlinx.coroutines.runBlocking

// Created once per execution environment (survives warm starts)
private val logtide = LogTideClient(
    LogTideClientOptions(
        apiUrl = System.getenv("LOGTIDE_API_URL"),
        apiKey = System.getenv("LOGTIDE_API_KEY"),
        globalMetadata = mapOf(
            "function" to System.getenv("AWS_LAMBDA_FUNCTION_NAME"),
            "region" to System.getenv("AWS_REGION"),
        )
    )
)

class OrderHandler : RequestHandler<OrderEvent, String> {
    override fun handleRequest(event: OrderEvent, context: Context): String {
        logtide.info("orders", "Processing order", mapOf(
            "requestId" to context.awsRequestId,
            "orderId" to event.orderId,
            "coldStart" to isColdStart(),
        ))

        return try {
            // business logic
            logtide.info("orders", "Order processed", mapOf("orderId" to event.orderId))
            "OK"
        } catch (e: Exception) {
            logtide.error("orders", "Order processing failed", e)
            throw e
        } finally {
            // Flush before the environment freezes - one HTTP round-trip
            runBlocking { logtide.flush() }
        }
    }
}

private var cold = true
private fun isColdStart(): Boolean = cold.also { cold = false }
```

The SDK batches in memory with retry, exponential backoff, and a circuit breaker, so the only synchronous cost is the final `flush()` - typically 10-50 ms in-region.

**Choose this approach when** you want field-based queries on your own metadata, real-time alerting on errors, and cold start tracking - without paying CloudWatch per query.

## Which approach should you pick?

| | Option A: CloudWatch forwarding | Option B: LogTide SDK |
|---|---|---|
| Code changes | None | Handler + dependency |
| Structured metadata | Parsed from JSON layout | Native, arbitrary fields |
| Latency added | None (async forwarding) | One flush per invocation |
| CloudWatch costs | Still paying ingestion | Can reduce retention to minimum |
| Best for | Existing fleets, no-touch migration | New functions, rich telemetry |

Many teams run both: SDK for new services, forwarding for the legacy fleet.

## Troubleshooting

- **Only `ERROR` lines in a default format, or `Unable to locate plugin type for Lambda`** - your shaded JAR lost the plugin cache. Add the transformer from Step 1.
- **Logs disappear on some invocations** - check you are not on `aws-lambda-java-log4j2` 1.6.3; upgrade to 1.6.4 or later.
- **JSON mode prints plain text** - `log4j-layout-template-json` is missing, or the function's log format is not `JSON`.
- **Stack traces split across CloudWatch events** - you're printing with `System.out` or `printStackTrace()` instead of the Log4j2 Lambda appender; log the exception as the last argument (`logger.error("...", e)`).
- **Nothing in LogTide after `flush()`** - check the function's VPC/egress configuration can reach your LogTide instance, and that the API key has ingest permission for the project.

---

**Next steps:**

- [AWS Lambda integration overview](/integrations/aws-lambda/) - Node.js SDK, extensions, and forwarder setup
- [AWS Lambda Java Log4j2 full tutorial](/blog/aws-lambda-java-log4j2/) - vendor-neutral setup, log levels, SnapStart
- [Kotlin/Java SDK reference](/docs/sdks/kotlin/) - full configuration options
- [Spring Boot integration](/integrations/spring-boot/) - for containerized Java services
- [Cost optimization guide](/use-cases/cost-optimization/) - what you save by moving search off CloudWatch
