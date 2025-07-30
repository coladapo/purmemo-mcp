# PUO Memo MCP Disaster Recovery Plan

## Executive Summary
This document outlines the disaster recovery (DR) procedures for PUO Memo MCP. Our target Recovery Time Objective (RTO) is **1 hour** and Recovery Point Objective (RPO) is **1 hour**.

## Table of Contents
1. [Risk Assessment](#risk-assessment)
2. [Recovery Objectives](#recovery-objectives)
3. [Backup Strategy](#backup-strategy)
4. [Recovery Procedures](#recovery-procedures)
5. [Testing Plan](#testing-plan)
6. [Communication Plan](#communication-plan)
7. [Post-Recovery](#post-recovery)

---

## Risk Assessment

### Critical Components
| Component | Priority | Impact if Lost | Recovery Complexity |
|-----------|----------|----------------|-------------------|
| PostgreSQL Database | Critical | Complete data loss | Medium |
| Redis Cache | High | Performance degradation | Low |
| Application Code | Critical | Service unavailable | Low |
| Configuration/Secrets | Critical | Service unavailable | Medium |
| User Attachments (GCS) | High | Feature degradation | Medium |
| SSL Certificates | Critical | Service unavailable | Low |

### Disaster Scenarios
1. **Data Center Failure**: Complete loss of primary infrastructure
2. **Database Corruption**: Data integrity compromised
3. **Cyber Attack**: Ransomware or data breach
4. **Human Error**: Accidental deletion or misconfiguration
5. **Natural Disaster**: Physical infrastructure damage

---

## Recovery Objectives

### Service Level Targets
- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 1 hour
- **Service Availability**: 99.9% (8.76 hours downtime/year)

### Priority Order
1. **Tier 1** (0-15 min): Core API authentication and health checks
2. **Tier 2** (15-30 min): Memory storage and retrieval
3. **Tier 3** (30-45 min): Search and entity extraction
4. **Tier 4** (45-60 min): Attachments and advanced features

---

## Backup Strategy

### Automated Backups

#### Database Backups
```yaml
Schedule:
  Full: Daily at 02:00 UTC
  Incremental: Every hour
  WAL Archives: Continuous

Retention:
  Hourly: 24 hours
  Daily: 7 days
  Weekly: 4 weeks
  Monthly: 12 months

Storage:
  Primary: Google Cloud Storage (us-central1)
  Secondary: AWS S3 (us-east-1)
  Tertiary: On-premise NAS
```

#### Configuration Backups
```bash
# Backup script runs every 6 hours
#!/bin/bash
BACKUP_DIR="/backup/config/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup configurations
cp -r /app/.env* $BACKUP_DIR/
cp -r /app/config/ $BACKUP_DIR/
cp -r /etc/nginx/ $BACKUP_DIR/

# Backup secrets
kubectl get secrets -o yaml > $BACKUP_DIR/k8s-secrets.yaml

# Encrypt and upload
tar -czf - $BACKUP_DIR | gpg --encrypt -r backup@company.com | \
  gsutil cp - gs://puo-memo-backups/config/
```

### Backup Verification
```python
# Daily verification job
import subprocess
from datetime import datetime, timedelta

def verify_backups():
    # Check latest backup exists
    latest = datetime.now() - timedelta(hours=1)
    backup_name = f"puo_memo_{latest.strftime('%Y%m%d_%H')}.dump"
    
    # Verify backup integrity
    result = subprocess.run([
        "pg_restore", "--list", f"/backup/{backup_name}"
    ], capture_output=True)
    
    if result.returncode != 0:
        alert_oncall("Backup verification failed")
        return False
    
    # Test restore to staging
    subprocess.run([
        "./scripts/backup/restore.sh",
        "--target", "staging",
        "--backup", backup_name,
        "--verify-only"
    ])
    
    return True
```

---

## Recovery Procedures

### Phase 1: Assessment (0-10 minutes)

1. **Identify Failure Type**
   ```bash
   # Quick diagnostics
   ./scripts/dr/assess-failure.sh
   ```

2. **Activate DR Team**
   - Send alert via PagerDuty
   - Open emergency Slack channel #dr-active
   - Start incident timer

3. **Determine Recovery Strategy**
   - Full recovery needed?
   - Partial recovery sufficient?
   - Failover to secondary region?

### Phase 2: Infrastructure Recovery (10-30 minutes)

#### Option A: Cloud Provider Failure
```bash
# Switch to backup provider
cd infrastructure/terraform/disaster-recovery

# Update provider to backup region
export TF_VAR_provider="aws"
export TF_VAR_region="us-east-1"

# Provision infrastructure
terraform init
terraform apply -auto-approve

# Output new endpoints
terraform output -json > new_endpoints.json
```

#### Option B: Corrupted Infrastructure
```bash
# Destroy corrupted resources
terraform destroy -target=module.corrupted_component

# Recreate from scratch
terraform apply

# Restore from configuration backup
gsutil cp gs://puo-memo-backups/config/latest.tar.gz.gpg - | \
  gpg --decrypt | tar -xzf -
```

### Phase 3: Data Recovery (20-40 minutes)

#### Database Recovery
```bash
#!/bin/bash
# restore-database.sh

# 1. Find latest valid backup
LATEST_BACKUP=$(gsutil ls gs://puo-memo-backups/postgres/ | \
  grep "$(date +%Y%m%d)" | sort -r | head -1)

# 2. Download and decrypt
gsutil cp $LATEST_BACKUP - | gpg --decrypt > restore.dump

# 3. Create new database
export PGPASSWORD=$POSTGRES_PASSWORD
createdb -h $NEW_DB_HOST -U postgres puo_memo_restore

# 4. Restore data
pg_restore -h $NEW_DB_HOST -U postgres -d puo_memo_restore \
  --no-owner --no-privileges restore.dump

# 5. Verify restoration
psql -h $NEW_DB_HOST -U postgres -d puo_memo_restore \
  -c "SELECT COUNT(*) FROM memories;"

# 6. Apply WAL logs for point-in-time recovery
if [ "$POINT_IN_TIME" ]; then
  pg_wal_replay -h $NEW_DB_HOST -d puo_memo_restore \
    --target-time="$POINT_IN_TIME"
fi

# 7. Switch application to new database
kubectl set env deployment/api deployment/mcp \
  DATABASE_URL="postgresql://postgres:$PGPASSWORD@$NEW_DB_HOST/puo_memo_restore"
```

#### Redis Recovery
```bash
# Redis is less critical - can start fresh
redis-cli -h $NEW_REDIS_HOST FLUSHDB

# Optional: Restore from RDB backup if available
if [ -f /backup/redis/dump.rdb ]; then
  redis-cli -h $NEW_REDIS_HOST --rdb /backup/redis/dump.rdb
fi

# Warm cache with critical data
python scripts/analysis/performance_benchmark.py --warm-cache
```

### Phase 4: Application Recovery (30-50 minutes)

```bash
#!/bin/bash
# deploy-dr-application.sh

# 1. Update DNS to point to DR environment
./infrastructure/scripts/update-dns.sh --target=dr

# 2. Deploy application containers
docker pull gcr.io/puo-memo/api:latest
docker pull gcr.io/puo-memo/mcp:latest

# 3. Start services with DR configuration
docker-compose -f docker-compose.dr.yml up -d

# 4. Run health checks
for service in api mcp; do
  echo "Checking $service..."
  curl -f http://localhost:$(docker port puo-memo-$service 8000)/health || \
    echo "WARNING: $service not healthy"
done

# 5. Verify core functionality
python tests/dr_verification.py

# 6. Enable monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

### Phase 5: Validation (45-60 minutes)

```python
# dr_verification.py
import requests
import time
from datetime import datetime

class DRValidator:
    def __init__(self, base_url):
        self.base_url = base_url
        self.results = []
    
    def validate_all(self):
        """Run all validation checks"""
        tests = [
            self.test_authentication,
            self.test_memory_operations,
            self.test_search,
            self.test_attachments,
            self.test_integrations
        ]
        
        for test in tests:
            try:
                result = test()
                self.results.append({
                    'test': test.__name__,
                    'passed': result,
                    'timestamp': datetime.now()
                })
            except Exception as e:
                self.results.append({
                    'test': test.__name__,
                    'passed': False,
                    'error': str(e)
                })
        
        return all(r['passed'] for r in self.results)
    
    def test_authentication(self):
        """Verify authentication works"""
        response = requests.post(
            f"{self.base_url}/auth/token",
            json={"username": "test", "password": "test"}
        )
        return response.status_code == 200
    
    def test_memory_operations(self):
        """Test CRUD operations"""
        # Create
        create_resp = requests.post(
            f"{self.base_url}/memory",
            json={"content": "DR test memory"},
            headers=self._get_auth_headers()
        )
        
        if create_resp.status_code != 201:
            return False
        
        memory_id = create_resp.json()['id']
        
        # Read
        read_resp = requests.get(
            f"{self.base_url}/memory/{memory_id}",
            headers=self._get_auth_headers()
        )
        
        return read_resp.status_code == 200
    
    def generate_report(self):
        """Generate DR validation report"""
        report = f"""
# Disaster Recovery Validation Report
Generated: {datetime.now()}

## Test Results
"""
        for result in self.results:
            status = "✅ PASS" if result['passed'] else "❌ FAIL"
            report += f"- {result['test']}: {status}\n"
            if not result['passed'] and 'error' in result:
                report += f"  Error: {result['error']}\n"
        
        overall = "✅ All tests passed" if all(r['passed'] for r in self.results) else "❌ Some tests failed"
        report += f"\n## Overall Status: {overall}\n"
        
        return report
```

---

## Testing Plan

### Monthly DR Drills
```yaml
Schedule: First Saturday of each month, 10:00 UTC
Duration: 2-4 hours
Type: Rotating scenarios

Scenarios:
  January: Database corruption
  February: Region failure  
  March: Cyber attack simulation
  April: Human error recovery
  May: Full data center loss
  June: Partial service degradation
  July: Network partition
  August: Storage failure
  September: Authentication system failure
  October: Third-party service outage
  November: Configuration loss
  December: Complete disaster simulation
```

### Test Procedure
1. **Announce drill** (T-24 hours)
2. **Snapshot production** (T-1 hour)
3. **Execute failure scenario** (T+0)
4. **Time recovery process** (T+0 to completion)
5. **Document issues** (Throughout)
6. **Debrief meeting** (T+1 day)
7. **Update procedures** (T+1 week)

---

## Communication Plan

### Internal Communication
```python
# alert_framework.py
class DRCommunicator:
    def __init__(self):
        self.channels = {
            'slack': SlackClient(),
            'pagerduty': PagerDutyClient(),
            'email': EmailClient(),
            'sms': TwilioClient()
        }
    
    def declare_incident(self, severity='high'):
        """Initiate DR communication cascade"""
        
        # 1. Page on-call engineer
        self.channels['pagerduty'].trigger(
            service='puo-memo',
            severity=severity,
            message="DR Event Triggered"
        )
        
        # 2. Create Slack channel
        channel = self.channels['slack'].create_channel(
            name=f"dr-{datetime.now().strftime('%Y%m%d-%H%M')}",
            purpose="Active DR event coordination"
        )
        
        # 3. Send initial notifications
        message = self._generate_initial_message()
        
        for role in ['engineering', 'management', 'support']:
            self.notify_team(role, message)
        
        # 4. Start status page update
        self.update_status_page('investigating')
```

### External Communication

#### Customer Notification Templates
```markdown
# Initial Notification (T+15 minutes)
Subject: PUO Memo Service Disruption

We are currently experiencing a service disruption affecting PUO Memo. 
Our team has been notified and is actively working on restoration.

Current Status: Investigating
Started: [TIMESTAMP]
Affected Services: [LIST]

Updates will be posted at: https://status.puo-memo.com

# Progress Update (Every 30 minutes)
Subject: PUO Memo Service Update

Recovery Progress:
- Infrastructure: [STATUS]
- Data Recovery: [STATUS]  
- Service Restoration: [STATUS]

Estimated Time to Resolution: [ESTIMATE]

# Resolution Notice
Subject: PUO Memo Service Restored

All PUO Memo services have been restored to full functionality.

Incident Duration: [START] - [END]
Root Cause: [BRIEF DESCRIPTION]

A detailed post-mortem will be published within 48 hours.
```

---

## Post-Recovery

### Immediate Actions (0-4 hours)
1. **Verify all services operational**
   ```bash
   python tests/production_test_suite.py --comprehensive
   ```

2. **Monitor for anomalies**
   ```bash
   # Enhanced monitoring for 24 hours
   python scripts/analysis/enhanced_monitoring.py --alert-threshold=low
   ```

3. **Backup verification**
   ```bash
   # Ensure backups resume
   ./scripts/backup/verify-schedule.sh
   ```

### Short-term Actions (4-48 hours)
1. **Incident report**
   - Timeline of events
   - Actions taken
   - Resources used
   - Decisions made

2. **Customer communication**
   - Service restoration notice
   - Preliminary RCA
   - Credit/compensation if applicable

3. **Team debrief**
   - What worked well
   - What needs improvement
   - Action items

### Long-term Actions (2-30 days)
1. **Detailed post-mortem**
   ```markdown
   # Post-Mortem Template
   ## Incident Summary
   - Date/Time:
   - Duration:
   - Impact:
   - Severity:
   
   ## Timeline
   [Detailed timeline with actions]
   
   ## Root Cause Analysis
   [5 Whys analysis]
   
   ## Lessons Learned
   - What went well
   - What went poorly
   - Where we got lucky
   
   ## Action Items
   | Action | Owner | Due Date | Status |
   |--------|-------|----------|--------|
   ```

2. **Procedure updates**
   - Update runbooks
   - Revise automation scripts
   - Improve monitoring

3. **Prevention measures**
   - Address root causes
   - Improve resilience
   - Enhanced testing

---

## Appendices

### A. Key Contacts
```yaml
Roles:
  DR_Lead:
    Primary: John Smith (+1-555-0123)
    Backup: Jane Doe (+1-555-0124)
  
  Database_Admin:
    Primary: Bob Wilson (+1-555-0125)
    Backup: Alice Brown (+1-555-0126)
  
  Infrastructure:
    Primary: Charlie Davis (+1-555-0127)
    Backup: Dana White (+1-555-0128)

External:
  CloudProvider: support@cloud.com (1-800-CLOUD)
  DataCenter: noc@datacenter.com (1-800-DC-HELP)
  DNS_Provider: support@dns.com
```

### B. Critical Resources
```yaml
Documentation:
  - Wiki: https://wiki.company.com/dr
  - Runbooks: https://runbooks.company.com
  - Architecture: https://arch.company.com/puo-memo

Access:
  - Break-glass credentials: Vault path /emergency/puo-memo
  - Console access: https://console.cloud.com
  - Backup storage: gs://puo-memo-backups

Tools:
  - Status page: https://status.puo-memo.com
  - Monitoring: https://monitoring.company.com
  - Logs: https://logs.company.com
```

### C. DR Checklist
- [ ] Incident declared
- [ ] Team notified
- [ ] Assessment complete
- [ ] Recovery strategy chosen
- [ ] Infrastructure provisioned
- [ ] Database restored
- [ ] Application deployed
- [ ] DNS updated
- [ ] Services validated
- [ ] Monitoring enabled
- [ ] Customers notified
- [ ] Post-mortem scheduled