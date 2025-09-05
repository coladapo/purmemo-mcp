#!/usr/bin/env node

/**
 * Phase 2: Graph-Enhanced pūrmemo MCP Server
 * 
 * Adds AI-powered relationship mapping and graph-based memory retrieval
 * to the core MCP functionality. This server provides 8 enhanced tools:
 * 
 * 1. store_memory - Store with automatic relationship detection
 * 2. retrieve_memories - Graph-context aware retrieval  
 * 3. list_memories - Enhanced with relationship stats
 * 4. entity_insights - AI entity extraction with confidence
 * 5. analyze_relationships - Entity relationship analysis
 * 6. knowledge_graph - Generate knowledge graph visualization
 * 7. find_connections - Discover paths between entities
 * 8. graph_analytics - Graph-based analytics and insights
 * 
 * Based on Model Context Protocol (MCP) specification
 * Requires API key authentication and supports relationship mapping
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// ============= CONFIGURATION =============

const API_BASE_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const API_KEY = process.env.PUO_MEMO_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: PUO_MEMO_API_KEY environment variable is required');
  console.error('💡 Get your API key from: https://app.purmemo.ai/settings/api-keys');
  process.exit(1);
}

// ============= TOOL DEFINITIONS =============

const GRAPH_TOOLS = [
  {
    name: "store_memory",
    description: "Store memory with automatic AI entity extraction and relationship detection",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Memory content to store (will be analyzed for entities and relationships)"
        },
        title: {
          type: "string",
          description: "Optional title for the memory"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for categorization"
        },
        analyze_relationships: {
          type: "boolean",
          description: "Enable automatic relationship detection (default: true)",
          default: true
        },
        relationship_threshold: {
          type: "number",
          description: "Minimum relationship strength to store (0.0-1.0, default: 0.3)",
          minimum: 0.0,
          maximum: 1.0,
          default: 0.3
        }
      },
      required: ["content"]
    }
  },
  
  {
    name: "retrieve_memories",
    description: "Retrieve memories with graph-context awareness and relationship traversal",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for memory retrieval"
        },
        include_relationships: {
          type: "boolean",
          description: "Include related memories through entity relationships (default: true)",
          default: true
        },
        max_results: {
          type: "integer",
          description: "Maximum number of results (1-50, default: 10)",
          minimum: 1,
          maximum: 50,
          default: 10
        },
        relationship_depth: {
          type: "integer", 
          description: "Relationship traversal depth (1-3, default: 2)",
          minimum: 1,
          maximum: 3,
          default: 2
        },
        min_relevance: {
          type: "number",
          description: "Minimum relevance score (0.0-1.0, default: 0.1)",
          minimum: 0.0,
          maximum: 1.0,
          default: 0.1
        }
      },
      required: ["query"]
    }
  },
  
  {
    name: "list_memories",
    description: "List recent memories with relationship statistics and entity information",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Number of memories to return (1-50, default: 10)",
          minimum: 1,
          maximum: 50,
          default: 10
        },
        include_entities: {
          type: "boolean",
          description: "Include AI-extracted entities for each memory (default: true)",
          default: true
        },
        include_relationships: {
          type: "boolean", 
          description: "Include relationship statistics (default: true)",
          default: true
        }
      }
    }
  },
  
  {
    name: "entity_insights",
    description: "Get AI-powered insights about entities in memories with confidence scoring",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: {
          type: "string",
          description: "Specific memory ID to analyze (optional)"
        },
        entity_types: {
          type: "array",
          items: { type: "string" },
          description: "Filter by entity types (person, organization, concept, etc.)"
        },
        min_confidence: {
          type: "number",
          description: "Minimum AI confidence score (0.0-1.0, default: 0.5)",
          minimum: 0.0,
          maximum: 1.0,
          default: 0.5
        },
        limit: {
          type: "integer",
          description: "Maximum entities to return (1-100, default: 20)",
          minimum: 1,
          maximum: 100,
          default: 20
        }
      }
    }
  },
  
  {
    name: "analyze_relationships",
    description: "Analyze relationships for a specific entity across all memories",
    inputSchema: {
      type: "object",
      properties: {
        entity_name: {
          type: "string",
          description: "Name of the entity to analyze relationships for"
        },
        max_relationships: {
          type: "integer",
          description: "Maximum relationships to return (1-100, default: 20)",
          minimum: 1,
          maximum: 100,
          default: 20
        },
        relationship_types: {
          type: "array",
          items: { 
            type: "string",
            enum: ["co_occurrence", "semantic_similar", "temporal", "causal", "hierarchical", "conceptual"]
          },
          description: "Filter by relationship types (optional)"
        }
      },
      required: ["entity_name"]
    }
  },
  
  {
    name: "knowledge_graph", 
    description: "Generate a knowledge graph visualization of entities and relationships",
    inputSchema: {
      type: "object",
      properties: {
        center_entity: {
          type: "string",
          description: "Center the graph on this entity (optional)"
        },
        max_entities: {
          type: "integer",
          description: "Maximum entities in graph (10-200, default: 50)",
          minimum: 10,
          maximum: 200,
          default: 50
        },
        min_strength: {
          type: "number",
          description: "Minimum relationship strength (0.0-1.0, default: 0.3)",
          minimum: 0.0,
          maximum: 1.0,
          default: 0.3
        }
      }
    }
  },
  
  {
    name: "find_connections",
    description: "Find connection paths between two entities through relationships",
    inputSchema: {
      type: "object",
      properties: {
        source_entity: {
          type: "string",
          description: "Starting entity name"
        },
        target_entity: {
          type: "string",
          description: "Target entity name"
        },
        max_depth: {
          type: "integer",
          description: "Maximum path depth (1-5, default: 3)",
          minimum: 1,
          maximum: 5,
          default: 3
        },
        min_strength: {
          type: "number",
          description: "Minimum relationship strength for paths (0.0-1.0, default: 0.2)",
          minimum: 0.0,
          maximum: 1.0,
          default: 0.2
        }
      },
      required: ["source_entity", "target_entity"]
    }
  },
  
  {
    name: "graph_analytics",
    description: "Get graph-based analytics including centrality scores and entity clusters",
    inputSchema: {
      type: "object",
      properties: {
        analysis_type: {
          type: "string",
          enum: ["centrality", "clusters", "summary", "all"],
          description: "Type of analysis to perform (default: all)",
          default: "all"
        },
        min_relationships: {
          type: "integer",
          description: "Minimum relationships for inclusion (default: 1)",
          minimum: 1,
          default: 1
        }
      }
    }
  }
];

// ============= API UTILITIES =============

async function makeAPIRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'purmemo-mcp-graph/1.0.0'
    }
  };
  
  const requestOptions = { ...defaultOptions, ...options };
  
  try {
    console.error(`🔄 Making ${requestOptions.method || 'GET'} request to: ${endpoint}`);
    
    const response = await fetch(url, requestOptions);
    const responseText = await response.text();
    
    console.error(`📊 Response status: ${response.status}`);
    console.error(`📝 Response length: ${responseText.length} chars`);
    
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.error(`📄 Response body: ${responseText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ JSON Parse Error: ${parseError.message}`);
      console.error(`📄 Raw response: ${responseText}`);
      throw new Error('Invalid JSON response from API');
    }
    
  } catch (error) {
    console.error(`💥 API Request failed: ${error.message}`);
    throw error;
  }
}

// ============= TOOL IMPLEMENTATIONS =============

async function storeMemoryWithGraph(args) {
  console.error(`💾 Storing memory with graph analysis...`);
  console.error(`📊 Relationship analysis: ${args.analyze_relationships !== false}`);
  console.error(`🎯 Threshold: ${args.relationship_threshold || 0.3}`);
  
  const response = await makeAPIRequest('/api/mcp/graph/store', {
    method: 'POST',
    body: JSON.stringify({
      content: args.content,
      title: args.title,
      tags: args.tags || [],
      analyze_relationships: args.analyze_relationships !== false,
      relationship_threshold: args.relationship_threshold || 0.3
    })
  });
  
  if (response.success) {
    const graphInfo = response.graph_analysis || {};
    return [
      {
        type: "text",
        text: `✅ Memory stored successfully with graph analysis!\n\n` +
              `📝 Memory ID: ${response.memory_id}\n` +
              `🧠 AI Analysis: ${response.ai_analysis?.entities_found || 0} entities extracted\n` +
              `🔗 Relationships: ${graphInfo.relationships_detected || 0} detected, ${graphInfo.relationships_stored || 0} stored\n` +
              `🎯 Analysis threshold: ${graphInfo.analysis_threshold || 0.3}\n\n` +
              `${response.title ? `Title: ${response.title}\n` : ''}` +
              `Content preview: ${response.content.substring(0, 150)}${response.content.length > 150 ? '...' : ''}`
      }
    ];
  } else {
    throw new Error(`Storage failed: ${response.error || 'Unknown error'}`);
  }
}

async function retrieveMemoriesWithGraph(args) {
  console.error(`🔍 Retrieving memories with graph context...`);
  console.error(`🎯 Query: "${args.query}"`);
  console.error(`🔗 Include relationships: ${args.include_relationships !== false}`);
  console.error(`📏 Depth: ${args.relationship_depth || 2}`);
  
  const response = await makeAPIRequest('/api/mcp/graph/retrieve', {
    method: 'POST',
    body: JSON.stringify({
      query: args.query,
      include_relationships: args.include_relationships !== false,
      max_results: args.max_results || 10,
      relationship_depth: args.relationship_depth || 2,
      min_relevance: args.min_relevance || 0.1
    })
  });
  
  if (response.success) {
    const memories = response.memories || [];
    const graphContext = response.graph_context;
    
    if (memories.length === 0) {
      return [
        {
          type: "text",
          text: `🔍 No memories found for query: "${args.query}"\n\n` +
                `💡 Try different keywords or create new memories with this content.`
        }
      ];
    }
    
    let resultText = `🔍 Found ${memories.length} memories for: "${args.query}"\n`;
    if (graphContext) {
      resultText += `📊 Graph context: ${response.direct_matches || 0} direct + ${response.related_matches || 0} related\n`;
      resultText += `🔗 Relationship depth: ${response.relationship_depth || 1}\n`;
    }
    resultText += `\n`;
    
    memories.forEach((memory, index) => {
      const relevanceEmoji = memory.relevance > 0.8 ? '🎯' : memory.relevance > 0.5 ? '✅' : '🔗';
      resultText += `${relevanceEmoji} ${index + 1}. ${memory.title || 'Untitled'}\n`;
      resultText += `   📊 Relevance: ${(memory.relevance * 100).toFixed(1)}%\n`;
      resultText += `   📅 Created: ${new Date(memory.created_at).toLocaleDateString()}\n`;
      resultText += `   📝 ${memory.content.substring(0, 120)}${memory.content.length > 120 ? '...' : ''}\n\n`;
    });
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Retrieval failed: ${response.error || 'Unknown error'}`);
  }
}

async function analyzeEntityRelationships(args) {
  console.error(`🔗 Analyzing relationships for entity: ${args.entity_name}`);
  
  const response = await makeAPIRequest('/api/mcp/graph/relationships', {
    method: 'POST',
    body: JSON.stringify({
      entity_name: args.entity_name,
      max_relationships: args.max_relationships || 20,
      relationship_types: args.relationship_types
    })
  });
  
  if (response.success) {
    const entity = response.entity;
    const relationships = response.relationships || [];
    
    if (relationships.length === 0) {
      return [
        {
          type: "text",
          text: `🔍 No relationships found for entity: "${args.entity_name}"\n\n` +
                `💡 This entity may be isolated or you may need to create more memories containing it.`
        }
      ];
    }
    
    let resultText = `🔗 Relationship analysis for: ${entity.name} (${entity.type})\n`;
    resultText += `📊 Total relationships: ${relationships.length}\n\n`;
    
    // Group by relationship type
    const groupedRels = {};
    relationships.forEach(rel => {
      if (!groupedRels[rel.relationship_type]) {
        groupedRels[rel.relationship_type] = [];
      }
      groupedRels[rel.relationship_type].push(rel);
    });
    
    Object.entries(groupedRels).forEach(([type, rels]) => {
      resultText += `📂 ${type.toUpperCase()} (${rels.length})\n`;
      rels.slice(0, 5).forEach(rel => {
        const strengthEmoji = rel.strength_score > 0.7 ? '🔥' : rel.strength_score > 0.4 ? '⚡' : '🔗';
        resultText += `   ${strengthEmoji} ${rel.related_entity.name} (${rel.related_entity.type})\n`;
        resultText += `      💪 Strength: ${(rel.strength_score * 100).toFixed(1)}% | `;
        resultText += `🎯 Confidence: ${(rel.confidence * 100).toFixed(1)}% | `;
        resultText += `🔄 Co-occurrences: ${rel.co_occurrence_count}\n`;
      });
      if (rels.length > 5) {
        resultText += `   ... and ${rels.length - 5} more\n`;
      }
      resultText += `\n`;
    });
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Relationship analysis failed: ${response.error || 'Unknown error'}`);
  }
}

async function generateKnowledgeGraph(args) {
  console.error(`📊 Generating knowledge graph...`);
  console.error(`🎯 Center entity: ${args.center_entity || 'auto-detect'}`);
  console.error(`📏 Max entities: ${args.max_entities || 50}`);
  
  const response = await makeAPIRequest('/api/mcp/graph/knowledge-graph', {
    method: 'POST',
    body: JSON.stringify({
      center_entity: args.center_entity,
      max_entities: args.max_entities || 50,
      min_strength: args.min_strength || 0.3
    })
  });
  
  if (response.success) {
    const nodes = response.nodes || [];
    const edges = response.edges || [];
    const stats = response.stats || {};
    
    if (nodes.length === 0) {
      return [
        {
          type: "text",
          text: `📊 No knowledge graph could be generated.\n\n` +
                `💡 Try storing more memories with entities and relationships, or lowering the minimum strength threshold.`
        }
      ];
    }
    
    let resultText = `📊 Knowledge Graph Generated\n`;
    resultText += `🎯 Center: ${stats.center_entity || 'Auto-selected'}\n`;
    resultText += `📈 Nodes: ${stats.total_nodes} | Edges: ${stats.total_edges}\n`;
    resultText += `💪 Min strength: ${stats.min_strength}\n\n`;
    
    // Show top entities by centrality
    const topEntities = nodes
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 10);
    
    resultText += `🌟 Top Entities by Centrality:\n`;
    topEntities.forEach((node, index) => {
      const centralityEmoji = node.centrality > 0.8 ? '👑' : node.centrality > 0.5 ? '⭐' : '🔹';
      resultText += `${centralityEmoji} ${index + 1}. ${node.name} (${node.type})\n`;
      resultText += `   📊 Centrality: ${(node.centrality * 100).toFixed(1)}%\n`;
    });
    
    resultText += `\n🔗 Relationship Types:\n`;
    const relationshipTypes = {};
    edges.forEach(edge => {
      relationshipTypes[edge.type] = (relationshipTypes[edge.type] || 0) + 1;
    });
    
    Object.entries(relationshipTypes).forEach(([type, count]) => {
      resultText += `   📂 ${type}: ${count} connections\n`;
    });
    
    resultText += `\n💡 Use visualization tools to explore the full graph structure with the provided nodes and edges data.`;
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Knowledge graph generation failed: ${response.error || 'Unknown error'}`);
  }
}

async function getGraphAnalytics(args) {
  console.error(`📈 Getting graph analytics...`);
  console.error(`🔍 Analysis type: ${args.analysis_type || 'all'}`);
  
  const response = await makeAPIRequest('/api/graph/analytics/centrality');
  
  if (response.success) {
    const centrality = response.centrality_analysis || [];
    const clusters = response.clusters || [];
    
    let resultText = `📈 Graph Analytics Summary\n`;
    resultText += `🎯 Total entities: ${response.total_entities || 0}\n`;
    resultText += `🏘️ Entity clusters: ${response.total_clusters || 0}\n\n`;
    
    if (args.analysis_type === 'all' || args.analysis_type === 'centrality') {
      resultText += `🌟 Top Central Entities:\n`;
      centrality.slice(0, 10).forEach((item, index) => {
        const centralityEmoji = item.centrality_score > 0.8 ? '👑' : item.centrality_score > 0.5 ? '⭐' : '🔹';
        resultText += `${centralityEmoji} ${index + 1}. ${item.entity_name} (${item.entity_type})\n`;
        resultText += `   📊 Score: ${(item.centrality_score * 100).toFixed(1)}%\n`;
      });
      resultText += `\n`;
    }
    
    if (args.analysis_type === 'all' || args.analysis_type === 'clusters') {
      resultText += `🏘️ Entity Clusters:\n`;
      clusters.slice(0, 5).forEach((cluster, index) => {
        resultText += `   📦 Cluster ${index + 1}: ${cluster.size} entities\n`;
      });
      if (clusters.length > 5) {
        resultText += `   ... and ${clusters.length - 5} more clusters\n`;
      }
      resultText += `\n`;
    }
    
    resultText += `💡 These analytics help identify the most important entities and natural groupings in your knowledge base.`;
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Graph analytics failed: ${response.error || 'Unknown error'}`);
  }
}

// Legacy tools for backward compatibility
async function listMemories(args) {
  console.error(`📋 Listing recent memories...`);
  const response = await makeAPIRequest('/api/mcp/memories/list', {
    method: 'POST',
    body: JSON.stringify({ limit: args.limit || 10 })
  });
  
  if (response.success) {
    const memories = response.memories || [];
    if (memories.length === 0) {
      return [{ type: "text", text: "📋 No memories found. Create your first memory to get started!" }];
    }
    
    let resultText = `📋 Recent Memories (${memories.length})\n\n`;
    memories.forEach((memory, index) => {
      resultText += `📝 ${index + 1}. ${memory.title || 'Untitled'}\n`;
      resultText += `   📅 ${new Date(memory.created_at).toLocaleDateString()}\n`;
      resultText += `   🏷️ ${memory.tags?.join(', ') || 'No tags'}\n`;
      resultText += `   📄 ${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}\n\n`;
    });
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Failed to list memories: ${response.error || 'Unknown error'}`);
  }
}

async function getEntityInsights(args) {
  console.error(`🧠 Getting entity insights...`);
  const response = await makeAPIRequest('/api/mcp/entities/insights', {
    method: 'POST',
    body: JSON.stringify({
      memory_id: args.memory_id,
      entity_types: args.entity_types,
      min_confidence: args.min_confidence || 0.5,
      limit: args.limit || 20
    })
  });
  
  if (response.success) {
    const insights = response.insights || [];
    if (insights.length === 0) {
      return [{ type: "text", text: "🧠 No entities found. Store more memories to see AI-extracted insights!" }];
    }
    
    let resultText = `🧠 AI Entity Insights (${insights.length})\n\n`;
    
    // Group by type
    const groupedInsights = {};
    insights.forEach(insight => {
      if (!groupedInsights[insight.entity_type]) {
        groupedInsights[insight.entity_type] = [];
      }
      groupedInsights[insight.entity_type].push(insight);
    });
    
    Object.entries(groupedInsights).forEach(([type, entities]) => {
      resultText += `📂 ${type.toUpperCase()} (${entities.length})\n`;
      entities.slice(0, 5).forEach(entity => {
        const confidenceEmoji = entity.confidence > 0.8 ? '🎯' : entity.confidence > 0.6 ? '✅' : '🔍';
        resultText += `   ${confidenceEmoji} ${entity.entity_name}\n`;
        resultText += `      🎯 Confidence: ${(entity.confidence * 100).toFixed(1)}%\n`;
        resultText += `      📝 Context: ${entity.context}\n`;
      });
      if (entities.length > 5) {
        resultText += `   ... and ${entities.length - 5} more\n`;
      }
      resultText += `\n`;
    });
    
    return [{ type: "text", text: resultText }];
  } else {
    throw new Error(`Failed to get entity insights: ${response.error || 'Unknown error'}`);
  }
}

// ============= MCP SERVER SETUP =============

const server = new Server(
  {
    name: 'purmemo-graph',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error(`📋 Client requested tool list - returning ${GRAPH_TOOLS.length} graph-enhanced tools`);
  return {
    tools: GRAPH_TOOLS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`🔧 Tool called: ${name}`);
  console.error(`📥 Arguments:`, JSON.stringify(args, null, 2));
  
  try {
    let result;
    
    switch (name) {
      case 'store_memory':
        result = await storeMemoryWithGraph(args);
        break;
        
      case 'retrieve_memories':
        result = await retrieveMemoriesWithGraph(args);
        break;
        
      case 'list_memories':
        result = await listMemories(args);
        break;
        
      case 'entity_insights':
        result = await getEntityInsights(args);
        break;
        
      case 'analyze_relationships':
        result = await analyzeEntityRelationships(args);
        break;
        
      case 'knowledge_graph':
        result = await generateKnowledgeGraph(args);
        break;
        
      case 'find_connections':
        // Placeholder for connection path finding
        result = [{ 
          type: "text", 
          text: "🚧 Connection path finding is coming soon in the next update!" 
        }];
        break;
        
      case 'graph_analytics':
        result = await getGraphAnalytics(args);
        break;
        
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
    
    console.error(`✅ Tool ${name} completed successfully`);
    return { content: result };
    
  } catch (error) {
    console.error(`❌ Tool ${name} failed:`, error.message);
    console.error('📄 Full error:', error);
    
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`
    );
  }
});

// ============= SERVER STARTUP =============

async function runServer() {
  const transport = new StdioServerTransport();
  
  console.error('🚀 Starting pūrmemo Graph-Enhanced MCP Server v2.0.0');
  console.error('🔗 Phase 2: AI Knowledge Intelligence with Relationship Mapping');
  console.error(`🌐 API Base URL: ${API_BASE_URL}`);
  console.error(`🔑 API Key: ${API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.error(`📊 Available tools: ${GRAPH_TOOLS.length}`);
  console.error('');
  console.error('🎯 Enhanced Capabilities:');
  console.error('   • AI-powered entity extraction with confidence scoring');
  console.error('   • Automatic relationship detection and mapping');
  console.error('   • Graph-context aware memory retrieval');
  console.error('   • Knowledge graph generation and visualization');
  console.error('   • Entity relationship analysis and insights');
  console.error('   • Graph-based analytics and centrality scoring');
  console.error('');
  console.error('📝 Ready for Claude Code integration!');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  await server.connect(transport);
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.error('\n🛑 Shutting down pūrmemo Graph-Enhanced MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n🛑 Shutting down pūrmemo Graph-Enhanced MCP Server...');
  process.exit(0);
});

// Start the server
runServer().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});