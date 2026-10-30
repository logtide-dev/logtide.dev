---
title: "AWS Lambda Java Log4j2: Setup, JSON Logs and Maven Shade Fix"
description: "Complete Log4j2 setup for AWS Lambda Java: Maven dependencies, log4j2.xml, JSON log format, request ID, log level env var, and the shade plugin cache fix."
pubDate: 2026-10-30
author: "LogTide Team"
tags:
  - "aws"
  - "java"
  - "serverless"
  - "logging"
keywords:
  - "aws lambda log4j2"
  - "log4j aws lambda"
  - "aws lambda log4j"
  - "aws lambda java log4j"
  - "aws lambda java log4j2"
  - "aws lambda java log4j2 maven"
  - "aws lambda java log4j2 example"
  - "log4j2 lambda appender"
faqs:
  - question: "How do I use Log4j2 in an AWS Lambda Java function?"
    answer: "Add aws-lambda-java-log4j2, log4j-api, log4j-core and log4j-layout-template-json to your build, put a log4j2.xml with a Lambda appender in src/main/resources, and create loggers with LogManager.getLogger(). If you package a fat JAR with maven-shade-plugin, also register Log4j2PluginCacheFileTransformer, otherwise the Lambda appender is not found at runtime and Log4j2 falls back to its default error-only console configuration."
  - question: "Why does Log4j2 only print ERROR messages in my Lambda function?"
    answer: "Almost always because the shaded JAR lost the Log4j2 plugin cache. Log4j2 cannot resolve the Lambda appender, fails to apply your log4j2.xml and falls back to the default configuration, which logs only ERROR and above in a plain format. Add Log4j2PluginCacheFileTransformer to the shade plugin and confirm that Log4j2Plugins.dat in the final JAR contains the Lambda and JsonTemplateLayout plugins."
  - question: "How do I get JSON logs from Log4j2 in Lambda?"
    answer: "Set the function's log format to JSON (LoggingConfig LogFormat=JSON) and use the Lambda appender with a LambdaJSONFormat child that wraps a JsonTemplateLayout pointing at classpath:LambdaLayout.json, a template shipped inside aws-lambda-java-log4j2. Lambda then receives one JSON event per log call, including exceptions, and adds the request ID. Add log4j-layout-template-json to your dependencies or the layout will not load."
  - question: "How do I change the Log4j2 log level in Lambda without redeploying?"
    answer: "Read the level from an environment variable in log4j2.xml, for example level=\"${env:LOG_LEVEL:-${env:AWS_LAMBDA_LOG_LEVEL:-INFO}}\", and change LOG_LEVEL in the function configuration. With JSON log format you can also set ApplicationLogLevel in the logging configuration, which filters at the platform level. Neither needs a code deploy, but both create a new configuration revision that takes effect on the next cold start or invocation."
  - question: "Which Log4j2 version should I use in AWS Lambda?"
    answer: "Use the latest 2.x release and pin it explicitly. At the time of writing that is 2.25.5 for log4j-api, log4j-core and log4j-layout-template-json, with aws-lambda-java-log4j2 1.6.5. Do not use aws-lambda-java-log4j2 1.6.3, which had a regression that dropped logs, and never use the old aws-lambda-java-log4j (Log4j 1.x) artifact. Lambda managed runtimes do not bundle Log4j2, so the version in your JAR is the one that runs."
---

Most Java Lambda functions that use Log4j2 work fine on a laptop and then log almost nothing in production. The usual cause is not the logging code. It is the packaging: Log4j2 finds its appenders through a plugin cache file, and a naive fat JAR destroys that file.

This guide is the complete setup, verified against current versions: Maven dependencies, a `log4j2.xml` that works in both text and JSON format, request ID and custom fields, level control through environment variables, the shade plugin fix, and what changes with SnapStart. Everything below was built and run, including a reproduction of the shading failure.

## How Log4j2 fits into the Lambda runtime

