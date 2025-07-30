# PUO Memo MCP Operational Runbooks

## Table of Contents
1. [Incident Response](#incident-response)
2. [Common Issues](#common-issues)
3. [Performance Troubleshooting](#performance-troubleshooting)
4. [Database Maintenance](#database-maintenance)
5. [Security Incidents](#security-incidents)
6. [Deployment Procedures](#deployment-procedures)
7. [Monitoring and Alerts](#monitoring-and-alerts)
8. [Backup and Recovery](#backup-and-recovery)

---

## Incident Response

### High CPU Usage
**Symptoms:** Server response times > 1s, CPU usage > 80%

**Resolution Steps:**
1. Check current load:
   ```bash
   htop
   docker stats
   ```

2. Identify heavy queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';
   ```

3. Scale horizontally if needed:
   ```bash
   docker-compose up -d --scale api=3
   ```

4. Clear Redis cache if corrupted:
   ```bash
   redis-cli FLUSHDB
   ```

### Memory Leak
**Symptoms:** Gradually increasing memory usage, OOM errors

**Resolution Steps:**
1. Identify memory usage by process:
   ```bash
   ps aux | sort -nk 6 | tail -20
   ```

2. Check for connection leaks:
   ```python
   # Run diagnostics
   python scripts/analysis/monitor_performance.py --check-connections
   ```

3. Restart affected services:
   ```bash
   docker-compose restart api mcp
   ```

4. Enable memory profiling:
   ```bash
   MEMORY_PROFILE=1 python start_server.py
   ```

---

## Common Issues

### Authentication Failures
**Error:** "Invalid API key" or "JWT token expired"

**Resolution:**
1. Verify environment variables:
   ```bash
   env | grep -E "(JWT_SECRET|API_KEY)"
   ```

2. Regenerate tokens:
   ```python
   python scripts/migrate_to_secure.py --regenerate-keys
   ```

3. Update client configurations:
   ```bash
   # Update Claude Desktop config
   python scripts/data/update_claude_config.py
   
   # Update Cursor config
   python scripts/data/update_cursor_config.py
   ```

### Database Connection Errors
**Error:** "psycopg2.OperationalError: could not connect to server"

**Resolution:**
1. Check database status:
   ```bash
   docker-compose ps postgres
   pg_isready -h localhost -p 5432
   ```

2. Verify connection pool:
   ```python
   python scripts/analysis/check_database_contents.py
   ```

3. Reset connection pool:
   ```bash
   docker-compose restart api mcp
   ```

4. Check connection limits:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   SHOW max_connections;
   ```

### Redis Connection Issues
**Error:** "Redis connection refused"

**Resolution:**
1. Check Redis status:
   ```bash
   redis-cli ping
   docker-compose ps redis
   ```

2. Verify Redis configuration:
   ```bash
   redis-cli CONFIG GET maxmemory
   redis-cli INFO memory
   ```

3. Clear Redis if full:
   ```bash
   redis-cli --scan --pattern "puo:*" | xargs redis-cli DEL
   ```

---

## Performance Troubleshooting

### Slow Search Queries
**Symptoms:** Search operations > 500ms

**Resolution:**
1. Analyze query performance:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM memories WHERE ... ;
   ```

2. Update statistics:
   ```sql
   ANALYZE memories;
   VACUUM ANALYZE;
   ```

3. Check indexes:
   ```sql
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_all_indexes
   WHERE schemaname = 'public'
   ORDER BY idx_scan;
   ```

4. Warm cache:
   ```python
   python scripts/analysis/performance_benchmark.py --warm-cache
   ```

### High Latency
**Symptoms:** P99 latency > 1s

**Resolution:**
1. Enable performance monitoring:
   ```python
   from src.core.performance_monitor import PerformanceMonitor
   monitor = PerformanceMonitor()
   monitor.start_monitoring()
   ```

2. Check slow operations:
   ```bash
   tail -f archive/logs/performance_metrics.log | grep -E "duration.*[0-9]{4,}"
   ```

3. Optimize connection pools:
   ```python
   python scripts/fix_performance_issues.py
   ```

---

## Database Maintenance

### Regular Maintenance
**Schedule:** Daily at 2 AM

1. Run vacuum:
   ```sql
   VACUUM ANALYZE;
   ```

2. Update statistics:
   ```sql
   ANALYZE;
   ```

3. Check table sizes:
   ```sql
   SELECT 
     schemaname,
     tablename,
     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   ```

### Index Maintenance
**Schedule:** Weekly

1. Identify unused indexes:
   ```sql
   SELECT 
     schemaname, 
     tablename, 
     indexname, 
     idx_scan
   FROM pg_stat_all_indexes
   WHERE schemaname = 'public' 
     AND idx_scan = 0
     AND indexname NOT LIKE '%_pkey';
   ```

2. Rebuild bloated indexes:
   ```sql
   REINDEX INDEX CONCURRENTLY index_name;
   ```

---

## Security Incidents

### Unauthorized Access Attempt
**Alert:** Multiple failed authentication attempts

**Response:**
1. Check logs for patterns:
   ```bash
   grep "401\|403" archive/logs/api_server.log | tail -100
   ```

2. Block suspicious IPs:
   ```bash
   # Add to nginx/firewall rules
   iptables -A INPUT -s SUSPICIOUS_IP -j DROP
   ```

3. Rotate compromised keys:
   ```python
   python scripts/migrate_to_secure.py --rotate-all-keys
   ```

4. Audit access logs:
   ```sql
   SELECT * FROM audit_logs 
   WHERE action LIKE '%auth%' 
   AND created_at > NOW() - INTERVAL '1 hour';
   ```

### Data Breach Response
**Alert:** Unauthorized data access detected

**Response:**
1. Isolate affected systems:
   ```bash
   docker-compose stop api mcp
   ```

2. Preserve evidence:
   ```bash
   # Backup logs
   tar -czf incident_$(date +%Y%m%d_%H%M%S).tar.gz archive/logs/
   
   # Dump audit trail
   pg_dump -t audit_logs > audit_backup_$(date +%Y%m%d).sql
   ```

3. Assess impact:
   ```sql
   -- Check affected users
   SELECT DISTINCT user_id FROM memories 
   WHERE updated_at > 'INCIDENT_TIME';
   ```

4. Notify affected users and reset credentials

---

## Deployment Procedures

### Blue-Green Deployment
**Prerequisites:** Docker Swarm or Kubernetes configured

1. Deploy to green environment:
   ```bash
   docker stack deploy -c docker-compose.prod.yml puo-memo-green
   ```

2. Run health checks:
   ```bash
   curl http://green.puo-memo.local/health
   python tests/production_test.py --target=green
   ```

3. Switch traffic:
   ```bash
   # Update load balancer
   ./infrastructure/scripts/switch-traffic.sh green
   ```

4. Monitor for issues:
   ```bash
   docker service logs -f puo-memo-green_api
   ```

5. Rollback if needed:
   ```bash
   ./infrastructure/scripts/switch-traffic.sh blue
   ```

### Database Migration
**Prerequisites:** Backup completed

1. Create backup:
   ```bash
   ./scripts/backup/backup.sh
   ```

2. Run migration:
   ```bash
   alembic upgrade head
   ```

3. Verify migration:
   ```sql
   SELECT version_num FROM alembic_version;
   ```

4. Test critical paths:
   ```bash
   pytest tests/test_database_operations.py
   ```

---

## Monitoring and Alerts

### Health Check Failures
**Alert:** Service health check failing

**Response:**
1. Check service status:
   ```bash
   curl -f http://localhost:8000/health || echo "API unhealthy"
   curl -f http://localhost:3000/health || echo "MCP unhealthy"
   ```

2. Check dependencies:
   ```bash
   # Database
   pg_isready
   
   # Redis
   redis-cli ping
   
   # External services
   curl -f https://api.openai.com/v1/models
   ```

3. Review recent deployments:
   ```bash
   git log --oneline -10
   docker images | head -5
   ```

### Performance Degradation
**Alert:** Response time > SLA

**Response:**
1. Check current metrics:
   ```bash
   curl http://localhost:8000/metrics
   ```

2. Identify bottlenecks:
   ```python
   python scripts/analysis/enhanced_monitoring.py --real-time
   ```

3. Scale if needed:
   ```bash
   kubectl scale deployment api --replicas=5
   ```

---

## Backup and Recovery

### Backup Failure
**Alert:** Nightly backup failed

**Response:**
1. Check backup logs:
   ```bash
   tail -100 /var/log/backup.log
   ```

2. Verify disk space:
   ```bash
   df -h /backup
   ```

3. Run manual backup:
   ```bash
   ./scripts/backup/backup.sh --manual
   ```

4. Test backup integrity:
   ```bash
   pg_restore --list backup_file.dump
   ```

### Disaster Recovery
**Scenario:** Complete system failure

**Recovery Steps:**
1. Provision new infrastructure:
   ```bash
   cd infrastructure/terraform
   terraform apply
   ```

2. Restore database:
   ```bash
   ./scripts/backup/restore.sh --latest
   ```

3. Restore configuration:
   ```bash
   # Copy environment files
   scp .env.prod user@new-server:/app/.env
   
   # Restore secrets
   kubectl apply -f k8s/secrets.yaml
   ```

4. Verify system:
   ```bash
   python tests/production_test_suite.py --comprehensive
   ```

5. Update DNS:
   ```bash
   # Point domain to new infrastructure
   ./infrastructure/scripts/update-dns.sh
   ```

---

## Appendix

### Emergency Contacts
- **On-call Engineer:** Check PagerDuty
- **Database Admin:** dba@company.com
- **Security Team:** security@company.com
- **Cloud Provider Support:** 1-800-XXX-XXXX

### Useful Commands
```bash
# Quick diagnostics
docker-compose ps
redis-cli INFO
psql -c "SELECT version();"

# Performance check
python scripts/analysis/comprehensive_audit.py

# Security audit
python tests/test_security_comprehensive.py

# Full system test
pytest tests/ -v --cov=src
```

### Reference Documentation
- [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md)
- [SECURITY_GUIDE.md](./SECURITY_GUIDE.md)
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- [SYSTEM_HEALTH_CHECKLIST.md](./SYSTEM_HEALTH_CHECKLIST.md)