"""
Background worker for PUO Memo
Handles embedding generation and other async tasks
"""

import asyncio
import os
import logging
import signal
import sys
from datetime import datetime
import redis.asyncio as redis
import asyncpg
import json
from typing import Optional

from embeddings import EmbeddingService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class Worker:
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.embedding_service: Optional[EmbeddingService] = None
        self.running = True
        self.worker_type = os.getenv('WORKER_TYPE', 'embeddings')
        
    async def setup(self):
        """Initialize connections and services"""
        # Setup Redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.redis_client = await redis.from_url(redis_url, decode_responses=True)
        
        # Setup PostgreSQL
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is required")
            
        self.pg_pool = await asyncpg.create_pool(
            database_url,
            min_size=1,
            max_size=5,
            command_timeout=60
        )
        
        # Setup embedding service
        if self.worker_type == 'embeddings':
            self.embedding_service = EmbeddingService(self.pg_pool)
            await self.embedding_service.initialize()
        
        logger.info(f"Worker initialized: type={self.worker_type}")
        
    async def cleanup(self):
        """Clean up connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.pg_pool:
            await self.pg_pool.close()
        logger.info("Worker cleaned up")
        
    async def process_embedding_task(self, task_data: dict):
        """Process an embedding generation task"""
        try:
            memory_id = task_data['memory_id']
            content = task_data['content']
            title = task_data.get('title', '')
            
            logger.info(f"Processing embedding for memory {memory_id}")
            
            # Generate embedding
            combined_text = f"{title} {content}".strip()
            embedding = await self.embedding_service.generate_embedding(combined_text)
            
            # Store in database
            async with self.pg_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE memories 
                    SET embedding = $1,
                        embedding_model = $2,
                        embedding_generated_at = $3
                    WHERE id = $4
                """, embedding, self.embedding_service.model_name, 
                    datetime.utcnow(), memory_id)
            
            # Publish completion event
            await self.redis_client.publish(
                f"tenant:{task_data['tenant_id']}:events",
                json.dumps({
                    "type": "memory.embedding_complete",
                    "data": {
                        "memory_id": memory_id,
                        "embedding_model": self.embedding_service.model_name
                    },
                    "timestamp": datetime.utcnow().isoformat()
                })
            )
            
            logger.info(f"Embedding completed for memory {memory_id}")
            
        except Exception as e:
            logger.error(f"Error processing embedding task: {e}")
            # Re-queue with backoff
            task_data['retry_count'] = task_data.get('retry_count', 0) + 1
            if task_data['retry_count'] < 3:
                await asyncio.sleep(2 ** task_data['retry_count'])
                await self.redis_client.lpush(
                    'embedding_queue',
                    json.dumps(task_data)
                )
            else:
                logger.error(f"Max retries exceeded for memory {task_data.get('memory_id')}")
    
    async def run_embedding_worker(self):
        """Main loop for embedding worker"""
        logger.info("Starting embedding worker")
        
        while self.running:
            try:
                # Block waiting for tasks
                result = await self.redis_client.brpop(['embedding_queue'], timeout=5)
                
                if result:
                    _, task_json = result
                    task_data = json.loads(task_json)
                    await self.process_embedding_task(task_data)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(1)
    
    async def run(self):
        """Main worker loop"""
        if self.worker_type == 'embeddings':
            await self.run_embedding_worker()
        else:
            logger.error(f"Unknown worker type: {self.worker_type}")
            
    def handle_shutdown(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.running = False

async def main():
    """Main entry point"""
    worker = Worker()
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, worker.handle_shutdown)
    signal.signal(signal.SIGTERM, worker.handle_shutdown)
    
    try:
        await worker.setup()
        await worker.run()
    except Exception as e:
        logger.error(f"Worker failed: {e}")
        sys.exit(1)
    finally:
        await worker.cleanup()

if __name__ == "__main__":
    asyncio.run(main())