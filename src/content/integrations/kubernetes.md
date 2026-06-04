---
title: "Kubernetes Centralized Logging Integration"
description: "Collect and ship logs from Kubernetes clusters to LogTide using Fluent Bit DaemonSet or sidecar patterns."
category: "container"
difficulty: "advanced"
brandIcon: "simple-icons:kubernetes"
highlights:
  - "DaemonSet deployment"
  - "Namespace filtering"
  - "Helm chart ready"
  - "Multi-cluster support"
relatedIntegrations:
  - "docker"
  - "docker-compose"
  - "nginx"
  - "redis"
relatedUseCases:
  - "security-monitoring"
keywords:
  - "kubernetes logging"
  - "k8s centralized logging"
  - "fluent bit kubernetes"
  - "kubernetes log aggregation"
  - "container logs"
  - "pod logging"
faqs:
  - question: "How do I collect logs from all pods in a Kubernetes cluster and send them to LogTide?"
    answer: "Deploy Fluent Bit as a DaemonSet so that one Fluent Bit pod runs on every node and reads from /var/log/containers/. Configure the http output to point at your LogTide instance with your API key in the X-API-Key header, apply the ConfigMap and DaemonSet manifests with kubectl apply, and logs from every pod begin arriving in LogTide automatically."
  - question: "Do I need to modify my application containers to ship logs to LogTide?"
    answer: "No. The DaemonSet approach captures logs written to standard output and standard error by any container on the node without any changes to application images or code. Kubernetes metadata such as pod name, namespace, and labels is automatically enriched by the Fluent Bit Kubernetes filter."
  - question: "Can I filter logs by Kubernetes namespace or send different namespaces to separate LogTide projects?"
    answer: "Yes. You can use the Fluent Bit grep filter or Exclude_Path patterns to drop logs from system namespaces such as kube-system, and you can define multiple http output blocks that match different namespace patterns and use different API keys to route logs to separate LogTide projects."
  - question: "Can I deploy LogTide log collection for Kubernetes using Helm?"
    answer: "Yes. The guide shows how to use the official Fluent Bit Helm chart by adding the fluent Helm repository and running helm install with a values.yaml that configures the LogTide http output, Kubernetes metadata filters, and resource limits. The Helm approach is recommended for production deployments."
---

Kubernetes generates logs from multiple sources: application containers, system components, and the control plane. This guide shows you how to collect all these logs and ship them to LogTide using Fluent Bit.

## Why centralized logging for Kubernetes?

- **Ephemeral containers**: Pods die, logs disappear. Centralized logging persists everything
- **Multi-node visibility**: See logs from all nodes in one place
- **Namespace isolation**: Filter and route logs by namespace, labels, or annotations
- **Correlation**: Link application logs with Kubernetes events and metrics
- **Compliance**: Audit trails and retention policies for regulated environments

## Architecture Options

### Option 1: DaemonSet (Recommended)

Deploy Fluent Bit as a DaemonSet to collect logs from all nodes:

**Kubernetes Cluster with DaemonSet:**
- Each node runs a Fluent Bit pod
- Fluent Bit reads from `/var/log/containers/`
- All logs are shipped to LogTide centrally
- Pods can come and go, logs persist

### Option 2: Sidecar

Deploy Fluent Bit as a sidecar container for specific applications:

**Sidecar Pattern:**
- App container writes logs to a shared volume
- Fluent Bit sidecar reads from the same volume
- Useful for custom log parsing per application
- Higher resource usage but more flexibility

## Prerequisites

- Kubernetes 1.21+ cluster
- kubectl configured with cluster access
- Helm 3.x (optional, for Helm deployment)
- LogTide instance with API key

## Quick Start: DaemonSet Deployment

### 1. Create Namespace and Secret

```bash
kubectl create namespace logtide

kubectl create secret generic logtide-credentials \
  --namespace logtide \
  --from-literal=api-key=YOUR_LOGTIDE_API_KEY
```

### 2. Deploy Fluent Bit ConfigMap

