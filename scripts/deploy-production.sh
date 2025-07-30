#!/bin/bash
# Production deployment script with zero-downtime

set -e

DEPLOY_USER=${PROD_USER:-deploy}
DEPLOY_HOST=${PROD_HOST:-api.puo-memo.com}
DOCKER_IMAGE="coladapo/puo-memo:${GITHUB_SHA:-latest}"

echo "🚀 Deploying to production..."
echo "Image: $DOCKER_IMAGE"
echo "Host: $DEPLOY_HOST"

# Create deployment script with blue-green deployment
cat > /tmp/deploy-production.sh << 'EOF'
#!/bin/bash
set -e

IMAGE=$1
CURRENT_COLOR=$(docker ps --filter "name=puo-memo-blue" --format "{{.Names}}" | grep -q "blue" && echo "blue" || echo "green")
NEW_COLOR=$([ "$CURRENT_COLOR" = "blue" ] && echo "green" || echo "blue")
NEW_PORT=$([ "$NEW_COLOR" = "blue" ] && echo "8001" || echo "8002")

echo "Current: $CURRENT_COLOR, Deploying: $NEW_COLOR"

# Pull latest image
docker pull $IMAGE

# Start new container
docker run -d \
  --name puo-memo-$NEW_COLOR \
  --restart unless-stopped \
  -p $NEW_PORT:8000 \
  --env-file /opt/puo-memo/.env \
  -v /opt/puo-memo/data:/app/data \
  $IMAGE

# Health check new container
echo "Waiting for new container to be healthy..."
for i in {1..30}; do
  if curl -f http://localhost:$NEW_PORT/health >/dev/null 2>&1; then
    echo "✅ New container is healthy!"
    break
  fi
  sleep 1
done

# Update nginx to point to new container
sudo sed -i "s/127.0.0.1:800[12]/127.0.0.1:$NEW_PORT/g" /etc/nginx/sites-enabled/puo-memo
sudo nginx -s reload

# Wait a bit for connections to drain
sleep 10

# Stop old container
docker stop puo-memo-$CURRENT_COLOR || true
docker rm puo-memo-$CURRENT_COLOR || true

echo "✅ Production deployment complete!"
EOF

# Deploy via SSH
scp /tmp/deploy-production.sh $DEPLOY_USER@$DEPLOY_HOST:/tmp/
ssh $DEPLOY_USER@$DEPLOY_HOST "bash /tmp/deploy-production.sh $DOCKER_IMAGE"

echo "✅ Production deployment complete!"