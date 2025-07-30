"""
Advanced Natural Language Search for PUO Memo
Provides temporal parsing, intent extraction, and dynamic query building
"""

import re
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class SearchIntent(Enum):
    FIND = "find"  # General search
    WHEN = "when"  # Temporal search
    WHO = "who"    # Person search
    WHERE = "where"  # Location search
    WHAT = "what"  # Topic/concept search
    HOW = "how"    # Process/method search


@dataclass
class ParsedQuery:
    """Represents a parsed natural language query"""
    original_query: str
    intent: SearchIntent = SearchIntent.FIND
    keywords: List[str] = None
    entities: List[Dict[str, str]] = None
    temporal_filter: Optional[Dict[str, Any]] = None
    tags_filter: List[str] = None
    content_type_filter: Optional[str] = None
    
    def __post_init__(self):
        if self.keywords is None:
            self.keywords = []
        if self.entities is None:
            self.entities = []
        if self.tags_filter is None:
            self.tags_filter = []


class NLPSearchParser:
    """Parses natural language queries into structured search parameters"""
    
    # Temporal expressions
    TEMPORAL_PATTERNS = {
        # Relative time
        r'(today|tonight)': lambda: (
            datetime.now(timezone.utc).replace(hour=0, minute=0, second=0),
            datetime.now(timezone.utc).replace(hour=23, minute=59, second=59)
        ),
        r'yesterday': lambda: (
            (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=0, minute=0, second=0),
            (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=23, minute=59, second=59)
        ),
        r'(this|current) week': lambda: (
            datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday()),
            datetime.now(timezone.utc)
        ),
        r'last week': lambda: (
            datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday() + 7),
            datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday())
        ),
        r'(this|current) month': lambda: (
            datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0),
            datetime.now(timezone.utc)
        ),
        r'last month': lambda: (
            (datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0),
            datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0) - timedelta(seconds=1)
        ),
        r'last (\d+) days?': lambda m: (
            datetime.now(timezone.utc) - timedelta(days=int(m.group(1))),
            datetime.now(timezone.utc)
        ),
        r'last (\d+) hours?': lambda m: (
            datetime.now(timezone.utc) - timedelta(hours=int(m.group(1))),
            datetime.now(timezone.utc)
        ),
        r'(\d+) days? ago': lambda m: (
            (datetime.now(timezone.utc) - timedelta(days=int(m.group(1)))).replace(hour=0, minute=0, second=0),
            (datetime.now(timezone.utc) - timedelta(days=int(m.group(1)) - 1)).replace(hour=23, minute=59, second=59)
        ),
    }
    
    # Intent patterns
    INTENT_PATTERNS = {
        SearchIntent.WHEN: [r'\bwhen\b', r'\bdate\b', r'\btime\b'],
        SearchIntent.WHO: [r'\bwho\b', r'\bperson\b', r'\bpeople\b'],
        SearchIntent.WHERE: [r'\bwhere\b', r'\blocation\b', r'\bplace\b'],
        SearchIntent.WHAT: [r'\bwhat\b', r'\btopic\b', r'\bsubject\b'],
        SearchIntent.HOW: [r'\bhow\b', r'\bmethod\b', r'\bprocess\b'],
    }
    
    # Tag extraction patterns
    TAG_PATTERNS = [
        r'#(\w+)',  # Hashtags
        r'\btag:(\w+)',  # Explicit tags
        r'\btagged?\s+(?:as|with)\s+(\w+)',  # Natural tag expressions
    ]
    
    # Content type patterns
    TYPE_PATTERNS = {
        'note': [r'\bnotes?\b', r'\bnote\b'],
        'task': [r'\btasks?\b', r'\btodo\b', r'\bto-do\b'],
        'idea': [r'\bideas?\b', r'\bthoughts?\b'],
        'meeting': [r'\bmeetings?\b', r'\bmeeting notes\b'],
        'code': [r'\bcode\b', r'\bsnippet\b', r'\bscript\b'],
    }
    
    # Entity patterns
    ENTITY_PATTERNS = {
        'person': r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',  # Simple name pattern
        'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        'url': r'https?://[^\s]+',
        'phone': r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
    }
    
    def parse(self, query: str) -> ParsedQuery:
        """Parse natural language query into structured format"""
        parsed = ParsedQuery(original_query=query)
        
        # Extract temporal expressions
        parsed.temporal_filter = self._extract_temporal(query)
        
        # Extract intent
        parsed.intent = self._extract_intent(query)
        
        # Extract tags
        parsed.tags_filter = self._extract_tags(query)
        
        # Extract content type
        parsed.content_type_filter = self._extract_type(query)
        
        # Extract entities
        parsed.entities = self._extract_entities(query)
        
        # Extract keywords (remaining words after filtering)
        parsed.keywords = self._extract_keywords(query)
        
        return parsed
    
    def _extract_temporal(self, query: str) -> Optional[Dict[str, Any]]:
        """Extract temporal expressions from query"""
        query_lower = query.lower()
        
        for pattern, time_func in self.TEMPORAL_PATTERNS.items():
            match = re.search(pattern, query_lower)
            if match:
                if callable(time_func):
                    # Check if function expects match object
                    try:
                        start, end = time_func(match)
                    except TypeError:
                        start, end = time_func()
                else:
                    start, end = time_func
                    
                return {
                    'start': start,
                    'end': end,
                    'expression': match.group(0)
                }
                
        # Check for specific date patterns
        date_patterns = [
            (r'on (\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', '%m-%d-%Y'),
            (r'on (\d{4})[/-](\d{1,2})[/-](\d{1,2})', '%Y-%m-%d'),
        ]
        
        for pattern, date_format in date_patterns:
            match = re.search(pattern, query)
            if match:
                try:
                    date_str = match.group(0).replace('on ', '')
                    date = datetime.strptime(date_str, date_format)
                    return {
                        'start': date.replace(hour=0, minute=0, second=0, tzinfo=timezone.utc),
                        'end': date.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc),
                        'expression': match.group(0)
                    }
                except ValueError:
                    pass
                    
        return None
    
    def _extract_intent(self, query: str) -> SearchIntent:
        """Extract search intent from query"""
        query_lower = query.lower()
        
        for intent, patterns in self.INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query_lower):
                    return intent
                    
        return SearchIntent.FIND
    
    def _extract_tags(self, query: str) -> List[str]:
        """Extract tags from query"""
        tags = []
        
        for pattern in self.TAG_PATTERNS:
            matches = re.findall(pattern, query, re.IGNORECASE)
            tags.extend(matches)
            
        return list(set(tags))  # Remove duplicates
    
    def _extract_type(self, query: str) -> Optional[str]:
        """Extract content type from query"""
        query_lower = query.lower()
        
        for type_name, patterns in self.TYPE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query_lower):
                    return type_name
                    
        return None
    
    def _extract_entities(self, query: str) -> List[Dict[str, str]]:
        """Extract entities from query"""
        entities = []
        
        for entity_type, pattern in self.ENTITY_PATTERNS.items():
            matches = re.findall(pattern, query)
            for match in matches:
                entities.append({
                    'type': entity_type,
                    'value': match
                })
                
        return entities
    
    def _extract_keywords(self, query: str) -> List[str]:
        """Extract keywords after removing special patterns"""
        # Remove temporal expressions
        cleaned = query
        if hasattr(self, '_last_temporal_expression'):
            cleaned = cleaned.replace(self._last_temporal_expression, '')
            
        # Remove tags
        for pattern in self.TAG_PATTERNS:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
            
        # Remove common words
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'must', 'can', 'find',
            'search', 'show', 'get', 'list', 'memories', 'memory'
        }
        
        # Split and filter
        words = cleaned.split()
        keywords = [w for w in words if w.lower() not in stop_words and len(w) > 2]
        
        return keywords


