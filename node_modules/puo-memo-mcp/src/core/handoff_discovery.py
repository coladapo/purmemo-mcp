#!/usr/bin/env python3
"""
Cross-Project Discovery Engine for Handoff-PUO-MEMO Integration
Phase 2C: Advanced discovery features across all projects and handoffs
"""

import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass

from .database import DatabaseConnection
from .memory import MemoryStore
from .knowledge_graph import KnowledgeGraphStore
from .entity_extractor import EntityExtractor

logger = logging.getLogger(__name__)


@dataclass
class ProjectInsight:
    """Represents a cross-project insight or pattern"""
    project_id: str
    project_name: str
    insight_type: str  # 'similar_tech', 'similar_problem', 'pattern_reuse', 'team_knowledge'
    confidence: float
    description: str
    related_entities: List[str]
    memory_ids: List[str]


@dataclass
class DiscoveryResult:
    """Result from cross-project discovery search"""
    query: str
    total_projects: int
    insights: List[ProjectInsight]
    entity_connections: Dict[str, List[str]]
    patterns: List[Dict[str, Any]]
    recommendations: List[str]


class CrossProjectDiscovery:
    """Advanced cross-project discovery engine"""
    
    def __init__(self, db: DatabaseConnection, memory: MemoryStore, 
                 knowledge_graph: KnowledgeGraphStore, entity_extractor: EntityExtractor):
        self.db = db
        self.memory = memory
        self.knowledge_graph = knowledge_graph
        self.entity_extractor = entity_extractor
        
    async def discover_similar_projects(self, query: str, project_context: Optional[str] = None) -> DiscoveryResult:
        """
        Discover projects with similar technologies, problems, or patterns
        
        Args:
            query: Search query (e.g., "React authentication", "API rate limiting")
            project_context: Optional current project context for filtering
            
        Returns:
            DiscoveryResult with insights, patterns, and recommendations
        """
        logger.info(f"Starting cross-project discovery for: {query}")
        
        # 1. Extract entities from query
        query_entities = await self._extract_query_entities(query)
        
        # 2. Find projects with matching entities/technologies
        tech_matches = await self._find_technology_matches(query_entities)
        
        # 3. Find projects with similar problems/challenges
        problem_matches = await self._find_problem_matches(query)
        
        # 4. Find reusable implementation patterns
        pattern_matches = await self._find_implementation_patterns(query, query_entities)
        
        # 5. Find team knowledge connections
        team_matches = await self._find_team_knowledge(query_entities)
        
        # 6. Combine and rank insights
        all_insights = tech_matches + problem_matches + pattern_matches + team_matches
        ranked_insights = await self._rank_insights(all_insights, query)
        
        # 7. Extract entity connections across projects
        entity_connections = await self._build_entity_connection_graph(ranked_insights)
        
        # 8. Identify implementation patterns
        patterns = await self._identify_cross_project_patterns(ranked_insights)
        
        # 9. Generate actionable recommendations
        recommendations = await self._generate_recommendations(ranked_insights, patterns, query)
        
        return DiscoveryResult(
            query=query,
            total_projects=len(set(i.project_id for i in ranked_insights)),
            insights=ranked_insights[:20],  # Top 20 insights
            entity_connections=entity_connections,
            patterns=patterns,
            recommendations=recommendations
        )
    
    async def discover_implementation_patterns(self, technology: str) -> Dict[str, Any]:
        """
        Discover how a specific technology is implemented across projects
        
        Args:
            technology: Technology to analyze (e.g., "authentication", "Redis", "Docker")
            
        Returns:
            Dict with implementation patterns, best practices, and common issues
        """
        logger.info(f"Discovering implementation patterns for: {technology}")
        
        # Search for memories related to this technology
        tech_memories = await self.memory.hybrid_search(
            query=technology,
            limit=50
        )
        
        if not tech_memories or 'results' not in tech_memories:
            return {
                "technology": technology,
                "patterns": [],
                "projects": [],
                "recommendations": [f"No implementation patterns found for {technology}"]
            }
        
        memories = tech_memories['results']
        
        # Group by project
        project_implementations = {}
        for memory in memories:
            project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
            for project_tag in project_tags:
                project_id = project_tag.replace('project-', '')
                if project_id not in project_implementations:
                    project_implementations[project_id] = []
                project_implementations[project_id].append(memory)
        
        # Analyze patterns across projects
        patterns = []
        for project_id, project_memories in project_implementations.items():
            pattern = await self._analyze_project_implementation(technology, project_id, project_memories)
            if pattern:
                patterns.append(pattern)
        
        # Extract common patterns and best practices
        common_patterns = await self._extract_common_patterns(patterns)
        best_practices = await self._extract_best_practices(patterns)
        common_issues = await self._extract_common_issues(patterns)
        
        return {
            "technology": technology,
            "total_projects": len(patterns),
            "patterns": common_patterns,
            "best_practices": best_practices,
            "common_issues": common_issues,
            "project_details": patterns,
            "recommendations": await self._generate_tech_recommendations(technology, patterns)
        }
    
    async def discover_team_expertise(self, person_name: str) -> Dict[str, Any]:
        """
        Discover a team member's expertise across projects
        
        Args:
            person_name: Name of the person to analyze
            
        Returns:
            Dict with expertise areas, project contributions, and knowledge patterns
        """
        logger.info(f"Discovering team expertise for: {person_name}")
        
        # Find all memories mentioning this person
        person_memories = await self.memory.search_by_entity(person_name, limit=100)
        
        if not person_memories or 'results' not in person_memories:
            return {
                "person": person_name,
                "expertise_areas": [],
                "projects": [],
                "recommendations": [f"No expertise data found for {person_name}"]
            }
        
        memories = person_memories['results']
        
        # Extract technologies and concepts they work with
        expertise_areas = {}
        project_contributions = {}
        
        for memory in memories:
            # Extract project context
            project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
            tech_tags = [tag for tag in memory.get('tags', []) if tag in [
                'react', 'python', 'nodejs', 'docker', 'redis', 'postgresql',
                'aws', 'gcp', 'kubernetes', 'typescript', 'javascript'
            ]]
            
            # Count technology mentions
            for tech in tech_tags:
                expertise_areas[tech] = expertise_areas.get(tech, 0) + 1
            
            # Count project contributions
            for project_tag in project_tags:
                project_id = project_tag.replace('project-', '')
                if project_id not in project_contributions:
                    project_contributions[project_id] = []
                project_contributions[project_id].append(memory)
        
        # Rank expertise areas
        top_expertise = sorted(expertise_areas.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Analyze project contributions
        project_analysis = []
        for project_id, project_memories in project_contributions.items():
            analysis = {
                "project_id": project_id,
                "contribution_count": len(project_memories),
                "key_contributions": [m.get('title', '') for m in project_memories[:3]],
                "technologies": list(set([
                    tag for memory in project_memories 
                    for tag in memory.get('tags', []) 
                    if tag in expertise_areas
                ]))
            }
            project_analysis.append(analysis)
        
        return {
            "person": person_name,
            "top_expertise_areas": top_expertise,
            "total_projects": len(project_contributions),
            "project_contributions": project_analysis,
            "knowledge_recommendations": await self._generate_expertise_recommendations(
                person_name, top_expertise, project_analysis
            )
        }
    
    async def discover_architectural_patterns(self) -> Dict[str, Any]:
        """
        Discover architectural patterns used across all projects
        
        Returns:
            Dict with common architectural patterns, their usage, and recommendations
        """
        logger.info("Discovering architectural patterns across all projects")
        
        # Search for architecture-related memories
        arch_keywords = [
            "microservices", "monolith", "api gateway", "event driven",
            "message queue", "database design", "caching strategy",
            "authentication", "authorization", "monitoring", "logging"
        ]
        
        pattern_analysis = {}
        
        for keyword in arch_keywords:
            memories = await self.memory.hybrid_search(query=keyword, limit=30)
            if memories and 'results' in memories:
                pattern_analysis[keyword] = await self._analyze_architectural_pattern(
                    keyword, memories['results']
                )
        
        # Find common architectural decisions
        common_decisions = await self._extract_architectural_decisions(pattern_analysis)
        
        # Identify best practices
        best_practices = await self._extract_architectural_best_practices(pattern_analysis)
        
        # Find anti-patterns and lessons learned
        lessons_learned = await self._extract_architectural_lessons(pattern_analysis)
        
        return {
            "total_patterns_analyzed": len(pattern_analysis),
            "common_decisions": common_decisions,
            "best_practices": best_practices,
            "lessons_learned": lessons_learned,
            "pattern_details": pattern_analysis,
            "recommendations": await self._generate_architectural_recommendations(pattern_analysis)
        }
    
    # Private helper methods
    
    async def _extract_query_entities(self, query: str) -> List[str]:
        """Extract entities from search query"""
        try:
            if self.entity_extractor:
                entities = await self.entity_extractor.extract_entities(query)
                return [e['name'] for e in entities if e.get('confidence', 0) > 0.7]
            return []
        except Exception as e:
            logger.warning(f"Entity extraction failed: {e}")
            return []
    
    async def _find_technology_matches(self, entities: List[str]) -> List[ProjectInsight]:
        """Find projects using similar technologies"""
        insights = []
        
        for entity in entities:
            try:
                # Search for memories with this technology
                tech_memories = await self.memory.hybrid_search(query=entity, limit=20)
                
                if tech_memories and 'results' in tech_memories:
                    project_groups = {}
                    
                    for memory in tech_memories['results']:
                        project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
                        for project_tag in project_tags:
                            project_id = project_tag.replace('project-', '')
                            if project_id not in project_groups:
                                project_groups[project_id] = []
                            project_groups[project_id].append(memory)
                    
                    for project_id, memories in project_groups.items():
                        if len(memories) >= 2:  # Significant usage
                            insight = ProjectInsight(
                                project_id=project_id,
                                project_name=f"Project {project_id}",
                                insight_type="similar_tech",
                                confidence=min(0.9, len(memories) * 0.15),
                                description=f"Uses {entity} extensively ({len(memories)} references)",
                                related_entities=[entity],
                                memory_ids=[m['id'] for m in memories]
                            )
                            insights.append(insight)
            
            except Exception as e:
                logger.warning(f"Technology matching failed for {entity}: {e}")
        
        return insights
    
    async def _find_problem_matches(self, query: str) -> List[ProjectInsight]:
        """Find projects solving similar problems"""
        insights = []
        
        try:
            # Use semantic search to find similar problems
            similar_memories = await self.memory.semantic_search(query=query, limit=30)
            
            if similar_memories and 'results' in similar_memories:
                project_groups = {}
                
                for memory in similar_memories['results']:
                    if memory.get('similarity', 0) > 0.6:  # High similarity threshold
                        project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
                        for project_tag in project_tags:
                            project_id = project_tag.replace('project-', '')
                            if project_id not in project_groups:
                                project_groups[project_id] = []
                            project_groups[project_id].append(memory)
                
                for project_id, memories in project_groups.items():
                    best_match = max(memories, key=lambda m: m.get('similarity', 0))
                    insight = ProjectInsight(
                        project_id=project_id,
                        project_name=f"Project {project_id}",
                        insight_type="similar_problem",
                        confidence=best_match.get('similarity', 0),
                        description=f"Solved similar problem: {best_match.get('title', '')[:100]}",
                        related_entities=[],
                        memory_ids=[m['id'] for m in memories]
                    )
                    insights.append(insight)
        
        except Exception as e:
            logger.warning(f"Problem matching failed: {e}")
        
        return insights
    
    async def _find_implementation_patterns(self, query: str, entities: List[str]) -> List[ProjectInsight]:
        """Find reusable implementation patterns"""
        insights = []
        
        # Look for implementation-related keywords
        impl_keywords = ['implement', 'solution', 'approach', 'pattern', 'architecture']
        
        for keyword in impl_keywords:
            search_query = f"{query} {keyword}"
            try:
                pattern_memories = await self.memory.hybrid_search(query=search_query, limit=15)
                
                if pattern_memories and 'results' in pattern_memories:
                    for memory in pattern_memories['results']:
                        if memory.get('similarity', 0) > 0.5:
                            project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
                            for project_tag in project_tags:
                                project_id = project_tag.replace('project-', '')
                                insight = ProjectInsight(
                                    project_id=project_id,
                                    project_name=f"Project {project_id}",
                                    insight_type="pattern_reuse",
                                    confidence=memory.get('similarity', 0) * 0.8,
                                    description=f"Reusable pattern: {memory.get('title', '')[:100]}",
                                    related_entities=entities,
                                    memory_ids=[memory['id']]
                                )
                                insights.append(insight)
            
            except Exception as e:
                logger.warning(f"Pattern matching failed for {keyword}: {e}")
        
        return insights
    
    async def _find_team_knowledge(self, entities: List[str]) -> List[ProjectInsight]:
        """Find team knowledge and expertise connections"""
        insights = []
        
        # Look for person entities in the knowledge graph
        if self.knowledge_graph:
            try:
                for entity in entities:
                    person_graph = await self.knowledge_graph.get_entity_graph(entity, depth=2)
                    
                    if person_graph and person_graph.get('entity', {}).get('entity_type') == 'person':
                        related_projects = []
                        
                        # Find projects this person is connected to
                        for connection in person_graph.get('connections', []):
                            if 'project' in connection.get('related_entity', {}).get('name', '').lower():
                                related_projects.append(connection)
                        
                        if related_projects:
                            insight = ProjectInsight(
                                project_id="cross_project",
                                project_name="Team Knowledge",
                                insight_type="team_knowledge",
                                confidence=0.7,
                                description=f"{entity} has expertise across {len(related_projects)} projects",
                                related_entities=[entity],
                                memory_ids=[]
                            )
                            insights.append(insight)
            
            except Exception as e:
                logger.warning(f"Team knowledge discovery failed: {e}")
        
        return insights
    
    async def _rank_insights(self, insights: List[ProjectInsight], query: str) -> List[ProjectInsight]:
        """Rank insights by relevance and confidence"""
        
        # Weight different insight types
        type_weights = {
            'similar_problem': 1.0,
            'similar_tech': 0.8,
            'pattern_reuse': 0.9,
            'team_knowledge': 0.6
        }
        
        for insight in insights:
            base_score = insight.confidence
            type_weight = type_weights.get(insight.insight_type, 0.5)
            
            # Boost score for recent projects
            recency_boost = 0.1  # Could be calculated based on memory timestamps
            
            insight.confidence = min(1.0, base_score * type_weight + recency_boost)
        
        return sorted(insights, key=lambda x: x.confidence, reverse=True)
    
    async def _build_entity_connection_graph(self, insights: List[ProjectInsight]) -> Dict[str, List[str]]:
        """Build entity connection graph across projects"""
        connections = {}
        
        for insight in insights:
            for entity in insight.related_entities:
                if entity not in connections:
                    connections[entity] = []
                connections[entity].append(insight.project_id)
        
        # Remove duplicates and sort by connection count
        for entity in connections:
            connections[entity] = list(set(connections[entity]))
        
        return connections
    
    async def _identify_cross_project_patterns(self, insights: List[ProjectInsight]) -> List[Dict[str, Any]]:
        """Identify patterns that appear across multiple projects"""
        patterns = []
        
        # Group insights by type
        type_groups = {}
        for insight in insights:
            if insight.insight_type not in type_groups:
                type_groups[insight.insight_type] = []
            type_groups[insight.insight_type].append(insight)
        
        # Analyze each group for patterns
        for insight_type, group_insights in type_groups.items():
            if len(group_insights) >= 3:  # Pattern needs multiple instances
                pattern = {
                    "pattern_type": insight_type,
                    "frequency": len(group_insights),
                    "projects": list(set(i.project_id for i in group_insights)),
                    "confidence": sum(i.confidence for i in group_insights) / len(group_insights),
                    "description": f"Common {insight_type.replace('_', ' ')} pattern across {len(set(i.project_id for i in group_insights))} projects"
                }
                patterns.append(pattern)
        
        return sorted(patterns, key=lambda x: x['confidence'], reverse=True)
    
    async def _generate_recommendations(self, insights: List[ProjectInsight], 
                                      patterns: List[Dict[str, Any]], query: str) -> List[str]:
        """Generate actionable recommendations based on discoveries"""
        recommendations = []
        
        # Technology recommendations
        tech_insights = [i for i in insights if i.insight_type == 'similar_tech']
        if tech_insights:
            top_tech = tech_insights[0]
            recommendations.append(
                f"Consider studying {top_tech.project_name}'s implementation of {top_tech.related_entities[0] if top_tech.related_entities else 'this technology'}"
            )
        
        # Problem-solving recommendations
        problem_insights = [i for i in insights if i.insight_type == 'similar_problem']
        if problem_insights:
            top_problem = problem_insights[0]
            recommendations.append(
                f"Review how {top_problem.project_name} solved a similar challenge (confidence: {top_problem.confidence:.0%})"
            )
        
        # Pattern reuse recommendations
        pattern_insights = [i for i in insights if i.insight_type == 'pattern_reuse']
        if pattern_insights:
            recommendations.append(
                f"Found {len(pattern_insights)} reusable patterns - consider adapting successful approaches"
            )
        
        # Cross-project pattern recommendations
        if patterns:
            top_pattern = patterns[0]
            recommendations.append(
                f"Strong pattern detected: {top_pattern['description']} - consider standardizing this approach"
            )
        
        # Team expertise recommendations
        team_insights = [i for i in insights if i.insight_type == 'team_knowledge']
        if team_insights:
            recommendations.append(
                f"Connect with team members who have relevant experience across {len(team_insights)} related projects"
            )
        
        if not recommendations:
            recommendations.append("No direct patterns found - this might be an opportunity for innovation")
        
        return recommendations
    
    async def _analyze_project_implementation(self, technology: str, project_id: str, 
                                           memories: List[Dict]) -> Optional[Dict]:
        """Analyze how a specific technology is implemented in a project"""
        if not memories:
            return None
        
        # Extract implementation details
        implementation_details = []
        success_indicators = []
        challenges = []
        
        for memory in memories:
            content = memory.get('content', '').lower()
            title = memory.get('title', '').lower()
            
            # Look for implementation patterns
            if any(word in content for word in ['implement', 'setup', 'configure', 'install']):
                implementation_details.append(memory.get('title', ''))
            
            # Look for success indicators
            if any(word in content for word in ['success', 'working', 'deployed', 'completed']):
                success_indicators.append(memory.get('title', ''))
            
            # Look for challenges
            if any(word in content for word in ['issue', 'problem', 'error', 'failed', 'bug']):
                challenges.append(memory.get('title', ''))
        
        return {
            "project_id": project_id,
            "technology": technology,
            "implementation_count": len(implementation_details),
            "success_count": len(success_indicators),
            "challenge_count": len(challenges),
            "implementation_details": implementation_details[:5],
            "success_indicators": success_indicators[:3],
            "challenges": challenges[:3],
            "memory_ids": [m['id'] for m in memories]
        }
    
    async def _extract_common_patterns(self, patterns: List[Dict]) -> List[Dict]:
        """Extract common implementation patterns"""
        common = []
        
        # Find patterns that appear in multiple projects
        implementation_approaches = {}
        
        for pattern in patterns:
            for detail in pattern.get('implementation_details', []):
                key = detail.lower()
                if key not in implementation_approaches:
                    implementation_approaches[key] = []
                implementation_approaches[key].append(pattern['project_id'])
        
        # Find approaches used by multiple projects
        for approach, projects in implementation_approaches.items():
            if len(projects) >= 2:
                common.append({
                    "pattern": approach,
                    "project_count": len(projects),
                    "projects": projects
                })
        
        return sorted(common, key=lambda x: x['project_count'], reverse=True)[:5]
    
    async def _extract_best_practices(self, patterns: List[Dict]) -> List[str]:
        """Extract best practices from successful implementations"""
        best_practices = []
        
        for pattern in patterns:
            if pattern.get('success_count', 0) > 0 and pattern.get('challenge_count', 0) == 0:
                for success in pattern.get('success_indicators', []):
                    best_practices.append(f"✅ {success} (from {pattern['project_id']})")
        
        return best_practices[:5]
    
    async def _extract_common_issues(self, patterns: List[Dict]) -> List[str]:
        """Extract common issues and how to avoid them"""
        issues = []
        
        for pattern in patterns:
            for challenge in pattern.get('challenges', []):
                issues.append(f"⚠️ {challenge} (in {pattern['project_id']})")
        
        return issues[:5]
    
    async def _generate_tech_recommendations(self, technology: str, patterns: List[Dict]) -> List[str]:
        """Generate technology-specific recommendations"""
        recommendations = []
        
        if not patterns:
            return [f"No implementation data found for {technology}"]
        
        # Success rate analysis
        total_implementations = sum(p.get('implementation_count', 0) for p in patterns)
        total_successes = sum(p.get('success_count', 0) for p in patterns)
        
        if total_implementations > 0:
            success_rate = total_successes / total_implementations
            recommendations.append(f"{technology} success rate: {success_rate:.0%} across {len(patterns)} projects")
        
        # Best performing project
        best_project = max(patterns, key=lambda p: p.get('success_count', 0))
        if best_project.get('success_count', 0) > 0:
            recommendations.append(f"Study {best_project['project_id']}'s implementation - highest success rate")
        
        # Most challenging project
        challenging_project = max(patterns, key=lambda p: p.get('challenge_count', 0))
        if challenging_project.get('challenge_count', 0) > 0:
            recommendations.append(f"Learn from {challenging_project['project_id']}'s challenges to avoid similar issues")
        
        return recommendations
    
    async def _generate_expertise_recommendations(self, person: str, expertise: List[Tuple], 
                                                projects: List[Dict]) -> List[str]:
        """Generate recommendations based on team expertise analysis"""
        recommendations = []
        
        if expertise:
            top_skill = expertise[0][0]
            recommendations.append(f"{person} is most experienced with {top_skill} - ideal for related tasks")
        
        if len(projects) > 1:
            recommendations.append(f"{person} has cross-project experience ({len(projects)} projects) - good for architectural decisions")
        
        # Find unique skills
        unique_skills = [skill for skill, count in expertise if count == 1]
        if unique_skills:
            recommendations.append(f"Consider documenting {person}'s knowledge of {unique_skills[0]} - appears unique")
        
        return recommendations
    
    async def _analyze_architectural_pattern(self, pattern_name: str, memories: List[Dict]) -> Dict:
        """Analyze an architectural pattern across projects"""
        projects = set()
        implementations = []
        
        for memory in memories:
            project_tags = [tag for tag in memory.get('tags', []) if tag.startswith('project-')]
            for project_tag in project_tags:
                projects.add(project_tag.replace('project-', ''))
            
            if any(word in memory.get('content', '').lower() for word in ['implement', 'use', 'apply']):
                implementations.append(memory.get('title', ''))
        
        return {
            "pattern": pattern_name,
            "project_count": len(projects),
            "projects": list(projects),
            "implementations": implementations[:5],
            "total_references": len(memories)
        }
    
    async def _extract_architectural_decisions(self, analysis: Dict) -> List[Dict]:
        """Extract common architectural decisions"""
        decisions = []
        
        for pattern_name, pattern_data in analysis.items():
            if pattern_data['project_count'] >= 2:
                decisions.append({
                    "decision": pattern_name,
                    "adoption_rate": f"{pattern_data['project_count']} projects",
                    "implementations": pattern_data['implementations'][:3]
                })
        
        return sorted(decisions, key=lambda x: int(x['adoption_rate'].split()[0]), reverse=True)
    
    async def _extract_architectural_best_practices(self, analysis: Dict) -> List[str]:
        """Extract architectural best practices"""
        practices = []
        
        # Find most adopted patterns
        sorted_patterns = sorted(analysis.items(), 
                               key=lambda x: x[1]['project_count'], reverse=True)
        
        for pattern_name, pattern_data in sorted_patterns[:3]:
            if pattern_data['project_count'] >= 2:
                practices.append(f"✅ {pattern_name.title()} - adopted by {pattern_data['project_count']} projects")
        
        return practices
    
    async def _extract_architectural_lessons(self, analysis: Dict) -> List[str]:
        """Extract architectural lessons learned"""
        lessons = []
        
        # Look for patterns with mixed adoption
        for pattern_name, pattern_data in analysis.items():
            if pattern_data['project_count'] == 1:
                lessons.append(f"📚 {pattern_name.title()} - used once, evaluate for broader adoption")
        
        return lessons[:5]
    
    async def _generate_architectural_recommendations(self, analysis: Dict) -> List[str]:
        """Generate architectural recommendations"""
        recommendations = []
        
        # Most adopted pattern
        if analysis:
            most_adopted = max(analysis.items(), key=lambda x: x[1]['project_count'])
            recommendations.append(f"Consider standardizing on {most_adopted[0]} - used by {most_adopted[1]['project_count']} projects")
        
        # Underutilized patterns
        single_use = [name for name, data in analysis.items() if data['project_count'] == 1]
        if single_use:
            recommendations.append(f"Evaluate {single_use[0]} for broader adoption or retirement")
        
        return recommendations


# Integration functions for handoff-mcp compatibility

async def create_handoff_memory(memory_store: MemoryStore, handoff_data: Dict) -> str:
    """
    Convert handoff data to PUO-MEMO memory format
    
    Args:
        memory_store: PUO-MEMO memory store instance
        handoff_data: Handoff data from handoff-mcp
        
    Returns:
        Memory ID of created memory
    """
    
    # Extract handoff information
    title = handoff_data.get('title', 'Untitled Handoff')
    strategic_context = handoff_data.get('strategic_context', '')
    tactical_requirements = handoff_data.get('tactical_requirements', [])
    acceptance_criteria = handoff_data.get('acceptance_criteria', [])
    project_info = handoff_data.get('project_info', {})
    priority = handoff_data.get('priority', 'medium')
    
    # Format content for PUO-MEMO
    content = f"""**Strategic Context:**
{strategic_context}

**Tactical Requirements:**
{chr(10).join(f"- {req}" for req in tactical_requirements)}

**Acceptance Criteria:**
{chr(10).join(f"✓ {criteria}" for criteria in acceptance_criteria)}

**Project Information:**
- Language: {project_info.get('language', 'Not specified')}
- Framework: {project_info.get('framework', 'Not specified')}
- Dependencies: {', '.join(project_info.get('dependencies', []))}
- Path: {project_info.get('path', 'Not specified')}
"""
    
    # Create tags
    tags = [
        'handoff',
        f"priority-{priority}",
        'strategic-tactical-handoff'
    ]
    
    if project_info.get('language'):
        tags.append(f"lang-{project_info['language'].lower()}")
    
    if project_info.get('framework'):
        tags.append(f"framework-{project_info['framework'].lower()}")
    
    # Store in PUO-MEMO using the basic create method
    try:
        result = await memory_store.create(
            content=content,
            title=title,
            tags=tags
        )
        
        # Handle different return formats
        if result:
            memory_id = result.get('memory_id') or result.get('id')
            return memory_id
        else:
            logger.warning("Memory creation returned None/empty result")
            return None
    except Exception as e:
        logger.error(f"Error creating handoff memory: {e}")
        return None


async def convert_memory_to_handoff(memory_data: Dict) -> Dict:
    """
    Convert PUO-MEMO memory back to handoff format
    
    Args:
        memory_data: Memory data from PUO-MEMO
        
    Returns:
        Handoff data in handoff-mcp format
    """
    
    content = memory_data.get('content', '')
    tags = memory_data.get('tags', [])
    
    # Parse content sections using regex for better parsing
    import re
    
    strategic_context = ''
    tactical_requirements = []
    acceptance_criteria = []
    
    # Extract strategic context
    strategic_match = re.search(r'\*\*Strategic Context:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
    if strategic_match:
        strategic_context = strategic_match.group(1).strip()
    
    # Extract tactical requirements
    tactical_match = re.search(r'\*\*Tactical Requirements:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
    if tactical_match:
        req_text = tactical_match.group(1).strip()
        tactical_requirements = [line.strip('- ').strip() for line in req_text.split('\n') if line.strip() and line.strip().startswith('- ')]
    
    # Extract acceptance criteria
    criteria_match = re.search(r'\*\*Acceptance Criteria:\*\*\s*\n?(.*?)(?=\*\*|$)', content, re.DOTALL)
    if criteria_match:
        criteria_text = criteria_match.group(1).strip()
        acceptance_criteria = [line.strip('✓ ').strip() for line in criteria_text.split('\n') if line.strip() and line.strip().startswith('✓ ')]
    
    # Extract project info from tags
    project_info = {}
    for tag in tags:
        if tag.startswith('lang-'):
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
        'id': memory_data.get('id'),
        'title': memory_data.get('title', ''),
        'strategic_context': strategic_context,
        'tactical_requirements': tactical_requirements,
        'acceptance_criteria': acceptance_criteria,
        'project_info': project_info,
        'priority': priority,
        'created_at': memory_data.get('created_at'),
        'updated_at': memory_data.get('updated_at', memory_data.get('created_at')),
        'status': 'in_progress'  # Default status
    }