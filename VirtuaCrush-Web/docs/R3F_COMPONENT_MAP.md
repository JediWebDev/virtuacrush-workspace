# VirtuaCrush — R3F / Three.js Component Map

Migration blueprint for replacing the Phaser renderer with React Three Fiber (R3F),
without touching the backend sim, React UI, auth/billing, or the asset pipeline.

**Guiding principle:** the server `sim` is the *brains* (where actors are at venue/room
granularity, who is present, what each NPC wants). The client is the *body* (continuous-space
movement, pathfinding, rendering, driving). The migration only rebuilds the body.

---

## 1. What changes vs. what stays

| Layer | Today | After migration |
|---|---|---|
| Renderer | `src/components/GameCanvas.tsx` (Phaser) | `src/game3d/*` (R3F `<Canvas>`) |
| Scene config | `src/game/scenes.ts` (2D rects/pixels) | `src/game3d/scenes.ts` (3D `.glb` + vec3) |
| Character visual | tinted silhouette texture | `.glb` model + Mixamo clips |
| Movement | `physics.moveTo` velocity | navmesh path + character controller |
| Backend sim (`server/sim/*`) | — | **unchanged** |
| Dialogue / overlays (`DialogueBox`, `NoticeToast`, toasts) | DOM over canvas | **unchanged** (DOM over canvas) |
| Asset serving (`/api/assets` → R2) | — | **unchanged** (serves `.glb` too) |
| `presentation_catalog.ts`, `StageView` | — | **unchanged** (see §7 for StageView's role) |

The renderer is one component (~355 lines) mounted in `ChatInterface`. Everything else is a swap of
*its* internals and its config types.

---

## 2. Dependencies to add

```
three @react-three/fiber @react-three/drei      # core + helpers (useGLTF, useAnimations, loaders)
@react-three/rapier                              # physics: colliders, triggers, vehicle
recast-navigation-js @recast-navigation/three    # navmesh build + query + crowd avoidance
zustand                                          # game store (already R3F-idiomatic)
leva                                             # OPTIONAL — debug panel, replaces ?game-debug
```

Vehicle note: Rapier's `DynamicRayCastVehicleController` is the target for driving, but the React
wrapper doesn't fully expose it yet — wire it through the underlying Rapier API (see §6).

---

## 3. Data model evolution

### `Scene3D` (was `SceneMap`)

```ts
export interface Vec3 { x: number; y: number; z: number }

export interface Scene3D {
  id: string;                       // 'player_home', 'downtown' — ALIGN WITH sim venueSlug (§8)
  name: string;
  modelKey: string;                 // R2 key, e.g. 'scenes/player_home.glb'  (was mapKey)
  navmeshKey?: string;              // 'scenes/player_home.nav.glb' — baked navmesh; optional
  spawn: Vec3;                      // player spawn (was {x,y})
  npcAnchors: Record<string, Vec3>; // slotId -> stand position (was single npcAnchor)
  interactables: Interactable3D[];
  scale?: number;                   // model import scale
  camera?: { offset: Vec3; lookHeight: number }; // follow-cam tuning
}
```

### `Interactable3D` (was `SceneInteractable`)

```ts
export type InteractableKind = 'object' | 'door' | 'vehicle';

export interface Interactable3D {
  id: string;
  label: string;                    // "Watch TV", "Drive", "Go downtown"
  kind: InteractableKind;
  position: Vec3;
  radius: number;                   // proximity trigger radius (replaces 2D rect)
  to?: string;                      // doors: destination scene id
  requiresSkill?: string;           // gating — carried over verbatim
  requiresItemCategory?: string;
  result?: string;                  // flavor text for the toast
}
```

### `CharacterModel` (was `SpriteSource`)

```ts
export interface CharacterModel {
  id: string;                       // character / npc id
  modelKey: string;                 // 'characters/mina.glb'
  scale?: number;
  yOffset?: number;                 // feet-to-origin correction
  clips: {                          // Mixamo clip name -> our semantic name
    idle: string; walk: string; run?: string;
    sit?: string; talk?: string; drive?: string;
  };
}
```

Resolution helper mirrors the existing `portraitKeyForCharacter()` pattern in
`presentation_catalog.ts` — add `modelForCharacter(id)` with fallback:
**character `.glb` → generic placeholder capsule** (so nothing ever renders blank).

---

## 4. Component tree (R3F)

```
<GameRoot>                         # src/game3d/GameRoot.tsx — replaces GameCanvas.tsx
  props: scene, npc, playerName, onInteractNpc, onInteractObject, onNearChange, debug
  └─ <Canvas shadows>
       └─ <Physics>                # @react-three/rapier
            ├─ <SceneModel>        # loads scene .glb (useGLTF), static collider
            ├─ <Navmesh>           # loads/bakes navmesh, provides query context
            ├─ <Player>            # character controller + model + animation
            ├─ <CameraRig>         # follow camera (drei) targeting Player
            ├─ <Companion/>        # the dialogue character; sim-placed, idle/talk anims
            ├─ <Npc> × N           # other NPCs; navmesh agents driven by sim intent
            ├─ <Interactable> × N  # sensor colliders -> proximity -> onNearChange
            ├─ <Vehicle/>          # optional, present when scene has a 'vehicle' interactable
            └─ <DebugLayer/>       # navmesh wireframe, collider outlines (debug only)
```

Component responsibilities:

- **`GameRoot`** — the public boundary. Same prop shape as today's `GameCanvas`, so `ChatInterface`
  barely changes (see §9). Holds the `<Canvas>` and the zustand store provider.
- **`SceneModel`** — `useGLTF(assetUrl(scene.modelKey))`; auto-collider from the mesh, or a simplified
  collision proxy if the art mesh is heavy.
- **`Navmesh`** — loads `scene.navmeshKey` (or bakes from the scene mesh at load) via
  `recast-navigation-js`; exposes `findPath(from,to)` and a crowd for agent avoidance.
- **`Player`** — input (click-to-move via navmesh raycast, and/or WASD), Rapier kinematic character
  controller, plays `walk`/`idle` clips from velocity. Reports position to the store.
- **`Companion` / `Npc`** — render `CharacterModel`; position comes from sim state; `Npc` requests
  navmesh paths to its task target and animates along them. Pointer/proximity → `onInteractNpc`.
- **`Interactable`** — Rapier **sensor** collider at `position`/`radius`. Overlap with player → sets
  `near` in the store → fires `onNearChange`. Click/confirm → `onInteractObject` (doors switch scene,
  vehicles enter driving, objects show the result toast). Direct port of current logic.
- **`CameraRig`** — third-person follow using drei helpers; offset/look from `scene.camera`.
- **`Vehicle`** — §6.

---

## 5. Non-visual systems (hooks / store)

| Module | Role |
|---|---|
| `src/game3d/store.ts` (zustand) | `activeSceneId`, `near`, player transform, per-npc transforms + current intent. Single source the React UI reads. |
| `useNavmesh()` | Load navmesh for the active scene; `findPath`, `getClosestPoint`, crowd agents. |
| `usePlayerController()` | Input → desired velocity → Rapier move; sets walk/idle anim state. |
| `useSimSync()` | Reads sim state (existing endpoints/SSE) → places `Companion`/`Npc`, sets each NPC's target + intent. **The bridge in §8.** |
| `useInteractions()` | Pointer raycast + proximity resolution; emits `onNearChange` / `onInteract*`. |

---

## 6. The car — controllable-entity swap (NOT a driving sim)

The car is **not** a simulated vehicle (no interior, wheels, suspension, or brakes). It is an
*alternate body the player possesses*. The player input + follow-camera already drive an "active
entity"; entering a car just changes **which** entity that is.

**The abstraction.** Both `Player` and `Vehicle` are `ControllableEntity`s exposing the same
interface (apply move/steer input, report transform, choose movement clip/none). A single store field
selects the active one:

```ts
// store.ts
controlledEntityId: 'player' | 'vehicle';   // input + CameraRig follow this entity
```

- **Car model:** one external `.glb`, seen only from outside. Motion is arcade-kinematic —
  translate forward + yaw-steer on input across the drivable ground. Wheels can spin via a trivial
  rotation if the model has them, but nothing is physically simulated. No Rapier vehicle controller.
- **Physics use:** only **collision detection** for crashes — a Rapier collider on the car emits
  contact events; an impulse/speed over a threshold = "crash." That's the sole physics dependency.

**Enter → drive → exit lifecycle:**

```
near car (kind:'vehicle') + confirm  ─►  controlledEntityId = 'vehicle'
                                          Player model hidden; Vehicle takes input; camera retargets
drive (arcade move/steer over drivable area)
   ├─ Park:  stop + confirm (optionally inside a park zone)  ─┐
   └─ Crash: collision impulse > threshold                    ├─►  controlledEntityId = 'player'
                                                               │     spawn character at car's
                                                               │     exit anchor (beside the car),
                                                               │     car comes to rest, player resumes
```

So the character is hidden while driving and re-placed *next to* the car on park/crash. `CameraRig`,
`usePlayerController`, and the navmesh are all reused unchanged — only the controlled target swaps.

---

## 7. StageView's role after migration

`StageView` (visual-novel portraits + gradients, driven by `ScenePresentation`) and the 3D world are
not redundant — decide one of:

- **(A) 3D world for free-roam + exploration; StageView during dialogue** — tap an NPC → world stays,
  `DialogueBox` opens over it (today's flow). StageView retired, or kept only for "remote/phone" chats
  where there's no physical scene (`uiMode: 'chat_remote'`).
- **(B) 3D everywhere** — dialogue happens in-world with a camera push-in to the companion; StageView
  fully retired.

Recommendation: **(A)** — it reuses `uiMode` from `scenePresentation.ts` (`chat_remote` vs
`chat_copresent`) that the sim already emits, so remote chats render flat and co-present chats render in 3D.

---

## 8. Sim ↔ 3D contract (the important bridge)

The sim speaks in **venue + room + intent**; the client speaks in **vec3 + path**. `useSimSync`
translates:

```
sim                                   client (useSimSync)
----------------------------------    --------------------------------------------
spatialPatch.venueSlug  ──────────►   activeSceneId  (scene swap / portal)
spatialPatch.roomId     ──────────►   sub-anchor within the scene .glb
scene.presentNpcIds     ──────────►   which <Npc>/<Companion> are mounted + visible
agency action (e.g.                   pick target anchor → useNavmesh.findPath →
  'interrupt_date',     ──────────►     <Npc> walks there playing `walk`, then the
  'make_a_move')                        action resolves (anim / dialogue trigger)
```

Two naming systems must be reconciled first (flagged earlier): Phaser scenes `apartment`/`downtown`
vs sim venues `player_home`/`the_grind`/`westside_commons`/`ember_theater`. **Action item: make
`Scene3D.id === venueSlug`** so `activeSceneId` and the sim agree without a lookup table. Rooms
(`VENUE_PLACES` in `spatial.ts`: garage/living_room/kitchen/bedroom) become named anchor points or
sub-zones inside one scene `.glb`.

Pathfinding placement: high-level "go to the café" is a **sim** decision; the **client** turns it into
a navmesh path. NPCs never pathfind toward goals the sim didn't authorize.

---

## 9. Changes to `ChatInterface.tsx`

Minimal, because `GameRoot` keeps `GameCanvas`'s prop contract:

- Swap import: `GameCanvas` → `GameRoot`; `src/game/scenes` → `src/game3d/scenes`.
- `getScene` / `DEFAULT_SCENE_ID` / `activeScene` / `handleInteractNpc` / `handleInteractObject` /
  `setActiveSceneId` — **keep as-is** (now operating on `Scene3D`).
- `gameNpc` gains a resolved `model` (`modelForCharacter(character.id)`); `GameNpc` type extends to
  carry it.
- `DialogueBox`, `NoticeToast`, `worldToast`, history view — untouched.

---

## 10. Asset conventions (R2 keys via `/api/assets`)

| Asset | Key | Notes |
|---|---|---|
| Scene model | `scenes/<sceneId>.glb` | low-poly, Y-up, meters; one per venue |
| Scene navmesh | `scenes/<sceneId>.nav.glb` | baked in Blender/Recast; optional (can bake at runtime) |
| Character | `characters/<id>.glb` | Meshy mesh, rigged; Mixamo anims merged in |
| Animation naming | clips renamed to `idle/walk/run/sit/talk/drive` | rename Mixamo clips on export so `CharacterModel.clips` is stable |

Pipeline: Meshy → rig → Mixamo (FBX per anim) → Blender merge + rename clips → export `.glb` → upload
to R2 (or drop in `public/` for local testing — same fallback the proxy already does).

Multi-instance gotcha: clone characters with `SkeletonUtils.clone`, not `scene.clone()`, or skinned
meshes break.

---

## 11. Build order

0. **Scaffold** — add deps; `src/game3d/` with `Scene3D`/`CharacterModel` types + `store.ts`. No UI change.
1. **Static world** — `GameRoot` + `<Canvas>` + `SceneModel` loading one `.glb`; `CameraRig`. Swap it
   into `ChatInterface` behind a flag. (Floor-plane fallback when model missing, mirroring today.)
2. **Player + controller** — model, click-to-move, walk/idle anims.
3. **Interactables** — sensor triggers, proximity → `onNearChange`, doors switch scenes. Ports current logic.
4. **Companion + dialogue** — place via `useSimSync`; tap → `DialogueBox` (option A from §7).
5. **Navmesh + NPCs** — bake navmesh, NPCs path to sim-driven targets with avoidance.
6. **Vehicle** — `ControllableEntity` swap: enter/exit, arcade move/steer, crash-by-collision,
   re-place character beside the car on park/crash (§6).
7. **Polish** — shadows, LOD, lazy-load per scene, retire Phaser + `src/game/`.

---

## 12. Open decisions

1. **Scene id alignment** — adopt `Scene3D.id === venueSlug` (§8)? (Recommended.)
2. **Interiors** — separate `.glb` per room with portals, or one house model with named anchors?
3. **Movement** — click-to-move (matches current UX), WASD, or both?
4. **StageView** — option (A) hybrid or (B) 3D-everywhere (§7)?
5. **Car exit rules** — what counts as "parked" (stop anywhere + confirm, or only inside a park
   zone?) and the crash impulse threshold (§6).
6. **Navmesh** — bake offline in Blender (crisper) or generate at runtime from the scene mesh (less tooling)?
```
