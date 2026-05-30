# Database Schema Documentation

This document describes the schema design for the PostgreSQL meta-data store.

## Entity-Relationship Schema

```mermaid
erDiagram
    USERS ||--o{ WORKSPACES : owns
    WORKSPACES ||--o{ CHAT_SESSIONS : contains
    WORKSPACES ||--o{ DOCUMENTS : stores
    CHAT_SESSIONS ||--o{ MESSAGES : logs
    WORKSPACES ||--o{ MEDIA_TASKS : tracks
    
    USERS {
        int id PK
        string email UK
        string hashed_password
        string full_name
        boolean is_active
        string role
        datetime created_at
    }
    
    WORKSPACES {
        int id PK
        string name
        string description
        int owner_id FK
        datetime created_at
    }
    
    CHAT_SESSIONS {
        string id PK
        string title
        int workspace_id FK
        datetime created_at
    }
    
    MESSAGES {
        int id PK
        string session_id FK
        string role
        text content
        text thoughts
        text citations
        datetime created_at
    }
    
    DOCUMENTS {
        int id PK
        int workspace_id FK
        string filename
        string file_path
        int file_size
        datetime created_at
    }
    
    MEDIA_TASKS {
        string id PK
        int workspace_id FK
        string type
        text prompt
        string status
        string result_url
        string error_message
        datetime created_at
    }
```

## Vector Store Schema (Qdrant)
The semantic search collection is configured as:
- **Collection Name**: `platform_docs`
- **Vector Dimension**: `384` (using local `all-MiniLM-L6-v2` transformer)
- **Distance Metric**: `Cosine`
- **Payload Indexing**:
  - `workspace_id`: Integer filtering index
  - `doc_id`: String UUID index
