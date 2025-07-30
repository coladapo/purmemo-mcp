#!/usr/bin/env python3
"""
Handoff-MCP Proxy Layer
Provides handoff-mcp compatible API using PUO-MEMO as the backend
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from .database import DatabaseConnection
from .memory import MemoryStore
from .knowledge_graph import KnowledgeGraphStore
from .entity_extractor import EntityExtractor
from .handoff_discovery import (
    CrossProjectDiscovery, 
    create_handoff_memory, 
    convert_memory_to_handoff
)

logger = logging.getLogger(__name__)


class HandoffMcpProxy:
    """
    Proxy layer that implements handoff-mcp API using PUO-MEMO backend
    
    This allows existing handoff-mcp clients to work seamlessly with
    PUO-MEMO's unified memory system while gaining cross-project discovery.
    """
    
    def __init__(self, db: DatabaseConnection, memory: MemoryStore, 
                 knowledge_graph: KnowledgeGraphStore, entity_extractor: EntityExtractor):
        self.db = db
        self.memory = memory
        self.knowledge_graph = knowledge_graph
        self.entity_extractor = entity_extractor
        self.discovery = CrossProjectDiscovery(db, memory, knowledge_graph, entity_extractor)
    
    # Handoff-MCP Compatible API Methods
    
    async def create_handoff(self, project_id: str, title: str, strategic_context: str,
                           tactical_requirements: List[str], acceptance_criteria: Optional[List[str]] = None,
                           project_info: Optional[Dict] = None, priority: str = "medium") -> Dict[str, Any]:
        """
        Create a new handoff (compatible with handoff-mcp create_handoff)
        
        Args:
            project_id: Project identifier
            title: Handoff title
            strategic_context: High-level context and goals
            tactical_requirements: Specific technical requirements
            acceptance_criteria: Completion criteria
            project_info: Project technical details
            priority: Priority level (low, medium, high, urgent)
            
        Returns:
            Dict with handoff details including cross-project insights
        """
        logger.info(f"Creating handoff: {title} for project {project_id}")
        
        # Prepare handoff data
        handoff_data = {
            'title': title,
            'strategic_context': strategic_context,
            'tactical_requirements': tactical_requirements or [],
            'acceptance_criteria': acceptance_criteria or [],
            'project_info': project_info or {},
            'priority': priority
        }
        
        # Create memory in PUO-MEMO
        memory_id = await create_handoff_memory(self.memory, handoff_data)
        
        if not memory_id:
            return {'error': 'Failed to create handoff memory'}
        
        # Add project context tags
        await self._add_project_tags(memory_id, project_id)
        
        # Generate cross-project insights
        insights = await self.discovery.discover_similar_projects(
            query=f"{title} {strategic_context}",
            project_context=project_id
        )
        
        # Return handoff-mcp compatible response with enhanced insights
        return {
            'handoff_id': memory_id,
            'project_id': project_id,
            'title': title,
            'strategic_context': strategic_context,
            'tactical_requirements': tactical_requirements,
            'acceptance_criteria': acceptance_criteria,
            'project_info': project_info,
            'priority': priority,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            # Enhanced PUO-MEMO features
            'cross_project_insights': {
                'similar_projects': insights.total_projects,
                'recommendations': insights.recommendations[:3],
                'related_patterns': len(insights.patterns)
            }
        }
    
    async def get_handoff(self, handoff_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a handoff by ID (compatible with handoff-mcp get_handoff)
        
        Args:
            handoff_id: Handoff memory ID
            
        Returns:
            Handoff data or None if not found
        """
        logger.info(f"Retrieving handoff: {handoff_id}")
        
        # Get memory from PUO-MEMO
        memory_data = await self.memory.get(handoff_id)
        
        if not memory_data:
            return None
        
        # Convert back to handoff format
        handoff_data = await convert_memory_to_handoff(memory_data)
        
        # Extract project ID from tags
        project_id = self._extract_project_id(memory_data.get('tags', []))
        
        # Add handoff-mcp compatible fields
        handoff_data.update({
            'handoff_id': handoff_id,
            'project_id': project_id,
            'status': 'pending',  # Could be enhanced with actual status tracking
            'created_at': memory_data.get('created_at'),
            'updated_at': memory_data.get('updated_at', memory_data.get('created_at'))
        })
        
        return handoff_data
    
    async def list_handoffs(self, project_id: Optional[str] = None, 
                          status: Optional[str] = None, 
                          limit: int = 10) -> List[Dict[str, Any]]:
        """
        List handoffs with optional filtering (compatible with handoff-mcp list_handoffs)
        
        Args:
            project_id: Filter by project
            status: Filter by status
            limit: Maximum results
            
        Returns:
            List of handoff summaries
        """
        logger.info(f"Listing handoffs: project_id={project_id}, status={status}, limit={limit}")
        
        # Search for handoff memories
        search_tags = ['handoff']
        if project_id:
            search_tags.append(f'project-{project_id}')
        
        # Use tag-based search to find handoffs
        handoff_memories = await self.memory.search_by_tags(search_tags, limit=limit)
        
        if not handoff_memories or 'results' not in handoff_memories:
            return []
        
        handoffs = []
        for memory in handoff_memories['results']:
            handoff_summary = {
                'handoff_id': memory['id'],
                'project_id': self._extract_project_id(memory.get('tags', [])),
                'title': memory.get('title', ''),
                'priority': self._extract_priority(memory.get('tags', [])),
                'status': 'pending',  # Could be enhanced
                'created_at': memory.get('created_at'),
                'updated_at': memory.get('updated_at', memory.get('created_at'))
            }
            handoffs.append(handoff_summary)
        
        return handoffs
    
    async def update_handoff_status(self, handoff_id: str, status: str, 
                                   notes: Optional[str] = None,
                                   completion_artifacts: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Update handoff status (compatible with handoff-mcp update_handoff_status)
        
        Args:
            handoff_id: Handoff memory ID
            status: New status (pending, in_progress, completed, failed)
            notes: Optional status update notes
            completion_artifacts: Optional completion artifacts
            
        Returns:
            Updated handoff data
        """
        logger.info(f"Updating handoff {handoff_id} status to {status}")
        
        # Get existing handoff
        memory_data = await self.memory.get(handoff_id)
        if not memory_data:
            return {'error': 'Handoff not found'}
        
        # Update memory with status information
        status_update = f"\n\n**Status Update ({datetime.utcnow().isoformat()}):**\n"
        status_update += f"Status: {status}\n"
        if notes:
            status_update += f"Notes: {notes}\n"
        if completion_artifacts:
            status_update += f"Artifacts: {', '.join(completion_artifacts)}\n"
        
        updated_content = memory_data.get('content', '') + status_update
        
        # Update the memory
        await self.memory.update(
            memory_id=handoff_id,
            content=updated_content,
            tags=memory_data.get('tags', []) + [f'status-{status}']
        )
        
        # Return updated handoff
        return await self.get_handoff(handoff_id)
    
    async def generate_implementation_brief(self, handoff_id: str, 
                                          include_context: bool = True) -> Dict[str, Any]:
        """
        Generate implementation brief with cross-project insights
        
        Args:
            handoff_id: Handoff memory ID
            include_context: Include strategic context
            
        Returns:
            Implementation brief with cross-project recommendations
        """
        logger.info(f"Generating implementation brief for handoff: {handoff_id}")
        
        # Get handoff data
        handoff_data = await self.get_handoff(handoff_id)
        if not handoff_data:
            return {'error': 'Handoff not found'}
        
        # Generate cross-project insights
        insights = await self.discovery.discover_similar_projects(
            query=f"{handoff_data.get('title', '')} {handoff_data.get('strategic_context', '')}"
        )
        
        # Get implementation patterns for relevant technologies
        tech_patterns = {}
        project_info = handoff_data.get('project_info', {})
        if project_info.get('framework'):
            tech_patterns['framework'] = await self.discovery.discover_implementation_patterns(
                project_info['framework']
            )
        if project_info.get('language'):
            tech_patterns['language'] = await self.discovery.discover_implementation_patterns(
                project_info['language']
            )
        
        # Generate brief
        brief = {
            'handoff_id': handoff_id,
            'title': handoff_data.get('title', ''),
            'implementation_focus': handoff_data.get('tactical_requirements', []),
            'acceptance_criteria': handoff_data.get('acceptance_criteria', []),
            'project_info': project_info,
            'cross_project_insights': {
                'similar_projects_found': insights.total_projects,
                'key_recommendations': insights.recommendations,
                'implementation_patterns': tech_patterns,
                'related_entities': list(insights.entity_connections.keys())[:5]
            },
            'generated_at': datetime.utcnow().isoformat()
        }
        
        if include_context:
            brief['strategic_context'] = handoff_data.get('strategic_context', '')
        
        return brief
    
    # Cross-Project Discovery Enhanced Methods
    
    async def discover_project_connections(self, project_id: str) -> Dict[str, Any]:
        """
        Discover connections between projects through shared technologies, patterns, and team knowledge
        
        Args:
            project_id: Project to analyze
            
        Returns:
            Cross-project connections and insights
        """
        logger.info(f"Discovering project connections for: {project_id}")
        
        # Find all handoffs for this project
        project_handoffs = await self.list_handoffs(project_id=project_id, limit=50)
        
        if not project_handoffs:
            return {'project_id': project_id, 'connections': [], 'insights': []}
        
        # Analyze each handoff for cross-project patterns
        all_insights = []
        technology_usage = {}
        
        for handoff in project_handoffs:
            handoff_data = await self.get_handoff(handoff['handoff_id'])
            if handoff_data:
                # Discover similar projects for this handoff
                insights = await self.discovery.discover_similar_projects(
                    query=f"{handoff_data.get('title', '')} {handoff_data.get('strategic_context', '')}"
                )
                all_insights.extend(insights.insights)
                
                # Track technology usage
                project_info = handoff_data.get('project_info', {})
                for tech_type in ['language', 'framework']:
                    tech = project_info.get(tech_type)
                    if tech:
                        if tech not in technology_usage:
                            technology_usage[tech] = 0
                        technology_usage[tech] += 1
        
        # Aggregate connections
        connected_projects = {}
        for insight in all_insights:
            if insight.project_id != project_id:
                if insight.project_id not in connected_projects:
                    connected_projects[insight.project_id] = []
                connected_projects[insight.project_id].append(insight)
        
        # Generate recommendations
        recommendations = []
        if technology_usage:
            top_tech = max(technology_usage.items(), key=lambda x: x[1])
            recommendations.append(f"Primary technology: {top_tech[0]} (used in {top_tech[1]} handoffs)")
        
        if connected_projects:
            most_connected = max(connected_projects.items(), key=lambda x: len(x[1]))
            recommendations.append(f"Strongest connection with {most_connected[0]} ({len(most_connected[1])} shared patterns)")
        
        return {
            'project_id': project_id,
            'total_handoffs_analyzed': len(project_handoffs),
            'connected_projects': {
                proj_id: len(insights) 
                for proj_id, insights in connected_projects.items()
            },
            'technology_usage': technology_usage,
            'cross_project_insights': all_insights[:10],  # Top 10 insights
            'recommendations': recommendations
        }
    
    async def get_architectural_overview(self) -> Dict[str, Any]:
        """
        Get architectural patterns overview across all projects
        
        Returns:
            Comprehensive architectural analysis
        """
        logger.info("Generating architectural overview")
        
        # Get architectural patterns
        arch_patterns = await self.discovery.discover_architectural_patterns()
        
        # Get all handoffs for project distribution
        all_handoffs = await self.list_handoffs(limit=100)
        
        # Analyze project distribution
        project_distribution = {}
        technology_distribution = {}
        
        for handoff in all_handoffs:
            proj_id = handoff.get('project_id', 'unknown')
            project_distribution[proj_id] = project_distribution.get(proj_id, 0) + 1
            
            # Get detailed handoff for technology info
            handoff_data = await self.get_handoff(handoff['handoff_id'])
            if handoff_data:
                project_info = handoff_data.get('project_info', {})
                for tech_type in ['language', 'framework']:
                    tech = project_info.get(tech_type)
                    if tech:
                        technology_distribution[tech] = technology_distribution.get(tech, 0) + 1
        
        return {
            'total_projects': len(project_distribution),
            'total_handoffs': len(all_handoffs),
            'architectural_patterns': arch_patterns,
            'project_distribution': project_distribution,
            'technology_distribution': technology_distribution,
            'generated_at': datetime.utcnow().isoformat()
        }
    
    # Helper Methods
    
    async def _add_project_tags(self, memory_id: str, project_id: str):
        """Add project-specific tags to a memory"""
        try:
            memory_data = await self.memory.get(memory_id)
            if memory_data:
                current_tags = memory_data.get('tags', [])
                project_tag = f'project-{project_id}'
                if project_tag not in current_tags:
                    await self.memory.update(
                        memory_id=memory_id,
                        tags=current_tags + [project_tag]
                    )
        except Exception as e:
            logger.warning(f"Failed to add project tags: {e}")
    
    def _extract_project_id(self, tags: List[str]) -> Optional[str]:
        """Extract project ID from tags"""
        for tag in tags:
            if tag.startswith('project-'):
                return tag.replace('project-', '')
        return None
    
    def _extract_priority(self, tags: List[str]) -> str:
        """Extract priority from tags"""
        for tag in tags:
            if tag.startswith('priority-'):
                return tag.replace('priority-', '')
        return 'medium'