#!/usr/bin/env python3
"""
Minimal PUO Memo API Server for Railway Deployment
"""
import os
import json
from datetime import datetime
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Create FastAPI app
app = FastAPI(
    title="PUO Memo Platform API",
    version="2.0.0",
    description="Multi-tenant memory management platform"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
    environment: str = "production"

class DeploymentTest(BaseModel):
    status: str
    version: str
    message: str
    timestamp: str

# Routes
@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information"""
    return {
        "name": "PUO Memo Platform API",
        "version": "2.0.0",
        "status": "operational",
        "endpoints": {
            "health": "/health",
            "deployment_test": "/deployment-test",
            "auth": "/auth/*",
            "memories": "/api/v2/memories"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version="2.0.0",
        timestamp=datetime.utcnow().isoformat(),
        environment=os.getenv("RAILWAY_ENVIRONMENT", "production")
    )

@app.get("/deployment-test", response_model=DeploymentTest)
async def deployment_test():
    """Deployment test endpoint - proves new code is running"""
    return DeploymentTest(
        status="NEW DEPLOYMENT ACTIVE!",
        version="2.0.0",
        message="Railway deployment successful - new multi-tenant API is running",
        timestamp=datetime.utcnow().isoformat()
    )

@app.post("/auth/register")
async def register():
    """Placeholder auth endpoint to prove v2 is running"""
    return {
        "message": "Auth endpoint active - v2.0.0 multi-tenant API",
        "status": "registration_endpoint_ready"
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)