The `aws-lambda-java-log4j2` library contributes one thing: a Log4j2 appender named `Lambda`. It does not write to stdout itself. It hands each formatted event to the Lambda runtime's own logger, which is what gives you single-event multiline stack traces, the request ID, and platform-level log level filtering.

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

code: "logger.info(...)\nLog4j2 root logger" { class: src }
app: "Lambda appender\nformat = TEXT or JSON" { class: hub }
lay: "PatternLayout (TEXT)\nJsonTemplateLayout (JSON)" { class: dest }
rt: "Lambda runtime logger\nlevel filter, request ID" { class: hub }
cw: "CloudWatch Logs" { class: src }

code -> app { class: flow }
app -> lay { class: flow }
lay -> rt { class: flow }
rt -> cw { class: flow }
```

Two consequences matter later. The layout inside the appender is chosen from the `AWS_LAMBDA_LOG_FORMAT` environment variable, and there are two places a log level is applied: Log4j2's own logger level, and Lambda's `ApplicationLogLevel` (JSON format only).

One more fact worth knowing: AWS documents that Lambda managed Java runtimes do not include Log4j2. The version in your JAR is the version that runs, so patching it is your job.

## Maven dependencies

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

Notes on each:

- **`aws-lambda-java-log4j2` 1.6.5** is the current release. Version 1.6.3 shipped a regression that dropped logs (aws-lambda-java-libs issue #612), so anything below 1.6.4 is worth avoiding. Never use the old `aws-lambda-java-log4j` artifact: it targets Log4j 1.x, which is end of life.
- **`log4j-layout-template-json`** is required for JSON format. `aws-lambda-java-log4j2` declares it only as a test dependency, so it will not arrive transitively. If you forget it, the JSON layout fails to resolve and you are back to default logging.
- **`aws-lambda-java-core`** provides `Context` and `RequestHandler`. The Lambda appender calls into it at runtime.
- If libraries such as the AWS SDK for Java v2 log through SLF4J, add `org.apache.logging.log4j:log4j-slf4j2-impl` at the same Log4j version to route their output into Log4j2.

## log4j2.xml with the Lambda appender

Put this in `src/main/resources/log4j2.xml`:

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

This follows the structure in the AWS documentation and the library README. What each piece does:

- `format="${env:AWS_LAMBDA_LOG_FORMAT:-TEXT}"` selects which child layout is active. `JSON` picks `LambdaJSONFormat`, anything else picks `LambdaTextFormat`. Locally, where the variable is unset, you get text.
- `%X{AWSRequestId}` prints the request ID from Log4j2's context map. Lambda populates it per invocation, so you do not have to.
- `classpath:LambdaLayout.json` is a JSON template packaged inside `aws-lambda-java-log4j2`. It emits `timestamp` (ISO 8601 UTC), `level`, `message`, `logger`, the exception fields `errorType`, `errorMessage` and `stackTrace`, and every context map entry as an extra key.
- The nested default in the root level (`${env:LOG_LEVEL:-${env:AWS_LAMBDA_LOG_LEVEL:-INFO}}`) means: your own `LOG_LEVEL` wins, then the level Lambda reports from its logging configuration, then `INFO`. Nested defaults resolve correctly in Log4j2; this exact file was run in both formats.
- `software.amazon.awssdk` at `WARN` keeps SDK request chatter out of your bill. Raise it temporarily when debugging a failing AWS call.

One thing to avoid is the `packages="..."` attribute on `<Configuration>` that older tutorials include. It triggers classpath scanning for plugins, which costs cold start time, and it is unnecessary when the plugin cache is intact.

## The handler: request ID, custom fields, exceptions

```java
package example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import org.apache.logging.log4j.CloseableThreadContext;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.Map;

public class OrderHandler implements RequestHandler<Map<String, Object>, String> {

    // static: Log4j2 initializes once per execution environment, during init
    private static final Logger log = LogManager.getLogger(OrderHandler.class);
    private static boolean coldStart = true;