```yaml
# fluent-bit-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: logtide
  labels:
    app.kubernetes.io/name: fluent-bit
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         5
        Log_Level     info
        Daemon        off
        Parsers_File  parsers.conf
        HTTP_Server   On
        HTTP_Listen   0.0.0.0
        HTTP_Port     2020

    [INPUT]
        Name              tail
        Tag               kube.*
        Path              /var/log/containers/*.log
        Parser            cri
        DB                /var/log/flb_kube.db
        Mem_Buf_Limit     50MB
        Skip_Long_Lines   On
        Refresh_Interval  10

    [FILTER]
        Name                kubernetes
        Match               kube.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
        Kube_Tag_Prefix     kube.var.log.containers.
        Merge_Log           On
        Merge_Log_Key       log_processed
        K8S-Logging.Parser  On
        K8S-Logging.Exclude Off
        Labels              On
        Annotations         Off

    # Extract service name from nested kubernetes metadata
    [FILTER]
        Name          nest
        Match         kube.*
        Operation     lift
        Nested_under  kubernetes
        Add_prefix    k8s_

    [FILTER]
        Name          modify
        Match         kube.*
        Rename        k8s_container_name service

    [FILTER]
        Name    modify
        Match   kube.*
        Add     cluster ${CLUSTER_NAME}
        Add     level info
        Rename  log message

    [OUTPUT]
        Name              http
        Match             kube.*
        Host              ${LOGTIDE_HOST}
        Port              443
        URI               /api/v1/ingest/single
        Format            json_lines
        Header            X-API-Key ${LOGTIDE_API_KEY}
        Header            Content-Type application/x-ndjson
        Json_date_key     time
        Json_date_format  iso8601
        tls               On
        tls.verify        On
        Retry_Limit       5

  parsers.conf: |
    [PARSER]
        Name        cri
        Format      regex
        Regex       ^(?<time>[^ ]+) (?<stream>stdout|stderr) (?<logtag>[^ ]*) (?<log>.*)$
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z

    [PARSER]
        Name        json
        Format      json
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z
```

### 3. Deploy Fluent Bit DaemonSet

```yaml
# fluent-bit-daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logtide
  labels:
    app.kubernetes.io/name: fluent-bit
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: fluent-bit
  template:
    metadata:
      labels:
        app.kubernetes.io/name: fluent-bit
    spec:
      serviceAccountName: fluent-bit
      tolerations:
        - key: node-role.kubernetes.io/master
          effect: NoSchedule
        - key: node-role.kubernetes.io/control-plane
          effect: NoSchedule
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:2.2
          env:
            - name: LOGTIDE_HOST
              value: "api.logtide.dev"
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: api-key
            - name: CLUSTER_NAME
              value: "production"
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          ports:
            - containerPort: 2020
              name: metrics
          resources:
            limits:
              cpu: 200m
              memory: 256Mi
            requests:
              cpu: 100m
              memory: 128Mi
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
            - name: fluent-bit-config
              mountPath: /fluent-bit/etc/
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
        - name: fluent-bit-config
          configMap:
            name: fluent-bit-config
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluent-bit
  namespace: logtide
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fluent-bit
rules:
  - apiGroups: [""]
    resources:
      - namespaces
      - pods
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: fluent-bit
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: fluent-bit
subjects:
  - kind: ServiceAccount
    name: fluent-bit
    namespace: logtide
```

### 4. Apply Configuration

```bash
kubectl apply -f fluent-bit-configmap.yaml
kubectl apply -f fluent-bit-daemonset.yaml
```

### 5. Verify Deployment

```bash
# Check DaemonSet status
kubectl get daemonset fluent-bit -n logtide

# Check pod logs
kubectl logs -n logtide -l app.kubernetes.io/name=fluent-bit --tail=100

# Check metrics endpoint
kubectl port-forward -n logtide ds/fluent-bit 2020:2020
curl http://localhost:2020/api/v1/metrics
```

## Helm Deployment

For production deployments, use the official Fluent Bit Helm chart:

```bash
helm repo add fluent https://fluent.github.io/helm-charts

helm install fluent-bit fluent/fluent-bit \
  --namespace logtide \
  --create-namespace \
  --set env[0].name=LOGTIDE_API_KEY \
  --set env[0].valueFrom.secretKeyRef.name=logtide-credentials \
  --set env[0].valueFrom.secretKeyRef.key=api-key \
  --values values.yaml
```

### values.yaml

