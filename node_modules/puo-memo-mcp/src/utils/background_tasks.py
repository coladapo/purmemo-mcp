"""
Background task management for PUO Memo
Handles asynchronous operations like embedding generation, entity extraction, etc.
"""

import asyncio
import logging
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid
from collections import deque
import traceback

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class BackgroundTask:
    """Represents a background task"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    task_type: str = ""
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    traceback: Optional[str] = None
    progress: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            'id': self.id,
            'name': self.name,
            'task_type': self.task_type,
            'priority': self.priority.name,
            'status': self.status.value,
            'created_at': self.created_at.isoformat(),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'progress': self.progress,
            'error': self.error,
            'metadata': self.metadata
        }


class TaskQueue:
    """Priority-based task queue with async execution"""
    
    def __init__(self, max_workers: int = 5):
        self.max_workers = max_workers
        self.tasks: Dict[str, BackgroundTask] = {}
        self.pending_queue: List[deque] = [
            deque() for _ in range(len(TaskPriority))
        ]
        self.workers: List[asyncio.Task] = []
        self.running = False
        self.task_handlers: Dict[str, Callable] = {}
        
    def register_handler(self, task_type: str, handler: Callable):
        """Register a handler for a specific task type"""
        self.task_handlers[task_type] = handler
        logger.info(f"Registered handler for task type: {task_type}")
        
    async def start(self):
        """Start the task queue workers"""
        if self.running:
            return
            
        self.running = True
        
        # Start worker tasks
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self.workers.append(worker)
            
        logger.info(f"Started {self.max_workers} background workers")
        
    async def stop(self):
        """Stop the task queue"""
        self.running = False
        
        # Cancel all workers
        for worker in self.workers:
            worker.cancel()
            
        # Wait for workers to finish
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        
        logger.info("Background task queue stopped")
        
    async def add_task(
        self,
        task_type: str,
        name: str,
        priority: TaskPriority = TaskPriority.NORMAL,
        **kwargs
    ) -> str:
        """Add a task to the queue"""
        if task_type not in self.task_handlers:
            raise ValueError(f"No handler registered for task type: {task_type}")
            
        task = BackgroundTask(
            name=name,
            task_type=task_type,
            priority=priority,
            metadata=kwargs
        )
        
        self.tasks[task.id] = task
        self.pending_queue[priority.value].append(task.id)
        
        logger.info(f"Added task {task.id}: {name} (priority: {priority.name})")
        return task.id
        
    async def _worker(self, worker_name: str):
        """Worker coroutine that processes tasks"""
        logger.info(f"{worker_name} started")
        
        while self.running:
            try:
                # Get next task from highest priority queue
                task_id = None
                for priority in reversed(range(len(TaskPriority))):
                    if self.pending_queue[priority]:
                        task_id = self.pending_queue[priority].popleft()
                        break
                        
                if not task_id:
                    # No tasks available, wait a bit
                    await asyncio.sleep(0.1)
                    continue
                    
                task = self.tasks.get(task_id)
                if not task:
                    continue
                    
                # Update task status
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                
                logger.info(f"{worker_name} processing task {task.id}: {task.name}")
                
                try:
                    # Get handler and execute
                    handler = self.task_handlers[task.task_type]
                    
                    # Create progress callback
                    async def update_progress(progress: float):
                        task.progress = progress
                        
                    # Execute handler with metadata
                    result = await handler(
                        task_id=task.id,
                        progress_callback=update_progress,
                        **task.metadata
                    )
                    
                    # Update task with result
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = datetime.now()
                    task.result = result
                    task.progress = 1.0
                    
                    logger.info(f"{worker_name} completed task {task.id}")
                    
                except asyncio.CancelledError:
                    task.status = TaskStatus.CANCELLED
                    raise
                    
                except Exception as e:
                    # Handle task failure
                    task.status = TaskStatus.FAILED
                    task.completed_at = datetime.now()
                    task.error = str(e)
                    task.traceback = traceback.format_exc()
                    
                    logger.error(f"{worker_name} task {task.id} failed: {e}")
                    
            except asyncio.CancelledError:
                break
                
            except Exception as e:
                logger.error(f"{worker_name} error: {e}")
                await asyncio.sleep(1)  # Prevent tight loop on errors
                
        logger.info(f"{worker_name} stopped")
        
    def get_task(self, task_id: str) -> Optional[BackgroundTask]:
        """Get task by ID"""
        return self.tasks.get(task_id)
        
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task status as dictionary"""
        task = self.tasks.get(task_id)
        return task.to_dict() if task else None
        
    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List tasks with optional status filter"""
        tasks = list(self.tasks.values())
        
        if status:
            tasks = [t for t in tasks if t.status == status]
            
        # Sort by created_at descending
        tasks.sort(key=lambda t: t.created_at, reverse=True)
        
        return [t.to_dict() for t in tasks[:limit]]
        
    def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics"""
        status_counts = {}
        for status in TaskStatus:
            status_counts[status.value] = sum(
                1 for t in self.tasks.values() if t.status == status
            )
            
        queue_lengths = {}
        for priority in TaskPriority:
            queue_lengths[priority.name] = len(self.pending_queue[priority.value])
            
        return {
            'total_tasks': len(self.tasks),
            'status_counts': status_counts,
            'queue_lengths': queue_lengths,
            'workers': self.max_workers,
            'running': self.running
        }


