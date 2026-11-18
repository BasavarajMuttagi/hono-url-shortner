# Kubernetes Deployment Guide (Manual `kubectl` + Gateway API)

This directory contains pure Kubernetes manifests for deploying the **Hono URL Shortener & Analytics Engine** with **Kubernetes Gateway API (`gateway.networking.k8s.io/v1`)** using **Traefik** as the gateway controller.

No external domain name or TLS certificates are required. The Gateway listens directly on HTTP port 80 as a catch-all.

---

## 📁 Directory Structure

| File | Purpose |
| :--- | :--- |
| [`00-namespace.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/00-namespace.yaml) | Creates isolated `hono-url-shortner` namespace |
| [`01-configmap.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/01-configmap.yaml) | Non-sensitive configs (`PORT`, `NODE_ENV`, ClickHouse DB/user, Axiom datasets) |
| [`02-secret.template.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/02-secret.template.yaml) | Reference template only (never put real passwords here) |
| [`03-deployment.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/03-deployment.yaml) | 3-replica Deployment with rolling updates, non-root UID 1000, probes, and `preStop` drain hook |
| [`04-service.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/04-service.yaml) | `ClusterIP` Service exposing port 8080 |
| [`05-gateway.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/05-gateway.yaml) | Gateway API `Gateway` resource bound to `gatewayClassName: traefik` (HTTP :80) |
| [`06-httproute.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/06-httproute.yaml) | `HTTPRoute` forwarding path prefix `/` to `hono-service:8080` |
| [`07-hpa.yaml`](file:///Users/basavarajmuttagi/Desktop/Scalable%20Backends/hono-url-shortner/k8s/07-hpa.yaml) | Horizontal Pod Autoscaler (3 to 20 replicas, CPU 70% / Memory 80% targets) |

---

## ⚡ Prerequisites

### 1. Install Gateway API Standard CRDs (if not already present on the cluster)
```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml
```

### 2. Install Traefik with Gateway API Provider Enabled
If your cluster does not yet have Traefik installed:
```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update

helm install traefik traefik/traefik \
  --namespace traefik --create-namespace \
  --set experimental.kubernetesGateway.enabled=true \
  --set providers.kubernetesGateway.enabled=true
```

### 3. Ensure Metrics Server is Running (for HPA)
If using minikube: `minikube addons enable metrics-server`  
If using Docker Desktop / cloud: Ensure `metrics-server` pod is running.

---

## 🚀 Step-by-Step Deployment

### Step 1: Build & Load Docker Image
If running on a local cluster (e.g. Minikube or Kind):
```bash
# Docker build
docker build -t hono-url-shortner:latest .

# For Minikube:
minikube image load hono-url-shortner:latest

# Or for Kind:
kind load docker-image hono-url-shortner:latest
```

### Step 2: Inject Secrets Directly from `.env` (Zero Leaks / No Files Written)
Never write secrets into YAML files. You can stream your local `.env` straight into Kubernetes with one terminal command:
```bash
kubectl apply -f k8s/00-namespace.yaml

kubectl create secret generic hono-secret \
  --namespace=hono-url-shortner \
  --from-env-file=.env \
  --dry-run=client -o yaml | kubectl apply -f -
```
This loads your passwords directly into Kubernetes memory without saving or committing anything to disk.

### Step 3: Apply All Manifests
```bash
kubectl apply -f k8s/
```

---

## 🔍 Verification & Inspection

### 1. Check Pods and ReplicaSets
```bash
kubectl get pods -n hono-url-shortner -o wide
```
Verify that all 3 replicas reach `1/1 Running`.

### 2. Check Gateway API Status
```bash
kubectl get gateway,httproute -n hono-url-shortner
```
You should see:
```text
NAME                                          CLASS     ADDRESS   PROGRAMMED   AGE
gateway.gateway.networking.k8s.io/traefik-gateway   traefik             True         1m

NAME                                            HOSTNAMES   AGE
httproute.gateway.networking.k8s.io/hono-route               1m
```

### 3. Check HPA Status
```bash
kubectl get hpa -n hono-url-shortner
```

---

## 🌐 Accessing the Application (Without a Domain)

### Method 1: Via Traefik Service IP / NodePort
Check Traefik's service:
```bash
kubectl get svc -n traefik
```
If Traefik has an external IP or NodePort:
```bash
curl http://<TRAEFIK_EXTERNAL_IP>/health
```

### Method 2: Local Port-Forwarding (Testing)
You can directly port-forward the Gateway or ClusterIP service:
```bash
kubectl port-forward -n hono-url-shortner svc/hono-service 8080:8080
```
Open in browser:
- Dashboard: [http://localhost:8080/dashboard](http://localhost:8080/dashboard)
- Health check: [http://localhost:8080/health](http://localhost:8080/health)

---

## 🛡️ Reliability & Zero-Downtime Drainage Details

1. **ClickHouse Batch Drain (`preStop: sleep 5`)**:
   During pod termination or rolling updates, the pod sleeps for 5 seconds to give Kubernetes endpoint controllers and Traefik time to remove the dying pod from upstream routing. Then Node.js receives `SIGTERM`, triggers `closeClickHouse()`, and drains all remaining in-memory buffered analytics events before shutdown.
2. **Horizontal Pod Autoscaling & Node Autoscaling Synergy**:
   - Sized at `100m CPU / 128Mi RAM` requests.
   - When traffic spikes, HPA rapidly scales pods from 3 up to 20 replicas.
   - If the existing nodes run out of capacity, newly created pods enter `Pending` status, which immediately triggers Cluster Autoscaler / Karpenter to provision new physical/cloud nodes.
