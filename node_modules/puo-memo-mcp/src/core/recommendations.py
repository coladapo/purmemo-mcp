"""
Graph-based memory recommendations using entity relationships
"""
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict
import asyncio
import uuid
import networkx as nx

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """Generate memory recommendations based on knowledge graph"""
    
    def __init__(self, db_connection, ai_assistant=None):
        self.db = db_connection
        self.ai = ai_assistant
        
    async def get_recommendations(self, memory_id: str, 
                                strategy: str = 'hybrid',
                                limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get memory recommendations based on different strategies
        
        Strategies:
        - 'entity_based': Based on shared entities
        - 'relation_based': Based on entity relationships
        - 'content_based': Based on content similarity
        - 'temporal': Based on time proximity
        - 'hybrid': Combination of all strategies
        """
        recommendations = []
        
        if strategy in ['entity_based', 'hybrid']:
            entity_recs = await self._get_entity_based_recommendations(memory_id)
            recommendations.extend(entity_recs)
            
        if strategy in ['relation_based', 'hybrid']:
            relation_recs = await self._get_relation_based_recommendations(memory_id)
            recommendations.extend(relation_recs)
            
        if strategy in ['content_based', 'hybrid']:
            content_recs = await self._get_content_based_recommendations(memory_id)
            recommendations.extend(content_recs)
            
        if strategy in ['temporal', 'hybrid']:
            temporal_recs = await self._get_temporal_recommendations(memory_id)
            recommendations.extend(temporal_recs)
        
        # Merge and rank recommendations
        merged = self._merge_recommendations(recommendations)
        
        # Sort by combined score
        merged.sort(key=lambda x: x['score'], reverse=True)
        
        return merged[:limit]
    
    async def _get_entity_based_recommendations(self, memory_id: str) -> List[Dict[str, Any]]:
        """Find memories with shared entities"""
        async with self.db.get_connection() as conn:
            # Get entities in the source memory
            source_entities = await conn.fetch("""
                SELECT entity_id, relevance_score
                FROM memory_entity_associations
                WHERE memory_id = $1
            """, uuid.UUID(memory_id))
            
            if not source_entities:
                return []
            
            entity_ids = [e['entity_id'] for e in source_entities]
            
            # Find memories sharing these entities
            recommendations = await conn.fetch("""
                SELECT 
                    m.id,
                    m.title,
                    m.content,
                    m.created_at,
                    COUNT(DISTINCT mer.entity_id) as shared_entity_count,
                    AVG(mer.relevance_score) as avg_relevance,
                    array_agg(DISTINCT e.name) as shared_entities
                FROM memory_entities m
                JOIN memory_entity_associations mer ON m.id = mer.memory_id
                JOIN entities e ON mer.entity_id = e.id
                WHERE mer.entity_id = ANY($1::uuid[])
                    AND m.id != $2
                GROUP BY m.id, m.title, m.content, m.created_at
                ORDER BY shared_entity_count DESC, avg_relevance DESC
                LIMIT 20
            """, entity_ids, uuid.UUID(memory_id))
            
            results = []
            for rec in recommendations:
                score = (rec['shared_entity_count'] * 0.7 + 
                        float(rec['avg_relevance']) * 0.3)
                
                results.append({
                    'memory_id': str(rec['id']),
                    'title': rec['title'],
                    'content_preview': rec['content'][:200] + '...' if len(rec['content']) > 200 else rec['content'],
                    'score': score,
                    'reason': f"Shares {rec['shared_entity_count']} entities: {', '.join(rec['shared_entities'][:3])}",
                    'strategy': 'entity_based',
                    'created_at': rec['created_at'].isoformat()
                })
            
            return results
    
    async def _get_relation_based_recommendations(self, memory_id: str) -> List[Dict[str, Any]]:
        """Find memories through entity relationship paths"""
        async with self.db.get_connection() as conn:
            # Build a graph of entity relationships
            # Get entities in source memory
            source_entities = await conn.fetch("""
                SELECT entity_id FROM memory_entity_associations WHERE memory_id = $1
            """, uuid.UUID(memory_id))
            
            if not source_entities:
                return []
            
            entity_ids = [e['entity_id'] for e in source_entities]
            
            # Get related entities through relationships (2-hop)
            related_entities = await conn.fetch("""
                -- Direct relations
                SELECT DISTINCT
                    CASE 
                        WHEN er.from_entity_id = ANY($1::uuid[]) THEN er.to_entity_id
                        ELSE er.from_entity_id
                    END as related_entity_id,
                    er.relation_type,
                    1 as hop_count
                FROM relations er
                WHERE er.from_entity_id = ANY($1::uuid[]) OR er.to_entity_id = ANY($1::uuid[])
                
                UNION
                
                -- 2-hop relations
                SELECT DISTINCT
                    CASE 
                        WHEN er2.from_entity_id = er1.to_entity_id THEN er2.to_entity_id
                        ELSE er2.from_entity_id
                    END as related_entity_id,
                    er1.relation_type || ' -> ' || er2.relation_type as relation_type,
                    2 as hop_count
                FROM relations er1
                JOIN relations er2 ON (
                    er1.to_entity_id = er2.from_entity_id OR 
                    er1.to_entity_id = er2.to_entity_id
                )
                WHERE er1.from_entity_id = ANY($1::uuid[])
                    AND er2.from_entity_id != ALL($1::uuid[])
                    AND er2.to_entity_id != ALL($1::uuid[])
            """, entity_ids)
            
            if not related_entities:
                return []
            
            # Find memories containing these related entities
            related_entity_ids = [e['related_entity_id'] for e in related_entities]
            
            recommendations = await conn.fetch("""
                SELECT DISTINCT
                    m.id,
                    m.title,
                    m.content,
                    m.created_at,
                    e.name as entity_name,
                    mer.entity_id
                FROM memory_entities m
                JOIN memory_entity_associations mer ON m.id = mer.memory_id
                JOIN entities e ON mer.entity_id = e.id
                WHERE mer.entity_id = ANY($1::uuid[])
                    AND m.id != $2
                LIMIT 20
            """, related_entity_ids, uuid.UUID(memory_id))
            
            # Group by memory and calculate scores
            memory_scores = defaultdict(lambda: {'score': 0, 'entities': [], 'paths': []})
            
            for rec in recommendations:
                memory_key = str(rec['id'])
                memory_scores[memory_key]['title'] = rec['title']
                memory_scores[memory_key]['content'] = rec['content']
                memory_scores[memory_key]['created_at'] = rec['created_at']
                memory_scores[memory_key]['entities'].append(rec['entity_name'])
                
                # Find the relation path for this entity
                for rel in related_entities:
                    if rel['related_entity_id'] == rec['entity_id']:
                        # Score based on hop count (closer = higher score)
                        score = 1.0 / rel['hop_count']
                        memory_scores[memory_key]['score'] += score
                        memory_scores[memory_key]['paths'].append(
                            f"{rec['entity_name']} ({rel['relation_type']})"
                        )
            
            results = []
            for memory_id, data in memory_scores.items():
                results.append({
                    'memory_id': memory_id,
                    'title': data['title'],
                    'content_preview': data['content'][:200] + '...' if len(data['content']) > 200 else data['content'],
                    'score': data['score'],
                    'reason': f"Connected through: {', '.join(data['paths'][:2])}",
                    'strategy': 'relation_based',
                    'created_at': data['created_at'].isoformat()
                })
            
            return results
    
    async def _get_content_based_recommendations(self, memory_id: str) -> List[Dict[str, Any]]:
        """Find similar memories based on content embeddings"""
        async with self.db.get_connection() as conn:
            # Get source memory embedding
            source = await conn.fetchrow("""
                SELECT embedding, title, context
                FROM memory_entities
                WHERE id = $1 AND embedding IS NOT NULL
            """, uuid.UUID(memory_id))
            
            if not source or not source['embedding']:
                return []
            
            # Find similar memories using vector similarity
            similar = await conn.fetch("""
                SELECT 
                    id,
                    title,
                    content,
                    created_at,
                    1 - (embedding <-> $1) as similarity
                FROM memory_entities
                WHERE id != $2
                    AND embedding IS NOT NULL
                    AND context = $3
                    AND 1 - (embedding <-> $1) > 0.7
                ORDER BY similarity DESC
                LIMIT 10
            """, source['embedding'], uuid.UUID(memory_id), source['context'])
            
            results = []
            for rec in similar:
                results.append({
                    'memory_id': str(rec['id']),
                    'title': rec['title'],
                    'content_preview': rec['content'][:200] + '...' if len(rec['content']) > 200 else rec['content'],
                    'score': float(rec['similarity']),
                    'reason': f"Content similarity: {rec['similarity']:.0%}",
                    'strategy': 'content_based',
                    'created_at': rec['created_at'].isoformat()
                })
            
            return results
    
    async def _get_temporal_recommendations(self, memory_id: str) -> List[Dict[str, Any]]:
        """Find memories created around the same time"""
        async with self.db.get_connection() as conn:
            # Get source memory timestamp
            source = await conn.fetchrow("""
                SELECT created_at, context
                FROM memory_entities
                WHERE id = $1
            """, uuid.UUID(memory_id))
            
            if not source:
                return []
            
            # Find memories within 24 hours
            temporal = await conn.fetch("""
                SELECT 
                    id,
                    title,
                    content,
                    created_at,
                    ABS(EXTRACT(EPOCH FROM (created_at - $1))) as time_diff_seconds
                FROM memory_entities
                WHERE id != $2
                    AND context = $3
                    AND created_at BETWEEN $1 - INTERVAL '24 hours' AND $1 + INTERVAL '24 hours'
                ORDER BY time_diff_seconds
                LIMIT 10
            """, source['created_at'], uuid.UUID(memory_id), source['context'])
            
            results = []
            for rec in temporal:
                # Score based on time proximity (closer = higher score)
                hours_diff = rec['time_diff_seconds'] / 3600
                score = max(0, 1 - (hours_diff / 24))  # Linear decay over 24 hours
                
                results.append({
                    'memory_id': str(rec['id']),
                    'title': rec['title'],
                    'content_preview': rec['content'][:200] + '...' if len(rec['content']) > 200 else rec['content'],
                    'score': score,
                    'reason': f"Created {self._format_time_diff(rec['time_diff_seconds'])}",
                    'strategy': 'temporal',
                    'created_at': rec['created_at'].isoformat()
                })
            
            return results
    
    def _merge_recommendations(self, recommendations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge recommendations from different strategies"""
        merged = defaultdict(lambda: {
            'score': 0,
            'reasons': [],
            'strategies': set()
        })
        
        for rec in recommendations:
            key = rec['memory_id']
            
            # Combine scores with strategy weights
            weight = {
                'entity_based': 1.0,
                'relation_based': 0.8,
                'content_based': 0.9,
                'temporal': 0.6
            }.get(rec['strategy'], 0.5)
            
            merged[key]['score'] += rec['score'] * weight
            merged[key]['reasons'].append(rec['reason'])
            merged[key]['strategies'].add(rec['strategy'])
            
            # Keep memory details from first occurrence
            if 'title' not in merged[key]:
                merged[key].update({
                    'memory_id': rec['memory_id'],
                    'title': rec['title'],
                    'content_preview': rec['content_preview'],
                    'created_at': rec['created_at']
                })
        
        # Convert to list and normalize scores
        results = []
        max_score = max((m['score'] for m in merged.values()), default=1.0)
        
        for memory_id, data in merged.items():
            results.append({
                'memory_id': memory_id,
                'title': data['title'],
                'content_preview': data['content_preview'],
                'score': data['score'] / max_score,  # Normalize to 0-1
                'reasons': data['reasons'],
                'strategies': list(data['strategies']),
                'created_at': data['created_at']
            })
        
        return results
    
    def _format_time_diff(self, seconds: float) -> str:
        """Format time difference in human-readable form"""
        if seconds < 60:
            return f"{int(seconds)} seconds ago"
        elif seconds < 3600:
            return f"{int(seconds / 60)} minutes ago"
        elif seconds < 86400:
            return f"{int(seconds / 3600)} hours ago"
        else:
            return f"{int(seconds / 86400)} days ago"
    
    async def build_memory_graph(self, context: Optional[str] = None,
                                limit: int = 100) -> nx.DiGraph:
        """
        Build a NetworkX graph of memory relationships
        """
        G = nx.DiGraph()
        
        async with self.db.get_connection() as conn:
            # Get memories
            if context:
                memories = await conn.fetch("""
                    SELECT id, title, created_at
                    FROM memory_entities
                    WHERE context = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                """, context, limit)
            else:
                memories = await conn.fetch("""
                    SELECT id, title, created_at
                    FROM memory_entities
                    ORDER BY created_at DESC
                    LIMIT $1
                """, limit)
            
            # Add memory nodes
            for mem in memories:
                G.add_node(f"memory_{mem['id']}", 
                          type='memory',
                          title=mem['title'],
                          created_at=mem['created_at'].isoformat())
            
            memory_ids = [m['id'] for m in memories]
            
            # Get entities in these memories
            entities = await conn.fetch("""
                SELECT DISTINCT e.id, e.name, e.type
                FROM entities e
                JOIN memory_entity_associations mer ON e.id = mer.entity_id
                WHERE mer.memory_id = ANY($1::uuid[])
            """, memory_ids)
            
            # Add entity nodes
            for ent in entities:
                G.add_node(f"entity_{ent['id']}", 
                          type='entity',
                          name=ent['name'],
                          entity_type=ent['type'])
            
            # Add memory-entity edges
            mem_ent_relations = await conn.fetch("""
                SELECT memory_id, entity_id, relevance_score
                FROM memory_entity_associations
                WHERE memory_id = ANY($1::uuid[])
            """, memory_ids)
            
            for rel in mem_ent_relations:
                G.add_edge(f"memory_{rel['memory_id']}", 
                          f"entity_{rel['entity_id']}",
                          weight=float(rel['relevance_score']))
            
            # Add entity-entity edges
            entity_ids = [e['id'] for e in entities]
            ent_ent_relations = await conn.fetch("""
                SELECT from_entity_id, to_entity_id, relation_type
                FROM relations
                WHERE from_entity_id = ANY($1::uuid[]) 
                   OR to_entity_id = ANY($1::uuid[])
            """, entity_ids)
            
            for rel in ent_ent_relations:
                G.add_edge(f"entity_{rel['from_entity_id']}", 
                          f"entity_{rel['to_entity_id']}",
                          relation=rel['relation_type'])
        
        return G