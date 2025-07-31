#!/usr/bin/env python3
"""
PUO Memo File System Watcher
Keeps PUO Memo in sync with local project documentation
"""

import asyncio
import asyncpg
import hashlib
import json
from pathlib import Path
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import aiofiles
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PuoMemoSyncHandler(FileSystemEventHandler):
    """Handles file system events and syncs to PUO Memo"""
    
    def __init__(self, db_url, user_id):
        self.db_url = db_url
        self.user_id = user_id
        self.queue = asyncio.Queue()
        self.skip_patterns = {
            'node_modules', '.git', '__pycache__', '.venv', 'venv',
            '.next', 'dist', 'build', '.cache', '.DS_Store'
        }
        self.doc_patterns = {
            '.md', '.txt', 'README', 'NOTES', 'TODO', 'MEMO',
            'ARCHITECTURE', 'DESIGN', 'IMPLEMENTATION', 'GUIDE'
        }
    
    def should_process(self, path):
        """Check if file should be processed"""
        path_str = str(path)
        
        # Skip if in ignored directory
        if any(skip in path_str for skip in self.skip_patterns):
            return False
        
        # Check if it's a document file
        file_name = Path(path).name.upper()
        return (
            path.suffix.lower() in self.doc_patterns or
            any(pattern in file_name for pattern in self.doc_patterns)
        )
    
    def on_created(self, event):
        if not event.is_directory and self.should_process(Path(event.src_path)):
            asyncio.create_task(self.queue.put(('create', event.src_path)))
            logger.info(f"Queued for creation: {event.src_path}")
    
    def on_modified(self, event):
        if not event.is_directory and self.should_process(Path(event.src_path)):
            asyncio.create_task(self.queue.put(('update', event.src_path)))
            logger.info(f"Queued for update: {event.src_path}")
    
    def on_deleted(self, event):
        if not event.is_directory and self.should_process(Path(event.src_path)):
            asyncio.create_task(self.queue.put(('delete', event.src_path)))
            logger.info(f"Queued for deletion: {event.src_path}")

