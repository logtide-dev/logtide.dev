---
title: "ASP.NET Core Logging Integration"
description: "Add structured logging to ASP.NET Core applications with ILogger integration, Entity Framework tracing, and Docker deployment."
category: "framework"
difficulty: "medium"
sdk: "csharp"
brandIcon: "simple-icons:dotnet"
highlights:
  - "ILogger provider integration"
  - "ASP.NET Core middleware"
  - "Entity Framework query tracing"
  - "Background service logging"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "postgresql"
relatedUseCases:
  - "compliance-audit-trail"
  - "security-monitoring"
keywords:
  - "dotnet logging"
  - "asp.net core logging"
  - "c# structured logging"
  - ".net log management"
  - "entity framework logging"
  - "ilogger logtide"
---

LogTide's C# SDK integrates with ASP.NET Core's built-in `ILogger` infrastructure, providing structured logging with automatic request tracing, Entity Framework query logging, and dependency injection support. This guide covers middleware setup, the ILogger provider, background services, and production deployment.

## Why use LogTide with ASP.NET Core?

- **ILogger integration**: Drop-in provider that works with the standard `ILogger<T>` interface
- **Request middleware**: Automatic HTTP request/response logging with timing and trace IDs
- **Dependency injection**: Register once, inject everywhere via ASP.NET Core DI
- **Entity Framework**: Log slow queries and database operations with execution time
- **Background services**: Trace `IHostedService` and worker processes
- **Structured logging**: First-class support for scopes, message templates, and semantic values
- **Non-blocking**: Async batching keeps request latency unaffected

## Prerequisites

- .NET 8.0+ (.NET 9.0 supported)
- ASP.NET Core
- LogTide instance with API key

## Installation

Install the `LogTide.Client` NuGet package:

```bash
dotnet add package LogTide.Client
```

Or via the Package Manager Console:

```powershell
Install-Package LogTide.Client
```

Or add directly to your `.csproj`:

```xml
<PackageReference Include="LogTide.Client" Version="0.4.0" />
```

## Quick Start

### 1. Configure Services

```csharp
// Program.cs
using LogTide.Client;

var builder = WebApplication.CreateBuilder(args);

// Register LogTide
builder.Services.AddLogTide(options =>
{
    options.ApiUrl = builder.Configuration["LogTide:ApiUrl"]!;
    options.ApiKey = builder.Configuration["LogTide:ApiKey"]!;
    options.DefaultService = "dotnet-app";
    options.BatchSize = 50;
    options.FlushIntervalMs = 5000;
    options.GlobalMetadata = new Dictionary<string, object>
    {
        ["environment"] = builder.Environment.EnvironmentName,
        ["version"] = typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown"
    };
});

// Add the LogTide ILogger provider
builder.Logging.AddLogTide();

builder.Services.AddControllers();
var app = builder.Build();

app.UseLogTideMiddleware();
app.MapControllers();
app.Run();
```

### 2. Configure App Settings

```json
// appsettings.json
{
  "LogTide": {
    "ApiUrl": "https://your-logtide-instance.example.com",
    "ApiKey": "lp_your_api_key_here"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore": "Warning"
    }
  }
}
```

For production, use environment variables or user secrets:

```bash
export LogTide__ApiUrl="https://your-logtide-instance.example.com"
export LogTide__ApiKey="lp_your_api_key_here"
```

### 3. Use in Controllers

```csharp
// Controllers/UsersController.cs
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly ILogger<UsersController> _logger;
    private readonly UserService _userService;

    public UsersController(ILogger<UsersController> logger, UserService userService)
    {
        _logger = logger;
        _userService = userService;
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetUser(int id)
    {
        _logger.LogInformation("Fetching user profile for {UserId}", id);

        var user = await _userService.GetByIdAsync(id);
        if (user is null)
        {
            _logger.LogWarning("User {UserId} not found", id);
            return NotFound();
        }

        return Ok(user);
    }

    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        _logger.LogInformation("Creating user with email {Email}", request.Email);

        try
        {
            var user = await _userService.CreateAsync(request);
            _logger.LogInformation("User {UserId} created successfully", user.Id);
            return CreatedAtAction(nameof(GetUser), new { id = user.Id }, user);
        }
        catch (DuplicateEmailException)
        {
            _logger.LogWarning("Duplicate email address: {Email}", request.Email);
            return Conflict(new { error = "Email already exists" });
        }
    }
}
```

