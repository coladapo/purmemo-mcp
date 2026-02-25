# ADR-011: macOS Distribution Strategy for Purmemo Desktop App

**Status**: Accepted
**Date**: 2026-02-25
**Deciders**: Purmemo core team
**Technical area**: Desktop App / CI / Distribution
**Related**: Phase 1 desktop roadmap (MEMORY.md), `purmemo-desktop/package.json`, `.github/workflows/desktop-build.yml`

---

## Context and Problem Statement

The Purmemo Desktop app is an Electron shell (`purmemo-desktop/`) that loads
`https://app.purmemo.ai/dashboard` and provides system tray presence, clipboard
capture, and AI app focus detection. It is built on GitHub Actions (`macos-latest`)
and currently distributes as a `.zip` file attached to GitHub Releases at
`coladapo/purmemo-mcp`.

**The app cannot launch on users' Macs.**

**Failure mode A — DMG (previously attempted)**:
`NSPOSIXErrorDomain Code=153` (launch constraint violation). The OS hard-blocks
the app at kernel level. No bypass is possible — not even right-click > Open.

**Failure mode B — Zip (current, desktop-v1.0.1)**:
"Apple could not verify Purmemo is free from malware" dialog. Technically bypassable
via System Settings > Privacy & Security > Open Anyway, but macOS 15 Sequoia requires
a 5-step process and most users abandon at this screen.

**Root cause (verified via research)**:
`electron-builder` applies a partial self-signature even when `CSC_IDENTITY_AUTO_DISCOVERY: false`
is set. The AMFI kernel-level check fails because the app is in an inconsistent signing
state — neither fully signed nor fully unsigned. This is worse than completely unsigned.
Setting `"identity": null` forces electron-builder to produce a truly unsigned binary,
which AMFI evaluates cleanly (no Code=153) and Gatekeeper handles via its normal
"unverified developer" flow (bypassable).

**Two separate macOS security layers must be understood independently:**
- **Layer 1 — Gatekeeper / Quarantine**: blocks apps downloaded from the internet via
  `com.apple.quarantine` xattr. Bypassed by right-click > Open or System Settings.
- **Layer 2 — AMFI / Launch Constraints**: kernel-level enforcement checking code signing
  coherence. `xattr -cr` has zero effect here. This is what Code=153 is.

The previous fix attempts (strip signature, repackage DMG, zip with `ditto`) only
addressed Layer 1. Code=153 is a Layer 2 failure caused by the partial signing state.

**Current build config** (`purmemo-desktop/package.json`):
```json
"mac": {
  "target": [{ "target": "dmg", "arch": ["arm64"] }],
  "hardenedRuntime": false,
  "gatekeeperAssess": false
}
```

**Current CI** (`.github/workflows/desktop-build.yml`):
- Builds with `--dir` + `ditto` to create zip manually
- Uses `CSC_IDENTITY_AUTO_DISCOVERY: false` — but does NOT set `"identity": null`
- Result: partial signature → Code=153

**Impact**: Zero successful installs from direct download. Desktop onboarding
completion rate is effectively 0%.

---

## Decision Drivers

1. **Ship something working today** — users who downloaded the zip need a path forward.
2. **Zero support burden** — current failure generates confused support with no fix.
3. **Activation rate** — desktop is one of four onboarding items; broken download
   blocks full onboarding completion tracking.
4. **Commercial product** — install UX at first launch reflects brand quality.
5. **Developer-first audience** — primary users (Claude, Cursor, Copilot users) are
   technical and can handle "right-click > Open", but still expect clean installs.
6. **Startup economics** — $99/year Apple Developer Program is trivial vs. lost activations.
7. **macOS 15 trend** — Apple continues tightening Gatekeeper; any unsigned workaround
   degrades further with each macOS release. The only future-proof path is notarization.

---

## Options Considered

### Option A: Fix `identity: null` + install instructions
Add `"identity": null` to `package.json` mac config. Ship as zip. Include explicit
bypass instructions in onboarding UI.

- Cost: $0, effort: 30 min, fixes Code=153 permanently
- Still requires 5+ steps on macOS 15 Sequoia; non-technical users may still fail
- Correct technical fix but incomplete UX fix

### Option B: Apple Developer Program + full notarization
Enroll in ADP ($99/year). Configure CI with signing certificate + notarization.
Result: DMG that double-click installs on any Mac with zero security prompts.

