---
title: "DevOps CI/CD Pipeline Logging"
description: "Centralize build, test, and deployment logs from GitHub Actions, GitLab CI, and other pipelines with LogTide for full release visibility."
category: "operations"
difficulty: "easy"
icon: "lucide:git-branch"
industries:
  - "Software"
  - "DevOps"
  - "Platform Engineering"
highlights:
  - "Pipeline log collection"
  - "Build failure analysis"
  - "Deploy tracking"
  - "Release audit trail"
relatedIntegrations:
  - "docker"
  - "kubernetes"
  - "systemd"
relatedUseCases:
  - "incident-response"
  - "compliance-audit-trail"
keywords:
  - "CI/CD logging"
  - "pipeline logging"
  - "build log management"
  - "deployment tracking"
  - "devops logging"
  - "github actions logging"
---

Your CI/CD pipeline generates some of the most valuable operational data in your organization: what was built, when it was deployed, whether tests passed, who approved the release. Yet most teams let these logs rot in GitHub Actions or GitLab CI with a 30-90 day retention limit. When a production incident traces back to a bad deploy three weeks ago, the evidence is already gone. This guide shows how to ship all pipeline logs to LogTide for permanent, searchable retention.

## The Problem with Pipeline Logs

CI/CD platforms treat logs as ephemeral artifacts:

```
❌ Pipeline log problems:

1. Retention limits    → GitHub Actions: 90 days, GitLab CI: 30 days
2. No search           → Can't query across builds or pipelines
3. Siloed by platform  → GitHub Actions + ArgoCD + Terraform = 3 log stores
4. No correlation      → Can't connect a deploy to a production incident
5. No alerting         → Build failures go unnoticed until someone checks
6. No audit trail      → Who deployed what, when? Scroll through pages of UI
```

| Scenario | Without Centralized Pipeline Logs |
|----------|----------------------------------|
| Production incident | "When was the last deploy?" -- check 3 different UIs |
| Flaky test investigation | No way to see test failure patterns over time |
| Compliance audit | Manually screenshot pipeline runs to prove controls |
| Build time regression | No historical data to compare build durations |

## The LogTide Approach

Ship every pipeline event to LogTide and treat CI/CD as a first-class data source:

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ GitHub Actions │  │  GitLab CI     │  │  Jenkins /      │
│                │  │                │  │  Other CI       │
└───────┬────────┘  └───────┬────────┘  └───────┬────────┘
        │                   │                   │
        │  HTTP POST        │  HTTP POST        │  HTTP POST
        ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                       LogTide                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Pipeline │  │  Deploy  │  │  Release Audit       │   │
│  │ Dashboard│  │  Tracker │  │  Trail               │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Implementation

### 1. LogTide CI Helper Script

Create a reusable script that any CI platform can call:

```bash
#!/bin/bash
# scripts/logtide-ci.sh

LOGTIDE_API_URL="${LOGTIDE_API_URL:?LOGTIDE_API_URL is required}"
LOGTIDE_API_KEY="${LOGTIDE_API_KEY:?LOGTIDE_API_KEY is required}"

logtide_log() {
  local level="$1" message="$2"
  shift 2

  local metadata="{"
  local first=true
  while [ $# -gt 0 ]; do
    [ "$first" = true ] && first=false || metadata+=","
    metadata+="\"${1%%=*}\": \"${1#*=}\""
    shift
  done
  metadata+="}"

  curl -s -X POST "${LOGTIDE_API_URL}/api/v1/ingest" \
    -H "X-API-Key: ${LOGTIDE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"logs\":[{\"level\":\"${level}\",\"message\":\"${message}\",\"service\":\"ci-pipeline\",\"metadata\":${metadata}}]}"
}

logtide_build_start() {
  logtide_log "info" "Build started" \
    "event=build.started" "commit=${COMMIT_SHA}" "branch=${BRANCH}" \
    "pipeline_id=${PIPELINE_ID}" "triggered_by=${TRIGGERED_BY}"
}

logtide_build_success() {
  logtide_log "info" "Build succeeded" \
    "event=build.success" "commit=${COMMIT_SHA}" "branch=${BRANCH}" \
    "pipeline_id=${PIPELINE_ID}" "duration_seconds=${BUILD_DURATION}"
}

logtide_build_failure() {
  logtide_log "error" "Build failed" \
    "event=build.failure" "commit=${COMMIT_SHA}" "branch=${BRANCH}" \
    "pipeline_id=${PIPELINE_ID}" "failure_step=${FAILURE_STEP}"
}

logtide_deploy() {
  logtide_log "info" "Deployment completed" \
    "event=deploy.completed" "version=${VERSION}" "environment=${ENVIRONMENT}" \
    "commit=${COMMIT_SHA}" "deployed_by=${DEPLOYED_BY}" "image_tag=${IMAGE_TAG}"
}

logtide_test_results() {
  logtide_log "info" "Test results" \
    "event=tests.completed" "passed=${TESTS_PASSED}" "failed=${TESTS_FAILED}" \
    "skipped=${TESTS_SKIPPED}" "coverage=${COVERAGE}" "pipeline_id=${PIPELINE_ID}"
}
```

