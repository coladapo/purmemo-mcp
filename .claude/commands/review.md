# Pre-Commit Security & Quality Review

**Description:** Comprehensive security and quality checks before committing (prevents vulnerabilities and tech debt).

**Usage:** `/review`

**When to use:**
- Before EVERY commit (make it a habit!)
- After completing feature or bug fix
- Before pull request

**Example:**
```
User: /review
→ Returns: Security scan (SQL injection, XSS, secrets) + code quality + tests + docs + dependencies
→ Saves audit trail to purmemo
```

---

Perform a comprehensive pre-commit review to ensure code quality, security, and best practices.

## Your Process

Execute the following checks before committing code:

### Step 1: Identify Changes to Review
Use git to see what's being committed:

```bash
# Show all changes to be committed
git diff --cached --stat

# Show detailed changes
git diff --cached

# If nothing staged, show working directory changes
git diff --stat
git diff
```

List the files and understand the scope of changes.

### Step 2: Security Vulnerability Check

**Critical vulnerabilities to check for:**

**A. SQL Injection**
Use Grep to search for potential SQL injection vulnerabilities:
```bash
# Look for string concatenation in SQL queries
grep -rn "SELECT.*\+\|INSERT.*\+\|UPDATE.*\+\|DELETE.*\+" --include="*.{js,ts,py,go,java}" .

# Look for template literals in SQL (JavaScript/TypeScript)
grep -rn "SELECT.*\${.*}\|INSERT.*\${.*}" --include="*.{js,ts}" .

# Look for f-strings in SQL (Python)
grep -rn "f\"SELECT.*{.*}\|f'SELECT.*{.*}" --include="*.py" .
```

**B. XSS (Cross-Site Scripting)**
```bash
# Look for innerHTML usage (JavaScript)
grep -rn "innerHTML\s*=" --include="*.{js,ts,jsx,tsx}" .

# Look for dangerouslySetInnerHTML (React)
grep -rn "dangerouslySetInnerHTML" --include="*.{jsx,tsx}" .

# Look for unescaped template rendering
grep -rn "safe\|mark_safe" --include="*.{py,html}" .
```

**C. Authentication/Authorization Issues**
```bash
# Look for hardcoded credentials
grep -rn "password\s*=\|api_key\s*=\|secret\s*=" --include="*.{js,ts,py,go,java}" .

# Look for missing authentication checks
grep -rn "router\.\(get\|post\|put\|delete\)" --include="*.{js,ts}" . | grep -v "auth\|protected"

# Look for exposed sensitive endpoints
grep -rn "\.env\|process\.env" --include="*.{js,ts}" .
```

**D. Command Injection**
```bash
# Look for shell command execution
grep -rn "exec\|spawn\|system\|shell" --include="*.{js,ts,py,go,java}" .

# Look for eval usage
grep -rn "\beval\(" --include="*.{js,ts,py}" .
```

**E. Path Traversal**
```bash
# Look for file path operations without sanitization
grep -rn "readFile\|writeFile\|\.\./" --include="*.{js,ts,py,go,java}" .
```

### Step 3: Code Quality Review

**A. Check for code smells:**

Use Grep to find common issues:
```bash
# Long functions (potential code smell)
grep -rn "function\|def " --include="*.{js,ts,py}" . | # Then manually check line counts

# TODO/FIXME comments (should be addressed or tracked)
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.{js,ts,py,go,java}" .

# Console.log statements (should be removed or use proper logging)
grep -rn "console\.log\|print(" --include="*.{js,ts,py}" .

# Commented out code (should be removed)
grep -rn "^[\s]*//.*\|^[\s]*#.*" --include="*.{js,ts,py}" . | head -20

# Magic numbers (should use constants)
grep -rn "\b[0-9]{3,}\b" --include="*.{js,ts,py}" . | grep -v "test\|spec"
```

