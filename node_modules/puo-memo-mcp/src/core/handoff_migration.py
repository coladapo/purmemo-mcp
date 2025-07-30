#!/usr/bin/env python3
"""
One-Way Handoff-MCP to PUO-MEMO Migration Tool
Simplified approach: migrate existing handoff data once, use PUO-MEMO natively going forward
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path

from .database import DatabaseConnection
from .memory import MemoryStore
from .knowledge_graph import KnowledgeGraphStore
from .entity_extractor import EntityExtractor
from .handoff_discovery import CrossProjectDiscovery

logger = logging.getLogger(__name__)


class HandoffMigrator:
    """
    One-way migration tool for converting handoff-mcp data to PUO-MEMO
    
    This approach is simpler than bidirectional conversion:
    - Import existing handoff data once
    - Users work natively in PUO-MEMO going forward
    - Maintain cross-project discovery benefits
    """
    
    def __init__(self, db: DatabaseConnection, memory: MemoryStore, 
                 knowledge_graph: KnowledgeGraphStore = None, 
                 entity_extractor: EntityExtractor = None):
        self.db = db
        self.memory = memory
        self.knowledge_graph = knowledge_graph
        self.entity_extractor = entity_extractor
        self.discovery = CrossProjectDiscovery(db, memory, knowledge_graph, entity_extractor)
    
    async def migrate_handoff_file(self, file_path: str) -> Dict[str, Any]:
        """
        Migrate handoffs from a JSON file to PUO-MEMO
        
        Args:
            file_path: Path to JSON file containing handoff data
            
        Returns:
            Migration results and statistics
        """
        logger.info(f"Starting migration from {file_path}")
        
        try:
            with open(file_path, 'r') as f:
                handoff_data = json.load(f)
        except Exception as e:
            return {'error': f'Failed to read file: {e}'}
        
        if not isinstance(handoff_data, (list, dict)):
            return {'error': 'File must contain a list of handoffs or a single handoff object'}
        
        # Ensure we have a list
        handoffs = handoff_data if isinstance(handoff_data, list) else [handoff_data]
        
        # Migrate each handoff
        results = {
            'total_handoffs': len(handoffs),
            'successful_migrations': 0,
            'failed_migrations': 0,
            'migrated_memory_ids': [],
            'errors': [],
            'cross_project_insights': {}
        }
        
        for i, handoff in enumerate(handoffs):
            try:
                memory_id = await self._migrate_single_handoff(handoff, i + 1)
                if memory_id:
                    results['successful_migrations'] += 1
                    results['migrated_memory_ids'].append(memory_id)
                    logger.info(f"Migrated handoff {i+1}/{len(handoffs)}: {handoff.get('title', 'Untitled')}")
                else:
                    results['failed_migrations'] += 1
                    results['errors'].append(f"Handoff {i+1}: Failed to create memory")
            except Exception as e:
                results['failed_migrations'] += 1
                results['errors'].append(f"Handoff {i+1}: {str(e)}")
                logger.error(f"Migration error for handoff {i+1}: {e}")
        
        # Generate cross-project insights after migration
        if results['successful_migrations'] > 0:
            results['cross_project_insights'] = await self._generate_migration_insights(
                results['migrated_memory_ids']
            )
        
        logger.info(f"Migration completed: {results['successful_migrations']}/{results['total_handoffs']} successful")
        return results
    
    async def migrate_handoff_objects(self, handoffs: List[Dict]) -> Dict[str, Any]:
        """
        Migrate handoff objects directly (no file I/O)
        
        Args:
            handoffs: List of handoff dictionaries
            
        Returns:
            Migration results
        """
        logger.info(f"Starting migration of {len(handoffs)} handoff objects")
        
        results = {
            'total_handoffs': len(handoffs),
            'successful_migrations': 0,
            'failed_migrations': 0,
            'migrated_memory_ids': [],
            'errors': []
        }
        
        for i, handoff in enumerate(handoffs):
            try:
                memory_id = await self._migrate_single_handoff(handoff, i + 1)
                if memory_id:
                    results['successful_migrations'] += 1
                    results['migrated_memory_ids'].append(memory_id)
                else:
                    results['failed_migrations'] += 1
                    results['errors'].append(f"Handoff {i+1}: Failed to create memory")
            except Exception as e:
                results['failed_migrations'] += 1
                results['errors'].append(f"Handoff {i+1}: {str(e)}")
        
        return results
    
    async def export_to_handoff_format(self, project_id: Optional[str] = None) -> List[Dict]:
        """
        Export PUO-MEMO memories back to handoff format (for backup/reference)
        
        Args:
            project_id: Optional project filter
            
        Returns:
            List of handoff-formatted objects
        """
        logger.info(f"Exporting memories to handoff format (project: {project_id or 'all'})")
        
        # Search for handoff memories
        search_query = "handoff strategic tactical"
        if project_id:
            search_query += f" project-{project_id}"
        
        memories = await self.memory.search(search_query, limit=100)
        
        if not memories or 'results' not in memories:
            return []
        
        handoffs = []
        for memory in memories['results']:
            # Only process memories that look like handoffs
            if 'handoff' in memory.get('tags', []):
                handoff = await self._convert_memory_to_handoff(memory)
                if handoff:
                    handoffs.append(handoff)
        
        return handoffs
    
    async def _migrate_single_handoff(self, handoff: Dict, handoff_number: int) -> Optional[str]:
        """Migrate a single handoff to PUO-MEMO memory"""
        
        # Validate required fields
        if not handoff.get('title'):
            raise ValueError("Handoff missing required 'title' field")
        
        # Extract handoff data
        title = handoff.get('title', f'Imported Handoff {handoff_number}')
        strategic_context = handoff.get('strategic_context', '')
        tactical_requirements = handoff.get('tactical_requirements', [])
        acceptance_criteria = handoff.get('acceptance_criteria', [])
        project_info = handoff.get('project_info', {})
        priority = handoff.get('priority', 'medium')
        project_id = handoff.get('project_id', 'imported')
        
        # Format content for PUO-MEMO
        content = f"""**Imported Handoff - Strategic to Tactical**