Required secrets: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`,
`CSC_LINK` (base64 certificate), `CSC_KEY_PASSWORD`.

Required entitlements for Electron with Hardened Runtime: `allow-jit`,
`allow-unsigned-executable-memory`, `disable-library-validation` (for native modules).

- Cost: $99/year, effort: 2-4 hours + ~5 business days for org enrollment
- Zero-friction for all users on all macOS versions, forever
- Enables future Mac App Store path and auto-update (`electron-updater`)

### Option C: Option A now + Option B within 30 days ✅ CHOSEN
- Fix the build immediately: unblocks installs today at zero cost
- Enroll in ADP and ship notarized DMG within the month: removes friction permanently
- Best for a startup: ship fast, polish fast

### Option D: Shell install script
Ship zip + `install.sh` that runs `xattr -rd` + `codesign --force --deep --sign -`
(ad-hoc re-sign on the target machine). Works, but requires users to run a sudo shell
script — poor UX, security-conscious users refuse.

### Option E: Homebrew Cask
Private tap at `purmemo/homebrew-tap`. `postflight` stanza handles quarantine
removal automatically. Great for technical users; excludes non-Homebrew users.
Viable as a parallel install path after Phase 2 notarization. Optional.

---

## Decision

**Option C: Immediate `identity: null` fix (Phase 1, today) + Apple Developer Program
notarization within 30 days (Phase 2), with optional Homebrew Cask parallel track (Phase 3).**

---

## Implementation

### Phase 1 — Unblock today (30 minutes)

**`purmemo-desktop/package.json` — mac build section:**

```json
"mac": {
  "identity": null,
  "target": [
    { "target": "zip", "arch": ["arm64", "x64"] }
  ],
  "icon": "assets/icon.icns",
  "category": "public.app-category.productivity",
  "hardenedRuntime": false,
  "gatekeeperAssess": false
},
"zip": {
  "artifactName": "purmemo-desktop-${arch}.zip"
}
```

Key change: `"identity": null` forces electron-builder to skip all signing.
Also switch target from `dmg` to `zip` natively (cleaner than `--dir` + `ditto`).
Add `x64` for Intel Mac support.

**`.github/workflows/desktop-build.yml`:**

Remove the manual `ditto` packaging step. Let electron-builder produce the zip.
Upload both arch artifacts. Remove `--dir` flag from electron-builder command.

**`v1-mvp/frontend/components/morphing-setup-cluster.tsx`:**

- Download URL: point to `purmemo-desktop-arm64.zip` (arm64 default, add Intel link)
- Add install instructions before/after download button
- Bump `LATEST_VERSIONS.desktop` to `'1.0.2'`

**Validation:**

```bash
# Confirm no partial signature (should show "code object is not signed" or "adhoc")
codesign -dv --verbose=4 dist/mac-arm64/Purmemo.app

# On clean test Mac — should get "unverified developer" prompt, NOT Code=153 crash
open /Applications/Purmemo.app
```

---

### Phase 2 — Full notarization (within 30 days)

**Step 1: Enroll in Apple Developer Program**
- Enroll at `developer.apple.com` with `hello@purmemo.ai`
- Organization enrollment preferred (requires D-U-N-S, ~5 business days)
- Individual enrollment available immediately as fallback

**Step 2: Generate Developer ID Application certificate**
- Create in Xcode or developer portal
- Export as `.p12` with passphrase
- Base64 encode: `base64 -i cert.p12 | pbcopy`

**Step 3: App-specific password**
- `appleid.apple.com` > Sign-In and Security > App-Specific Passwords
- Label: "GitHub Actions Notarization"

**Step 4: Add GitHub Secrets** (repo settings: `coladapo/purmemo-mcp`)
```
APPLE_ID                    = hello@purmemo.ai
APPLE_APP_SPECIFIC_PASSWORD = <app-specific-password>
APPLE_TEAM_ID               = <10-char team ID>
CSC_LINK                    = <base64-encoded .p12>
CSC_KEY_PASSWORD            = <passphrase>
```

**Step 5: `purmemo-desktop/package.json` mac config:**

```json
"mac": {
  "target": [
    { "target": "dmg", "arch": ["arm64", "x64"] }
  ],
  "icon": "assets/icon.icns",
  "category": "public.app-category.productivity",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "assets/entitlements.mac.plist",
  "entitlementsInherit": "assets/entitlements.mac.plist"
},
"dmg": {
  "artifactName": "purmemo-desktop-${arch}.dmg",
  "title": "Install Purmemo"
},
"afterSign": "scripts/notarize.js"
```

**Step 6: Create `assets/entitlements.mac.plist`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
</dict>
</plist>
```

Note: `disable-library-validation` is required for `keytar` and `active-win` native
modules under Hardened Runtime.

**Step 7: Create `scripts/notarize.js`:**

```javascript
import { notarize } from '@electron/notarize';
import { fileURLToPath } from 'url';
import path from 'path';

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  return await notarize({
    tool: 'notarytool',
    appBundleId: 'ai.purmemo.desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
}
```

Add to `devDependencies`: `"@electron/notarize": "^2.1.0"`

**Step 8: Update CI workflow:**