**B. Best Practices Check:**
- Are functions/methods doing one thing?
- Are variable names descriptive?
- Is error handling comprehensive?
- Are edge cases handled?
- Is the code DRY (Don't Repeat Yourself)?

### Step 4: Test Coverage Check

**Run existing tests:**
```bash
# Run tests based on project type
npm test || pytest || go test -v || mvn test || echo "No test command found"

# Check test coverage if available
npm run test:coverage || pytest --cov || go test -cover || echo "No coverage command found"
```

**Check for missing tests:**

Use Grep to find files without corresponding tests:
```bash
# Find source files
find src -name "*.js" -o -name "*.ts" | grep -v ".test\|.spec" | sort > /tmp/source_files.txt

# Find test files
find . -name "*.test.*" -o -name "*.spec.*" | sort > /tmp/test_files.txt

# Compare (manual check if source files have tests)
# Look for new functions/classes that need tests
grep -rn "function\|class\|def " --include="*.{js,ts,py}" src/ | grep -v "test\|spec"
```

**Test quality questions:**
- Do new features have tests?
- Are edge cases tested?
- Are error cases tested?
- Do tests actually test the functionality (not just pass)?

### Step 4b: Autonomous Safety System Tests (Purmemo Backend Only)

**For Purmemo backend** (`/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend`), automatically run relevant tests from the 124-test Autonomous Safety System:

**1. Detect changed files:**
```bash
# Get list of changed files
git diff --name-only HEAD
```

**2. Map files to test phases:**

Use this intelligent mapping:

| Changed File Pattern | Run Tests | Rationale |
|---------------------|-----------|-----------|
| `app/services/event_publisher.py` | Phase 2 (Redis + SQS) | Event publishing integration |
| `app/services/embeddings.py` | Phase 1 + Phase 3 | API contracts + performance |
| `app/services/redis_client.py` | Phase 2 | Redis integration |
| `app/services/*` | Phase 2 | Integration tests |
| `app/routers/memories.py` | Phase 1 + DB constraints | API + data integrity |
| `app/routers/auth.py` | Phase 1 (auth flows) | Security critical |
| `app/routers/*` | Phase 1 | API contracts |
| `app/middleware/*` | Phase 2 | Integration layer |
| `app/schemas/*` | Phase 1 | API contracts |
| `tests/test_*.py` | Modified test file | Self-test |
| Multiple areas | `/test quick` (Phase 1+2) | Broad impact |
| Performance-sensitive | Include Phase 3 | Regression detection |

**3. Run targeted tests:**

```bash
cd /Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend
source venv/bin/activate

# Based on mapping above, run appropriate tests:

# Phase 1: API + Auth + Embeddings (65 tests, ~15 sec)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py -v --tb=short

# Phase 2: Redis + SQS + Database (47 tests, ~20 sec)
pytest tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v --tb=short

# Phase 3: Performance Benchmarks (12 tests, ~47 sec)
pytest tests/test_performance_benchmarks.py -v --tb=short

# Quick (Phase 1 + 2 - RECOMMENDED for most commits) (112 tests, ~35 sec)
pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v --tb=short
```

**4. Recall past test failures:**

Before running tests, use purmemo to recall similar past failures:
```bash
recall_memories(query="test failures pytest purmemo backend")
recall_memories(query="FK constraint violations tests")
recall_memories(query="boto3 mocking SQS tests")
```

**5. Report test results in review:**

**If all tests pass:**
```
## 🧪 AUTONOMOUS SAFETY SYSTEM TESTS
✅ Phase 1 (API + Auth + Embeddings): 65/65 passing
✅ Phase 2 (Redis + SQS + Database): 47/47 passing
⏱️  Total runtime: 33.7 seconds

All Autonomous Safety System tests passing - safe to commit
```

**If tests fail:**
```
## 🧪 AUTONOMOUS SAFETY SYSTEM TESTS
❌ Phase 2 (Redis + SQS + Database): 46/47 passing (98%)
⏱️  Runtime: 18.4 seconds

🔴 BLOCKER: 1 test failure must be fixed before commit

Failed Test: test_redis_connection_pool_exhaustion
Error: Connection pool timeout after 10 seconds
File: tests/test_redis_integration.py:285

🧠 Pattern Detected (from purmemo):
This is a known connection pool issue. Tests under heavy load can exhaust pool.

💡 Suggested Fix:
Check Redis connection pool size in config:
- Current: redis_pool_size = 10
- Recommended: redis_pool_size = 20 (for production load)

Reference: tests/test_redis_integration.py:285-302
Similar fix: PHASE_3_PERFORMANCE_BENCHMARKS_COMPLETE.md (connection pool behavior)
```

**6. Commit decision based on test results:**

- **All tests pass** → ✅ SAFE TO COMMIT
- **Non-critical tests fail** → ⚠️ REVIEW FAILURES (fix or document why committing)
- **Critical tests fail** → 🛑 BLOCK COMMIT (must fix)

**Critical tests (must pass):**
- Database constraint tests (`test_database_constraints_v2.py`) - data integrity
- Authentication tests (`test_auth_flows.py`) - security
- Performance regression tests (>50% degradation) - user experience

**7. Intelligent error reporting:**

For failures, provide:
- Failed test name + error message
- Pattern detection (recall from purmemo)
- Suggested fix with code example
- Reference to file/line where fix needed
- Link to similar past fixes

### Step 5: Documentation Review

**Check if documentation needs updating:**

**A. README.md:**
- Does it reflect new features/changes?
- Are setup instructions still accurate?
- Are dependencies listed correctly?

**B. API Documentation:**
```bash
# Check for undocumented functions (JavaScript/TypeScript)
grep -rn "export function\|export const.*=.*=>" --include="*.{js,ts}" . | grep -v "/**\|//"

# Check for undocumented classes (Python)
grep -rn "^class " --include="*.py" . | grep -v '"""'
```

**C. Code Comments:**
- Are complex algorithms explained?
- Are non-obvious decisions documented?
- Are public APIs documented?

**D. CHANGELOG.md:**
- Should this change be added to changelog?
- Is the version number updated if needed?

### Step 6: Dependency & Configuration Check

**Check for issues:**
```bash
# Check for outdated dependencies
npm outdated || pip list --outdated || echo "No dependency check available"

# Check for security vulnerabilities in dependencies
npm audit || pip check || echo "No security audit available"

# Check for untracked config files
git status | grep "\.env\|config\|credentials"
```

**Questions:**
- Are new dependencies necessary?
- Are dependency versions pinned appropriately?
- Are environment variables documented?
- Are secrets properly excluded (.gitignore)?

### Step 7: Generate Review Report

Present a comprehensive review report:

**🔒 SECURITY REVIEW**
- ✅/❌ SQL Injection: [Status + findings]
- ✅/❌ XSS Vulnerabilities: [Status + findings]
- ✅/❌ Authentication/Authorization: [Status + findings]
- ✅/❌ Command Injection: [Status + findings]
- ✅/❌ Path Traversal: [Status + findings]
- ✅/❌ Hardcoded Secrets: [Status + findings]

**📊 CODE QUALITY**
- ✅/❌ No code smells detected
- ✅/❌ Best practices followed
- ✅/❌ Error handling comprehensive
- ✅/❌ Code is DRY and maintainable
- ⚠️ TODOs found: [Count + locations]
- ⚠️ Console logs: [Count + locations]

**🧪 TEST COVERAGE**
- ✅/❌ Tests passing: [Status]
- ✅/❌ New code has tests
- ✅/❌ Edge cases covered
- Coverage: [Percentage if available]
- ⚠️ Files without tests: [List]

**🤖 AUTONOMOUS SAFETY SYSTEM (Purmemo Backend)**
- ✅/❌ Phase 1 (API + Auth + Embeddings): [X/65 passing]
- ✅/❌ Phase 2 (Redis + SQS + Database): [X/47 passing]
- ✅/❌ Phase 3 (Performance Benchmarks): [X/12 passing] (if performance-sensitive)
- ⏱️ Runtime: [X seconds]
- 🔴 Critical failures: [List blockers]
- ⚠️ Non-critical failures: [List warnings]

**📚 DOCUMENTATION**
- ✅/❌ README updated
- ✅/❌ API docs updated
- ✅/❌ Code comments adequate
- ✅/❌ CHANGELOG updated
- ⚠️ Undocumented functions: [Count + locations]

**📦 DEPENDENCIES**
- ✅/❌ No outdated dependencies
- ✅/❌ No security vulnerabilities
- ✅/❌ No untracked config files
- ⚠️ New dependencies: [List + justification needed]

**📋 FILES CHANGED**
- [List of files being committed]
- [Brief description of changes]

**✅ COMMIT READINESS**
- Overall Status: ✅ READY / ⚠️ NEEDS ATTENTION / ❌ NOT READY
- Blockers: [List critical issues that must be fixed]
- Warnings: [List non-critical issues to consider]
- Recommendations: [Suggested improvements]

### Step 8: Save Review to Purmemo

After the review, use `/save` command to document:

**Title format:** `Review - [Component/Feature] - Pre-commit - [Date]`

**Examples:**
- "Review - Authentication Module - Pre-commit - 2025-11-13"
- "Review - API Endpoints - Pre-commit - 2025-11-13"

**Content should include:**
- Complete review report (from Step 7)
- Security findings and resolutions
- Code quality observations
- Test coverage status
- Documentation changes made
- Any technical debt identified

**Tags:** ["code-review", "pre-commit", "security", component-name]

This creates a valuable audit trail and knowledge base of what was reviewed and why!

### Step 9: Interactive Guidance

Based on the review findings:

**If READY:**
- Summarize what's being committed
- Confirm all checks passed
- User can proceed with commit

**If NEEDS ATTENTION:**
- List warnings clearly
- Ask user if they want to:
  - Fix issues now
  - Commit anyway with documented reasons
  - Cancel commit

**If NOT READY:**
- List critical blockers
- Provide specific fix recommendations
- Do NOT allow commit until fixed

## Example Execution:

### Example 1: Standard Project
```
User: "Review my changes before committing"

Step 1: Identify Changes
→ git diff --cached --stat
→ Files: auth.js (modified), users.test.js (new)

Step 2: Security Check
→ grep for SQL injection: ❌ Found unsafe query in auth.js:42
→ grep for XSS: ✅ No issues
→ grep for hardcoded secrets: ✅ No issues
→ grep for command injection: ✅ No issues

Step 3: Code Quality
→ grep for TODOs: ⚠️ 1 TODO in auth.js:67
→ grep for console.log: ⚠️ 2 console.logs in auth.js
→ Best practices: ✅ Code looks good

Step 4: Test Coverage
→ npm test: ✅ All tests passing
→ New file users.test.js covers new functionality
→ Coverage: 85% (good)

Step 5: Documentation
→ README.md: ⚠️ No mention of new auth feature
→ Code comments: ✅ Adequate
→ CHANGELOG: ⚠️ Not updated

Step 6: Dependencies
→ npm audit: ✅ No vulnerabilities
→ No new dependencies

Step 7: Generate Report
→ Present comprehensive review report
→ Status: ⚠️ NEEDS ATTENTION (SQL injection + minor issues)

Step 8: Interactive Guidance
→ BLOCKER: SQL injection vulnerability must be fixed
→ Recommend: Fix auth.js:42 to use parameterized query
→ Recommend: Remove console.logs
→ Recommend: Update README and CHANGELOG
→ Ask user: Fix now or cancel commit?

[User fixes issues]

Step 9: Save Review
→ /save with title "Review - Authentication - Pre-commit - 2025-11-13"
→ Documents: What was checked, issues found, resolutions
```

### Example 2: Purmemo Backend (with Autonomous Safety System)
```
User: "/review"

Step 1: Identify Changes
→ git diff --name-only HEAD
→ Files: app/routers/memories.py (modified), app/services/embeddings.py (modified)

Step 2: Security Check
→ All security checks: ✅ No issues found

Step 3: Code Quality
→ grep for TODOs: ✅ None found
→ Best practices: ✅ Code looks good

Step 4: Test Coverage
→ Standard tests: ✅ Passing

Step 4b: Autonomous Safety System Tests
→ Detected changes: routers + services → Phase 1 + Phase 2 recommended
→ Recall from purmemo: No past failures for these files
→ Running: pytest tests/test_api_contracts.py tests/test_auth_flows.py tests/test_embeddings_service.py tests/test_redis_integration.py tests/test_sqs_publishing.py tests/test_database_constraints_v2.py -v --tb=short

Results:
✅ Phase 1 (API + Auth + Embeddings): 65/65 passing
✅ Phase 2 (Redis + SQS + Database): 47/47 passing
⏱️  Runtime: 34.2 seconds

All Autonomous Safety System tests passing - safe to commit

Step 5: Documentation
→ README.md: ✅ No changes needed
→ Code comments: ✅ Adequate

Step 6: Dependencies
→ pip check: ✅ No vulnerabilities

Step 7: Generate Report
→ Status: ✅ READY TO COMMIT

Step 8: Interactive Guidance
→ All checks passed
→ 112/112 Autonomous Safety System tests passing
→ Safe to proceed with commit

Step 9: Save Review
→ /save with title "Review - Memories API + Embeddings - Pre-commit - 2025-11-24"
```

## Smart Features:

**Auto-detect project type:**
- Adjust security checks based on language (JS/Python/Go)
- Use appropriate test commands
- Check language-specific best practices

**Severity levels:**
- 🔴 Critical (SQL injection, XSS, hardcoded secrets) - MUST FIX
- 🟡 Warning (TODOs, console.logs, missing docs) - SHOULD FIX
- 🟢 Info (code smells, suggestions) - NICE TO FIX

**Integration with git hooks:**
- This workflow can be automated with pre-commit hooks
- Recommend setting up git hooks for automatic checks

## Notes

- Run this BEFORE every commit (make it a habit)
- Don't skip security checks - they're the most important
- Document WHY you're committing if warnings exist
- Build up a knowledge base of reviews in purmemo
- Learn from past reviews - patterns will emerge
- Share review findings with team
- Consider automating checks with git hooks + CI/CD
