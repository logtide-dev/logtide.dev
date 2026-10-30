---
title: "Azure Functions Logging: Dependency Injection, ILogger and App Insights"
description: "How Azure Functions logging works: ILogger via dependency injection in the isolated worker, host.json vs worker log levels, App Insights filtering and costs."
pubDate: 2026-10-30
author: "LogTide Team"
tags:
  - "azure"
  - "serverless"
  - "logging"
  - "dotnet"
keywords:
  - "azure functions logging"
  - "azure function logging dependency injection"
  - "azure function logging"
  - "azure function logs"
  - "azure function logger"
  - "azure functions ilogger"
  - "azure functions application insights logs missing"
  - "azureloghandler"
faqs:
  - question: "How do I use dependency injection for logging in Azure Functions?"
    answer: "In the isolated worker model, functions are normal classes created by the .NET host, so you take an ILogger<T> (or ILoggerFactory) as a constructor parameter and the container supplies it. Register extra services and logging providers in Program.cs through builder.Services or ConfigureServices/ConfigureLogging. The old in-process model passed an ILogger into the Run method instead, and that model's support ends on November 10, 2026."
  - question: "Why are my Information logs missing in Application Insights from an isolated worker function?"
    answer: "When you send logs to Application Insights directly from the worker with the Application Insights worker service SDK, the SDK registers a default filter rule that only lets Warning and above through for its logger provider. host.json log levels do not override it because the worker has its own logging configuration. Remove the rule for ApplicationInsightsLoggerProvider in Program.cs (or set levels in appsettings.json) and the Information logs appear."
  - question: "What is the difference between host.json logLevel and worker log filtering?"
    answer: "host.json controls what the Functions host emits: runtime categories such as Host.Results and Function.<name>, and the logs of non-.NET workers that are relayed through the host. In a .NET isolated app, code that logs through ILogger runs in the worker process, which has its own pipeline configured in Program.cs and appsettings.json. Microsoft's guidance is to apply changes in both places if you need to tune both layers."
  - question: "What replaced AzureLogHandler for Python Azure Functions?"
    answer: "AzureLogHandler comes from the opencensus-ext-azure package, and OpenCensus is deprecated. The current route is the azure-monitor-opentelemetry package: call configure_azure_monitor() in function_app.py, or let the platform do it by setting PYTHON_APPLICATIONINSIGHTS_ENABLE_TELEMETRY to true. Standard logging calls are then exported as OpenTelemetry logs."
  - question: "How do I see Azure Functions logs in real time?"
    answer: "Use the Log stream blade of the function app in the portal, Live Metrics in Application Insights, or the Core Tools command func azure functionapp logstream <app-name>. Note that when you switch the host to OpenTelemetry mode (telemetryMode in host.json), the portal no longer supports log streaming, so plan for another live view in that case."
---

Azure Functions logging has more moving parts than it looks. There is a Functions host and a worker process, two places where log levels are set, a default filter that quietly drops Information logs, and a sampling layer that can drop more. The usual symptom: `logger.LogInformation` works locally, and in Azure the logs are thin or missing.

This guide covers how logs flow, how to get `ILogger<T>` through dependency injection in the .NET isolated worker, the filters that explain most "missing log" reports, and short notes for Node.js and Python.

## The in-process model is retiring - start with the isolated worker

For C#, there are two models: in-process (your code runs inside the host) and the isolated worker (your code runs in its own process, with its own `Program.cs`). Per Microsoft Learn, support for the in-process model ends on **November 10, 2026**, and OpenTelemetry output is not supported for in-process apps. The isolated worker supports .NET 8, .NET 9, .NET 10 and .NET Framework 4.8 on Functions runtime 4.x.

Everything below assumes the isolated worker, because that is where standard .NET dependency injection and logging configuration actually apply.

## How logs travel

The important detail is that your logs can take two different routes, and the route decides which settings apply:

```d2
direction: right
style.fill: transparent

classes: {
  src:   { style: { fill: "#f5f3ff"; stroke: "#7c3aed"; stroke-width: 2; font-color: "#3b0764"; border-radius: 8; shadow: true } }
  hub:   { style: { fill: "#7c3aed"; stroke: "#6d28d9"; stroke-width: 2; font-color: "#ffffff"; border-radius: 8; shadow: true } }
  dest:  { style: { fill: "#f1f5f9"; stroke: "#94a3b8"; stroke-width: 1; font-color: "#475569"; border-radius: 6 } }
  flow:  { style: { stroke: "#94a3b8"; stroke-width: 2; font-color: "#64748b" } }
}

w: "Worker process\nILogger<T> / logging / context.log" { class: src }
h: "Functions host\nhost.json logLevel + sampling" { class: hub }
ai: "Application Insights\n(Log Analytics workspace)" { class: dest }

w -> h: "default route" { class: flow }
h -> ai { class: flow }
w -> ai: "direct (SDK / OpenTelemetry)" { class: flow }
```

- **Default route:** the worker sends logs to the host, which sends them to Application Insights. `host.json` governs them.
- **Direct route:** for .NET isolated, you wire Application Insights (or OpenTelemetry) into the worker. Microsoft's docs state that the host no longer emits those logs and `host.json` no longer controls them.

Mixing the two without knowing it is the root of most confusion.

## ILogger via dependency injection in the isolated worker

Functions are plain classes. The host builds them through the DI container, so you ask for what you need in the constructor:

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace OrdersApp;

public class OrderFunctions(ILogger<OrderFunctions> logger, IOrderService orders)
{
    [Function("CreateOrder")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        FunctionContext context)
    {
        var order = await req.ReadFromJsonAsync<OrderDto>();

        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["InvocationId"] = context.InvocationId,
            ["OrderId"] = order!.Id,
        }))
        {
            logger.LogInformation("Order {OrderId} accepted with {ItemCount} items",
                order.Id, order.Items.Count);

            try
            {
                await orders.SubmitAsync(order);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Submitting order {OrderId} failed", order.Id);
                return req.CreateResponse(System.Net.HttpStatusCode.InternalServerError);
            }
        }

        return req.CreateResponse(System.Net.HttpStatusCode.Accepted);
    }
}

public record OrderDto(string Id, List<string> Items);
public interface IOrderService { Task SubmitAsync(OrderDto order); }
```

This targets .NET 8 or later (primary constructors need C# 12) with `Microsoft.Azure.Functions.Worker` and `Microsoft.Azure.Functions.Worker.Extensions.Http`. `Program.cs` registers your own services next to the logging setup:

```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OrdersApp;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddSingleton<IOrderService, OrderService>();
    })
    .Build();

host.Run();
```

Two things worth knowing about categories. With `ILogger<T>` injected into a class, the category is the fully qualified class name (`OrdersApp.OrderFunctions`), not the `Function.<name>.User` category you see in the host-level docs. And on Linux, you cannot override levels for categories that contain periods using environment variables, so set them in code or in `appsettings.json`.

### Message templates and scopes

Two habits make the difference between searchable logs and a wall of text:

- **Use message templates, not interpolation.** `LogInformation("Order {OrderId} accepted", id)` keeps `OrderId` as a named property that providers can index. `LogInformation($"Order {id} accepted")` bakes it into a string and loses the field.
- **Use scopes for per-invocation context.** `BeginScope` attaches values to every log line written inside the block, so you set `InvocationId` and `OrderId` once instead of repeating them. Not every exporter includes scopes by default: with OpenTelemetry in the worker, you have to opt in with `builder.Logging.AddOpenTelemetry(b => b.IncludeScopes = true)`.

## The classic gotcha: Information logs vanish in Application Insights

If you send logs directly from the worker using the Application Insights worker service SDK, you typically add this to `Program.cs` (packages `Microsoft.Azure.Functions.Worker.ApplicationInsights` and `Microsoft.ApplicationInsights.WorkerService`):

```csharp
.ConfigureServices(services =>
{
    services.AddApplicationInsightsTelemetryWorkerService();
    services.ConfigureFunctionsApplicationInsights();
})
```

and then wonder why `LogInformation` never shows up in the `traces` table while `LogWarning` does. The Application Insights logger provider is registered with a default rule that filters to `Warning` and above. Setting `"default": "Information"` in `host.json` does nothing, because these logs never pass through the host. The fix is to remove that rule:

```csharp
using Microsoft.Extensions.Logging;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddApplicationInsightsTelemetryWorkerService();
        services.ConfigureFunctionsApplicationInsights();
        services.Configure<LoggerFilterOptions>(options =>
        {
            var rule = options.Rules.FirstOrDefault(r => r.ProviderName ==
                "Microsoft.Extensions.Logging.ApplicationInsights.ApplicationInsightsLoggerProvider");
            if (rule is not null)
            {
                options.Rules.Remove(rule);
            }
        });
    })
    .Build();
