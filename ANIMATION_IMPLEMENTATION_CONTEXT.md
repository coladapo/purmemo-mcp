# Cluster Animation Implementation Context

## Quick Summary
**Goal**: Add continuous movement animation to cluster bubbles (like particle system) with depth-based parallax  
**Status**: Previous attempts failed - animation not working  
**Main Issue**: Inline `transform` styles override CSS animations  
**Recommended Solution**: Wrapper div pattern to separate positioning from animation  
**Files**: `purmemo-frontend/components/neural-constellation-v67.tsx` and `v1-mvp/frontend/components/neural-constellation-v67.tsx`

---

## Goal
Add continuous movement animation to cluster bubbles in the neural constellation view, similar to a particle system. Clusters should move continuously across the canvas at different speeds based on their depth (z-position), creating a parallax effect.

## Current Component Structure

**File**: `purmemo-frontend/components/neural-constellation-v67.tsx` and `v1-mvp/frontend/components/neural-constellation-v67.tsx`

### Key Container
```tsx
<div className="absolute inset-0" style={{ zIndex: 20 }}>
  {filteredClusters.map(cluster => renderClusterNode(cluster))}
</div>
```

### Cluster Node Structure
Each cluster is rendered with:
```tsx
<div
  key={cluster.id}
  className="absolute group transition-all duration-500 cursor-pointer"
  style={{
    left: `${cluster.position.x}%`,
    top: `${cluster.position.y}%`,
    transform: `translateX(-50%) translateY(-50%) translateZ(${cluster.position.z}px)`,
    opacity: isActive || isConnected ? 1.0 : activityInfo.opacity
  }}
>
  {/* Cluster content: glow, 3D sphere layers, text label, animated ring */}
</div>
```

### Cluster Position Data
- `cluster.position.x` - percentage (0-100)
- `cluster.position.y` - percentage (0-100)  
- `cluster.position.z` - pixel value (can be negative, 0, or positive)
  - Higher z = closer to viewer
  - Lower z = farther from viewer

## What Was Attempted

### Attempt 1: CSS Keyframe Animation with Container Class
**Approach**: Added `text-depth-animated` class to container, tried to animate child elements
**Problem**: Animation didn't apply because:
- Inline `transform` style overrides CSS animations
- CSS animations can't override inline styles even with `!important`
- Container-level animation would move all clusters together, not individually

### Attempt 2: CSS Custom Properties + Keyframes
**Approach**: 
- Removed inline transform
- Used CSS variable `--z-depth` to pass z value
- Created keyframes with `calc()` to combine centering and movement
- Applied animation via `data-depth` attribute on each cluster

**Code attempted**:
```css
@keyframes continuousMove {
  0% {
    transform: translateX(calc(-50% + 0%)) translateY(calc(-50% + 0%)) translateZ(var(--z-depth, 0px));
  }
  50% {
    transform: translateX(calc(-50% + 4%)) translateY(calc(-50% + -2%)) translateZ(var(--z-depth, 0px));
  }
  /* ... */
}
```

**Problems**:
- Animation still didn't work - clusters remained static
- CSS custom properties in keyframes may not work as expected
- Transform order matters and may have caused issues

### Attempt 3: Depth-Based Speed Variation
**Approach**: Different animation speeds based on z position
- `z > 50`: fast (20s cycle)
- `z < -50`: slow (40s cycle)  
- Otherwise: normal (30s cycle)

**Problem**: Never got to test this because base animation didn't work

## Technical Constraints

1. **Inline Styles Override CSS**: React inline styles have higher specificity than CSS classes
2. **Transform Property**: The `transform` property can only have one value - can't combine inline and animated transforms easily
3. **Positioning**: Clusters use percentage-based positioning (`left`, `top`) with `translateX(-50%) translateY(-50%)` for centering
4. **3D Context**: Using `translateZ` for depth, need to preserve 3D transforms
5. **Performance**: Need smooth 60fps animation for 40+ clusters
6. **React/Next.js**: Component is client-side rendered, using `"use client"` directive

## What Needs to Work

1. **Individual Cluster Movement**: Each cluster should move independently
2. **Continuous Motion**: Smooth, infinite loop animation (not just breathing/pulsing)
3. **Depth-Based Parallax**: Clusters at different z-depths move at different speeds
4. **Preserve Positioning**: Must maintain percentage-based positioning and centering
5. **Preserve 3D Depth**: Must maintain `translateZ` for 3D effect
6. **No Breaking Changes**: Should not break existing hover, click, or visual effects

## Suggested Approaches to Try

### Option 1: JavaScript Animation with requestAnimationFrame
- Use `useEffect` to set up animation loop
- Update cluster positions in state or refs
- Calculate movement based on z-depth
- More control but more complex

### Option 2: CSS Animation with Wrapper Div
- Wrap each cluster in an animated div
- Keep positioning/centering on outer div
- Apply movement animation to inner wrapper
- Avoids inline style conflicts

### Option 3: CSS Animation with Transform Origin
- Use `transform-origin` to handle centering
- Apply animation directly to cluster div
- May need to adjust positioning approach

### Option 4: CSS Motion Path or Custom Properties
- Use CSS `offset-path` for movement
- Or use CSS custom properties that update via JavaScript
- More modern but browser support considerations

## Current State

