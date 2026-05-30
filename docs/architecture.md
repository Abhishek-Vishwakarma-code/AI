# System Architecture Blueprint

This document outlines the architectural block structure and data streaming paths of the 100% self-hosted Multimodal AI Platform.

## 1. High-Level Architecture Diagram

```mermaid
graph TD
    User([User Client Browser])
    NextJS[Next.js App Router UI]
    FastAPI[FastAPI Monolith Backend]
    
    %% Databases
    Postgres[(PostgreSQL - Meta & Sessions)]
    Redis[(Redis - Token Rate Limits & Caches)]
    Qdrant[(Qdrant - RAG Embeddings)]
    
    %% Services
    LocalLLM[Local TinyLlama LLM]
    SDPipeline[Stable Diffusion Pipeline]
    Scraper[DuckDuckGo / Wiki Scraper]
    
    %% Connections
    User <-->|HTTP / WS| NextJS
    NextJS <-->|REST API| FastAPI
    
    FastAPI --> Postgres
    FastAPI --> Redis
    FastAPI --> Qdrant
    
    FastAPI <-->|Local Inference| LocalLLM
    FastAPI <-->|Local Inference| SDPipeline
    FastAPI <-->|Local Scraping| Scraper
```

## 2. Multi-Agent Orchestration Workflow

When a user submits a prompt, the **Supervisor Agent** routes queries to specialized actors:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant S as Supervisor Agent
    participant R as Research Agent
    participant C as Coding Agent
    participant I as Image Agent
    
    User->>S: Prompt ("Search and Write Python code for X")
    Note over S: Analyze Intent
    S->>R: Subtask: Crawl references for X
    R->>R: Local BeautifulSoup Web Scraping
    R-->>S: Markdown Citations & Summary
    
    S->>C: Subtask: Write Python code & unit tests
    C->>C: TinyLlama Text Generation
    C-->>S: Code blocks + Tests
    
    S-->>User: Synthesize responses & live trace thoughts
```

## 3. Deployment Scaling Strategy
- **Frontend Pods**: Horizontal scaling based on standard HTTP ingress volume.
- **Backend Pods**: Autoscales based on CPU/Memory and GPU limits. Node affinity schedules model pods to GPU nodes.