```yaml
- name: Build and notarize
  run: npx electron-builder --mac --publish never
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

Remove `CSC_IDENTITY_AUTO_DISCOVERY: false`. Notarization adds ~5 min to CI.

**Step 9: Update frontend:**

- Change download URL from `.zip` to `.dmg`
- Remove bypass instructions entirely
- Bump `LATEST_VERSIONS.desktop` to `'1.0.3'`

**Validation:**

```bash
spctl -a -t exec -vv dist/mac-arm64/Purmemo.app
# Expected: source=Notarized Developer ID
```

---

### Phase 3 — Homebrew Cask (optional, after Phase 2)

Private tap at `purmemo/homebrew-tap`:

```ruby
cask "purmemo" do
  version "1.0.3"
  sha256 arm:   "<sha256 of arm64 dmg>",
         intel: "<sha256 of x64 dmg>"

  url "https://github.com/coladapo/purmemo-mcp/releases/download/desktop-v#{version}/purmemo-desktop-#{arch}.dmg"
  name "Purmemo"
  desc "AI memory and context management desktop app"
  homepage "https://purmemo.ai"

  app "Purmemo.app"

  zap trash: [
    "~/Library/Application Support/purmemo-config",
    "~/Library/Logs/purmemo-desktop",
  ]
end
```

Users install with: `brew install --cask purmemo/tap/purmemo`

---

## Consequences

### Positive

**Phase 1 (immediate):**
- Eliminates the Code=153 hard block — users can install for the first time
- 30-minute fix, zero cost, no dependencies
- Adds x64 support for Intel Mac users
- Unblocks desktop onboarding completion tracking

**Phase 2 (30 days):**
- Zero-friction double-click DMG install on all macOS versions
- Removes the 5-step Sequoia bypass flow
- Enables future auto-update via `electron-updater` (requires signing)
- Enables Mac App Store path
- Signals commercial product quality at first install

### Negative / Trade-offs

**Phase 1:**
- Zip still requires "Open Anyway" bypass. Non-technical users may abandon.
  Bypass instructions in the onboarding UI are critical — must be shown before download.
- Two arch zips: default arm64, secondary Intel link. Small UX complexity.

**Phase 2:**
- `hardenedRuntime: true` may cause regressions with `keytar` + `active-win`.
  The `disable-library-validation` entitlement mitigates most cases — test before shipping.
- D-U-N-S lookup for organization ADP enrollment takes ~5 business days.
  Individual enrollment available immediately as fallback.
- Notarization adds ~5 minutes to CI build time.

### Non-goals

- **Windows / Linux**: Out of scope. Windows NSIS builds don't require signing to run.
- **Mac App Store**: Separate submission process. Enabled by ADP enrollment but not pursued until user base justifies.
- **Auto-update**: `electron-updater` wired in `publish` config but not activated. Implement in Phase 2 or after, as it requires code signing to verify update authenticity.

---

## Timeline

| Phase | Effort | Target date | Blocker |
|-------|--------|-------------|---------|
| Phase 1: `identity: null` fix | 30 min | 2026-02-25 | None |
| Phase 2: ADP enrollment | 1 hr + ~5 business days | 2026-03-04 | D-U-N-S lookup |
| Phase 2: CI signing setup | 2-4 hrs | 2026-03-06 | ADP enrollment |
| Phase 2: First notarized DMG | CI run | 2026-03-06 | CI setup |
| Phase 3: Homebrew tap | 1 hr | Optional | Phase 2 preferred first |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Phase 1 zip still hard-blocks on some macOS configs | Low | High | Test on macOS 13, 14, 15 before shipping; Phase 2 eliminates permanently |
| `hardenedRuntime: true` breaks `keytar` / `active-win` | Medium | High | `disable-library-validation` entitlement; test in CI first |
| D-U-N-S delays Phase 2 beyond 30 days | Medium | Low | Start enrollment 2026-02-25; individual enrollment as fallback |
| Notarization timeout in CI | Low | Medium | electron-notarize has built-in polling; add retry |

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| Phase 1 | App launches after right-click > Open on macOS 15 | Pass |
| Phase 1 | `codesign -dv Purmemo.app` shows no certificate identity | Pass |
| Phase 1 | Desktop onboarding completion rate | >10% (from ~0%) |
| Phase 2 | `spctl -a Purmemo.app` returns `Notarized Developer ID` | Pass |
| Phase 2 | Zero security prompts on double-click DMG install | Pass |
| Phase 2 | Desktop onboarding completion rate | >40% |

---

## Links

- Build config: `purmemo-desktop/package.json` — `build.mac`
- CI workflow: `.github/workflows/desktop-build.yml`
- Onboarding download link: `v1-mvp/frontend/components/morphing-setup-cluster.tsx:977`
- `LATEST_VERSIONS`: `v1-mvp/frontend/components/morphing-setup-cluster.tsx:57`
- GitHub Releases: `github.com/coladapo/purmemo-mcp/releases`
- ADP enrollment: `developer.apple.com/programs/enroll/`
- Electron code signing: `electronjs.org/docs/latest/tutorial/code-signing`
- electron-builder notarization: `electron.build/configuration/mac`