```yaml
# values.yaml
config:
  outputs: |
    [OUTPUT]
        Name              http
        Match             *
        Host              api.logtide.dev
        Port              443
        URI               /api/v1/ingest/single
        Format            json_lines
        Header            X-API-Key ${LOGTIDE_API_KEY}
        Header            Content-Type application/x-ndjson
        Json_date_key     time
        Json_date_format  iso8601
        tls               On

  filters: |
    [FILTER]
        Name                kubernetes
        Match               kube.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
        Merge_Log           On
        Labels              On

    # Extract service name from nested kubernetes metadata
    [FILTER]
        Name          nest
        Match         kube.*
        Operation     lift
        Nested_under  kubernetes
        Add_prefix    k8s_

    [FILTER]
        Name          modify
        Match         kube.*
        Rename        k8s_container_name service

    [FILTER]
        Name    modify
        Match   kube.*
        Add     level info
        Rename  log message

resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi

tolerations:
  - key: node-role.kubernetes.io/master
    effect: NoSchedule
  - key: node-role.kubernetes.io/control-plane
    effect: NoSchedule
```

## Namespace-Based Filtering

### Exclude Namespaces

Exclude system namespaces from logging:

```ini
[INPUT]
    Name              tail
    Tag               kube.*
    Path              /var/log/containers/*.log
    Exclude_Path      /var/log/containers/*_kube-system_*.log,/var/log/containers/*_kube-public_*.log

[FILTER]
    Name    grep
    Match   kube.*
    Exclude $kubernetes['namespace_name'] ^(kube-system|kube-public)$
```

### Route by Namespace

Send different namespaces to different LogTide projects:

```ini
[OUTPUT]
    Name              http
    Match             kube.var.log.containers.*_production_*
    Host              api.logtide.dev
    Port              443
    URI               /api/v1/ingest/single
    Format            json_lines
    Header            X-API-Key ${LOGTIDE_PRODUCTION_KEY}
    Header            Content-Type application/x-ndjson
    Json_date_key     time
    Json_date_format  iso8601
    tls               On

[OUTPUT]
    Name              http
    Match             kube.var.log.containers.*_staging_*
    Host              api.logtide.dev
    Port              443
    URI               /api/v1/ingest/single
    Format            json_lines
    Header            X-API-Key ${LOGTIDE_STAGING_KEY}
    Header            Content-Type application/x-ndjson
    Json_date_key     time
    Json_date_format  iso8601
    tls               On
```

## Sidecar Pattern

For applications that need custom log parsing or isolation:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-app:latest
          volumeMounts:
            - name: logs
              mountPath: /var/log/app

        - name: fluent-bit
          image: fluent/fluent-bit:2.2
          env:
            - name: LOGTIDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: logtide-credentials
                  key: api-key
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
              readOnly: true
            - name: fluent-bit-config
              mountPath: /fluent-bit/etc/
          resources:
            limits:
              cpu: 50m
              memory: 64Mi

      volumes:
        - name: logs
          emptyDir: {}
        - name: fluent-bit-config
          configMap:
            name: my-app-fluent-bit-config
```

## Log Enrichment

### Add Kubernetes Metadata

The Kubernetes filter automatically adds:

```json
{
  "kubernetes": {
    "pod_name": "my-app-7d8f9b6c5-x2j4k",
    "namespace_name": "production",
    "container_name": "app",
    "container_id": "abc123...",
    "labels": {
      "app": "my-app",
      "version": "1.2.3"
    }
  }
}
```

### Add Custom Labels

Use annotations to add custom metadata:

```yaml
apiVersion: v1
kind: Pod
metadata:
  annotations:
    logtide.dev/service: "payment-service"
    logtide.dev/team: "payments"
```

Then parse in Fluent Bit. Since the Kubernetes metadata is nested, you need to lift the annotations first:

```ini
# First, lift the kubernetes object (if not already done)
[FILTER]
    Name          nest
    Match         kube.*
    Operation     lift
    Nested_under  kubernetes
    Add_prefix    k8s_

# Then lift the annotations
[FILTER]
    Name          nest
    Match         kube.*
    Operation     lift
    Nested_under  k8s_annotations
    Add_prefix    annotation_

# Now rename the annotation fields
[FILTER]
    Name    modify
    Match   kube.*
    Rename  annotation_logtide.dev/service service
    Rename  annotation_logtide.dev/team team