# Global task queue instance
task_queue = TaskQueue()


# Example task handlers for PUO Memo

async def generate_embedding_task(
    task_id: str,
    progress_callback: Callable,
    memory_id: str,
    content: str,
    ai_client,
    db_connection,
    **kwargs
):
    """Background task to generate embeddings"""
    await progress_callback(0.1)
    
    # Generate embedding
    embedding = await ai_client.generate_embedding(content)
    await progress_callback(0.5)
    
    if embedding:
        # Store in database
        embedding_str = '[' + ','.join(str(x) for x in embedding) + ']'
        
        async with db_connection.get_connection() as conn:
            await conn.execute("""
                UPDATE memory_entities
                SET embedding = $1::vector,
                    embedding_model = $2,
                    embedding_generated_at = NOW()
                WHERE id = $3
            """, embedding_str, ai_client.embedding_model_name, memory_id)
            
        await progress_callback(1.0)
        
        return {
            'memory_id': memory_id,
            'embedding_size': len(embedding),
            'model': ai_client.embedding_model_name
        }
    else:
        raise Exception("Failed to generate embedding")


async def extract_entities_task(
    task_id: str,
    progress_callback: Callable,
    memory_id: str,
    content: str,
    entity_extractor,
    **kwargs
):
    """Background task to extract entities"""
    await progress_callback(0.1)
    
    # Extract entities
    entities, relations = await entity_extractor.extract_entities_and_relations(content)
    await progress_callback(0.8)
    
    # Store results (would need entity manager here)
    result = {
        'memory_id': memory_id,
        'entities_count': len(entities),
        'relations_count': len(relations),
        'entities': [e.name for e in entities]
    }
    
    await progress_callback(1.0)
    return result


async def process_attachment_task(
    task_id: str,
    progress_callback: Callable,
    attachment_id: str,
    file_data: bytes,
    mime_type: str,
    processor,
    **kwargs
):
    """Background task to process attachments"""
    await progress_callback(0.1)
    
    # Process based on type
    if mime_type.startswith('image/'):
        await processor._process_image(attachment_id, file_data, mime_type)
    elif mime_type == 'application/pdf':
        await processor._process_pdf(attachment_id, file_data)
    elif mime_type.startswith('text/'):
        await processor._process_text(attachment_id, file_data, mime_type)
        
    await progress_callback(1.0)
    
    return {
        'attachment_id': attachment_id,
        'mime_type': mime_type,
        'processed': True
    }