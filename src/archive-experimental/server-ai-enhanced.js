#!/usr/bin/env node

/**
 * AI-Enhanced MCP Server for Purmemo
 * Uses Gemini AI entity extraction and intelligent memory processing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_URL = process.env.PURMEMO_API_URL || 'https://api.purmemo.ai';
const EMAIL = process.env.PURMEMO_EMAIL || 'demo@puo-memo.com';
const PASSWORD = process.env.PURMEMO_PASSWORD || 'demodemo123';

let authToken = null;

class AIEnhancedPurmemoServer {
  constructor() {
    this.server = new Server(
      {
        name: 'purmemo-ai-enhanced',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  async authenticate() {
    if (!authToken) {
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            username: EMAIL,
            password: PASSWORD,
            grant_type: 'password'
          })
        });

        if (response.ok) {
          const data = await response.json();
          authToken = data.access_token;
        } else {
          throw new Error(`Authentication failed: ${response.status}`);
        }
      } catch (error) {
        throw new Error(`Authentication error: ${error.message}`);
      }
    }
    return authToken;
  }

  async makeApiCall(endpoint, options = {}) {
    const token = await this.authenticate();
    
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'memory',
            description: 'Save memories with automatic AI entity extraction and intelligent tagging',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The content to save to memory'
                },
                title: {
                  type: 'string',
                  description: 'Title for the memory'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional tags for organization'
                },
                extract_entities: {
                  type: 'boolean',
                  description: 'Whether to use AI entity extraction (default: true)',
                  default: true
                }
              },
              required: ['content', 'title'],
            },
          },
          {
            name: 'recall',
            description: 'Search memories with entity-aware semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query to find relevant memories'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10
                },
                include_entities: {
                  type: 'boolean',
                  description: 'Include AI-extracted entities in results (default: true)',
                  default: true
                }
              },
              required: ['query'],
            },
          },
          {
            name: 'entities',
            description: 'List AI-extracted entities with confidence scores and analytics',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of entities to return (default: 50)',
                  default: 50
                },
                entity_type: {
                  type: 'string',
                  description: 'Filter by entity type: Person, Organization, Location, Concept, Custom'
                },
                min_confidence: {
                  type: 'number',
                  description: 'Minimum AI confidence score (0.0-1.0, default: 0.6)',
                  default: 0.6
                },
                include_analytics: {
                  type: 'boolean',
                  description: 'Include analytics and insights (default: true)',
                  default: true
                }
              },
            },
          },
          {
            name: 'entity_insights',
            description: 'Generate AI-powered insights about entity relationships and patterns',
            inputSchema: {
              type: 'object',
              properties: {
                analysis_type: {
                  type: 'string',
                  enum: ['relationships', 'timeline', 'clustering'],
                  description: 'Type of analysis to perform',
                  default: 'relationships'
                },
                entity_names: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific entities to analyze (optional)'
                }
              },
            },
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'memory':
            return await this.handleMemoryTool(args);
          case 'recall':
            return await this.handleRecallTool(args);
          case 'entities':
            return await this.handleEntitiesToolAI(args);
          case 'entity_insights':
            return await this.handleEntityInsights(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true,
        };
      }
    });
  }

  async handleMemoryTool(args) {
    const { content, title, tags = [], extract_entities = true } = args;

    try {
      // Store memory with AI enhancement flag
      const data = await this.makeApiCall('/api/v5/mcp/memory/store', {
        method: 'POST',
        body: JSON.stringify({
          content,
          title,
          tags,
          extract_entities
        }),
      });

      let responseText = `✅ Memory saved successfully!

📝 Content: ${content}
🔗 ID: ${data.memory_id}
📋 Title: ${title}
🏷️ Tags: ${tags.join(', ') || 'none'}`;

      // Add AI entity extraction results if available
      if (data.ai_entities_extracted > 0) {
        responseText += `\n\n🤖 AI Entity Extraction Results:`;
        responseText += `\n   • Extracted ${data.ai_entities_extracted} entities using Gemini AI`;
        
        if (data.entities_preview && data.entities_preview.length > 0) {
          responseText += `\n   • Preview: `;
          const entityPreviews = data.entities_preview.map(e => 
            `${e.name} (${e.type}, ${(e.confidence * 100).toFixed(0)}% confidence)`
          );
          responseText += entityPreviews.join(', ');
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to save memory: ${error.message}`);
    }
  }

  async handleRecallTool(args) {
    const { query, limit = 10, include_entities = true } = args;

    try {
      const data = await this.makeApiCall('/api/v5/mcp/memory/recall', {
        method: 'POST',
        body: JSON.stringify({
          query,
          limit,
          include_entities
        }),
      });

      if (!data.memories || data.memories.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `🔍 No memories found for "${query}"`,
            },
          ],
        };
      }

      let responseText = `🔍 Found ${data.memories.length} memories for "${query}"`;
      
      if (data.entity_matches && data.entity_matches.length > 0) {
        responseText += `\n🏷️ Entity matches: ${data.entity_matches.map(e => `${e.name} (${e.type})`).join(', ')}`;
      }

      responseText += '\n';

      data.memories.forEach((memory, index) => {
        responseText += `\n${index + 1}. **${memory.title}**`;
        responseText += `\n   📝 ${memory.content}`;
        responseText += `\n   🏷️ ${memory.tags.join(', ') || 'no tags'}`;
        responseText += `\n   📅 ${new Date(memory.created_at).toLocaleDateString()}`;
        
        if (include_entities && memory.entities && memory.entities.length > 0) {
          const topEntities = memory.entities.slice(0, 3).map(e => 
            `${e.name} (${e.type}, ${(e.confidence * 100).toFixed(0)}%)`
          );
          responseText += `\n   🤖 AI Entities: ${topEntities.join(', ')}`;
        }
        
        responseText += '\n';
      });

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to recall memories: ${error.message}`);
    }
  }

  async handleEntitiesToolAI(args) {
    const { 
      limit = 50, 
      entity_type, 
      min_confidence = 0.6,
      include_analytics = true 
    } = args;

    try {
      // Try AI-enhanced entities endpoint first
      const data = await this.makeApiCall('/api/v5/mcp/entities/list', {
        method: 'POST',
        body: JSON.stringify({
          limit,
          entity_type,
          min_confidence,
          include_ai_insights: include_analytics
        }),
      });

      if (!data.entities || data.entities.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `🏷️ No AI entities found\n\n🤖 The AI entity extraction system is ready but no entities have been extracted yet. Create some memories to see intelligent entity recognition in action!`,
            },
          ],
        };
      }

      let responseText = `🏷️ Found ${data.entities.length} AI-extracted entities`;
      
      if (entity_type) {
        responseText += ` (filtered by type: ${entity_type})`;
      }
      if (min_confidence > 0.6) {
        responseText += ` (min confidence: ${(min_confidence * 100).toFixed(0)}%)`;
      }

      responseText += '\n\n';

      // Display entities with AI enhancements
      data.entities.forEach((entity, index) => {
        const confidencePercent = (entity.confidence * 100).toFixed(0);
        responseText += `${index + 1}. **${entity.name}** (${entity.type})\n`;
        responseText += `   🎯 AI Confidence: ${confidencePercent}%\n`;
        responseText += `   📊 Mentioned ${entity.mention_count} times\n`;
        responseText += `   💾 Found in ${entity.memory_count || 0} memories\n`;
        responseText += `   🔬 Extraction: ${entity.extraction_method || 'ai'}\n`;
        
        if (entity.first_seen) {
          responseText += `   📅 First seen: ${new Date(entity.first_seen).toLocaleDateString()}\n`;
        }
        responseText += '\n';
      });

      // Add analytics if available
      if (include_analytics && data.analytics) {
        responseText += `\n📈 **AI Analytics:**\n`;
        responseText += `• Total entities: ${data.analytics.total_entities || 0}\n`;
        responseText += `• Average confidence: ${(data.analytics.average_confidence * 100).toFixed(1)}%\n`;
        
        if (data.analytics.type_distribution) {
          responseText += `• Type distribution:\n`;
          Object.entries(data.analytics.type_distribution).forEach(([type, count]) => {
            responseText += `  - ${type}: ${count}\n`;
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      // Fallback to legacy entities if AI endpoints not available
      try {
        const fallbackData = await this.makeApiCall(`/api/v5/entities?limit=${limit}`);
        
        let fallbackText = `🏷️ Found ${fallbackData.entities?.length || 0} entities (legacy system)`;
        fallbackText += `\n\n⚠️ Using pattern-based extraction - AI entity extraction not yet available.\n`;
        fallbackText += `The new Gemini AI system will provide intelligent entity recognition with confidence scores.\n\n`;

        if (fallbackData.entities && fallbackData.entities.length > 0) {
          fallbackData.entities.slice(0, 10).forEach((entity, index) => {
            fallbackText += `${index + 1}. **${entity.name}** (${entity.type || 'unknown'})\n`;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: fallbackText,
            },
          ],
        };
      } catch (fallbackError) {
        throw new Error(`AI entities not available and fallback failed: ${fallbackError.message}`);
      }
    }
  }

  async handleEntityInsights(args) {
    const { analysis_type = 'relationships', entity_names } = args;

    try {
      const data = await this.makeApiCall('/api/v5/mcp/entities/insights', {
        method: 'POST',
        body: JSON.stringify({
          analysis_type,
          entity_names
        }),
      });

      let responseText = `🧠 **Entity Insights - ${analysis_type.toUpperCase()}**\n\n`;

      if (analysis_type === 'relationships' && data.relationships) {
        responseText += `Found ${data.relationships.length} entity relationships:\n\n`;
        
        data.relationships.forEach((rel, index) => {
          responseText += `${index + 1}. **${rel.entity1.name}** (${rel.entity1.type}) ↔️ **${rel.entity2.name}** (${rel.entity2.type})\n`;
          responseText += `   💪 Connection strength: ${rel.connection_strength} shared memories\n`;
          responseText += `   🔗 Relationship: ${rel.relationship_type}\n\n`;
        });
      } else if (analysis_type === 'timeline' && data.timeline) {
        responseText += `Entity timeline analysis:\n\n`;
        
        data.timeline.forEach((item, index) => {
          responseText += `${index + 1}. **${item.entity.name}** (${item.entity.type})\n`;
          responseText += `   🎯 Confidence: ${(item.confidence * 100).toFixed(0)}%\n`;
          responseText += `   📅 First seen: ${new Date(item.first_seen).toLocaleDateString()}\n`;
          responseText += `   📅 Last seen: ${new Date(item.last_seen).toLocaleDateString()}\n`;
          responseText += `   ⏱️ Active for: ${item.days_active} days\n\n`;
        });
      } else {
        responseText += `Analysis type "${analysis_type}" results:\n`;
        responseText += JSON.stringify(data, null, 2);
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `🧠 **Entity Insights - ${analysis_type.toUpperCase()}**\n\nℹ️ Advanced entity insights are being developed as part of the AI Knowledge Intelligence Stack. This feature will provide:\n\n• Relationship mapping between entities\n• Timeline analysis of entity mentions\n• Pattern recognition and clustering\n• Predictive entity suggestions\n\nCurrent status: Core AI extraction is live, insights coming in Phase 2!`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new AIEnhancedPurmemoServer();
server.run().catch((error) => {
  process.exit(1);
});