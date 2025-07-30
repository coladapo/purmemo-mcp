# PUO Memo Architecture - Visual Diagram

```mermaid
graph TB
    subgraph "User Interfaces"
        Claude[Claude Desktop<br/>Local]
        ChatGPT[ChatGPT Desktop<br/>Cloud]
    end
    
    subgraph "Local Services"
        MCP[MCP Server<br/>server.py]
        Bridge[ChatGPT Bridge<br/>FastAPI :8001]
        
        subgraph "Core Components"
            Memory[MemoryStore]
            Dedup[DeduplicationManager]
            Attach[AttachmentProcessor]
            DB[DatabaseConnection<br/>asyncpg pool]
        end
    end
    
    subgraph "Cloud Proxy"
        ngrok[ngrok Tunnel<br/>HTTPS Proxy]
    end
    
    subgraph "Google Cloud Platform"
        CloudSQL[(Cloud SQL<br/>35.235.107.217<br/>puo_memo)]
        GCS[(Cloud Storage<br/>puo-memo-attachments)]
        
        subgraph "AI Services"
            Gemini[Gemini API<br/>• Embeddings<br/>• Entities<br/>• Vision]
        end
    end
    
    %% Connections
    Claude <-->|stdio| MCP
    ChatGPT -->|HTTPS| ngrok
    ngrok -->|HTTPS| Bridge
    
    MCP <-->|Python| Memory
    Bridge <-->|Python| Memory
    Memory <-->|Python| Dedup
    Memory <-->|Python| Attach
    Memory <-->|Python| DB
    
    DB <-->|SQL + pgvector| CloudSQL
    Attach -->|Upload| GCS
    Memory -->|API Call| Gemini
    Dedup -->|API Call| Gemini
    Attach -->|Vision API| Gemini
    
    %% Styling
    classDef local fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef cloud fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef ai fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef storage fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    
    class Claude,MCP,Bridge,Memory,Dedup,Attach,DB local
    class ChatGPT,ngrok cloud
    class Gemini ai
    class CloudSQL,GCS storage
```

## Processing Flow Details

### 🧠 Where Intelligence Happens:

| Process | Location | Details |
|---------|----------|---------|
| **Embedding Generation** | Gemini API (Cloud) | Text → 768-dim vectors |
| **Entity Extraction** | Gemini API (Cloud) | NER + relationship extraction |
| **Similarity Search** | Cloud SQL (pgvector) | Cosine similarity in DB |
| **Vision Analysis** | Gemini API (Cloud) | Image/PDF understanding |
| **Content Deduplication** | Cloud SQL + Local | 90% similarity threshold |

### 📊 Data Flow Examples:

#### Creating a Memory:
```
1. User types in Claude/ChatGPT
2. Local server receives content
3. Calls Gemini API for embedding (Cloud)
4. Calls Gemini API for entities (Cloud)
5. Stores in Cloud SQL with vector
6. Returns memory ID to user
```

#### Searching Memories:
```
1. User enters search query
2. Local server gets query
3. Calls Gemini API for query embedding (Cloud)
4. Cloud SQL does vector similarity search
5. Returns ranked results
6. Local server formats response
```

#### Attaching Files:
```
1. User provides file path/URL
2. Local validation
3. Upload to Google Cloud Storage
4. Gemini Vision API analyzes content
5. Metadata + analysis stored in Cloud SQL
```

### 🔐 Security Boundaries:

- **Claude**: Direct local access (trusted)
- **ChatGPT**: Through ngrok tunnel (authenticated)
- **Gemini API**: API key authentication
- **Cloud SQL**: Database credentials
- **GCS**: Service account or API key

### 💾 Storage Distribution:

| Data Type | Location | Why |
|-----------|----------|-----|
| Memory Content | Cloud SQL | Centralized, backed up |
| Embeddings | Cloud SQL (pgvector) | Efficient similarity search |
| Knowledge Graph | Cloud SQL | Relational queries |
| File Attachments | Google Cloud Storage | Scalable blob storage |
| Logs | Local disk | Debugging, temporary |

The intelligence (AI processing) happens entirely in the cloud via Gemini API, while the orchestration and business logic run locally. Your data is stored in Google Cloud for reliability and accessibility.