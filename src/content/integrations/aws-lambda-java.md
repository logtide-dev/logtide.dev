---
title: "AWS Lambda Java Logging with Log4j2"
description: "Set up Log4j2 logging in AWS Lambda Java functions and ship structured logs to LogTide. Covers the Lambda appender, JSON layout, and CloudWatch forwarding."
category: "infrastructure"
difficulty: "medium"
sdk: "kotlin"
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
    answer: "Add the aws-lambda-java-log4j2 adapter and log4j-core/log4j-api dependencies, include a log4j2.xml with the Lambda appender in src/main/resources, and bundle the Log4j2 plugin cache transformer in your Maven Shade or Gradle shadow configuration. Without the transformer, Log4j2 plugins are silently dropped from the fat JAR and logging falls back to stderr."
  - question: "Why are my Log4j2 logs not appearing in CloudWatch?"
    answer: "The most common causes are a missing Log4j2 plugin cache transformer in the shaded JAR (plugins like the Lambda appender get lost during packaging), a log4j2.xml that is not on the classpath, or a logger level filtering the messages out. Enable Log4j2 internal status logging with -Dlog4j2.debug=true to see which configuration file is actually loaded."
  - question: "Is Log4j2 safe to use in AWS Lambda after Log4Shell?"
    answer: "Yes, as long as you use Log4j 2.17.1 or later, which fully patches CVE-2021-44228 (Log4Shell) and the follow-up CVEs. Pin the version explicitly in your build file rather than relying on transitive dependencies, and verify the resolved version with your dependency tree before deploying."
  - question: "How do I send AWS Lambda Java logs to LogTide?"
    answer: "Two options: keep Log4j2 writing to CloudWatch and forward log groups to LogTide with a subscription filter, or call the LogTide JVM SDK directly from your handler for structured logs with metadata. The SDK approach gives richer fields; the forwarding approach requires zero code changes to existing functions."
  - question: "Does logging add latency or cold start time to a Java Lambda?"
    answer: "Log4j2 adds roughly 100-200 ms to a Java cold start during plugin initialization, which is small relative to typical JVM cold starts. The LogTide SDK batches logs in memory and flushes asynchronously; calling flush() once before the handler returns adds a single HTTP round-trip, typically 10-50 ms inside the same region."
---

Java is one of the most popular Lambda runtimes for enterprise workloads, and Log4j2 is the de-facto logging framework for it. But getting Log4j2 to behave inside Lambda — and getting those logs somewhere you can actually search them — trips up a lot of teams: plugins disappear during JAR shading, multiline stack traces get split into separate CloudWatch events, and CloudWatch Logs Insights bills you for every query.

This guide covers the correct Log4j2 setup for AWS Lambda Java functions, structured JSON logging, and two ways to ship those logs to LogTide for real search, alerting, and retention without per-query costs.

> **Security note:** use Log4j **2.17.1 or later**. Versions before 2.15.0 are vulnerable to [CVE-2021-44228 (Log4Shell)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228). Pin the version explicitly — don't rely on transitive resolution.

## Why Java Lambda logging is harder than it should be

- **Shading breaks Log4j2 plugins.** Log4j2 discovers appenders via a binary plugin cache (`Log4j2Plugins.dat`). Maven Shade and Gradle Shadow merge JARs without merging this cache, so the Lambda appender silently vanishes.
- **Multiline stack traces fragment.** CloudWatch treats each line as a separate event unless you log JSON, making Java exceptions nearly unreadable.
- **CloudWatch costs scale with usage.** $0.50/GB ingestion plus $0.005/GB scanned per Logs Insights query adds up fast for chatty Java services.
- **No structured querying.** Filtering on MDC values or custom fields in CloudWatch requires fragile filter patterns instead of field-based search.

## Step 1: Correct Log4j2 setup for Lambda

### Dependencies

**Maven:**

```xml
<dependencies>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-api</artifactId>
    <version>2.23.1</version>
  </dependency>
  <dependency>
    <groupId>org.apache.logging.log4j</groupId>
    <artifactId>log4j-core</artifactId>
    <version>2.23.1</version>
  </dependency>
  <dependency>
    <groupId>com.amazonaws</groupId>
    <artifactId>aws-lambda-java-log4j2</artifactId>
    <version>1.6.0</version>
  </dependency>
</dependencies>
```

**Gradle (Kotlin DSL):**

```kotlin
dependencies {
    implementation("org.apache.logging.log4j:log4j-api:2.23.1")
    implementation("org.apache.logging.log4j:log4j-core:2.23.1")
    implementation("com.amazonaws:aws-lambda-java-log4j2:1.6.0")
}
```

### log4j2.xml with the Lambda appender