### 2. GitHub Actions Integration

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]

env:
  LOGTIDE_API_URL: ${{ secrets.LOGTIDE_API_URL }}
  LOGTIDE_API_KEY: ${{ secrets.LOGTIDE_API_KEY }}

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log build start
        run: |
          source ./scripts/logtide-ci.sh
          COMMIT_SHA="${{ github.sha }}" BRANCH="${{ github.ref_name }}" \
          PIPELINE_ID="${{ github.run_id }}" TRIGGERED_BY="${{ github.actor }}" \
          logtide_build_start

      - name: Install and test
        run: |
          npm ci
          npm test -- --coverage --json --outputFile=test-results.json

      - name: Log test results
        if: always()
        run: |
          source ./scripts/logtide-ci.sh
          TESTS_PASSED=$(jq '.numPassedTests' test-results.json 2>/dev/null || echo 0)
          TESTS_FAILED=$(jq '.numFailedTests' test-results.json 2>/dev/null || echo 0)
          TESTS_SKIPPED=$(jq '.numPendingTests' test-results.json 2>/dev/null || echo 0)
          PIPELINE_ID="${{ github.run_id }}" COVERAGE="unknown" \
          logtide_test_results

      - name: Log build result
        if: always()
        run: |
          source ./scripts/logtide-ci.sh
          export COMMIT_SHA="${{ github.sha }}"
          export BRANCH="${{ github.ref_name }}"
          export PIPELINE_ID="${{ github.run_id }}"
          export BUILD_DURATION="$SECONDS"
          if [ "${{ job.status }}" == "success" ]; then
            logtide_build_success
          else
            FAILURE_STEP="${{ github.action }}" logtide_build_failure
          fi

  deploy-production:
    needs: build-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy and log
        run: |
          kubectl set image deployment/myapp \
            myapp=myregistry/myapp:${{ github.sha }} -n production

          source ./scripts/logtide-ci.sh
          VERSION="${{ github.sha }}" ENVIRONMENT="production" \
          COMMIT_SHA="${{ github.sha }}" DEPLOYED_BY="${{ github.actor }}" \
          IMAGE_TAG="myregistry/myapp:${{ github.sha }}" \
          logtide_deploy
```

### 3. GitLab CI Integration

```yaml
# .gitlab-ci.yml
stages: [build, test, deploy]

build:
  stage: build
  script:
    - source ./scripts/logtide-ci.sh
    - COMMIT_SHA="$CI_COMMIT_SHA" BRANCH="$CI_COMMIT_REF_NAME"
      PIPELINE_ID="$CI_PIPELINE_ID" TRIGGERED_BY="$GITLAB_USER_LOGIN"
      logtide_build_start
    - npm ci && npm run build
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - BUILD_DURATION=$SECONDS logtide_build_success

deploy_production:
  stage: deploy
  script:
    - kubectl set image deployment/myapp myapp=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA -n production
    - source ./scripts/logtide-ci.sh
    - VERSION="$CI_COMMIT_SHA" ENVIRONMENT="production"
      DEPLOYED_BY="$GITLAB_USER_LOGIN" IMAGE_TAG="$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
      logtide_deploy
  when: manual
  only: [main]
```

### 4. Programmatic Deploy Script with Rollback

For more control, use the LogTide SDK directly in deploy scripts:

```typescript
// scripts/deploy.ts
import { LogTideClient } from '@logtide/node';
import { execSync } from 'child_process';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'deploy-script',
});

async function deploy(service: string, env: string, imageTag: string) {
  const deployId = `deploy-${Date.now()}`;
  const startTime = Date.now();

  client.info('Deployment started', {
    event: 'deploy.started',
    deploy_id: deployId,
    service, environment: env, image_tag: imageTag,
    deployed_by: process.env.USER || 'automation',
    git_commit: execSync('git rev-parse HEAD').toString().trim(),
    git_message: execSync('git log -1 --pretty=%B').toString().trim(),
  });

  try {
    execSync(`kubectl set image deployment/${service} ${service}=${imageTag} -n ${env}`);
    execSync(`kubectl rollout status deployment/${service} -n ${env} --timeout=300s`);

    client.info('Deployment succeeded', {
      event: 'deploy.success',
      deploy_id: deployId,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      service, environment: env,
    });
  } catch (error) {
    client.error('Deployment failed', {
      event: 'deploy.failure',
      deploy_id: deployId,
      error: error.message,
      service, environment: env,
    });

    // Automatic rollback
    client.warn('Initiating rollback', { event: 'deploy.rollback', deploy_id: deployId });
    execSync(`kubectl rollout undo deployment/${service} -n ${env}`);
    client.info('Rollback completed', { event: 'deploy.rollback.completed', deploy_id: deployId });

    throw error;
  } finally {
    await client.flush();
  }
}
```

### 5. Release Audit Trail

For compliance, capture comprehensive release metadata:

```typescript
// scripts/release-audit.ts
import { LogTideClient } from '@logtide/node';
import { execSync } from 'child_process';

