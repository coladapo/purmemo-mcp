# ADR-017: MCP Distribution Parity Strategy

**Date:** 2026-03-19
**Status:** Accepted
**Deciders:** Chris Oladapo

## Context

Purmemo's MCP server ships through 4 channels (Render, npm, mcpb, local), all compiled from one TypeScript source. Despite source unification, channels update at different times:

- Render: every git push (~2 min)
- Local: manual `npm run build`
- npm: only on `gh release create`
- mcpb: only on manual re-download

This caused a production incident on 2026-03-19 where remote save was broken for OAuth users. The fix deployed to Render in 2 minutes but npm/mcpb stayed stale.

## Decision

**Create releases more frequently using the existing pipeline, with process gates.**

The CI pipeline (`publish.yml`) already handles everything: npm publish → mcpb build → mcpb upload → Render redeploy. The problem was not using it — 6 commits pushed without a release.

## Implementation

1. `/review` command checks if `purmemo-mcp/server.ts` changed → reminds to release
2. `/release-mcp` command: bump version → commit → push → `gh release create` → CI does the rest
3. Submit to Anthropic Connectors Directory for mcpb auto-updates

## Alternatives Rejected

- **Auto-publish on push**: Risks publishing broken commits, inflates versions
- **Render from npm**: Blocks rapid iteration, can't hotfix without npm publish
- **Auto-release on server.ts change**: Complex CI, rapid releases during dev sessions

## Review Date

2026-04-19
