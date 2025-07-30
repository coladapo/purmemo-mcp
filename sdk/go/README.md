# PUO Memo Go SDK

Official Go SDK for the PUO Memo API.

## Installation

```bash
go get github.com/puomemo/go-sdk
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "log"
    
    "github.com/puomemo/go-sdk"
)

func main() {
    // Initialize client with API key
    client := puomemo.NewClient(
        puomemo.WithAPIKey("puo_sk_..."),
    )
    
    ctx := context.Background()
    
    // Create a memory
    memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
        Content: "Important meeting notes from today's standup",
        Title:   "Daily Standup",
        Tags:    []string{"meetings", "daily", "team"},
    })
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("Created memory: %s\n", memory.ID)
    
    // Search memories
    results, err := client.Search(ctx, puomemo.SearchOptions{
        Query: "standup meetings",
    })
    if err != nil {
        log.Fatal(err)
    }
    
    for _, mem := range results.Results {
        fmt.Printf("%s: %s...\n", mem.Title, mem.Content[:100])
    }
    
    // Update a memory
    updated, err := client.UpdateMemory(ctx, memory.ID, puomemo.UpdateMemoryOptions{
        Tags: []string{"meetings", "daily", "team", "archived"},
    })
    if err != nil {
        log.Fatal(err)
    }
    
    // Delete a memory
    err = client.DeleteMemory(ctx, memory.ID)
    if err != nil {
        log.Fatal(err)
    }
}
```

## Authentication

### API Key Authentication

```go
client := puomemo.NewClient(
    puomemo.WithAPIKey("puo_sk_..."),
)
```

### Email/Password Authentication

```go
client := puomemo.NewClient()

ctx := context.Background()
user, err := client.Login(ctx, "user@example.com", "password")
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Logged in as: %s\n", user.FullName)
```

### Environment Variables

The SDK can read configuration from environment variables:

```bash
export PUO_MEMO_API_KEY="puo_sk_..."
export PUO_MEMO_API_URL="https://api.puomemo.com"
```

Then initialize without parameters:

```go
client := puomemo.NewClient()
```

## Client Configuration

```go
client := puomemo.NewClient(
    puomemo.WithAPIKey("puo_sk_..."),
    puomemo.WithBaseURL("https://api.puomemo.com"),
    puomemo.WithTimeout(30 * time.Second),
    puomemo.WithRetry(3, 1 * time.Second),
    puomemo.WithHTTPClient(customHTTPClient),
)
```

## Memory Operations

### Create Memory

```go
memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
    Content:    "Memory content",
    Title:      "Optional title",
    Tags:       []string{"tag1", "tag2"},
    Metadata: map[string]interface{}{
        "key": "value",
    },
    Visibility:        "private", // or "team", "public"
    GenerateEmbedding: &[]bool{true}[0], // for semantic search
})
```

### List Memories

```go
// List recent memories
result, err := client.ListMemories(ctx, &puomemo.ListMemoriesOptions{
    Limit:  20,
    Offset: 0,
})

// Filter by tags
filtered, err := client.ListMemories(ctx, &puomemo.ListMemoriesOptions{
    Tags: []string{"important", "work"},
})

// Filter by visibility
teamMemories, err := client.ListMemories(ctx, &puomemo.ListMemoriesOptions{
    Visibility: []string{"team"},
})
```

### Search Memories

```go
// Hybrid search (default)
results, err := client.Search(ctx, puomemo.SearchOptions{
    Query: "machine learning",
})

// Keyword-only search
keywordResults, err := client.Search(ctx, puomemo.SearchOptions{
    Query:      "exact phrase",
    SearchType: "keyword",
})

// Semantic search
semanticResults, err := client.Search(ctx, puomemo.SearchOptions{
    Query:      "AI and neural networks",
    SearchType: "semantic",
})

// Advanced search
advancedResults, err := client.Search(ctx, puomemo.SearchOptions{
    Query:               "project updates",
    SearchType:          "hybrid",
    Tags:                []string{"project", "updates"},
    DateFrom:            &time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
    DateTo:              &time.Date(2024, 12, 31, 23, 59, 59, 0, time.UTC),
    SimilarityThreshold: 0.8,
    KeywordWeight:       0.3,
    SemanticWeight:      0.7,
})
```