```

With the rule gone, the levels you configure for the worker apply. Set them in `appsettings.json` (copy it to the output directory; `FunctionsApplication.CreateBuilder` loads it automatically, `new HostBuilder()` needs `ConfigureAppConfiguration` as shown in Microsoft's guide):

```json
{
  "logging": {
    "logLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Azure.Functions.Worker": "Information"
    }
  }
}
```

Note that Microsoft's current documentation has moved its examples to the OpenTelemetry route for direct Application Insights export (`AddOpenTelemetry().UseFunctionsWorkerDefaults().UseAzureMonitorExporter()` plus `"telemetryMode": "OpenTelemetry"` in `host.json`). That route does not use the Application Insights logger provider, so the rule above does not apply to it; filtering there goes through the OpenTelemetry logging configuration. If you are on an existing app using the classic SDK, the fix above is the one you need.

## host.json logLevel vs worker filtering

| Setting | Controls | Does not control |
|---|---|---|
| `host.json` `logging.logLevel` | Host categories (`Host.Results`, `Host.Aggregator`, `Function.<name>`), and logs from non-.NET workers relayed through the host | .NET isolated logs sent directly to Application Insights |
| `appsettings.json` / `ConfigureLogging` in the worker | Your `ILogger<T>` output and worker-side providers | Host runtime categories |
| `host.json` `logging.applicationInsights.samplingSettings` | Sampling of host-relayed telemetry | Direct worker telemetry, and anything when `telemetryMode` is `OpenTelemetry` |

A useful host.json, straight from Microsoft's high-volume guidance, keeps run results and aggregated metrics intact while dropping noise:

```json
{
  "version": "2.0",
  "logging": {
    "logLevel": {
      "default": "Warning",
      "Host.Aggregator": "Trace",
      "Host.Results": "Information",
      "Function": "Information"
    },
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20,
        "excludedTypes": "Request;Exception"
      }
    }
  }
}
```

Be careful with `Host.Results` and `Host.Aggregator`. They are written at `Information`, so raising them above that removes the data behind the portal's Monitor and Overview tabs. You can also change `host.json` values without redeploying through app settings named `AzureFunctionsJobHost__logging__logLevel__default` (double underscores for nesting), which restarts the app.

## Node.js (v4 model) and Python

**Node.js.** In the v4 programming model, every handler receives an `InvocationContext` with leveled logging methods. These go through the host, so `host.json` applies:

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

app.http("createOrder", {
  methods: ["POST"],
  authLevel: "function",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const order = (await request.json()) as { id: string };

    context.info(JSON.stringify({ msg: "order_accepted", orderId: order.id, invocationId: context.invocationId }));

    try {
      // business logic
      return { status: 202 };
    } catch (err) {
      context.error("order_failed", err);
      return { status: 500 };
    }
  },
});
```

`context.log`, `context.trace`, `context.debug`, `context.info`, `context.warn` and `context.error` all exist. They produce text, so serialize fields into the message if you want to query them later. `console.log` is also captured, but it goes through the host's stdout capture, so prefer the context methods.

**Python.** Use the standard `logging` module. The root logger is wired to Application Insights when running in Azure:

```python
import logging
import azure.functions as func

app = func.FunctionApp()

@app.route(route="orders", methods=["POST"])
def create_order(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("order accepted, items=%s", len(req.get_json().get("items", [])))
    return func.HttpResponse(status_code=202)
```

Debug logs need extra setup: set `PYTHON_ENABLE_DEBUG_LOGGING=1` and `logLevel` to `debug` or `trace` in `host.json`.

If you searched for **AzureLogHandler**: it lives in `opencensus-ext-azure`, and OpenCensus is deprecated. Replace it with `azure-monitor-opentelemetry` (add it to `requirements.txt`, then call `configure_azure_monitor()` in `function_app.py`, or set `PYTHON_APPLICATIONINSIGHTS_ENABLE_TELEMETRY=true` and add `"telemetryMode": "OpenTelemetry"` to `host.json`). Your existing `logging` calls need no changes.

## Where the logs go, what they cost, how to view them