class NLPSearchEngine:
    """Executes natural language searches using parsed queries"""
    
    def __init__(self, memory_store):
        self.memory = memory_store
        self.parser = NLPSearchParser()
        
    async def search(self, query: str, limit: int = 10, offset: int = 0) -> Dict[str, Any]:
        """Execute natural language search"""
        # Parse the query
        parsed = self.parser.parse(query)
        
        logger.info(f"Parsed query: intent={parsed.intent.value}, "
                   f"keywords={parsed.keywords}, "
                   f"temporal={parsed.temporal_filter is not None}, "
                   f"tags={parsed.tags_filter}")
        
        # Build search parameters
        search_params = self._build_search_params(parsed)
        
        # Execute appropriate search
        if parsed.entities and any(e['type'] == 'person' for e in parsed.entities):
            # Entity-based search
            person_names = [e['value'] for e in parsed.entities if e['type'] == 'person']
            results = []
            for name in person_names:
                entity_results = await self.memory.search_by_entity(name, limit, offset)
                if isinstance(entity_results, dict) and 'results' in entity_results:
                    results.extend(entity_results['results'])
                    
            # Deduplicate results
            seen_ids = set()
            unique_results = []
            for r in results:
                if r['id'] not in seen_ids:
                    seen_ids.add(r['id'])
                    unique_results.append(r)
                    
            return {
                'query': query,
                'parsed_query': {
                    'intent': parsed.intent.value,
                    'keywords': parsed.keywords,
                    'temporal_filter': parsed.temporal_filter,
                    'entities': parsed.entities,
                    'tags': parsed.tags_filter
                },
                'search_type': 'nlp-entity',
                'count': len(unique_results),
                'results': unique_results[:limit]
            }
            
        elif parsed.keywords or parsed.tags_filter:
            # Keyword/tag search with filters
            search_query = ' '.join(parsed.keywords)
            
            # Use semantic search for better results
            results = await self.memory.semantic_search(search_query, limit * 2, offset)
            
            # Apply filters
            if isinstance(results, dict) and 'results' in results:
                filtered = await self._apply_filters(results['results'], parsed)
                results['results'] = filtered[:limit]
                results['count'] = len(filtered)
                results['search_type'] = 'nlp-filtered'
                results['parsed_query'] = {
                    'intent': parsed.intent.value,
                    'keywords': parsed.keywords,
                    'temporal_filter': parsed.temporal_filter,
                    'tags': parsed.tags_filter
                }
                
            return results
            
        else:
            # Temporal-only search
            results = await self.memory.list(limit * 2, offset)
            
            if isinstance(results, list):
                filtered = await self._apply_filters(results, parsed)
                return {
                    'query': query,
                    'parsed_query': {
                        'intent': parsed.intent.value,
                        'temporal_filter': parsed.temporal_filter
                    },
                    'search_type': 'nlp-temporal',
                    'count': len(filtered),
                    'results': filtered[:limit]
                }
            else:
                return results
                
    def _build_search_params(self, parsed: ParsedQuery) -> Dict[str, Any]:
        """Build search parameters from parsed query"""
        params = {}
        
        if parsed.keywords:
            params['keywords'] = parsed.keywords
            
        if parsed.tags_filter:
            params['tags'] = parsed.tags_filter
            
        if parsed.content_type_filter:
            params['type'] = parsed.content_type_filter
            
        if parsed.temporal_filter:
            params['date_range'] = parsed.temporal_filter
            
        return params
        
    async def _apply_filters(self, results: List[Dict], parsed: ParsedQuery) -> List[Dict]:
        """Apply additional filters to results"""
        filtered = results
        
        # Apply temporal filter
        if parsed.temporal_filter:
            start = parsed.temporal_filter['start']
            end = parsed.temporal_filter['end']
            
            filtered = [
                r for r in filtered
                if 'created_at' in r and start <= datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')) <= end
            ]
            
        # Apply tag filter
        if parsed.tags_filter:
            filtered = [
                r for r in filtered
                if any(tag in r.get('tags', []) for tag in parsed.tags_filter)
            ]
            
        # Apply type filter
        if parsed.content_type_filter:
            filtered = [
                r for r in filtered
                if r.get('type', '').lower() == parsed.content_type_filter.lower()
            ]
            
        return filtered