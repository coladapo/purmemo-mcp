#!/bin/bash
# Staging deployment script

set -e

DEPLOY_USER=${STAGING_USER:-deploy}
DEPLOY_HOST=${STAGING_HOST:-staging.puo-memo.com}
DOCKER_IMAGE="coladapo/puo-memo:${GITHUB_SHA:-latest}"

echo "🚀 Deploying to staging..."
echo "Image: $DOCKER_IMAGE"
echo "Host: $DEPLOY_HOST"

# Create deployment script
cat > /tmp/deploy-staging.sh << 'EOF'
#!/bin/bash
set -e

# Pull latest image
docker pull $1

# Stop existing container
docker stop puo-memo-staging || true
docker rm puo-memo-staging || true

# Start new container
docker run -d \
  --name puo-memo-staging \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file /opt/puo-memo/.env \
  -v /opt/puo-memo/data:/app/data \
  $1

# Health check
sleep 10
curl -f http://localhost:8000/health || exit 1

echo "✅ Deployment successful!"
EOF

# Deploy via SSH
scp /tmp/deploy-staging.sh $DEPLOY_USER@$DEPLOY_HOST:/tmp/
ssh $DEPLOY_USER@$DEPLOY_HOST "bash /tmp/deploy-staging.sh $DOCKER_IMAGE"

echo "✅ Staging deployment complete!"