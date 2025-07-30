# PUO Memo MCP: Workflow Implementation Guide
## Practical Templates and Examples

### 🎬 **Complete Workflow Example: "AI Code Review Assistant"**

Let me walk you through a complete idea-to-implementation cycle using the new unified workflow:

---

## **Session 1: Voice Ideation (ChatGPT)**

**Voice conversation summary**:
*"Had an idea about an AI assistant that reviews code before commits. It would catch logic errors, suggest improvements, and learn from team patterns. Could integrate with GitHub and provide real-time feedback..."*

**End session with**:
```
Save this ideation session:

**Idea**: AI Code Review Assistant with Team Learning
**Problem**: Code reviews are slow, inconsistent, and miss logic errors that could be caught automatically
**Early thoughts**: 
- Real-time feedback during coding (not just pre-commit)
- Learn team-specific patterns and preferences  
- Integrate with GitHub Actions and VS Code
- Could reduce review time by 60% while improving quality
**Voice session energy**: High - excited about the learning aspect
**Next**: Technical architecture analysis in Claude Desktop

Tags: #ideation #voice-session #ai-tools #code-review #github-integration #high-energy
```

---

## **Session 2: Technical Architecture (Claude Desktop)**

**Start with context**:
```
Use recall tool with query: "AI Code Review Assistant ideation"
```

**Analysis request** (to Claude):
```
Based on my ideation session about an AI Code Review Assistant, help me think through the technical architecture. DON'T write code - instead:

1. Break this into sequential implementation phases with clear success criteria
2. Identify key technical decisions and trade-offs
3. Research relevant technologies and existing solutions
4. Create a detailed implementation roadmap
5. Flag potential challenges and mitigation strategies

Focus on the learning aspect - how would this system learn team patterns?
```

**Save the analysis**:
```
Use memory tool to save:

**Technical Analysis**: AI Code Review Assistant - Architecture & Roadmap

**Architecture Overview**:
- Frontend: VS Code extension + GitHub App
- Backend: Node.js API with vector database for pattern storage
- AI: Fine-tuned model on team codebases + general code review rules
- Learning: Continuous feedback loop from accepted/rejected suggestions

**Sequential Implementation Phases**:

Phase 1 (MVP - 2 weeks):
- Basic static analysis integration
- Simple rule-based suggestions
- VS Code extension shell
- Success criteria: Can flag obvious issues in real-time

Phase 2 (Learning - 3 weeks):  
- Vector database for storing team patterns
- Feedback collection system
- Pattern recognition for team preferences
- Success criteria: Suggestions improve with team usage

Phase 3 (Intelligence - 4 weeks):
- AI model integration for logic error detection
- Context-aware suggestions based on file/project type
- GitHub Actions integration
- Success criteria: Reduces review time by 40%+

**Tech Stack Decisions**:
- VS Code Extension API (familiar ecosystem)
- Pinecone for vector storage (team pattern matching)
- OpenAI/Claude for logic analysis (proven for code)
- GitHub API for repository integration
- Node.js backend (JavaScript across stack)

**Key Technical Challenges**:
1. Real-time performance (sub-200ms feedback)
2. Privacy concerns with code analysis
3. Avoiding false positives that annoy developers
4. Learning from limited team data

**Risk Mitigation**:
- Start with opt-in, build trust gradually
- Local-first processing where possible  
- Clear feedback mechanisms to improve accuracy
- Graceful degradation when AI unavailable

**Ready for**: Cursor implementation starting with Phase 1 MVP

Tags: #technical-analysis #architecture #ai-tools #code-review #implementation-ready #node-js #vscode-extension
```

**Link the sessions**:
```
Use link_conversations tool to connect this technical analysis to the original "AI Code Review Assistant ideation" memory as a "continuation"
```

---

## **Session 3: Implementation Start (Cursor)**

**Before opening Cursor**, get implementation context:
```bash
# Quick API call to get relevant context
curl -X POST http://localhost:8001/recall \
  -H "Authorization: Bearer gx3ZaY7QQCkf4NepTeZ4IR2MGejOURiM-ZBgZMaGa44" \
  -d '{
    "query": "AI Code Review Assistant technical analysis Phase 1",
    "search_type": "hybrid"
  }'
```

**In Cursor**, start with Claude Code:
```
I'm implementing the AI Code Review Assistant we analyzed. Starting with Phase 1 MVP:
- Basic VS Code extension
- Real-time static analysis
- Simple rule-based suggestions

Focus on the extension manifest and basic activation. Don't implement the full AI yet - just the foundation.
```

**After setting up the basic structure**, save progress:
```
Save implementation progress:

**Implementation**: AI Code Review Assistant - Phase 1 Foundation
**Code location**: 
- `/extensions/ai-code-reviewer/` (main extension folder)
- `package.json` (VS Code extension manifest)
- `src/extension.ts` (main activation logic)
- `src/analyzer.ts` (static analysis foundation)

**Key patterns implemented**:
- VS Code extension lifecycle (activate/deactivate)
- Document change listeners for real-time analysis
- Basic AST parsing with TypeScript compiler API
- Command registration and status bar integration

**Current state**: Extension loads and activates, basic file analysis working
**Screenshots**: [Attach screenshot of extension running in VS Code]

**Phase 1 progress**: 40% complete
- ✅ Extension scaffold and activation
- ✅ Real-time document listening  
- 🔄 Rule-based analysis (in progress)
- ⏳ User feedback UI
- ⏳ Settings and configuration

**Next session**: Complete basic rule engine and user feedback system

Tags: #implementation #phase-1 #vscode-extension #typescript #cursor #in-progress
```