Place this in `src/main/resources/log4j2.xml`. The `Lambda` appender writes to the Lambda runtime's stdout pipe so each log entry — including multiline stack traces — arrives in CloudWatch as a single event:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration packages="com.amazonaws.services.lambda.runtime.log4j2">
  <Appenders>
    <Lambda name="Lambda" format="${env:AWS_LAMBDA_LOG_FORMAT:-TEXT}">
      <JsonTemplateLayout eventTemplateUri="classpath:LambdaLayout.json" />
    </Lambda>
  </Appenders>
  <Loggers>
    <Root level="INFO">
      <AppenderRef ref="Lambda" />
    </Root>
    <Logger name="software.amazon.awssdk" level="WARN" />
  </Loggers>
</Configuration>
```

### The shading transformer (the step everyone misses)

Without this, your fat JAR loses the Log4j2 plugin cache and the Lambda appender stops working.

**Maven Shade:**

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-shade-plugin</artifactId>
  <version>3.5.2</version>
  <dependencies>
    <dependency>
      <groupId>io.github.edwgiz</groupId>
      <artifactId>log4j-maven-shade-plugin-extensions</artifactId>
      <version>2.20.0</version>
    </dependency>
  </dependencies>
  <executions>
    <execution>
      <phase>package</phase>
      <goals><goal>shade</goal></goals>
      <configuration>
        <transformers>
          <transformer implementation="io.github.edwgiz.log4j.maven.plugins.shade.transformer.Log4j2PluginCacheFileTransformer" />
        </transformers>
      </configuration>
    </execution>
  </executions>
</plugin>
```

**Gradle Shadow** users can apply the [`de.sebastianboegl.shadow.transform-log4j2`](https://plugins.gradle.org/plugin/de.sebastianboegl.shadow.transform-log4j2) plugin, which does the same merge.

### Logging from your handler

```java
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.logging.log4j.ThreadContext;

public class OrderHandler implements RequestHandler<OrderEvent, String> {
    private static final Logger logger = LogManager.getLogger(OrderHandler.class);

    @Override
    public String handleRequest(OrderEvent event, Context context) {
        ThreadContext.put("requestId", context.getAwsRequestId());
        ThreadContext.put("orderId", event.getOrderId());

        logger.info("Processing order");
        try {
            // business logic
            logger.info("Order processed successfully");
            return "OK";
        } catch (Exception e) {
            logger.error("Order processing failed", e);
            throw e;
        } finally {
            ThreadContext.clearAll();
        }
    }
}
```

At this point you have clean, structured Log4j2 logs in CloudWatch. Now let's make them searchable.

## Step 2, Option A: Forward CloudWatch logs to LogTide

Zero code changes — keep Log4j2 exactly as configured above and forward the function's log group to LogTide with a CloudWatch subscription filter and a small forwarder function.

This is the same pattern used for Node.js functions, so follow the forwarder setup in the [AWS Lambda integration guide](/integrations/aws-lambda/#approach-2-cloudwatch-to-logtide-forwarding). The JSON layout from Step 1 pays off here: the forwarder can parse each event and map `level`, `message`, and your `ThreadContext` fields directly into LogTide's structured metadata instead of shipping opaque text lines.

**Choose this approach when** you have many existing Java functions, you can't modify their code, or you want CloudWatch to remain the primary sink with LogTide as the search and alerting layer.

## Step 2, Option B: LogTide JVM SDK from the handler

For the richest structured data, log directly to LogTide using the [Kotlin/Java SDK](/docs/sdks/kotlin/) (JVM 11+, works from plain Java via interop).

```kotlin
dependencies {
    implementation("io.github.logtide-dev:logtide-sdk-kotlin:0.2.0")
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
            // Flush before the environment freezes — one HTTP round-trip
            runBlocking { logtide.flush() }
        }
    }
}

private var cold = true
private fun isColdStart(): Boolean = cold.also { cold = false }
```

The SDK batches in memory with retry, exponential backoff, and a circuit breaker, so the only synchronous cost is the final `flush()` — typically 10-50 ms in-region.

**Choose this approach when** you want field-based queries on your own metadata, real-time alerting on errors, and cold start tracking — without paying CloudWatch per query.

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

- **`ERROR StatusLogger Unrecognized format specifier`** — your shaded JAR lost the plugin cache. Add the transformer from Step 1.
- **Logs appear in stderr without formatting** — `log4j2.xml` isn't on the classpath; confirm it's in `src/main/resources`.
- **Stack traces split across CloudWatch events** — you're using a pattern layout over stdout instead of the Lambda appender; switch to the `<Lambda>` appender or JSON layout.
- **Nothing in LogTide after `flush()`** — check the function's VPC/egress configuration can reach your LogTide instance, and that the API key has ingest permission for the project.

---

**Next steps:**

- [AWS Lambda integration overview](/integrations/aws-lambda/) — Node.js SDK, extensions, and forwarder setup
- [Kotlin/Java SDK reference](/docs/sdks/kotlin/) — full configuration options
- [Spring Boot integration](/integrations/spring-boot/) — for containerized Java services
- [Cost optimization guide](/use-cases/cost-optimization/) — what you save by moving search off CloudWatch