- **Animation**: None (rolled back)
- **Clusters**: Static, positioned correctly
- **3D Effects**: Working (sphere gradients, shadows)
- **Interactions**: Working (hover, click, connections)
- **Performance**: Good (no animation overhead)

## Key Files to Modify

1. `purmemo-frontend/components/neural-constellation-v67.tsx` (line ~2555-2576 for cluster rendering, line ~2913 for container)
2. `v1-mvp/frontend/components/neural-constellation-v67.tsx` (same structure)

## Exact Code Locations

### Cluster Rendering Function
Located in `renderConstellationView()` -> `renderClusterNode(cluster)` function
- Starts around line 2555
- Returns JSX for each cluster node
- Uses `cluster.position.x`, `cluster.position.y`, `cluster.position.z`

### Container Div
Located in `renderConstellationView()` return statement
- Line ~2913: `<div className="absolute inset-0" style={{ zIndex: 20 }}>`
- This is where clusters are mapped and rendered

### Cluster Data Structure
```typescript
cluster = {
  id: string,
  name: string,
  position: {
    x: number,  // percentage 0-100
    y: number,  // percentage 0-100
    z: number   // pixels (can be negative, 0, or positive)
  },
  size: string,  // 'size-8' through 'size-15'
  // ... other properties
}
```

### Current Transform Logic
```tsx
transform: `translateX(-50%) translateY(-50%) translateZ(${cluster.position.z}px)`
```
- `-50%` centers the cluster on its `left/top` position
- `translateZ` provides 3D depth
- This is applied as inline style, which overrides CSS animations

## Testing Checklist

- [ ] Clusters move continuously (not static)
- [ ] Movement is smooth (60fps)
- [ ] Different speeds based on z-depth
- [ ] Clusters stay within canvas bounds
- [ ] Hover effects still work
- [ ] Click interactions still work
- [ ] 3D sphere effects still visible
- [ ] No performance degradation
- [ ] Works on mobile (if applicable)

## Additional Context

- The component uses React hooks (`useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`)
- There's already a `canvasRef` for the particle system (P2 component)
- The constellation view is one of multiple views (also has Timeline view)
- Clusters can be filtered, searched, and have various states (active, connected, favorited, archived)
- Component is marked with `"use client"` directive (Next.js client component)
- Uses TypeScript with `// @ts-nocheck` at the top

## Why Previous Attempts Failed

1. **Inline Style Priority**: React inline styles have higher CSS specificity than classes
2. **Transform Property Limitation**: Can't have multiple transform declarations - the last one wins
3. **CSS Animation Override**: CSS animations can't override inline styles, even with `!important` on the animation
4. **Transform Order**: The order of transform functions matters, and combining them incorrectly breaks positioning

## Recommended Solution Approach

**Best Option: Wrapper Div Pattern**

Create a wrapper div for animation, keep positioning on outer div:

```tsx
// Outer div: handles positioning and centering (no animation)
<div
  style={{
    position: 'absolute',
    left: `${cluster.position.x}%`,
    top: `${cluster.position.y}%`,
    transform: `translateX(-50%) translateY(-50%) translateZ(${cluster.position.z}px)`,
  }}
>
  {/* Inner div: handles animation (no positioning) */}
  <div
    className="cluster-animation"
    data-depth={depthSpeed}
    style={{
      // No transform here - animation handles it
    }}
  >
    {/* Cluster content */}
  </div>
</div>
```

Then use CSS:
```css
.cluster-animation[data-depth="fast"] {
  animation: moveFast 20s ease-in-out infinite;
}

@keyframes moveFast {
  0%, 100% { transform: translateX(0) translateY(0); }
  50% { transform: translateX(4%) translateY(-2%); }
}
```

This separates concerns:
- Outer div: positioning, centering, 3D depth
- Inner div: movement animation
- No conflicts between inline styles and CSS animations

## Important: Cluster Node Structure

The cluster node contains multiple child elements that must be preserved:

```tsx
<div className="absolute group ..."> {/* This is the main cluster div */}
  {/* Glow effect */}
  <div className="absolute inset-0 bg-gradient-to-r ..." />
  
  {/* Main node with 3D sphere layers */}
  <div className="relative rounded-full ...">
    {/* Layer 1: Base sphere gradient */}
    <div className="absolute inset-0 rounded-full" />
    {/* Layer 2: Light reflection */}
    <div className="absolute inset-0 rounded-full" />
    {/* Layer 3: Edge shadow */}
    <div className="absolute inset-0 rounded-full" />
    
    {/* Content - cluster label */}
    <div className="absolute inset-3 z-10">
      <p>{cluster.name}</p>
    </div>
    
    {/* Animated ring (when active) */}
    {isActive && <div className="absolute inset-0 rounded-full animate-ping" />}
  </div>
  
  {/* Activity indicator */}
  {hasRecentActivity && <div className="absolute -top-1 -right-1 ..." />}
</div>
```

**Critical**: All these child elements must remain inside the animated wrapper. The wrapper pattern should wrap ALL of this content, not just parts of it.

## Alternative: JavaScript Animation Approach

If CSS animations prove too difficult, consider using `requestAnimationFrame`:

```tsx
useEffect(() => {
  const animate = () => {
    // Update cluster positions based on time and z-depth
    // Use refs to avoid re-renders
    requestAnimationFrame(animate);
  };
  animate();
}, []);
```

This gives full control but requires:
- Managing animation state
- Calculating positions based on time
- Updating DOM directly or using state (performance consideration)