---

## **Session 4: Debugging Challenge (Cross-Platform)**

**Problem encountered in Cursor**:
Extension causes VS Code to freeze when analyzing large files.

**Save debug context**:
```
**Debug Session**: VS Code Extension Performance Issue

**Specific issue**: Extension freezes VS Code when analyzing files >1000 lines
**Current state**: Basic AST parsing works on small files, fails on large ones
**Error symptoms**: 
- VS Code becomes unresponsive
- High CPU usage (100% single core)
- No error messages in console

**Attempted solutions**:
- Added try/catch blocks (didn't help)
- Reduced analysis frequency (still freezes)
- Limited to TypeScript files only (still issues)

**Screenshots**: [Attach CPU usage screenshot and VS Code frozen state]

**Need**: Performance optimization strategy and async processing approach

Tags: #debugging #performance #vscode-extension #stuck #async-processing
```

**Switch to Claude Desktop**:
```
Use recall tool to find my debugging session about VS Code extension performance.

Based on this context, help me think through:
1. Root cause analysis - why would AST parsing freeze VS Code?
2. Performance optimization strategies for VS Code extensions
3. Async processing patterns that won't block the main thread
4. Best practices for handling large file analysis
```

**After Claude's analysis**, back to Cursor:
```
Implement the worker thread solution Claude suggested:
- Move AST parsing to a worker thread
- Use message passing for results
- Add progress indicators for large files
- Implement cancellation for file changes during analysis
```

**Save resolution**:
```
**Debug Resolution**: VS Code Extension Performance Fixed

**Root cause**: Synchronous AST parsing on main thread blocked VS Code UI
**Solution implemented**: 
- Worker thread for file analysis (src/workers/analyzer.worker.ts)
- Message-based communication with main extension
- Progressive analysis with cancellation support
- File size limits and chunking for massive files

**Performance results**:
- Large files (2000+ lines): No more freezing
- Analysis time: 200ms average (was blocking indefinitely)
- Memory usage: Reduced by 60% through chunking

**Code patterns that work**:
```typescript
// Worker-based analysis pattern
const worker = new Worker('./analyzer.worker.js');
worker.postMessage({ code, fileName });
worker.onmessage = (result) => updateDiagnostics(result);
```

**Prevention**: Always use workers for CPU-intensive operations in VS Code extensions

Tags: #resolved #performance #worker-threads #vscode-best-practices #lesson-learned
```

---

## **🔧 Practical Templates**

### **Ideation Session Template**:
```
**Idea**: [One-line concept]
**Problem**: [Specific problem being solved]
**Early thoughts**: [Key insights and possibilities]
**Voice session energy**: [High/Medium/Low + mood notes]
**Next**: [What phase comes next]
Tags: #ideation #voice-session #[domain] #[energy-level]
```

### **Technical Analysis Template**:
```
**Technical Analysis**: [Project Name] - [Focus Area]
**Architecture**: [High-level approach and key components]
**Implementation Phases**: [Sequential phases with success criteria]
**Tech Stack**: [Technologies and rationale]  
**Key Decisions**: [Important choices and trade-offs]
**Risks & Mitigation**: [Potential issues and solutions]
**Ready for**: [Next implementation step]
Tags: #technical-analysis #architecture #[tech-stack] #implementation-ready
```

### **Implementation Progress Template**:
```
**Implementation**: [Feature/Component Name]
**Code location**: [Key files and functions]
**Key patterns**: [Successful approaches used]
**Current state**: [What's working, what's not]
**Screenshots**: [Visual progress]
**Progress**: [% complete with checklist]
**Next session**: [Specific next steps]
Tags: #implementation #[phase] #[technology] #[status]
```

### **Debug Session Template**:
```
**Debug Session**: [Specific Issue]
**Symptoms**: [What's happening]
**Attempted**: [Solutions tried]
**Screenshots**: [Error states, logs]
**Need**: [Type of help required]
Tags: #debugging #[error-type] #[technology] #stuck
```

### **Resolution Template**:
```
**Resolution**: [Issue Solved]
**Root cause**: [Why it happened]
**Solution**: [What fixed it]
**Code pattern**: [Reusable solution]
**Prevention**: [How to avoid in future]
Tags: #resolved #lesson-learned #[technology] #[pattern-type]
```

---

## **🎯 Daily Workflow Checklist**

### **Starting a Session**:
- [ ] Use recall to get context from previous work
- [ ] Review linked conversations and related memories
- [ ] Set clear session goals and success criteria

### **During Work**:
- [ ] Save progress at logical breakpoints
- [ ] Attach screenshots for visual state
- [ ] Note patterns and decisions as you make them

### **Ending a Session**:
- [ ] Save current state with specific next steps
- [ ] Link to related memories and conversations
- [ ] Tag appropriately for future discovery

### **Weekly Review**:
- [ ] Search for memories from the past week
- [ ] Identify successful patterns to replicate
- [ ] Extract lessons learned from debugging
- [ ] Plan focus areas for upcoming week

This implementation guide ensures your unified memory system becomes a true force multiplier for your development workflow.