**Strategic Context:**
{strategic_context}

**Tactical Requirements:**
{chr(10).join(f"- {req}" for req in tactical_requirements)}

**Acceptance Criteria:**
{chr(10).join(f"✓ {criteria}" for criteria in acceptance_criteria)}

**Project Information:**
- Project ID: {project_id}
- Language: {project_info.get('language', 'Not specified')}
- Framework: {project_info.get('framework', 'Not specified')}
- Dependencies: {', '.join(project_info.get('dependencies', []))}
- Path: {project_info.get('path', 'Not specified')}

**Migration Info:**
- Migrated on: {datetime.utcnow().isoformat()}
- Original source: handoff-mcp
"""
        
        # Create comprehensive tags
        tags = [
            'handoff',
            'imported',
            'strategic-tactical',
            f"priority-{priority}",
            f"project-{project_id}"
        ]
        
        # Add technology tags
        if project_info.get('language'):
            tags.append(f"lang-{project_info['language'].lower()}")
        
        if project_info.get('framework'):
            tags.append(f"framework-{project_info['framework'].lower()}")
        
        # Add domain tags based on content analysis
        content_lower = (strategic_context + ' ' + ' '.join(tactical_requirements)).lower()
        
        if any(word in content_lower for word in ['auth', 'login', 'security', 'token']):
            tags.append('domain-authentication')
        if any(word in content_lower for word in ['api', 'rest', 'endpoint']):
            tags.append('domain-api')
        if any(word in content_lower for word in ['docker', 'container', 'deploy']):
            tags.append('domain-deployment')
        if any(word in content_lower for word in ['database', 'sql', 'postgres', 'mysql']):
            tags.append('domain-database')
        
        # Store in PUO-MEMO
        try:
            result = await self.memory.create(
                content=content,
                title=title,
                tags=tags
            )
            
            if result:
                memory_id = result.get('memory_id') or result.get('id')
                return memory_id
            else:
                logger.warning(f"Memory creation returned None for handoff: {title}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating memory for handoff '{title}': {e}")
            raise
    
    async def _convert_memory_to_handoff(self, memory: Dict) -> Optional[Dict]:
        """Convert PUO-MEMO memory back to handoff format (for export)"""
        
        if 'handoff' not in memory.get('tags', []):
            return None
        
        content = memory.get('content', '')
        tags = memory.get('tags', [])
        
        # Parse content sections
        import re
        
        strategic_context = ''
        tactical_requirements = []
        acceptance_criteria = []
        project_id = 'unknown'
        
        # Extract strategic context
        strategic_match = re.search(r'\*\*Strategic Context:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
        if strategic_match:
            strategic_context = strategic_match.group(1).strip()
        
        # Extract tactical requirements
        tactical_match = re.search(r'\*\*Tactical Requirements:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
        if tactical_match:
            req_text = tactical_match.group(1).strip()
            tactical_requirements = [
                line.strip('- ').strip() 
                for line in req_text.split('\n') 
                if line.strip() and line.strip().startswith('- ')
            ]
        
        # Extract acceptance criteria
        criteria_match = re.search(r'\*\*Acceptance Criteria:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
        if criteria_match:
            criteria_text = criteria_match.group(1).strip()
            acceptance_criteria = [
                line.strip('✓ ').strip() 
                for line in criteria_text.split('\n') 
                if line.strip() and line.strip().startswith('✓ ')
            ]
        
        # Extract project info from tags and content
        project_info = {}
        for tag in tags:
            if tag.startswith('project-'):
                project_id = tag.replace('project-', '')
            elif tag.startswith('lang-'):
                project_info['language'] = tag.replace('lang-', '')
            elif tag.startswith('framework-'):
                project_info['framework'] = tag.replace('framework-', '')
        
        # Extract priority
        priority = 'medium'
        for tag in tags:
            if tag.startswith('priority-'):
                priority = tag.replace('priority-', '')
                break
        
        return {
            'id': memory.get('id'),
            'project_id': project_id,
            'title': memory.get('title', ''),
            'strategic_context': strategic_context,
            'tactical_requirements': tactical_requirements,
            'acceptance_criteria': acceptance_criteria,
            'project_info': project_info,
            'priority': priority,
            'created_at': memory.get('created_at'),
            'updated_at': memory.get('updated_at', memory.get('created_at')),
            'status': 'migrated'
        }
    
    async def _generate_migration_insights(self, memory_ids: List[str]) -> Dict[str, Any]:
        """Generate cross-project insights for migrated handoffs"""
        
        insights = {
            'total_migrated': len(memory_ids),
            'projects_discovered': set(),
            'technologies_found': set(),
            'domains_identified': set(),
            'cross_project_patterns': []
        }
        
        for memory_id in memory_ids:
            try:
                memory = await self.memory.get(memory_id)
                if memory:
                    tags = memory.get('tags', [])
                    
                    # Extract project IDs
                    for tag in tags:
                        if tag.startswith('project-'):
                            insights['projects_discovered'].add(tag.replace('project-', ''))
                        elif tag.startswith('lang-') or tag.startswith('framework-'):
                            insights['technologies_found'].add(tag)
                        elif tag.startswith('domain-'):
                            insights['domains_identified'].add(tag.replace('domain-', ''))
            
            except Exception as e:
                logger.warning(f"Failed to analyze memory {memory_id}: {e}")
        
        # Convert sets to lists for JSON serialization
        insights['projects_discovered'] = list(insights['projects_discovered'])
        insights['technologies_found'] = list(insights['technologies_found'])
        insights['domains_identified'] = list(insights['domains_identified'])
        
        # Identify patterns
        if len(insights['projects_discovered']) > 1:
            insights['cross_project_patterns'].append(
                f"Found handoffs across {len(insights['projects_discovered'])} projects"
            )
        
        if len(insights['technologies_found']) > 2:
            insights['cross_project_patterns'].append(
                f"Technology diversity: {len(insights['technologies_found'])} different technologies"
            )
        
        if len(insights['domains_identified']) > 1:
            insights['cross_project_patterns'].append(
                f"Domain coverage: {', '.join(insights['domains_identified'])}"
            )
        
        return insights


# CLI-style helper functions

async def migrate_from_file(file_path: str, db: DatabaseConnection, memory: MemoryStore) -> Dict:
    """Helper function to migrate handoffs from a file"""
    migrator = HandoffMigrator(db, memory)
    return await migrator.migrate_handoff_file(file_path)


async def create_sample_handoffs_for_testing() -> List[Dict]:
    """Create sample handoff data for testing the migration"""
    return [
        {
            "project_id": "ecommerce-platform",
            "title": "User Authentication System",
            "strategic_context": "Implement secure user authentication for our e-commerce platform to protect customer data and enable personalized experiences",
            "tactical_requirements": [
                "OAuth2 and social login integration",
                "Multi-factor authentication support",
                "Session management with JWT tokens",
                "Password security and reset functionality",
                "User role and permission system"
            ],
            "acceptance_criteria": [
                "Users can register with email or social accounts",
                "MFA is required for admin accounts",
                "Sessions expire after 24 hours of inactivity",
                "Password requirements meet security standards",
                "Role-based access control is enforced"
            ],
            "project_info": {
                "language": "TypeScript",
                "framework": "Next.js",
                "dependencies": ["next-auth", "prisma", "bcrypt", "jose"],
                "path": "/src/auth"
            },
            "priority": "high"
        },
        {
            "project_id": "data-analytics",
            "title": "Real-time Data Pipeline",
            "strategic_context": "Build a scalable real-time data pipeline to process customer events and enable data-driven decision making",
            "tactical_requirements": [
                "Apache Kafka event streaming",
                "Redis caching layer",
                "PostgreSQL data warehouse",
                "Apache Spark processing",
                "Monitoring and alerting system"
            ],
            "acceptance_criteria": [
                "Pipeline processes 10k+ events per second",
                "End-to-end latency under 100ms",
                "99.9% uptime requirement",
                "Data validation and error handling",
                "Real-time dashboards available"
            ],
            "project_info": {
                "language": "Python",
                "framework": "Apache Spark",
                "dependencies": ["pyspark", "kafka-python", "redis", "psycopg2"],
                "path": "/data-pipeline"
            },
            "priority": "medium"
        },
        {
            "project_id": "mobile-app",
            "title": "Offline-First Mobile Architecture",
            "strategic_context": "Design mobile app architecture that works seamlessly offline to improve user experience in low-connectivity environments",
            "tactical_requirements": [
                "Local SQLite database",
                "Data synchronization strategy",
                "Conflict resolution mechanisms",
                "Background sync processes",
                "Network state management"
            ],
            "acceptance_criteria": [
                "App functions fully offline",
                "Data syncs when connectivity returns",
                "Conflict resolution handles edge cases",
                "Battery usage optimized",
                "User feedback for sync status"
            ],
            "project_info": {
                "language": "Dart",
                "framework": "Flutter",
                "dependencies": ["sqflite", "dio", "connectivity_plus", "hive"],
                "path": "/mobile-app"
            },
            "priority": "medium"
        }
    ]