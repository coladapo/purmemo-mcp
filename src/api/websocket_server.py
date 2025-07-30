"""
WebSocket server for real-time synchronization
Provides real-time updates for memory operations across connected clients
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional, Any
from contextlib import asynccontextmanager
import uuid

from fastapi import WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.routing import APIRouter
import redis.asyncio as redis
from pydantic import BaseModel, Field

from .auth import get_current_user_ws, User

logger = logging.getLogger(__name__)

# WebSocket message types
class MessageType:
    # Client -> Server
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    PING = "ping"
    
    # Server -> Client
    MEMORY_CREATED = "memory.created"
    MEMORY_UPDATED = "memory.updated"
    MEMORY_DELETED = "memory.deleted"
    MEMORY_EMBEDDING_COMPLETE = "memory.embedding_complete"
    TENANT_USER_JOINED = "tenant.user_joined"
    TENANT_USER_LEFT = "tenant.user_left"
    ERROR = "error"
    PONG = "pong"
    SUBSCRIBED = "subscribed"
    UNSUBSCRIBED = "unsubscribed"


class WebSocketMessage(BaseModel):
    """Base WebSocket message structure"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Optional[Dict[str, Any]] = None


class SubscriptionRequest(BaseModel):
    """Subscription request from client"""
    channels: list[str]  # e.g., ["memories", "tenant.updates"]


class ConnectionManager:
    """Manages WebSocket connections and subscriptions"""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, Any]] = {}
        self.user_connections: Dict[str, Set[str]] = {}  # user_id -> connection_ids
        self.tenant_connections: Dict[str, Set[str]] = {}  # tenant_id -> connection_ids
        self.subscriptions: Dict[str, Set[str]] = {}  # connection_id -> channels
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
    
    async def initialize(self, redis_url: str):
        """Initialize Redis connection for pub/sub"""
        self.redis_client = await redis.from_url(redis_url)
        
        # Start listening to Redis pub/sub
        self.pubsub_task = asyncio.create_task(self._redis_listener())
    
    async def cleanup(self):
        """Cleanup resources"""
        if self.pubsub_task:
            self.pubsub_task.cancel()
            try:
                await self.pubsub_task
            except asyncio.CancelledError:
                pass
        
        if self.redis_client:
            await self.redis_client.close()
    
    async def connect(
        self,
        websocket: WebSocket,
        user: User,
        connection_id: str
    ):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        async with self._lock:
            # Store connection info
            self.active_connections[connection_id] = {
                "websocket": websocket,
                "user": user,
                "connected_at": datetime.utcnow()
            }
            
            # Track by user
            if user.id not in self.user_connections:
                self.user_connections[user.id] = set()
            self.user_connections[user.id].add(connection_id)
            
            # Track by tenant
            if user.tenant_id not in self.tenant_connections:
                self.tenant_connections[user.tenant_id] = set()
            self.tenant_connections[user.tenant_id].add(connection_id)
            
            # Initialize subscriptions
            self.subscriptions[connection_id] = set()
        
        # Notify tenant about new user
        await self._broadcast_to_tenant(
            user.tenant_id,
            MessageType.TENANT_USER_JOINED,
            {
                "user_id": user.id,
                "user_name": user.full_name,
                "connection_id": connection_id
            },
            exclude_connection=connection_id
        )
        
        logger.info(f"User {user.email} connected (connection: {connection_id})")
    
    async def disconnect(self, connection_id: str):
        """Handle WebSocket disconnection"""
        async with self._lock:
            if connection_id not in self.active_connections:
                return
            
            conn_info = self.active_connections[connection_id]
            user = conn_info["user"]
            
            # Remove from active connections
            del self.active_connections[connection_id]
            
            # Remove from user connections
            if user.id in self.user_connections:
                self.user_connections[user.id].discard(connection_id)
                if not self.user_connections[user.id]:
                    del self.user_connections[user.id]
            
            # Remove from tenant connections
            if user.tenant_id in self.tenant_connections:
                self.tenant_connections[user.tenant_id].discard(connection_id)
                if not self.tenant_connections[user.tenant_id]:
                    del self.tenant_connections[user.tenant_id]
            
            # Clean up subscriptions
            if connection_id in self.subscriptions:
                del self.subscriptions[connection_id]
        
        # Notify tenant about user leaving
        await self._broadcast_to_tenant(
            user.tenant_id,
            MessageType.TENANT_USER_LEFT,
            {
                "user_id": user.id,
                "user_name": user.full_name,
                "connection_id": connection_id
            }
        )
        
        logger.info(f"User {user.email} disconnected (connection: {connection_id})")
    
    async def subscribe(self, connection_id: str, channels: list[str]):
        """Subscribe connection to channels"""
        async with self._lock:
            if connection_id not in self.subscriptions:
                return
            
            self.subscriptions[connection_id].update(channels)
        
        # Send confirmation
        await self.send_to_connection(
            connection_id,
            MessageType.SUBSCRIBED,
            {"channels": channels}
        )
    
    async def unsubscribe(self, connection_id: str, channels: list[str]):
        """Unsubscribe connection from channels"""
        async with self._lock:
            if connection_id not in self.subscriptions:
                return
            
            for channel in channels:
                self.subscriptions[connection_id].discard(channel)
        
        # Send confirmation
        await self.send_to_connection(
            connection_id,
            MessageType.UNSUBSCRIBED,
            {"channels": channels}
        )
    
    async def send_to_connection(
        self,
        connection_id: str,
        message_type: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Send message to specific connection"""
        if connection_id not in self.active_connections:
            return
        
        websocket = self.active_connections[connection_id]["websocket"]
        message = WebSocketMessage(type=message_type, data=data)
        
        try:
            await websocket.send_json(message.dict())
        except Exception as e:
            logger.error(f"Error sending to connection {connection_id}: {e}")
            await self.disconnect(connection_id)
    
    async def send_to_user(
        self,
        user_id: str,
        message_type: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Send message to all connections of a user"""
        connection_ids = self.user_connections.get(user_id, set()).copy()
        
        for conn_id in connection_ids:
            await self.send_to_connection(conn_id, message_type, data)
    
    async def broadcast_to_channel(
        self,
        channel: str,
        message_type: str,
        data: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None
    ):
        """Broadcast message to all subscribers of a channel"""
        # Find all connections subscribed to this channel
        recipients = []
        
        for conn_id, channels in self.subscriptions.items():
            if channel in channels:
                conn_info = self.active_connections.get(conn_id)
                if conn_info:
                    # Filter by tenant if specified
                    if tenant_id and conn_info["user"].tenant_id != tenant_id:
                        continue
                    recipients.append(conn_id)
        
        # Send to all recipients
        for conn_id in recipients:
            await self.send_to_connection(conn_id, message_type, data)
    
    async def _broadcast_to_tenant(
        self,
        tenant_id: str,
        message_type: str,
        data: Optional[Dict[str, Any]] = None,
        exclude_connection: Optional[str] = None
    ):
        """Broadcast message to all connections in a tenant"""
        connection_ids = self.tenant_connections.get(tenant_id, set()).copy()
        
        for conn_id in connection_ids:
            if conn_id != exclude_connection:
                await self.send_to_connection(conn_id, message_type, data)
    
    async def _redis_listener(self):
        """Listen for Redis pub/sub messages"""
        if not self.redis_client:
            return
        
        pubsub = self.redis_client.pubsub()
        
        try:
            # Subscribe to channels
            await pubsub.subscribe(
                "memories:created",
                "memories:updated",
                "memories:deleted",
                "memories:embedding_complete"
            )
            
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await self._handle_redis_message(
                        message["channel"].decode(),
                        message["data"]
                    )
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Redis listener error: {e}")
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()
    
    async def _handle_redis_message(self, channel: str, data: bytes):
        """Handle message from Redis pub/sub"""
        try:
            message_data = json.loads(data.decode())
            tenant_id = message_data.get("tenant_id")
            
            # Map Redis channels to WebSocket message types
            channel_mapping = {
                "memories:created": MessageType.MEMORY_CREATED,
                "memories:updated": MessageType.MEMORY_UPDATED,
                "memories:deleted": MessageType.MEMORY_DELETED,
                "memories:embedding_complete": MessageType.MEMORY_EMBEDDING_COMPLETE
            }
            
            message_type = channel_mapping.get(channel)
            if not message_type:
                return
            
            # Broadcast to appropriate subscribers
            await self.broadcast_to_channel(
                "memories",
                message_type,
                message_data,
                tenant_id=tenant_id
            )
            
        except Exception as e:
            logger.error(f"Error handling Redis message: {e}")
    
    async def publish_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        tenant_id: str
    ):
        """Publish event to Redis for distribution"""
        if not self.redis_client:
            return
        
        # Add tenant context
        data["tenant_id"] = tenant_id
        data["timestamp"] = datetime.utcnow().isoformat()
        
        # Map event types to Redis channels
        channel_mapping = {
            MessageType.MEMORY_CREATED: "memories:created",
            MessageType.MEMORY_UPDATED: "memories:updated",
            MessageType.MEMORY_DELETED: "memories:deleted",
            MessageType.MEMORY_EMBEDDING_COMPLETE: "memories:embedding_complete"
        }
        
        channel = channel_mapping.get(event_type)
        if channel:
            await self.redis_client.publish(
                channel,
                json.dumps(data)
            )