## ASP.NET Core Middleware

### Request Logging Middleware

Create middleware that logs every request with timing, trace IDs, and user context:

```csharp
// Middleware/LogTideRequestMiddleware.cs
using System.Diagnostics;
using LogTide.Client;

public class LogTideRequestMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogTideClient _client;
    private static readonly HashSet<string> SkipPaths = new()
    {
        "/health", "/ready", "/metrics", "/swagger"
    };

    public LogTideRequestMiddleware(RequestDelegate next, ILogTideClient client)
    {
        _next = next;
        _client = client;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Generate or extract trace ID
        var traceId = context.Request.Headers["X-Trace-ID"].FirstOrDefault()
            ?? Activity.Current?.TraceId.ToString()
            ?? Guid.NewGuid().ToString();

        context.Items["TraceId"] = traceId;
        context.Response.Headers["X-Trace-Id"] = traceId;

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            LogRequest(context, stopwatch.ElapsedMilliseconds, traceId, ex);
            throw;
        }

        stopwatch.Stop();

        if (!ShouldSkip(context.Request.Path))
        {
            LogRequest(context, stopwatch.ElapsedMilliseconds, traceId);
        }
    }

    private void LogRequest(HttpContext context, long durationMs, string traceId, Exception? exception = null)
    {
        var statusCode = exception != null ? 500 : context.Response.StatusCode;
        var level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warning" : "info";

        var metadata = new Dictionary<string, object>
        {
            ["method"] = context.Request.Method,
            ["path"] = context.Request.Path.ToString(),
            ["statusCode"] = statusCode,
            ["durationMs"] = durationMs,
            ["traceId"] = traceId,
            ["ip"] = GetClientIp(context),
            ["userAgent"] = context.Request.Headers.UserAgent.ToString(),
        };

        if (context.User.Identity?.IsAuthenticated == true)
        {
            metadata["userId"] = context.User.FindFirst("sub")?.Value ?? "unknown";
        }

        if (exception != null)
        {
            metadata["error"] = exception.Message;
            metadata["errorType"] = exception.GetType().Name;
            metadata["stackTrace"] = exception.StackTrace?.Substring(0, Math.Min(exception.StackTrace.Length, 1000)) ?? "";
        }

        _client.Log(level, $"{context.Request.Method} {context.Request.Path} {statusCode}", metadata);
    }

    private static string GetClientIp(HttpContext context)
    {
        var forwarded = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwarded))
            return forwarded.Split(',')[0].Trim();

        return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private static bool ShouldSkip(PathString path)
    {
        return SkipPaths.Any(p => path.StartsWithSegments(p));
    }
}

// Extension method for clean registration
public static class LogTideMiddlewareExtensions
{
    public static IApplicationBuilder UseLogTideMiddleware(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<LogTideRequestMiddleware>();
    }
}
```

### Request Logging Output

Each request generates a structured log:

```json
{
  "level": "info",
  "message": "GET /api/users/42 200",
  "service": "dotnet-app",
  "metadata": {
    "method": "GET",
    "path": "/api/users/42",
    "statusCode": 200,
    "durationMs": 15,
    "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ip": "192.168.1.1",
    "userId": "42",
    "environment": "Production"
  }
}
```

## ILogger Provider Integration

The LogTide ILogger provider routes all `ILogger<T>` calls to LogTide while preserving scopes and message templates:

```csharp
// Services/OrderService.cs
public class OrderService
{
    private readonly ILogger<OrderService> _logger;
    private readonly AppDbContext _db;

    public OrderService(ILogger<OrderService> logger, AppDbContext db)
    {
        _logger = logger;
        _db = db;
    }

    public async Task<Order> ProcessOrderAsync(int orderId)
    {
        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["OrderId"] = orderId,
            ["Operation"] = "ProcessOrder"
        }))
        {
            _logger.LogInformation("Starting order processing");

            var order = await _db.Orders
                .Include(o => o.Items)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order is null)
            {
                _logger.LogWarning("Order {OrderId} not found", orderId);
                throw new OrderNotFoundException(orderId);
            }

            try
            {
                await ChargePaymentAsync(order);
                order.Status = OrderStatus.Completed;
                await _db.SaveChangesAsync();

                _logger.LogInformation(
                    "Order {OrderId} processed. Total: {Total:C}, Items: {ItemCount}",
                    orderId, order.Total, order.Items.Count);

                return order;
            }
            catch (PaymentFailedException ex)
            {
                _logger.LogError(ex,
                    "Payment failed for order {OrderId}. Amount: {Amount:C}",
                    orderId, order.Total);
                throw;
            }
        }
    }
}
```