    @Override
    public String handleRequest(Map<String, Object> event, Context context) {
        boolean cold = coldStart;
        coldStart = false;

        String orderId = String.valueOf(event.get("orderId"));
        try (CloseableThreadContext.Instance ctx = CloseableThreadContext
                .put("orderId", orderId)
                .put("coldStart", String.valueOf(cold))) {

            log.info("processing order");
            try {
                process(orderId);
                log.info("order processed");
                return "OK";
            } catch (IllegalStateException e) {
                log.error("order processing failed", e);
                throw e;
            }
        }
    }

    private void process(String orderId) {
        if (orderId.isBlank() || "null".equals(orderId)) {
            throw new IllegalStateException("missing orderId");
        }
    }
}
```

The points that matter:

- **Request ID needs no code.** The runtime puts `AWSRequestId` in the context map, so it appears in the text pattern through `%X{AWSRequestId}` and in JSON output as its own field. Do not copy `context.getAwsRequestId()` into `ThreadContext` yourself unless you want a second key.
- **Use `CloseableThreadContext`, not bare `ThreadContext.put`.** Lambda reuses the same thread across invocations, so a `put` without a matching `clear` leaks `orderId` into the next request's logs. Try-with-resources restores the previous context on exit, even when the handler throws. This is the pattern the library README uses for custom fields.
- **Pass the exception as the last argument** (`log.error("...", e)`). The JSON template turns it into `errorType`, `errorMessage` and a structured `stackTrace` array, all inside one log event.
- **Context values are strings.** The default template stringifies them, so `coldStart` arrives as `"true"`, not a boolean. Query it that way.

With `AWS_LAMBDA_LOG_FORMAT=JSON` and `LOG_LEVEL=DEBUG`, a failing invocation produces output like this (run locally, so the request ID that Lambda adds is absent):

```json
{"timestamp":"2026-10-30T12:19:03.760Z","level":"INFO","message":"processing order","logger":"example.OrderHandler","coldStart":"false","orderId":"null"}
{"timestamp":"2026-10-30T12:19:03.760Z","level":"ERROR","message":"order processing failed","logger":"example.OrderHandler","errorType":"java.lang.IllegalStateException","errorMessage":"missing orderId","stackTrace":[{"class":"example.OrderHandler","method":"process","file":"OrderHandler.java","line":41}],"coldStart":"false","orderId":"null"}
```

In text mode the same exception is one CloudWatch event with the stack trace attached, instead of one event per line as `System.out` would produce.

## The shade plugin fix

If you ship a fat JAR, this is the step that decides whether any of the above works.

Log4j2 discovers plugins (appenders, layouts, lookups) from a binary file, `META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat`, that every Log4j2 module and plugin JAR carries. `log4j-core`, `log4j-layout-template-json` and `aws-lambda-java-log4j2` each have one. A default `maven-shade-plugin` run keeps only one copy, so the others vanish.

I reproduced it with the exact project below minus the transformer. The function ran without any startup error, `INFO` lines disappeared, and the only output was an `ERROR` line in Log4j2's default format (`<timestamp> main ERROR order processing failed`). Log4j2 could not resolve the `Lambda` appender, discarded `log4j2.xml` and used its default configuration, which logs only `ERROR` and above. That silent fallback is why this bug survives code review.

The fix is a resource transformer that merges the `.dat` files. The current, maintained one is published by the Apache Logging Services project:

```xml
<build>
  <plugins>
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
          <goals>
            <goal>shade</goal>
          </goals>
          <configuration>
            <createDependencyReducedPom>false</createDependencyReducedPom>
            <transformers>
              <transformer implementation="org.apache.logging.log4j.maven.plugins.shade.transformer.Log4j2PluginCacheFileTransformer"/>
              <transformer implementation="org.apache.maven.plugins.shade.resource.ServicesResourceTransformer"/>
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
  </plugins>