class PuoMemoSync:
    """Main sync service"""
    
    def __init__(self, db_url, user_id, watch_dirs):
        self.db_url = db_url
        self.user_id = user_id
        self.watch_dirs = watch_dirs
        self.handler = PuoMemoSyncHandler(db_url, user_id)
        self.observer = Observer()
        self.conn = None
    
    async def connect_db(self):
        """Connect to database"""
        self.conn = await asyncpg.connect(self.db_url, statement_cache_size=0)
    
    async def process_queue(self):
        """Process sync queue"""
        while True:
            try:
                action, file_path = await self.handler.queue.get()
                
                if action == 'create':
                    await self.create_memory(file_path)
                elif action == 'update':
                    await self.update_memory(file_path)
                elif action == 'delete':
                    await self.delete_memory(file_path)
                    
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
            
            await asyncio.sleep(0.1)  # Prevent overwhelming the system
    
    async def create_memory(self, file_path):
        """Create new memory from file"""
        try:
            path = Path(file_path)
            
            # Read content
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            # Skip empty files
            if not content.strip():
                return
            
            # Extract metadata
            relative_path = str(path).replace("/Users/wivak/puo-jects/", "")
            path_parts = relative_path.split("/")
            project_name = path_parts[1] if len(path_parts) > 1 else path_parts[0]
            
            title = f"{project_name}: {path.name}"
            content_hash = hashlib.md5(content.encode()).hexdigest()[:16]
            
            # Check if already exists
            exists = await self.conn.fetchval("""
                SELECT COUNT(*) FROM memories 
                WHERE user_id = $1 AND metadata->>'source_path' = $2
            """, self.user_id, str(path))
            
            if exists > 0:
                # Update instead
                await self.update_memory(file_path)
                return
            
            # Build tags
            tags = ["project-docs", "auto-sync", project_name.lower().replace(" ", "-")]
            
            # Add specific tags based on file name
            file_lower = path.name.lower()
            if "readme" in file_lower:
                tags.append("readme")
            if "todo" in file_lower:
                tags.append("todo")
            if "architecture" in file_lower:
                tags.append("architecture")
            
            # Create metadata
            metadata = {
                "source_path": str(path),
                "relative_path": relative_path,
                "content_hash": content_hash,
                "file_size": path.stat().st_size,
                "last_synced": datetime.utcnow().isoformat(),
                "sync_source": "file-watcher"
            }
            
            # Insert memory
            await self.conn.execute("""
                INSERT INTO memories (
                    user_id, content, title, tags, type, context,
                    metadata, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """, self.user_id, content, title, tags, 
                'documentation', 'auto-sync', json.dumps(metadata))
            
            logger.info(f"✅ Created memory: {title}")
            
        except Exception as e:
            logger.error(f"Error creating memory for {file_path}: {e}")
    
    async def update_memory(self, file_path):
        """Update existing memory"""
        try:
            path = Path(file_path)
            
            # Read new content
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                content = await f.read()
            
            content_hash = hashlib.md5(content.encode()).hexdigest()[:16]
            
            # Find existing memory
            memory = await self.conn.fetchrow("""
                SELECT id, metadata FROM memories 
                WHERE user_id = $1 AND metadata->>'source_path' = $2
            """, self.user_id, str(path))
            
            if not memory:
                # Create new if doesn't exist
                await self.create_memory(file_path)
                return
            
            # Update metadata
            metadata = json.loads(memory['metadata']) if memory['metadata'] else {}
            metadata['content_hash'] = content_hash
            metadata['last_synced'] = datetime.utcnow().isoformat()
            metadata['file_size'] = path.stat().st_size
            
            # Update memory
            await self.conn.execute("""
                UPDATE memories 
                SET content = $2, 
                    metadata = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            """, memory['id'], content, json.dumps(metadata))
            
            logger.info(f"📝 Updated memory: {path.name}")
            
        except Exception as e:
            logger.error(f"Error updating memory for {file_path}: {e}")
    
    async def delete_memory(self, file_path):
        """Mark memory as deleted (soft delete)"""
        try:
            # Find existing memory
            memory_id = await self.conn.fetchval("""
                SELECT id FROM memories 
                WHERE user_id = $1 AND metadata->>'source_path' = $2
            """, self.user_id, str(file_path))
            
            if memory_id:
                # Add deleted tag and update metadata
                await self.conn.execute("""
                    UPDATE memories 
                    SET tags = array_append(tags, 'deleted'),
                        metadata = jsonb_set(
                            metadata, 
                            '{sync_status}', 
                            '"deleted"'
                        ),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                """, memory_id)
                
                logger.info(f"🗑️  Marked as deleted: {Path(file_path).name}")
            
        except Exception as e:
            logger.error(f"Error deleting memory for {file_path}: {e}")
    
    async def start(self):
        """Start the sync service"""
        await self.connect_db()
        
        # Set up watchers for each directory
        for watch_dir in self.watch_dirs:
            if Path(watch_dir).exists():
                self.observer.schedule(
                    self.handler, 
                    watch_dir, 
                    recursive=True
                )
                logger.info(f"👁️  Watching: {watch_dir}")
        
        self.observer.start()
        logger.info("🚀 PUO Memo Sync Service Started")
        
        # Start processing queue
        await self.process_queue()
    
    def stop(self):
        """Stop the sync service"""
        self.observer.stop()
        self.observer.join()
        logger.info("🛑 PUO Memo Sync Service Stopped")

async def main():
    """Main entry point"""
    # Configuration
    DATABASE_URL = "postgresql://postgres.bcmsutoahlxqriealrjb:qFjjHGqin2XxxqMK@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
    USER_ID = "a8174d68-2ab7-4fed-9a5a-c208c850379b"  # Chris's ID
    
    WATCH_DIRS = [
        "/Users/wivak/puo-jects/active",
        "/Users/wivak/puo-jects/personal",
        "/Users/wivak/puo-jects/tools",
        "/Users/wivak/puo-jects/archive"
    ]
    
    # Create and start sync service
    sync_service = PuoMemoSync(DATABASE_URL, USER_ID, WATCH_DIRS)
    
    try:
        await sync_service.start()
    except KeyboardInterrupt:
        sync_service.stop()

if __name__ == "__main__":
    asyncio.run(main())