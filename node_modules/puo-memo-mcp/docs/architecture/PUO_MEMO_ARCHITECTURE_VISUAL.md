# Puo Memo MCP Architecture - A Building Designer's View

## Overview
Think of Puo Memo MCP as a **6-story library and archive building** with a deep basement for data storage. Like a modern California institutional building (think Getty Center meets tech campus), it's designed for knowledge preservation, discovery, and intelligent retrieval.

## Table of Contents
1. [Building Concept](#building-concept)
2. [Plan Views](#plan-views)
3. [Elevation View](#elevation-view)
4. [Section Views](#section-views)
5. [Connection to CoS MCP](#connection-to-cos-mcp)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Key Architectural Insights](#key-architectural-insights)

## Building Concept

The Puo Memo MCP is structured like a modern knowledge center with:
- **Deep Basement (B1)**: PostgreSQL Database & Vector Storage
- **Ground Floor (L0)**: Core Memory Services
- **First Floor (L1)**: Intelligence & AI Processing
- **Second Floor (L2)**: Enhancement Services & Cache
- **Third Floor (L3)**: Import/Export Hub
- **Fourth Floor (L4)**: Public Interface (MCP & API)
- **Rooftop**: Connection Bridge to CoS MCP

## Plan Views

### B1 - BASEMENT PLAN (Database Foundation)
```
┌─────────────────────────────────────────────┐
│          POSTGRESQL DATABASE VAULT          │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Memory  │  │Attachments│  │ Entities  │  │
│  │ Store   │  │  Storage  │  │  Catalog  │  │
│  └─────────┘  └──────────┘  └───────────┘  │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │Relations│  │ Projects │  │Corrections│  │
│  │  Map    │  │ Contexts │  │  Vault    │  │
│  └─────────┘  └──────────┘  └───────────┘  │
│                                             │
│  Vector Embeddings Storage (pgvector)      │
└─────────────────────────────────────────────┘
```

### L0 - GROUND FLOOR PLAN (Core Services)
```
┌─────────────────────────────────────────────┐
│            CORE MEMORY SERVICES             │
│  ┌────────────────┐  ┌─────────────────┐   │
│  │  Memory Store  │  │    Database     │   │
│  │   Operations   │  │   Connection    │   │
│  │  • Create      │  │     Pool        │   │
│  │  • Update      │  └─────────────────┘   │
│  │  • Delete      │                         │
│  │  • Search      │  ┌─────────────────┐   │
│  └────────────────┘  │  Deduplication  │   │
│                      │   Checkpoint     │   │
│                      └─────────────────┘   │
└─────────────────────────────────────────────┘
```

### L1 - FIRST FLOOR PLAN (Intelligence Layer)
```
┌─────────────────────────────────────────────┐
│          INTELLIGENCE & AI FLOOR            │
│  ┌────────────────┐  ┌─────────────────┐   │
│  │  AI Assistant  │  │ Knowledge Graph │   │
│  │  • Gemini AI   │  │  • Entity Mgmt  │   │
│  │  • Embeddings  │  │  • Relations    │   │
│  │  • Smart Title │  │  • Traversal    │   │
│  └────────────────┘  └─────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │        Entity Extractor Lab          │  │
│  │    • Entity Mining • Relationships   │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### L2 - SECOND FLOOR PLAN (Enhancement Services)
```
┌─────────────────────────────────────────────┐
│         ENHANCEMENT & CACHE FLOOR           │
│  ┌────────────────┐  ┌─────────────────┐   │
│  │   Attachment   │  │  Redis Cache    │   │
│  │   Processor    │  │  • Fast Access  │   │
│  │  • GCS/Local   │  │  • TTL Manager  │   │
│  │  • Thumbnails  │  │  • Invalidation │   │
│  │  • Vision AI   │  └─────────────────┘   │
│  └────────────────┘                         │
│                      ┌─────────────────┐   │
│                      │ Background Tasks│   │
│                      │  Queue Manager  │   │
│                      └─────────────────┘   │
└─────────────────────────────────────────────┘
```

### L3 - THIRD FLOOR PLAN (Import/Export Hub)
```
┌─────────────────────────────────────────────┐
│          IMPORT/EXPORT CENTER               │
│  ┌────────────────┐  ┌─────────────────┐   │
│  │ Chat Importer  │  │  Deduplication  │   │
│  │ • Claude       │  │    Manager      │   │
│  │ • ChatGPT     │  │  • Smart Merge  │   │
│  │ • Actions      │  │  • Comparison   │   │
│  └────────────────┘  └─────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │     Reference & Link Discovery       │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### L4 - TOP FLOOR PLAN (Public Interface)
```
┌─────────────────────────────────────────────┐
│           PUBLIC ACCESS FLOOR               │
│                                             │
│  ┌─────────── MCP WING ──────────┐         │
│  │  ┌─────┐ ┌──────┐ ┌────────┐ │         │
│  │  │memory│ │recall│ │entities│ │         │
│  │  └─────┘ └──────┘ └────────┘ │         │
│  │  ┌──────┐ ┌──────┐ ┌───────┐ │         │
│  │  │attach│ │import│ │ find   │ │         │
│  │  └──────┘ └──────┘ └───────┘ │         │
│  │  ┌────┐ ┌──────────┐         │         │
│  │  │link│ │correction│         │         │
│  │  └────┘ └──────────┘         │         │
│  └───────────────────────────────┘         │
│                                             │
│  ┌─────────── API WING ──────────┐         │
│  │   REST Endpoints (Port 8000)  │         │
│  │   • Browser Extension Support │         │
│  │   • CORS-enabled Access       │         │
│  └───────────────────────────────┘         │
└─────────────────────────────────────────────┘
```

## Elevation View

```
ELEVATION VIEW - Puo Memo MCP Building
======================================

     ┌─────────────────────────────────────────┐
     │         BRIDGE TO CoS MCP →             │ ← Rooftop connection
     └─────────────────────────────────────────┘
     
L4   ┌─────────────────────────────────────────┐
     │         PUBLIC INTERFACE FLOOR           │
     │    MCP Server  |  REST API Server       │ ← Public access
     └─────────────────────────────────────────┘
     
L3   ┌─────────────────────────────────────────┐
     │         IMPORT/EXPORT CENTER             │
     │  Chat Import | Dedup | References       │ ← Data exchange
     └─────────────────────────────────────────┘
     
L2   ┌─────────────────────────────────────────┐
     │      ENHANCEMENT & CACHE FLOOR           │
     │  Attachments | Redis | Background       │ ← Performance layer
     └─────────────────────────────────────────┘
     
L1   ┌─────────────────────────────────────────┐
     │       INTELLIGENCE & AI FLOOR            │
     │  AI Assistant | Knowledge Graph         │ ← Smart processing
     └─────────────────────────────────────────┘
     
L0   ┌─────────────────────────────────────────┐
     │         CORE MEMORY SERVICES             │
     │  Memory Store | Database Connection     │ ← Core operations
     └─────────────────────────────────────────┘
     
B1   ┌─────────────────────────────────────────┐
     │         POSTGRESQL DATABASE              │
     │     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓            │ ← Data foundation
     │     Tables | Vectors | Indexes          │
     └─────────────────────────────────────────┘
     
     Legend: ▓ = Persistent storage
             □ = Active processing
```

## Section Views

### Memory Creation Flow - Section View
```
SECTION VIEW - Memory Creation Pipeline
======================================

Entry Point                Processing               Storage
    │                          │                      │
L4  │  MCP/API Request         │                      │
    │       ↓                  │                      │
L3  │                          │  Import/Validate     │
    │                          │       ↓              │
L2  │                          │  Deduplicate         │
    │                          │       ↓              │
L1  │                          │  Extract Entities    │
    │                          │  Generate Embeddings │
    │                          │       ↓              │
L0  │                          │  Create Memory       │
    │                          │       ↓              │
B1  │                          │                      │  Store in DB
    │                          │                      │  ▓▓▓▓▓▓▓▓▓▓
```

### Search Operation - Section View
```
SECTION VIEW - Search & Retrieval Pipeline
=========================================

Query Input              Processing              Results
    │                        │                     │
L4  │  Search Request        │                     │
    │       ↓                │                     │
L2  │  Check Cache ←─────────┤                     │
    │       ↓                │                     │
L1  │                        │  Semantic Search    │
    │                        │  Entity Search      │
    │                        │  Keyword Search     │
    │                        │       ↓             │
B1  │                        │  Query Database     │
    │                        │       ↓             │
L2  │                        │  Update Cache       │
    │                        │       ↓             │
L4  │                        │                     │  Return Results
```

## Connection to CoS MCP

### The Bridge Architecture
```
CAMPUS VIEW - Two Buildings Connected
====================================

   CoS MCP Building                    Puo Memo MCP Building
   ┌──────────────────┐               ┌──────────────────┐
L4 │ Cognitive OS     │               │ Public Interface │ L4
   ├──────────────────┤               ├──────────────────┤
L3 │ Execution Engine │               │ Import/Export    │ L3
   ├──────────────────┤               ├──────────────────┤
L2 │ Intelligence     │═══════════════│ Enhancement      │ L2
   │ • Selector       │<--memories--->│ • Search Engine  │
   │ • Router         │<--insights--->│ • Knowledge Graph│
   ├──────────────────┤               ├──────────────────┤
L1 │ Framework Lib    │               │ AI Intelligence  │ L1
   ├──────────────────┤               ├──────────────────┤
L0 │ MCP Foundation   │               │ Core Services    │ L0
   └──────────────────┘               ├──────────────────┤
                                   B1 │ Database Vault   │
                                      └──────────────────┘

         THE BRIDGE (MCP Protocol Connection)
         ═══════════════════════════════════
```

### Connection Points

The bridge connects at **Level 2** with these specific integration points:

```
CONNECTION INTERFACE - Bridge Details
====================================

From CoS MCP (L2)                    To Puo Memo MCP (L2)
─────────────────                    ────────────────────

1. Framework Selection ──────────>   Memory Query
   "What worked before?"             Search past experiences
   
2. Execution Results ────────────>   Memory Storage
   Save decisions/outcomes           Store for future reference
   
3. Context Request ──────────────>   Entity Graph
   "Related concepts?"               Return knowledge connections
   
4. Learning Query ───────────────>   Analytics Engine
   "Success patterns?"               Provide historical insights
   
5. AUTOEXEC.COG ─────────────────>   Personal Memories
   Load user preferences             Retrieve configurations
```

## Data Flow Diagrams

### Integrated Workflow - CoS + Puo Memo
```
INTEGRATED COGNITIVE WORKFLOW
============================

User Query
    │
    ▼
┌─────────────┐     Query History    ┌─────────────┐
│   CoS MCP   │ ←────────────────── │ Puo Memo    │
│  Selector   │                      │   Search    │
└──────┬──────┘                      └─────────────┘
       │
       ▼
┌─────────────┐     Save Progress    ┌─────────────┐
│  Framework  │ ───────────────────> │ Puo Memo    │
│  Execution  │                      │   Memory    │
└──────┬──────┘                      └─────────────┘
       │
       ▼
┌─────────────┐     Store Outcome    ┌─────────────┐
│   Results   │ ───────────────────> │ Puo Memo    │
│  Generated  │                      │  Knowledge  │
└─────────────┘                      └─────────────┘
```

### Memory-Augmented Intelligence Flow
```
LEARNING LOOP
=============

1. Initial State: No memories
   CoS: Generic framework selection
   
2. After First Use:
   Memory: Stores what worked
   CoS: Checks memory before selecting
   
3. Continuous Improvement:
   Memory: Builds pattern library
   CoS: Makes informed selections
   
4. Mature State:
   Memory: Rich knowledge graph
   CoS: Expert-level selection
```

## Key Architectural Insights

### 1. **Complementary Buildings**
- **CoS MCP**: The "thinking" building - active processing
- **Puo Memo MCP**: The "remembering" building - persistent storage
- Together: Complete cognitive system

### 2. **The Bridge Benefits**
| Without Bridge | With Bridge |
|----------------|-------------|
| Stateless processing | Stateful intelligence |
| No learning | Continuous improvement |
| Generic responses | Personalized decisions |
| Repeated mistakes | Learning from experience |

### 3. **Architectural Patterns**

#### Puo Memo Patterns:
- **Repository Pattern**: Centralized data access
- **Cache-Aside Pattern**: Performance optimization
- **Event Sourcing**: Correction history
- **CQRS**: Separate read/write paths

#### Integration Patterns:
- **API Gateway**: Multiple access points
- **Message Queue**: Async processing
- **Circuit Breaker**: Resilient connections
- **Adapter Pattern**: Format conversions

### 4. **Why This Architecture Matters**

**For Designers:**
- Clear separation of "thinking" vs "remembering"
- Modular components can be upgraded independently
- Visual data flows are easy to trace
- Performance optimization at every level

**For Users:**
- Memories persist across sessions
- Searches get smarter over time
- Knowledge builds progressively
- Personal context is maintained

### 5. **Future Expansion Potential**

**Puo Memo Building:**
- Add more AI floors (different models)
- Expand storage basement (more data types)
- Create specialized search wings
- Build collaboration bridges to other services

**Campus Growth:**
- Add more specialized buildings
- Create underground tunnels for faster data transfer
- Build shared facilities (common cache, shared AI)
- Develop inter-building workflows

## Technical Specifications

### Building Statistics
- **Total Floors**: 6 (including basement)
- **Lines of Code**: ~3,800 (core implementation)
- **Service Endpoints**: 8 MCP tools + REST API
- **Storage Capacity**: Unlimited (cloud-based)
- **Processing**: Async throughout
- **Cache Layer**: Redis with TTL
- **AI Integration**: Gemini Pro

### Performance Features
- **Deduplication**: Prevents redundant memories
- **Smart Search**: Multiple strategies (keyword, semantic, entity)
- **Background Processing**: Non-blocking operations
- **Connection Pooling**: Efficient database usage
- **Retry Mechanisms**: Resilient operations

## Conclusion

The Puo Memo MCP building serves as the **memory and knowledge center** of the cognitive campus. When connected to CoS MCP via the bridge, it transforms a stateless thinking system into a learning, evolving cognitive platform. 

Like a well-designed library that not only stores books but helps you find exactly what you need when you need it, Puo Memo MCP provides intelligent memory services that make the entire cognitive campus smarter over time.

The two-building campus design reflects the fundamental architecture of human cognition: working memory (CoS) and long-term memory (Puo Memo) working together to create intelligence.