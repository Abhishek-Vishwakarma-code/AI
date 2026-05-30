# Production Deployment Guide

This guide details steps to set up, configure, and maintain the Multimodal AI Platform in production environments.

## 1. Local Production Deployment (Docker Compose)

To build and launch the local multi-container stack:

```bash
# Move to infrastructure folder
cd infrastructure

# Start the stack
docker-compose up -d --build

# Verify container health
docker-compose ps
```

Once running, access services:
- **Next.js Web Portal**: `http://localhost:3000`
- **FastAPI Backend Documentation**: `http://localhost:8000/docs`
- **Postgres Database**: `localhost:5432`

## 2. Kubernetes Deployment

To deploy onto a staging/production Kubernetes cluster:

```bash
# Create namespace
kubectl apply -f k8s/manifests.yaml

# Monitor rolling updates
kubectl get pods -n platform -w
```

## 3. Enable Local GPU Scheduling
To leverage local hardware acceleration:
1. Ensure the NVIDIA Container Toolkit is installed on the host.
2. Edit `/infrastructure/docker-compose.yml` to request GPU resources:
   ```yaml
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: 1
             capabilities: [gpu]
   ```
3. Ensure CUDA libraries match PyTorch dependencies inside the backend Dockerfile.

## 4. Observability & Logging
- **FastAPI logs** can be tracked with Fluentbit/Loki.
- **System metrics** (CPU, RAM, GPU temperature/utilisation) are exposed to Prometheus.
- **Endpoint tracing** can be configured via OpenTelemetry middleware in `main.py`.