## Dependency Injection

Register LogTide services and inject them throughout the application:

```csharp
// Program.cs
builder.Services.AddLogTide(options =>
{
    options.ApiUrl = builder.Configuration["LogTide:ApiUrl"]!;
    options.ApiKey = builder.Configuration["LogTide:ApiKey"]!;
    options.DefaultService = "dotnet-app";
});

// Register application services
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<AuditService>();
```

### Direct Client Injection

For cases where you need the LogTide client directly (outside ILogger):

```csharp
// Services/AuditService.cs
public class AuditService
{
    private readonly ILogTideClient _logtide;

    public AuditService(ILogTideClient logtide)
    {
        _logtide = logtide;
    }

    public void LogAdminAction(string action, string userId, string resourceType, string resourceId)
    {
        _logtide.Log("info", $"Admin action: {action}", new Dictionary<string, object>
        {
            ["action"] = action,
            ["userId"] = userId,
            ["resourceType"] = resourceType,
            ["resourceId"] = resourceId,
            ["timestamp"] = DateTimeOffset.UtcNow.ToString("o"),
            ["source"] = "admin-panel"
        });
    }
}
```

## Entity Framework Logging

### Log Slow Queries

Intercept Entity Framework queries to log slow or problematic operations:

```csharp
// Data/LogTideDbInterceptor.cs
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Data.Common;
using System.Diagnostics;
using LogTide.Client;

public class LogTideDbInterceptor : DbCommandInterceptor
{
    private readonly ILogTideClient _client;
    private readonly int _slowQueryThresholdMs;

    public LogTideDbInterceptor(ILogTideClient client, int slowQueryThresholdMs = 100)
    {
        _client = client;
        _slowQueryThresholdMs = slowQueryThresholdMs;
    }

    public override DbDataReader ReaderExecuted(
        DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        LogQuery(command, eventData.Duration);
        return base.ReaderExecuted(command, eventData, result);
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command, CommandExecutedEventData eventData,
        DbDataReader result, CancellationToken cancellationToken = default)
    {
        LogQuery(command, eventData.Duration);
        return base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }

    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData)
    {
        _client.Log("error", "Database query failed", new Dictionary<string, object>
        {
            ["query"] = command.CommandText[..Math.Min(command.CommandText.Length, 500)],
            ["durationMs"] = eventData.Duration.TotalMilliseconds,
            ["error"] = eventData.Exception.Message,
            ["errorType"] = eventData.Exception.GetType().Name
        });

        base.CommandFailed(command, eventData);
    }

    private void LogQuery(DbCommand command, TimeSpan duration)
    {
        var durationMs = duration.TotalMilliseconds;

        if (durationMs >= _slowQueryThresholdMs)
        {
            _client.Log("warning", "Slow SQL query detected", new Dictionary<string, object>
            {
                ["query"] = command.CommandText[..Math.Min(command.CommandText.Length, 500)],
                ["durationMs"] = Math.Round(durationMs, 2),
                ["thresholdMs"] = _slowQueryThresholdMs
            });
        }
    }
}
```

### Register the Interceptor

```csharp
// Program.cs
builder.Services.AddDbContext<AppDbContext>((serviceProvider, options) =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));

    var logtideClient = serviceProvider.GetRequiredService<ILogTideClient>();
    options.AddInterceptors(new LogTideDbInterceptor(logtideClient, slowQueryThresholdMs: 100));
});
```

## Background Service Logging

Log from `IHostedService` and background workers:

```csharp
// Services/OrderProcessingService.cs
public class OrderProcessingService : BackgroundService
{
    private readonly ILogger<OrderProcessingService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public OrderProcessingService(
        ILogger<OrderProcessingService> logger,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Order processing service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var pendingOrders = await db.Orders
                    .Where(o => o.Status == OrderStatus.Pending)
                    .Take(10)
                    .ToListAsync(stoppingToken);

                if (pendingOrders.Count > 0)
                {
                    _logger.LogInformation(
                        "Processing {Count} pending orders", pendingOrders.Count);

                    foreach (var order in pendingOrders)
                    {
                        using (_logger.BeginScope(new Dictionary<string, object>
                        {
                            ["OrderId"] = order.Id,
                            ["Task"] = "BackgroundProcessing"
                        }))
                        {
                            try
                            {
                                await ProcessSingleOrder(order, db);
                                _logger.LogInformation("Order {OrderId} processed", order.Id);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex,
                                    "Failed to process order {OrderId}", order.Id);
                                order.Status = OrderStatus.Failed;
                            }
                        }
                    }

                    await db.SaveChangesAsync(stoppingToken);
                }

                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Order processing service stopping");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Order processing service encountered an error");
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
            }
        }

        _logger.LogInformation("Order processing service stopped");
    }

    private async Task ProcessSingleOrder(Order order, AppDbContext db)
    {
        order.Status = OrderStatus.Processing;
        await db.SaveChangesAsync();
        // ... payment, notifications, etc.
        order.Status = OrderStatus.Completed;
    }
}
```

### Register the Background Service

```csharp
// Program.cs
builder.Services.AddHostedService<OrderProcessingService>();
```

## Health Check Integration

Add a LogTide connectivity health check:

```csharp
// HealthChecks/LogTideHealthCheck.cs
using Microsoft.Extensions.Diagnostics.HealthChecks;
using LogTide.Client;

public class LogTideHealthCheck : IHealthCheck
{
    private readonly ILogTideClient _client;

    public LogTideHealthCheck(ILogTideClient client)
    {
        _client = client;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var isHealthy = _client.IsConnected;

        return Task.FromResult(isHealthy
            ? HealthCheckResult.Healthy("LogTide connection is active")
            : HealthCheckResult.Degraded("LogTide connection is unavailable"));
    }
}
```

```csharp
// Program.cs
builder.Services.AddHealthChecks()
    .AddCheck<LogTideHealthCheck>("logtide");
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY *.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=build /app/publish .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "MyApp.dll"]
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:8080
      - LogTide__ApiUrl=${LOGTIDE_API_URL}
      - LogTide__ApiKey=${LOGTIDE_API_KEY}
      - ConnectionStrings__DefaultConnection=Host=db;Database=myapp;Username=user;Password=pass
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Graceful Shutdown

ASP.NET Core handles shutdown automatically when LogTide is registered via `AddLogTide()`. The SDK's `IDisposable` implementation flushes pending logs on host shutdown. For manual control:

```csharp
// Program.cs
var app = builder.Build();

app.Lifetime.ApplicationStopping.Register(() =>
{
    var client = app.Services.GetRequiredService<ILogTideClient>();
    client.Flush();
});
```

## Performance

| Metric | Value |
|--------|-------|
| Middleware overhead | <1ms per request |
| Memory overhead | ~12MB |
| Network calls | 1 per batch (50 logs) |
| EF interceptor overhead | <0.5ms per query |
| Background service overhead | Negligible |
| ILogger provider overhead | <0.2ms per log entry |

## Troubleshooting

### Logs not appearing

1. Verify configuration values are loaded correctly:
   ```csharp
   var config = builder.Configuration.GetSection("LogTide");
   Console.WriteLine($"ApiUrl: {config["ApiUrl"]}");
   ```
2. Ensure `AddLogTide()` is called on both `Services` and `Logging`
3. Check that the middleware is registered before `MapControllers()`

### ILogger scopes not appearing in LogTide

Ensure you are using `BeginScope` with a `Dictionary<string, object>`:

```csharp
using (_logger.BeginScope(new Dictionary<string, object>
{
    ["OrderId"] = orderId
}))
{
    _logger.LogInformation("Processing order");
}
```

### Entity Framework logs too verbose

Raise the EF Core log level in `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Microsoft.EntityFrameworkCore": "Warning",
      "Microsoft.EntityFrameworkCore.Database.Command": "Warning"
    }
  }
}
```

### High memory usage in background services

When processing large batches, create a new DI scope per iteration and dispose it properly to release the LogTide batch buffer:

```csharp
using var scope = _scopeFactory.CreateScope();
// ... process batch
// Scope disposes here, flushing logs
```

## Next Steps

- [Docker Integration](/integrations/docker) - Container deployment patterns
- [Kubernetes Integration](/integrations/kubernetes) - Production K8s deployment
- [PostgreSQL Integration](/integrations/postgresql) - Database logging correlation
- [Compliance Audit Trail](/use-cases/compliance-audit-trail) - Regulatory logging
- [Security Monitoring](/use-cases/security-monitoring) - Threat detection and alerting