## API Key Management

```go
// Create API key
apiKey, err := client.CreateAPIKey(ctx, puomemo.CreateAPIKeyOptions{
    Name:        "Production Key",
    Permissions: []string{"memories.read", "memories.create"},
    ExpiresAt:   &time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC),
})

fmt.Printf("API Key: %s\n", apiKey)

// List API keys
keys, err := client.ListAPIKeys(ctx)
for _, key := range keys {
    fmt.Printf("%s: %s\n", key.Name, key.CreatedAt)
}

// Revoke API key
err = client.RevokeAPIKey(ctx, keyID)
```

## Error Handling

```go
memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
    Content: "Content",
})

if err != nil {
    if puoErr, ok := err.(*puomemo.Error); ok {
        switch puoErr.Code {
        case puomemo.ErrorCodeAuthentication:
            fmt.Println("Authentication failed. Check your credentials.")
        case puomemo.ErrorCodeRateLimit:
            fmt.Printf("Rate limit hit. Retry after %d seconds.\n", puoErr.RetryAfter)
        case puomemo.ErrorCodeValidation:
            fmt.Println("Input validation failed:", puoErr.Message)
        default:
            fmt.Println("API error:", puoErr.Message)
        }
    } else {
        fmt.Println("Network error:", err)
    }
}
```

## Context Support

All methods accept a context for cancellation and timeout:

```go
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()

memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
    Content: "Context-aware operation",
})
```

## Concurrent Operations

The client is safe for concurrent use:

```go
var wg sync.WaitGroup
memories := make(chan *puomemo.Memory, 10)

// Create multiple memories concurrently
for i := 0; i < 10; i++ {
    wg.Add(1)
    go func(i int) {
        defer wg.Done()
        
        memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
            Content: fmt.Sprintf("Memory %d", i),
        })
        if err != nil {
            log.Printf("Error creating memory %d: %v", i, err)
            return
        }
        
        memories <- memory
    }(i)
}

go func() {
    wg.Wait()
    close(memories)
}()

// Process created memories
for memory := range memories {
    fmt.Printf("Created: %s\n", memory.ID)
}
```

## Custom Metadata

```go
memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
    Content: "Meeting notes",
    Metadata: map[string]interface{}{
        "meeting_id": "123",
        "attendees":  []string{"Alice", "Bob"},
        "duration_minutes": 30,
        "action_items": []map[string]string{
            {"task": "Review proposal", "assignee": "Alice"},
            {"task": "Update timeline", "assignee": "Bob"},
        },
    },
})
```

## Pagination

```go
func getAllMemories(ctx context.Context, client *puomemo.Client) ([]puomemo.Memory, error) {
    var allMemories []puomemo.Memory
    offset := 0
    limit := 50
    
    for {
        result, err := client.ListMemories(ctx, &puomemo.ListMemoriesOptions{
            Limit:  limit,
            Offset: offset,
        })
        if err != nil {
            return nil, err
        }
        
        allMemories = append(allMemories, result.Memories...)
        
        if len(allMemories) >= result.Total {
            break
        }
        
        offset += limit
    }
    
    return allMemories, nil
}
```

## Statistics

```go
stats, err := client.GetStats(ctx)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Total memories: %v\n", stats["total_memories"])
fmt.Printf("Memories with embeddings: %v\n", stats["memories_with_embeddings"])
fmt.Printf("Storage used: %v MB\n", stats["storage_used_mb"])
```

## Token Management

```go
// Handle token refresh automatically
client := puomemo.NewClient()

// Login
user, err := client.Login(ctx, "user@example.com", "password")
if err != nil {
    log.Fatal(err)
}

// The client will automatically refresh tokens when needed
// You can also manually refresh
tokens, err := client.RefreshAccessToken(ctx)
if err != nil {
    log.Fatal(err)
}
```

## Custom HTTP Client

