---
title: "Angular Application Logging Integration"
description: "Add structured logging to Angular applications with ErrorHandler, HttpInterceptor, and standalone or NgModule providers."
category: "framework"
difficulty: "medium"
sdk: "javascript"
brandIcon: "simple-icons:angular"
highlights:
  - "Angular ErrorHandler"
  - "HttpInterceptor tracing"
  - "Standalone + NgModule"
  - "Component context capture"
relatedIntegrations:
  - "nodejs"
  - "docker"
relatedUseCases: []
keywords:
  - "angular logging"
  - "angular error tracking"
  - "angular structured logging"
  - "angular http interceptor logging"
  - "angular error handler"
faqs:
  - question: "How do I add LogTide logging to an Angular application?"
    answer: "Install the @logtide/angular package and call provideLogtide() in your bootstrapApplication providers (Angular 17+ standalone) or spread getLogtideProviders() inside your NgModule providers array. Both approaches require only your DSN, service name, and environment."
  - question: "Do I need to manually wrap every component to capture errors?"
    answer: "No. The logtide plugin registers a custom Angular ErrorHandler that automatically captures all uncaught errors across components, services, and templates, including the component name and lifecycle hook where the error occurred."
  - question: "Does LogTide trace outgoing HTTP requests made with Angular HttpClient?"
    answer: "Yes. The included HttpInterceptor automatically adds a W3C traceparent header to every outgoing HttpClient request and captures failed requests as errors, with no changes needed to your service code."
  - question: "Can I send manual log events alongside the automatic error capture?"
    answer: "Yes. Import hub from @logtide/core anywhere in your application to call hub.captureLog(), hub.captureError(), or hub.addBreadcrumb() for custom events alongside the automatic error and HTTP tracking."
---

LogTide's Angular SDK provides a custom ErrorHandler for automatic error capture, an HttpInterceptor for distributed tracing, and providers for both standalone and NgModule-based applications.

## Why use LogTide with Angular?

- **Automatic error capture**: Custom ErrorHandler catches all uncaught errors
- **HTTP tracing**: HttpInterceptor adds traceparent headers to outgoing requests
- **Component context**: Errors include component name and lifecycle hook
- **Single setup**: `provideLogtide()` registers everything in one call
- **Both styles**: Supports standalone and NgModule-based apps

## Prerequisites

- Angular 17+ (standalone) or Angular 14+ (NgModule)
- LogTide instance with a DSN

## Installation

```bash
npm install @logtide/angular
```

## Standalone Setup (Angular 17+)

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideLogtide } from '@logtide/angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideLogtide({
      dsn: 'https://lp_abc123@api.logtide.dev',
      service: 'angular-app',
      environment: 'production',
      release: '1.0.0',
    }),
  ],
});
```

## NgModule Setup

```typescript
// app.module.ts
import { NgModule } from '@angular/core';
import { getLogtideProviders } from '@logtide/angular';

@NgModule({
  providers: [
    ...getLogtideProviders({
      dsn: 'https://lp_abc123@api.logtide.dev',
      service: 'angular-app',
      environment: 'production',
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

## Automatic Error Capture

Uncaught errors in components, services, and templates are captured automatically with context:

```typescript
@Component({ selector: 'app-dashboard', template: '...' })
export class DashboardComponent implements OnInit {
  ngOnInit() {
    // If this throws, LogTide captures it with:
    // - component: 'DashboardComponent'
    // - hook: 'ngOnInit'
    // - route information
    this.loadData();
  }
}
```

## HTTP Interceptor

Outgoing HttpClient requests automatically include tracing:

```typescript
@Injectable()
export class UserService {
  constructor(private http: HttpClient) {}

  getUser(id: string) {
    // traceparent header added automatically
    // Failed requests captured as errors
    return this.http.get<User>(`/api/users/${id}`);
  }
}
```

## Manual Logging in Components

```typescript
import { hub } from '@logtide/core';

@Component({ selector: 'app-checkout', template: '...' })
export class CheckoutComponent {
  purchase() {
    hub.addBreadcrumb({
      category: 'ui',
      message: 'Purchase button clicked',
    });

    try {
      // process purchase...
      hub.captureLog('info', 'Purchase completed', { orderId: '123' });
    } catch (error) {
      hub.captureError(error, {
        tags: { module: 'checkout' },
      });
    }
  }
}
```

## Next Steps

- [JavaScript SDK](/docs/sdks/nodejs/) - Core SDK reference
- [Angular SDK Reference](/docs/sdks/angular/) - Full API documentation
- [Docker Integration](/integrations/docker/) - Container deployments