By default everything lands in Application Insights, backed by a Log Analytics workspace, in the `traces`, `requests`, `dependencies`, `exceptions` and `customMetrics` tables. You pay per GB ingested at Log Analytics rates, so a function that logs one `Information` line per message on a busy queue gets expensive quickly. Levers, in the order they usually pay off:

1. Default log level `Warning`, with explicit `Information` only for `Function.<name>` categories you care about.
2. Sampling. The default is 20 telemetry items per second, applied per host instance, so scale-out multiplies it. Exclude `Request` and `Exception` so you never lose failures.
3. Do not log payloads. Log IDs and sizes.
4. Basic table plans in Log Analytics for high-volume, low-value tables.

For viewing: query `traces` in Logs, for example filtering on category and severity. Field names depend on the path: logs sent directly by the worker's Application Insights SDK carry `CategoryName` and unprefixed template properties in `customDimensions`, while logs relayed through the host use `Category` and a `prop__` prefix:

```kusto
traces
| where timestamp > ago(1h)
| where tostring(customDimensions.CategoryName) startswith "OrdersApp"
| where severityLevel >= 2
| project timestamp, message, customDimensions
| order by timestamp desc
```

For live output, use the function app's **Log stream** blade, Application Insights **Live Metrics**, or `func azure functionapp logstream <app-name>` from Core Tools. If you enable `telemetryMode: OpenTelemetry`, the portal's log streaming stops working, so keep another way to tail logs.

For how Azure Monitor and Sentinel fit together on the cost and security side, see [Azure Monitor vs Azure Sentinel](/blog/azure-monitor-vs-azure-sentinel/).

## Shipping function logs somewhere else

Application Insights is good at traces, dependency maps and sampling-friendly metrics. It is less pleasant for ad-hoc log search, and the per-GB meter pushes teams to log less than they want to. A common split is to keep Application Insights at `Warning` and sampled for platform telemetry, and send application logs to a second destination.

Because `ILogger` is just a provider list, adding a second destination is a registration, not a rewrite. With the [LogTide .NET SDK](/docs/sdks/csharp/) (NuGet package `LogTide.SDK`) it looks like this:

```csharp
using LogTide.SDK.Logging;
using LogTide.SDK.Middleware;
using LogTide.SDK.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddLogTide(new ClientOptions
        {
            ApiUrl = Environment.GetEnvironmentVariable("LOGTIDE_API_URL")!,
            ApiKey = Environment.GetEnvironmentVariable("LOGTIDE_API_KEY")!,
            ServiceName = "orders-functions",
        });
    })
    .ConfigureLogging(logging =>
    {
        logging.AddLogTide(o =>
        {
            o.Service = "orders-functions";
            o.MinimumLevel = LogLevel.Information;
        });
    })
    .Build();

host.Run();
```

Your `ILogger<OrderFunctions>` code, message templates and scopes stay exactly as they were; scope values are merged into entry metadata by default. The step-by-step setup for the Node.js model, flushing behavior and the App Insights split is in the [Azure Functions integration guide](/integrations/azure-functions/), and the general .NET setup is in [ASP.NET Core / .NET integration](/integrations/dotnet/). For the cost side, see [LogTide vs Azure Monitor](/vs/azure-monitor/) and the [cloud logging pricing breakdown](/cloud-logging-pricing/).

## Checklist

- [ ] Isolated worker model (the in-process model's support ends November 10, 2026)
- [ ] `ILogger<T>` injected through the constructor, not created manually
- [ ] Message templates with named properties, no string interpolation
- [ ] `BeginScope` for invocation and business IDs
- [ ] Application Insights provider's default Warning rule removed, if using the classic SDK
- [ ] Log levels set in both `host.json` and the worker (`appsettings.json`)
- [ ] Sampling enabled, with `Request;Exception` excluded
- [ ] No payload logging, no debug level in production
- [ ] Python: `azure-monitor-opentelemetry`, not `AzureLogHandler`
- [ ] A way to search and live-tail logs that suits your volume

---

**Related guides:**

- [Azure Functions integration](/integrations/azure-functions/) - ship structured logs to LogTide, with flush and cold start patterns
- [ASP.NET Core / .NET integration](/integrations/dotnet/) - the LogTide .NET SDK with Microsoft.Extensions.Logging
- [Azure Monitor vs Azure Sentinel](/blog/azure-monitor-vs-azure-sentinel/) - what each Azure service does and costs
- [LogTide vs Azure Monitor](/vs/azure-monitor/) - feature and cost comparison