</build>
```

Three transformers, each with a job: the first merges the plugin caches, the second merges `META-INF/services` files, and the third keeps the shaded JAR flagged as a multi-release JAR, which `log4j-core` is. The Apache documentation recommends this combination.

Be careful with older snippets. The `aws-lambda-java-log4j2` README still shows `com.github.edwgiz:maven-shade-plugin.log4j2-cachefile-transformer` 2.8.1, and many blog posts use `io.github.edwgiz:log4j-maven-shade-plugin-extensions`. Both are the same transformer under older coordinates (the Apache one was donated from that project); the Apache artifact is the one still receiving releases, and its class lives in the `org.apache.logging.log4j.maven.plugins.shade.transformer` package.

**Verify the result instead of trusting the build.** After `mvn package`:

```bash
unzip -p target/order-handler-1.0.0.jar \
  META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat \
  | strings | grep -iE "LambdaAppender|JsonTemplateLayout"
```

You should see entries for both. In my build the merged file contained the Lambda appender, the JSON format classes and the JSON layout. If the output is empty, the transformer is not applied.

### Gradle

With Gradle, use the Shadow plugin (`com.gradleup.shadow`, the maintained fork) and register its `Log4j2PluginsCacheFileTransformer` in `shadowJar`. The library README shows the Groovy form:

```groovy
shadowJar {
    transform(com.github.jengelman.gradle.plugins.shadow.transformers.Log4j2PluginsCacheFileTransformer)
}
build.dependsOn(shadowJar)
```

Package names and the Kotlin DSL form have changed between Shadow major versions, and the transformer has had merge bugs in the past, so check the Shadow release notes for your version and run the `unzip ... | strings` check above on the output. The README also notes that if you deploy with `sam build`, the SAM CLI merges `Log4j2Plugins.dat` files itself and you do not need Shadow for this.

## Log level and format: who decides what

| Setting | Where | Effect |
|---|---|---|
| `LogFormat` = `JSON` / `Text` | Function logging config | Sets `AWS_LAMBDA_LOG_FORMAT`, which picks the layout in `log4j2.xml` |
| `ApplicationLogLevel` | Function logging config | Lambda drops events below this level before CloudWatch. JSON format only |
| `AWS_LAMBDA_LOG_LEVEL` | Set by Lambda | Used as the fallback root level in the XML above |
| `LOG_LEVEL` | Your own env var | Overrides the fallback; works in text and JSON |
| `Root level` / `<Logger level>` | `log4j2.xml` | Log4j2 decides whether an event is created at all |

The practical rule: Log4j2 filters first, Lambda second. If Log4j2's root is `INFO`, a `DEBUG` call never reaches the runtime, whatever `ApplicationLogLevel` says. If Log4j2's root is `DEBUG` and `ApplicationLogLevel` is `INFO`, debug events are created and then dropped by the platform, which costs CPU but no CloudWatch ingestion.

Set them from the CLI:

```bash
aws lambda update-function-configuration \
  --function-name order-handler \
  --logging-config LogFormat=JSON,ApplicationLogLevel=INFO,SystemLogLevel=WARN
```

For a quick debug session, use your own variable. This replaces the whole `Variables` map, so include existing values:

```bash
aws lambda update-function-configuration \
  --function-name order-handler \
  --environment "Variables={LOG_LEVEL=DEBUG}"