```

Alternatively, use a Lua script for more control:

```ini
[FILTER]
    Name          lua
    Match         kube.*
    Script        /fluent-bit/scripts/extract_metadata.lua
    Call          extract_metadata
```

```lua
-- extract_metadata.lua
function extract_metadata(tag, timestamp, record)
    if record["kubernetes"] then
        local k8s = record["kubernetes"]

        -- Extract container name as service
        if k8s["container_name"] then
            record["service"] = k8s["container_name"]
        end

        -- Extract custom annotations
        if k8s["annotations"] then
            if k8s["annotations"]["logtide.dev/service"] then
                record["service"] = k8s["annotations"]["logtide.dev/service"]
            end
            if k8s["annotations"]["logtide.dev/team"] then
                record["team"] = k8s["annotations"]["logtide.dev/team"]
            end
        end
    end
    return 1, timestamp, record
end
```

## Multi-Cluster Setup

For multi-cluster environments, add cluster identification:

```yaml
env:
  - name: CLUSTER_NAME
    value: "us-east-1-prod"
  - name: CLUSTER_REGION
    value: "us-east-1"
```

```ini
[FILTER]
    Name    modify
    Match   *
    Add     cluster ${CLUSTER_NAME}
    Add     region ${CLUSTER_REGION}
```

## Monitoring Fluent Bit

### Prometheus Metrics

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: fluent-bit
  namespace: logtide
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: fluent-bit
  endpoints:
    - port: metrics
      interval: 30s
```

### Key Metrics to Watch

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `fluentbit_input_records_total` | Records ingested | Sudden drops |
| `fluentbit_output_retries_total` | Retry attempts | >10/min |
| `fluentbit_output_errors_total` | Output errors | >0 |
| `fluentbit_filter_records_total` | Records filtered | Compare with input |

## Troubleshooting

### All logs show "unknown" service

If all your logs appear with service name "unknown" in LogTide, this means the `service` field isn't being extracted properly from the Kubernetes metadata.

The Kubernetes filter nests container information under `kubernetes.container_name`, but LogTide expects `service` at the top level. You need to lift this nested field using the `nest` filter:

```ini
# Add these filters AFTER the kubernetes filter
[FILTER]
    Name          nest
    Match         kube.*
    Operation     lift
    Nested_under  kubernetes
    Add_prefix    k8s_

[FILTER]
    Name          modify
    Match         kube.*
    Rename        k8s_container_name service
```

This lifts all fields from the `kubernetes` object to the top level (with `k8s_` prefix) and then renames `k8s_container_name` to `service`.

### HTTP 400 "body must be object" error

If you see this error in Fluent Bit logs:
```
[error] [output:http:http.0] HTTP status=400
```

This means the output configuration is incorrect. Make sure you're using:
- `URI /api/v1/ingest/single` (not `/api/v1/ingest`)
- `Format json_lines` (not `json`)
- `Header Content-Type application/x-ndjson`

### No logs appearing

1. Check Fluent Bit pods are running:
   ```bash
   kubectl get pods -n logtide -l app.kubernetes.io/name=fluent-bit
   ```

2. Check Fluent Bit logs:
   ```bash
   kubectl logs -n logtide -l app.kubernetes.io/name=fluent-bit
   ```

3. Verify log files exist on nodes:
   ```bash
   kubectl debug node/NODE_NAME -it --image=busybox -- ls /var/log/containers/
   ```

### High memory usage

Reduce memory buffer limit:

```ini
[INPUT]
    Name              tail
    Mem_Buf_Limit     5MB  # Reduce from default
```

### Logs being dropped

Check for backpressure and increase retry limits:

```ini
[OUTPUT]
    Name              http
    Retry_Limit       10
    storage.total_limit_size 5G
```

## Resource Recommendations

| Cluster Size | CPU Request | Memory Request | Memory Limit |
|--------------|-------------|----------------|--------------|
| Small (<20 nodes) | 50m | 64Mi | 128Mi |
| Medium (20-100) | 100m | 128Mi | 256Mi |
| Large (100+) | 200m | 256Mi | 512Mi |

## Next Steps

- [Docker Integration](/integrations/docker/) - Container logging basics
- [nginx Integration](/integrations/nginx/) - Web server logs in Kubernetes
- [Node.js SDK](/integrations/nodejs/) - Application-level logging