```go
// Use custom HTTP client with proxy
proxyURL, _ := url.Parse("http://proxy.example.com:8080")
httpClient := &http.Client{
    Transport: &http.Transport{
        Proxy: http.ProxyURL(proxyURL),
    },
    Timeout: 30 * time.Second,
}

client := puomemo.NewClient(
    puomemo.WithHTTPClient(httpClient),
)
```

## Testing

```go
package main

import (
    "testing"
    "context"
    
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

// Mock client for testing
type MockClient struct {
    mock.Mock
}

func (m *MockClient) CreateMemory(ctx context.Context, opts puomemo.CreateMemoryOptions) (*puomemo.Memory, error) {
    args := m.Called(ctx, opts)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*puomemo.Memory), args.Error(1)
}

func TestCreateMemory(t *testing.T) {
    mockClient := new(MockClient)
    
    expectedMemory := &puomemo.Memory{
        ID:      "123",
        Content: "Test content",
    }
    
    mockClient.On("CreateMemory", mock.Anything, mock.Anything).Return(expectedMemory, nil)
    
    memory, err := mockClient.CreateMemory(context.Background(), puomemo.CreateMemoryOptions{
        Content: "Test content",
    })
    
    assert.NoError(t, err)
    assert.Equal(t, expectedMemory, memory)
    mockClient.AssertExpectations(t)
}
```

## Best Practices

1. **Always use context**: Pass context to all operations for proper cancellation
2. **Handle errors**: Check for specific error types and handle appropriately
3. **Reuse client**: Create one client and reuse it across your application
4. **Set timeouts**: Use context with timeout for operations
5. **Log errors**: Log errors with context for debugging
6. **Secure credentials**: Never hardcode API keys, use environment variables

## Examples

### CLI Application

```go
package main

import (
    "bufio"
    "context"
    "flag"
    "fmt"
    "os"
    "strings"
    
    "github.com/puomemo/go-sdk"
)

func main() {
    var apiKey string
    flag.StringVar(&apiKey, "api-key", "", "PUO Memo API key")
    flag.Parse()
    
    if apiKey == "" {
        apiKey = os.Getenv("PUO_MEMO_API_KEY")
    }
    
    client := puomemo.NewClient(puomemo.WithAPIKey(apiKey))
    ctx := context.Background()
    
    scanner := bufio.NewScanner(os.Stdin)
    fmt.Println("PUO Memo CLI. Type 'help' for commands.")
    
    for {
        fmt.Print("> ")
        scanner.Scan()
        input := strings.TrimSpace(scanner.Text())
        
        parts := strings.Fields(input)
        if len(parts) == 0 {
            continue
        }
        
        switch parts[0] {
        case "create":
            if len(parts) < 2 {
                fmt.Println("Usage: create <content>")
                continue
            }
            content := strings.Join(parts[1:], " ")
            memory, err := client.CreateMemory(ctx, puomemo.CreateMemoryOptions{
                Content: content,
            })
            if err != nil {
                fmt.Printf("Error: %v\n", err)
            } else {
                fmt.Printf("Created memory: %s\n", memory.ID)
            }
            
        case "search":
            if len(parts) < 2 {
                fmt.Println("Usage: search <query>")
                continue
            }
            query := strings.Join(parts[1:], " ")
            results, err := client.Search(ctx, puomemo.SearchOptions{
                Query: query,
            })
            if err != nil {
                fmt.Printf("Error: %v\n", err)
            } else {
                for _, mem := range results.Results {
                    fmt.Printf("[%s] %s\n", mem.ID, mem.Content)
                }
            }
            
        case "quit":
            return
            
        case "help":
            fmt.Println("Commands:")
            fmt.Println("  create <content> - Create a new memory")
            fmt.Println("  search <query>   - Search memories")
            fmt.Println("  quit             - Exit")
            
        default:
            fmt.Println("Unknown command. Type 'help' for commands.")
        }
    }
}
```

## Contributing

See [CONTRIBUTING.md](https://github.com/puomemo/go-sdk/blob/main/CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](https://github.com/puomemo/go-sdk/blob/main/LICENSE) for details.