```

Level filtering by Lambda requires JSON format and a valid RFC 3339 `timestamp` in each event, which `LambdaLayout.json` provides. In text format there is no platform filtering, so the Log4j2 level is your only control. For the cost side of this, see our [AWS Lambda logging guide](/blog/aws-lambda-logging-best-practices/).

## Cold starts and SnapStart

Log4j2 initializes when the first `LogManager.getLogger` runs, which with a `static final` logger happens during the init phase, not on the first request. A few habits keep that cheap:

- Keep `log4j2.xml` small and skip the `packages` attribute. Plugin lookup is fast when the merged cache is present and slow when Log4j2 has to scan.
- Do not enable `log4j2.debug` outside troubleshooting; the status logger prints a lot at startup.
- Avoid asynchronous loggers and the Disruptor in Lambda. Background threads are frozen between invocations, and events queued at the end of one invocation may not be written before the freeze. The Lambda appender is synchronous, which is what you want here.

I did not benchmark Log4j2 init time, and published numbers vary with memory size and JAR size, so measure with your own `Init Duration` in the `REPORT` line.

**SnapStart** supports Java 11 and later, and for Java managed runtimes AWS states there is no additional SnapStart cost. Since the snapshot is taken after init, Log4j2 is already configured when an environment resumes. Two consequences: environment variables are part of a published version's configuration, so changing `LOG_LEVEL` means publishing a new version, and the `AWS_LAMBDA_LOG_GROUP_NAME` and `AWS_LAMBDA_LOG_STREAM_NAME` variables are not available on SnapStart functions, so do not read them in your logging setup.

## Shipping Log4j2 output somewhere searchable

Everything above ends in CloudWatch. CloudWatch Logs Insights bills per GB scanned, so many teams forward Java Lambda logs to a log platform with field-based search. The JSON layout makes this straightforward: each event is already structured, with `orderId` and `coldStart` as fields rather than text to regex.

If you use LogTide, the step-by-step for both routes (subscription filter forwarding, or calling the JVM SDK from the handler with a flush before return) is in [AWS Lambda Java logging with LogTide](/integrations/aws-lambda-java/). The general Lambda setup is in the [AWS Lambda integration](/integrations/aws-lambda/), and the cost comparison is in [LogTide vs AWS CloudWatch](/vs/aws-cloudwatch/).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Only `ERROR` lines, default format | Plugin cache lost in shaded JAR | Add `Log4j2PluginCacheFileTransformer`, run the `unzip` check |
| `Unable to locate plugin type for Lambda` in status output | Same, or `aws-lambda-java-log4j2` missing | Check dependency and transformer |
| JSON mode prints plain text | `log4j-layout-template-json` missing, or format is not `JSON` | Add dependency; check the function's `LogFormat` |
| Request ID empty in text pattern | Running locally, not in Lambda | Expected; Lambda populates it |
| Fields from a previous request appear | Bare `ThreadContext.put` without cleanup | Use `CloseableThreadContext` |
| `DEBUG` never shows up | Log4j2 root level or `ApplicationLogLevel` above `DEBUG` | Lower both, or set `LOG_LEVEL` |
| Logs vanish in a few invocations | `aws-lambda-java-log4j2` 1.6.3 | Upgrade to 1.6.4 or later |

To see which configuration Log4j2 actually loaded, set `-Dlog4j2.debug=true` through the `JAVA_TOOL_OPTIONS` environment variable on a test function and read the status output at the top of the log stream.

## Checklist

- [ ] `aws-lambda-java-log4j2` 1.6.4 or later, Log4j2 pinned to a current 2.x release
- [ ] `log4j-layout-template-json` in dependencies
- [ ] `log4j2.xml` with `Lambda` appender and both `LambdaTextFormat` and `LambdaJSONFormat`
- [ ] `Log4j2PluginCacheFileTransformer` in the shade (or Shadow) configuration
- [ ] `Log4j2Plugins.dat` in the final JAR checked with `unzip | strings`
- [ ] Function log format set to JSON, `ApplicationLogLevel` set per environment
- [ ] Custom fields added with `CloseableThreadContext`
- [ ] Exceptions logged as the last argument, never `printStackTrace()`
- [ ] A retention policy on the function's log group

---

**Related guides:**

- [AWS Lambda Java logging with LogTide](/integrations/aws-lambda-java/) - forwarding and SDK options for these Log4j2 logs
- [AWS Lambda logging: how it works and the practices that matter](/blog/aws-lambda-logging-best-practices/) - JSON format, retention, cost
- [AWS Lambda integration](/integrations/aws-lambda/) - Node.js SDK, extensions and forwarder setup
- [Spring Boot integration](/integrations/spring-boot/) - for containerized Java services
- [LogTide vs AWS CloudWatch](/vs/aws-cloudwatch/) - feature and cost comparison
