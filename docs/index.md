---
layout: default
title: PUO Memo MCP - Unified Memory for AI
---

# PUO Memo MCP

<div align="center">
  <!-- Logo placeholder - replace with actual logo -->
  <h1 style="font-size: 3rem; margin: 0;">🧠</h1>
  
  <h3>Your Unified Memory Layer for AI Assistants</h3>
  
  <p>
    <a href="https://www.npmjs.com/package/puo-memo-mcp"><img src="https://badge.fury.io/js/puo-memo-mcp.svg" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/puo-memo-mcp"><img src="https://img.shields.io/npm/dm/puo-memo-mcp.svg" alt="npm downloads"></a>
    <a href="https://github.com/coladapo/puo-memo-mcp/stargazers"><img src="https://img.shields.io/github/stars/coladapo/puo-memo-mcp.svg" alt="GitHub stars"></a>
  </p>
</div>

## 🚀 Stop Losing Context Between AI Conversations

Every time you switch between Claude, ChatGPT, or Cursor, you lose valuable context. PUO Memo solves this by creating a **unified memory layer** that works across all your AI tools.

<div class="features-grid">
  <div class="feature">
    <h3>🧠 Smart Storage</h3>
    <p>Automatically organize and deduplicate your memories across all AI tools</p>
  </div>
  
  <div class="feature">
    <h3>🔍 Intelligent Search</h3>
    <p>Find anything instantly with natural language search</p>
  </div>
  
  <div class="feature">
    <h3>🔐 Secure & Private</h3>
    <p>Your data stays on our secure servers, never in the client</p>
  </div>
  
  <div class="feature">
    <h3>🌐 Works Everywhere</h3>
    <p>Claude, ChatGPT, Cursor, VS Code, and any MCP-compatible tool</p>
  </div>
</div>

## Quick Start

### 1. Install

```bash
npm install -g puo-memo-mcp
```

### 2. Get Your API Key

<a href="https://github.com/coladapo/puo-memo-mcp#quick-start" class="cta-button">Get Started</a>

### 3. Configure Your AI Tool

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "puo-memo": {
      "command": "npx",
      "args": ["puo-memo-mcp"],
      "env": {
        "PUO_MEMO_API_KEY": "your-api-key"
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor / VS Code</strong></summary>

Coming soon! Check our [GitHub](https://github.com/coladapo/puo-memo-mcp) for updates.

</details>

<details>
<summary><strong>ChatGPT</strong></summary>

Use our custom GPT or integrate via API. [Learn more →](https://github.com/coladapo/puo-memo-mcp#chatgpt-integration)

</details>

## Real Users, Real Results

> "PUO Memo completely changed how I work with AI. I can start a project plan in Claude, refine it in ChatGPT, and implement it in Cursor - all without losing context!" 
> 
> — *Sarah Chen, Full Stack Developer*

> "As someone who jumps between different AI tools all day, PUO Memo is a lifesaver. It's like having a second brain that actually remembers everything."
> 
> — *Marcus Thompson, AI Researcher*

## Pricing

<div class="pricing-grid">
  <div class="pricing-card">
    <h3>Free</h3>
    <div class="price">$0/month</div>
    <ul>
      <li>100 memories</li>
      <li>Basic search</li>
      <li>3 AI tools</li>
    </ul>
    <a href="https://github.com/coladapo/puo-memo-mcp#quick-start" class="cta-button-outline">Get Started</a>
  </div>
  
  <div class="pricing-card featured">
    <h3>Pro</h3>
    <div class="price">$9/month</div>
    <ul>
      <li>Unlimited memories</li>
      <li>Advanced search</li>
      <li>Unlimited tools</li>
      <li>Priority support</li>
    </ul>
    <a href="https://github.com/coladapo/puo-memo-mcp#quick-start" class="cta-button">Start Free Trial</a>
  </div>
  
  <div class="pricing-card">
    <h3>Team</h3>
    <div class="price">$29/month</div>
    <ul>
      <li>Everything in Pro</li>
      <li>5 team members</li>
      <li>Shared memories</li>
      <li>Admin controls</li>
    </ul>
    <a href="./contact.html" class="cta-button-outline">Contact Sales</a>
  </div>
</div>

## Ready to Never Lose Context Again?

<div align="center">
  <a href="https://github.com/coladapo/puo-memo-mcp#quick-start" class="cta-button large">Start Your Free Trial</a>
  <p><small>No credit card required • 14-day free trial</small></p>
</div>

## Need Help Choosing?

<div align="center" style="margin: 2rem 0;">
  <p>Not sure which plan is right for you? Our team is here to help!</p>
  <a href="./contact.html" class="cta-button-outline">Talk to Sales</a>
</div>

---

<div align="center">
  <p>
    <a href="https://github.com/coladapo/puo-memo-mcp">GitHub</a> •
    <a href="https://github.com/coladapo/puo-memo-mcp/wiki">Documentation</a> •
    <a href="https://www.npmjs.com/package/puo-memo-mcp">NPM</a> •
    <a href="https://github.com/coladapo/puo-memo-mcp/issues">Support</a>
  </p>
  
  <p><small>© 2024 PUO Memo. Built with ❤️ for the AI community.</small></p>
</div>

<style>
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin: 3rem 0;
}

.feature {
  text-align: center;
  padding: 1.5rem;
  border-radius: 8px;
  background: #f8f9fa;
}

.feature h3 {
  margin-bottom: 0.5rem;
}

.cta-button {
  display: inline-block;
  padding: 12px 24px;
  background: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: bold;
  transition: background 0.3s;
}

.cta-button:hover {
  background: #0056b3;
}

.cta-button-outline {
  display: inline-block;
  padding: 12px 24px;
  border: 2px solid #007bff;
  color: #007bff;
  text-decoration: none;
  border-radius: 6px;
  font-weight: bold;
  transition: all 0.3s;
}

.cta-button-outline:hover {
  background: #007bff;
  color: white;
}

.cta-button.large {
  padding: 16px 32px;
  font-size: 1.2rem;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin: 3rem 0;
}

.pricing-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  position: relative;
}

.pricing-card.featured {
  border-color: #007bff;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,123,255,0.2);
}

.price {
  font-size: 2rem;
  font-weight: bold;
  color: #007bff;
  margin: 1rem 0;
}

.pricing-card ul {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0;
}

.pricing-card li {
  padding: 0.5rem 0;
}

details {
  margin: 1rem 0;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

summary {
  cursor: pointer;
  padding: 0.5rem;
}

summary:hover {
  color: #007bff;
}
</style>