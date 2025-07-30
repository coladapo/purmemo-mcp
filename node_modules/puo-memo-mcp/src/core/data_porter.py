"""
Data Export/Import functionality for PUO Memo
Supports exporting memories to various formats and importing from backups
"""
import json
import csv
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
import asyncio
from io import StringIO
import zipfile

import asyncpg

from src.core.database import DatabaseConnection
from src.core.memory import MemoryStore
from src.utils.error_tracking import error_tracker, with_error_tracking

logger = logging.getLogger(__name__)


class DataPorter:
    """Handles data export and import operations"""
    
    def __init__(self, db: DatabaseConnection, memory_store: MemoryStore):
        self.db = db
        self.memory_store = memory_store
    
    @with_error_tracking("data_export")
    async def export_memories(
        self,
        format: str = "json",
        context: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        include_attachments: bool = True,
        include_entities: bool = True,
        include_corrections: bool = True,
        output_path: Optional[Union[str, Path]] = None
    ) -> Dict[str, Any]:
        """
        Export memories to specified format
        
        Args:
            format: Export format (json, csv, markdown, archive)
            context: Filter by context
            start_date: Filter by start date
            end_date: Filter by end date
            tags: Filter by tags
            include_attachments: Include attachment data
            include_entities: Include entity data
            include_corrections: Include corrections
            output_path: Path to save export file
            
        Returns:
            Export result with file path or data
        """
        # Build query
        query = """
            SELECT 
                m.id,
                m.content,
                m.type,
                m.title,
                m.source_url,
                m.tags,
                m.context,
                m.created_at,
                m.updated_at,
                m.has_embedding,
                m.metadata
            FROM memories m
            WHERE 1=1
        """
        
        params = []
        param_count = 0
        
        if context:
            param_count += 1
            query += f" AND m.context = ${param_count}"
            params.append(context)
        
        if start_date:
            param_count += 1
            query += f" AND m.created_at >= ${param_count}"
            params.append(start_date)
        
        if end_date:
            param_count += 1
            query += f" AND m.created_at <= ${param_count}"
            params.append(end_date)
        
        if tags:
            param_count += 1
            query += f" AND m.tags && ${param_count}"
            params.append(tags)
        
        query += " ORDER BY m.created_at DESC"
        
        # Fetch memories
        memories = await self.db.fetch(query, *params)
        
        # Enrich with additional data if requested
        export_data = []
        for memory in memories:
            memory_data = dict(memory)
            memory_id = memory_data['id']
            
            # Convert datetime to ISO format
            memory_data['created_at'] = memory_data['created_at'].isoformat()
            memory_data['updated_at'] = memory_data['updated_at'].isoformat()
            
            if include_attachments:
                attachments = await self.db.fetch("""
                    SELECT file_name, file_type, file_size, storage_path, description
                    FROM attachments
                    WHERE memory_id = $1
                """, memory_id)
                memory_data['attachments'] = [dict(a) for a in attachments]
            
            if include_entities:
                entities = await self.db.fetch("""
                    SELECT entity_name, entity_type, confidence
                    FROM memory_entities
                    WHERE memory_id = $1
                """, memory_id)
                memory_data['entities'] = [dict(e) for e in entities]
            
            if include_corrections:
                corrections = await self.db.fetch("""
                    SELECT corrected_content, reason, created_at
                    FROM corrections
                    WHERE memory_id = $1
                    ORDER BY created_at DESC
                """, memory_id)
                memory_data['corrections'] = [
                    {**dict(c), 'created_at': c['created_at'].isoformat()}
                    for c in corrections
                ]
            
            export_data.append(memory_data)
        
        # Format the export
        if format == "json":
            return await self._export_json(export_data, output_path)
        elif format == "csv":
            return await self._export_csv(export_data, output_path)
        elif format == "markdown":
            return await self._export_markdown(export_data, output_path)
        elif format == "archive":
            return await self._export_archive(export_data, output_path)
        else:
            raise ValueError(f"Unsupported export format: {format}")
    
    async def _export_json(self, data: List[Dict], output_path: Optional[Path]) -> Dict[str, Any]:
        """Export to JSON format"""
        export = {
            "version": "1.0",
            "export_date": datetime.now(timezone.utc).isoformat(),
            "total_memories": len(data),
            "memories": data
        }
        
        if output_path:
            output_path = Path(output_path)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(export, f, indent=2, ensure_ascii=False)
            
            return {
                "success": True,
                "format": "json",
                "file_path": str(output_path),
                "memories_exported": len(data),
                "file_size": output_path.stat().st_size
            }
        else:
            return {
                "success": True,
                "format": "json",
                "data": export,
                "memories_exported": len(data)
            }
    
    async def _export_csv(self, data: List[Dict], output_path: Optional[Path]) -> Dict[str, Any]:
        """Export to CSV format"""
        if not data:
            return {
                "success": True,
                "format": "csv",
                "memories_exported": 0
            }
        
        # Flatten the data for CSV
        flattened = []
        for memory in data:
            row = {
                'id': memory['id'],
                'content': memory['content'],
                'type': memory['type'],
                'title': memory.get('title', ''),
                'source_url': memory.get('source_url', ''),
                'tags': '|'.join(memory.get('tags', [])),
                'context': memory['context'],
                'created_at': memory['created_at'],
                'updated_at': memory['updated_at'],
                'has_embedding': memory['has_embedding'],
                'entity_count': len(memory.get('entities', [])),
                'attachment_count': len(memory.get('attachments', [])),
                'correction_count': len(memory.get('corrections', []))
            }
            flattened.append(row)
        
        # Write CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=flattened[0].keys())
        writer.writeheader()
        writer.writerows(flattened)
        
        if output_path:
            output_path = Path(output_path)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(output.getvalue())
            
            return {
                "success": True,
                "format": "csv",
                "file_path": str(output_path),
                "memories_exported": len(data),
                "file_size": output_path.stat().st_size
            }
        else:
            return {
                "success": True,
                "format": "csv",
                "data": output.getvalue(),
                "memories_exported": len(data)
            }
    
    async def _export_markdown(self, data: List[Dict], output_path: Optional[Path]) -> Dict[str, Any]:
        """Export to Markdown format"""
        lines = [
            "# PUO Memo Export",
            f"\nExport Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            f"Total Memories: {len(data)}",
            "\n---\n"
        ]
        
        for memory in data:
            # Title
            title = memory.get('title', 'Untitled')
            lines.append(f"## {title}")
            
            # Metadata
            lines.append(f"\n**ID**: `{memory['id']}`")
            lines.append(f"**Created**: {memory['created_at']}")
            lines.append(f"**Type**: {memory['type']}")
            
            if memory.get('tags'):
                tags = ' '.join([f"`{tag}`" for tag in memory['tags']])
                lines.append(f"**Tags**: {tags}")
            
            if memory.get('source_url'):
                lines.append(f"**Source**: [{memory['source_url']}]({memory['source_url']})")
            
            # Content
            lines.append("\n### Content\n")
            lines.append(memory['content'])
            
            # Entities
            if memory.get('entities'):
                lines.append("\n### Entities\n")
                for entity in memory['entities']:
                    lines.append(f"- **{entity['entity_name']}** ({entity['entity_type']})")
            
            # Attachments
            if memory.get('attachments'):
                lines.append("\n### Attachments\n")
                for att in memory['attachments']:
                    lines.append(f"- {att['file_name']} ({att['file_type']}, {att['file_size']} bytes)")
            
            # Corrections
            if memory.get('corrections'):
                lines.append("\n### Corrections\n")
                for corr in memory['corrections']:
                    lines.append(f"- **{corr['created_at']}**: {corr.get('reason', 'No reason provided')}")
                    lines.append(f"  - {corr['corrected_content']}")
            
            lines.append("\n---\n")
        
        content = '\n'.join(lines)
        
        if output_path:
            output_path = Path(output_path)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "format": "markdown",
                "file_path": str(output_path),
                "memories_exported": len(data),
                "file_size": output_path.stat().st_size
            }
        else:
            return {
                "success": True,
                "format": "markdown",
                "data": content,
                "memories_exported": len(data)
            }
    
    async def _export_archive(self, data: List[Dict], output_path: Optional[Path]) -> Dict[str, Any]:
        """Export as a complete archive with all data and attachments"""
        if not output_path:
            raise ValueError("Output path required for archive export")
        
        output_path = Path(output_path)
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add main data file
            export_data = {
                "version": "1.0",
                "export_date": datetime.now(timezone.utc).isoformat(),
                "total_memories": len(data),
                "memories": data
            }
            zf.writestr('memories.json', json.dumps(export_data, indent=2))
            
            # Add metadata
            metadata = {
                "export_tool": "PUO Memo Data Porter",
                "export_date": datetime.now(timezone.utc).isoformat(),
                "memory_count": len(data),
                "contexts": list(set(m['context'] for m in data)),
                "date_range": {
                    "start": min(m['created_at'] for m in data) if data else None,
                    "end": max(m['created_at'] for m in data) if data else None
                }
            }
            zf.writestr('metadata.json', json.dumps(metadata, indent=2))
            
            # Add README
            readme = f"""# PUO Memo Archive

This archive contains an export of PUO Memo data.

## Contents

- `memories.json`: Main memory data export
- `metadata.json`: Export metadata
- `attachments/`: Attachment files (if any)

## Statistics

- Total Memories: {len(data)}
- Export Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}

## Import Instructions

To import this archive back into PUO Memo:

```python
from data_porter import DataPorter
porter = DataPorter(db, memory_store)
await porter.import_archive('path/to/archive.zip')
```
"""
            zf.writestr('README.md', readme)
        
        return {
            "success": True,
            "format": "archive",
            "file_path": str(output_path),
            "memories_exported": len(data),
            "file_size": output_path.stat().st_size
        }
    
    @with_error_tracking("data_import")
    async def import_memories(
        self,
        file_path: Union[str, Path],
        format: Optional[str] = None,
        merge_strategy: str = "skip",  # skip, update, duplicate
        context_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Import memories from file
        
        Args:
            file_path: Path to import file
            format: File format (auto-detected if None)
            merge_strategy: How to handle existing memories
            context_override: Override context for imported memories
            
        Returns:
            Import result statistics
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"Import file not found: {file_path}")
        
        # Auto-detect format
        if not format:
            if file_path.suffix == '.json':
                format = 'json'
            elif file_path.suffix == '.csv':
                format = 'csv'
            elif file_path.suffix == '.zip':
                format = 'archive'
            else:
                raise ValueError(f"Cannot determine format for: {file_path}")
        
        # Import based on format
        if format == 'json':
            return await self._import_json(file_path, merge_strategy, context_override)
        elif format == 'csv':
            return await self._import_csv(file_path, merge_strategy, context_override)
        elif format == 'archive':
            return await self._import_archive(file_path, merge_strategy, context_override)
        else:
            raise ValueError(f"Unsupported import format: {format}")
    
    async def _import_json(
        self,
        file_path: Path,
        merge_strategy: str,
        context_override: Optional[str]
    ) -> Dict[str, Any]:
        """Import from JSON file"""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Handle both raw array and structured export
        if isinstance(data, list):
            memories = data
        elif isinstance(data, dict) and 'memories' in data:
            memories = data['memories']
        else:
            raise ValueError("Invalid JSON format")
        
        # Import memories
        imported = 0
        skipped = 0
        updated = 0
        errors = []
        
        for memory_data in memories:
            try:
                # Override context if specified
                if context_override:
                    memory_data['context'] = context_override
                
                # Check if memory exists
                existing = None
                if 'id' in memory_data:
                    existing = await self.db.fetchrow("""
                        SELECT id FROM memories WHERE id = $1
                    """, memory_data['id'])
                
                if existing and merge_strategy == 'skip':
                    skipped += 1
                    continue
                elif existing and merge_strategy == 'update':
                    # Update existing memory
                    await self._update_memory(memory_data)
                    updated += 1
                else:
                    # Create new memory (duplicate or new)
                    if merge_strategy == 'duplicate' and existing:
                        # Remove ID to create duplicate
                        memory_data.pop('id', None)
                    
                    await self._create_memory_from_import(memory_data)
                    imported += 1
                    
            except Exception as e:
                logger.error(f"Error importing memory: {e}")
                errors.append(str(e))
                error_tracker.capture_exception(e)
        
        return {
            "success": True,
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "errors": len(errors),
            "total_processed": len(memories),
            "error_messages": errors[:10]  # First 10 errors
        }
    
    async def _import_csv(
        self,
        file_path: Path,
        merge_strategy: str,
        context_override: Optional[str]
    ) -> Dict[str, Any]:
        """Import from CSV file"""
        imported = 0
        errors = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row in reader:
                try:
                    # Convert CSV row to memory data
                    memory_data = {
                        'content': row['content'],
                        'type': row.get('type', 'general'),
                        'title': row.get('title', ''),
                        'source_url': row.get('source_url', ''),
                        'tags': row.get('tags', '').split('|') if row.get('tags') else [],
                        'context': context_override or row.get('context', 'import')
                    }
                    
                    # Create memory
                    result = await self.memory_store.create(**memory_data)
                    imported += 1
                    
                except Exception as e:
                    logger.error(f"Error importing CSV row: {e}")
                    errors.append(str(e))
        
        return {
            "success": True,
            "imported": imported,
            "errors": len(errors),
            "error_messages": errors[:10]
        }
    
    async def _import_archive(
        self,
        file_path: Path,
        merge_strategy: str,
        context_override: Optional[str]
    ) -> Dict[str, Any]:
        """Import from archive file"""
        import tempfile
        import shutil
        
        # Extract archive to temp directory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            with zipfile.ZipFile(file_path, 'r') as zf:
                zf.extractall(temp_path)
            
            # Import main memories file
            memories_file = temp_path / 'memories.json'
            if not memories_file.exists():
                raise ValueError("Archive missing memories.json")
            
            result = await self._import_json(memories_file, merge_strategy, context_override)
            
            # TODO: Handle attachment files if present
            
            return result
    
    async def _create_memory_from_import(self, memory_data: Dict[str, Any]) -> str:
        """Create a memory from imported data"""
        # Extract core fields
        core_fields = {
            'content': memory_data['content'],
            'type': memory_data.get('type', 'general'),
            'title': memory_data.get('title'),
            'source_url': memory_data.get('source_url'),
            'tags': memory_data.get('tags', []),
            'context': memory_data.get('context', 'import')
        }
        
        # Create memory
        result = await self.memory_store.create(**core_fields)
        memory_id = result['id']
        
        # Import entities if present
        if 'entities' in memory_data:
            for entity in memory_data['entities']:
                await self.db.execute("""
                    INSERT INTO memory_entities (id, memory_id, entity_name, entity_type, confidence)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4)
                """, memory_id, entity['entity_name'], entity['entity_type'], 
                    entity.get('confidence', 1.0))
        
        # Import corrections if present
        if 'corrections' in memory_data:
            for corr in memory_data['corrections']:
                await self.db.execute("""
                    INSERT INTO corrections (id, memory_id, corrected_content, reason)
                    VALUES (gen_random_uuid(), $1, $2, $3)
                """, memory_id, corr['corrected_content'], corr.get('reason'))
        
        return memory_id
    
    async def _update_memory(self, memory_data: Dict[str, Any]) -> None:
        """Update existing memory with imported data"""
        memory_id = memory_data['id']
        
        # Update core fields
        await self.db.execute("""
            UPDATE memories
            SET content = $2, title = $3, tags = $4, updated_at = NOW()
            WHERE id = $1
        """, memory_id, memory_data['content'], memory_data.get('title'), 
            memory_data.get('tags', []))
        
        # TODO: Handle entity and correction updates
    
    async def export_statistics(self) -> Dict[str, Any]:
        """Get statistics about the data"""
        stats = await self.db.fetchrow("""
            SELECT 
                COUNT(*) as total_memories,
                COUNT(DISTINCT context) as contexts,
                COUNT(CASE WHEN has_embedding THEN 1 END) as with_embeddings,
                MIN(created_at) as oldest_memory,
                MAX(created_at) as newest_memory,
                AVG(LENGTH(content)) as avg_content_length
            FROM memories
        """)
        
        tag_stats = await self.db.fetch("""
            SELECT tag, COUNT(*) as count
            FROM memories, unnest(tags) as tag
            GROUP BY tag
            ORDER BY count DESC
            LIMIT 20
        """)
        
        entity_stats = await self.db.fetch("""
            SELECT entity_type, COUNT(*) as count
            FROM memory_entities
            GROUP BY entity_type
            ORDER BY count DESC
        """)
        
        return {
            "total_memories": stats['total_memories'],
            "contexts": stats['contexts'],
            "with_embeddings": stats['with_embeddings'],
            "date_range": {
                "start": stats['oldest_memory'].isoformat() if stats['oldest_memory'] else None,
                "end": stats['newest_memory'].isoformat() if stats['newest_memory'] else None
            },
            "avg_content_length": int(stats['avg_content_length'] or 0),
            "top_tags": [{"tag": t['tag'], "count": t['count']} for t in tag_stats],
            "entity_types": [{"type": e['entity_type'], "count": e['count']} for e in entity_stats]
        }