# Global connection manager instance
manager = ConnectionManager()


# WebSocket router
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time updates"""
    connection_id = str(uuid.uuid4())
    user = None
    
    try:
        # Authenticate user
        user = await get_current_user_ws(token)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return
        
        # Connect
        await manager.connect(websocket, user, connection_id)
        
        # Main message loop
        while True:
            try:
                # Receive message
                data = await websocket.receive_json()
                message = WebSocketMessage(**data)
                
                # Handle different message types
                if message.type == MessageType.SUBSCRIBE:
                    sub_request = SubscriptionRequest(**message.data)
                    await manager.subscribe(connection_id, sub_request.channels)
                
                elif message.type == MessageType.UNSUBSCRIBE:
                    sub_request = SubscriptionRequest(**message.data)
                    await manager.unsubscribe(connection_id, sub_request.channels)
                
                elif message.type == MessageType.PING:
                    await manager.send_to_connection(
                        connection_id,
                        MessageType.PONG,
                        {"timestamp": datetime.utcnow().isoformat()}
                    )
                
                else:
                    await manager.send_to_connection(
                        connection_id,
                        MessageType.ERROR,
                        {"message": f"Unknown message type: {message.type}"}
                    )
                    
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                await manager.send_to_connection(
                    connection_id,
                    MessageType.ERROR,
                    {"message": "Invalid JSON"}
                )
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                await manager.send_to_connection(
                    connection_id,
                    MessageType.ERROR,
                    {"message": "Internal error"}
                )
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        await manager.disconnect(connection_id)


@asynccontextmanager
async def websocket_lifespan(redis_url: str):
    """Lifecycle manager for WebSocket server"""
    # Startup
    await manager.initialize(redis_url)
    
    yield
    
    # Shutdown
    await manager.cleanup()