const client = new LogTideClient({
  dsn: process.env.LOGTIDE_DSN!,
  service: 'release-audit',
});

async function logRelease(version: string, environment: string) {
  const lastTag = execSync(
    'git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo HEAD~10'
  ).toString().trim();

  client.info('Release published', {
    event: 'release.published',
    version,
    environment,
    released_by: process.env.USER || 'automation',
    commit_sha: execSync('git rev-parse HEAD').toString().trim(),
    commits: execSync(`git log --oneline ${lastTag}..HEAD`).toString().trim(),
    changed_files: execSync(`git diff --name-only ${lastTag}..HEAD`).toString().trim().split('\n'),
    has_dependency_changes: execSync(
      `git diff ${lastTag}..HEAD -- package-lock.json | head -1`
    ).toString().trim().length > 0,
  });

  await client.flush();
}
```

## Real-World Example: Platform Engineering Team

A platform team managing 30 microservices across 15 repositories needs visibility into their CI/CD health.

**Before LogTide:**
- Build failure notifications scattered across Slack channels
- No way to correlate a production incident to a specific deploy
- Compliance audits required manually gathering screenshots from GitHub
- Flaky tests went undetected for weeks

**After LogTide (daily volume: ~5,000 pipeline events):**

```
1. Production alert: "Order service error rate > 5%"

2. Query: What was the last deploy?
   event:deploy.completed AND environment:production AND time:>2h
   → order-service v2.4.1 deployed 45 min ago

3. Query: What changed in that release?
   event:release.published AND version:v2.4.1
   → 3 commits, changed: src/services/payment-client.ts

4. Query: Did tests pass?
   event:tests.completed AND pipeline_id:12345
   → 142 passed, 0 failed -- regression not covered by tests

5. Decision: Rollback to v2.4.0
   → event:deploy.rollback logged automatically
```

**Result:** Incident correlation time dropped from 30+ minutes to 5 minutes. Compliance audits are now automated exports from LogTide.

## Dashboard Query Patterns

```
# All deployments to production this week
event:deploy.completed AND environment:production AND time:>7d | sort desc

# Failed deployments by repository
event:deploy.failure AND time:>30d | group by repository

# Average deploy duration by environment
event:deploy.success AND time:>30d | group by environment | avg(duration_seconds)

# Deployment frequency (DORA metric)
event:deploy.completed AND environment:production AND time:>30d
  | group by date(timestamp) | count

# Change failure rate (DORA metric)
# rollbacks / total deploys
event:deploy.rollback AND time:>30d | count

# Build success rate by repository
(event:build.success OR event:build.failure) AND time:>30d
  | group by repository | ratio(event:build.success)

# Flaky test detection
event:tests.completed AND failed:>0 AND time:>14d
  | group by pipeline_id
```

## CI/CD Logging Checklist

### Pipeline Integration
- [ ] Build start and completion events logged
- [ ] Test results (passed, failed, skipped, coverage) logged
- [ ] Build failure step identified in log metadata
- [ ] Pipeline ID and triggering user captured

### Deployment Tracking
- [ ] Deploy events include version, environment, deployer
- [ ] Image tags and commit SHAs recorded
- [ ] Rollback events captured with reason
- [ ] Deploy duration tracked

### Release Audit Trail
- [ ] Commit list included in release events
- [ ] Changed files recorded
- [ ] Dependency changes flagged
- [ ] Approval records captured for gated environments

### Alerting
- [ ] Build failure alerts (immediate notification)
- [ ] Deploy failure alerts with auto-rollback
- [ ] Build duration regression alerts
- [ ] Flaky test detection (tests that fail intermittently)

## Common Pitfalls

### 1. "We only log failures"

If you only capture failures, you cannot calculate success rates, track deployment frequency, or establish baselines for build duration.

**Solution:** Log every pipeline event. The storage cost is negligible (a few thousand events per day), and the analytical value is enormous.

### 2. "Our CI platform already has logs"

GitHub Actions keeps logs for 90 days. GitLab CI keeps them for 30. When you need to investigate what happened 6 months ago during a compliance audit, those logs are gone.

**Solution:** Ship to LogTide in real-time. Configure retention based on your compliance requirements.

### 3. "We'll add deployment tracking later"

Without deployment markers in your logs, you cannot correlate production incidents with releases. The most common root cause of production issues is "something changed."

**Solution:** Add deploy logging on day one. It takes 10 minutes with the helper script above.

## Next Steps

- [Docker Integration](/integrations/docker/) - Container build logging
- [Kubernetes Integration](/integrations/kubernetes/) - Deployment orchestration
- [Incident Response](/use-cases/incident-response/) - Correlate deploys with incidents
- [Compliance Audit Trail](/use-cases/compliance-audit-trail/) - Meet regulatory requirements

---

**Ready to centralize your pipeline logs?**

- [Deploy LogTide](https://github.com/logtide-dev/logtide) - Free, open-source
- [Join GitHub Discussions](https://github.com/logtide-dev/logtide/discussions) - Share your CI/CD logging setup