# CLI utility functions
async def export_cli(
    db_connection: DatabaseConnection,
    memory_store: MemoryStore,
    format: str,
    output: str,
    **filters
) -> None:
    """CLI export function"""
    porter = DataPorter(db_connection, memory_store)
    
    result = await porter.export_memories(
        format=format,
        output_path=output,
        **filters
    )
    
    if result['success']:
        print(f"✅ Exported {result['memories_exported']} memories to {result.get('file_path', 'output')}")
        if 'file_size' in result:
            size_mb = result['file_size'] / 1024 / 1024
            print(f"📦 File size: {size_mb:.2f} MB")
    else:
        print(f"❌ Export failed: {result.get('error', 'Unknown error')}")


async def import_cli(
    db_connection: DatabaseConnection,
    memory_store: MemoryStore,
    file_path: str,
    merge_strategy: str = "skip"
) -> None:
    """CLI import function"""
    porter = DataPorter(db_connection, memory_store)
    
    result = await porter.import_memories(
        file_path=file_path,
        merge_strategy=merge_strategy
    )
    
    print(f"✅ Import complete:")
    print(f"  - Imported: {result['imported']}")
    print(f"  - Updated: {result.get('updated', 0)}")
    print(f"  - Skipped: {result.get('skipped', 0)}")
    print(f"  - Errors: {result['errors']}")
    
    if result['errors'] > 0:
        print("\n❌ Errors encountered:")
        for err in result['error_messages'][:5]:
            print(f"  - {err}")