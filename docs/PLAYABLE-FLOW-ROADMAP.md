# SIGNAL LOST - Playable Flow Roadmap

Last updated: 2026-07-01

This is the finish-line tracker for the current playable game idea. The target flow is:

`lobby -> boardRocket -> launch -> capsule -> docking -> station -> command -> returnExtraction`

## Locked Direction

- Final game target: players recover physical tapes in the command center and bring them back to Earth.
- Vertical-slice ending: players recover physical tapes in command, reroute extraction power, carry the case back to the airlock, and launch it home.
- Every scene must expose one authoritative flow session with stage, room code, player name, roster, objective, and endgame. The first implementation lives in `lookdev/flow.js` as `flowSession()`.
- Real players replace NPC crew slots immediately. NPCs are fallback crew only.
- Host owns objectives, docking authority, and station threat/objective state. Clients can request actions, but the host decides final state.
- A row is not "done" until it has a smoke check or a targeted test.

## Status By Plan Item

| Plan item | Status | Implemented now | Still missing before done |
|---|---|---|---|
| Unify the playable flow | Partial | `flow.js` carries room/name/roster params, typed `slots=`, and now exposes `flowSession()`; full-flow smoke covers lobby -> pad -> capsule -> docking -> station -> command -> returnExtraction. | Make objective state persistent beyond the station scene/page boundary. |
| Build real lobby voice | Partial | `lookdev/voice_chat.js` has mic permission, mute/unmute, level meter, WebRTC peer audio tracks, lobby UI, and compact comms panels in capsule/docking/station with smoke-visible crew labels. | Add deeper real-device mic QA and persistent voice continuity across full page navigations if the final app stays multi-page. |
| Fix live crew replacement | Partial | Lobby assigns real peers into slots 2-4, restores NPCs on leave, emits typed slot handoff, and smoke verifies lobby/capsule/docking/station preserve player-vs-NPC roles and comms labels. | Add final product UI polish for slot claiming/release and real-player seat ownership. |
| Make launch physically believable | Done for vertical slice | Pad scene has exterior rocket, attached capsule, crew access arm/connector, arm clearing, ascent camera, smoke-asserted capsule attachment through ascent, and capsule seat assignments preserving HOST/CLIENT/NPC roles. | Product polish: clearer lobby-to-connector boarding staging and more detailed crew seating animations. |
| Add docking ownership | Done for vertical slice | Dock scene has TAKE PILOT/RELEASE/TAKE OVER UI, host-granted pilot ownership, remote pilot input forwarding, host-published docking state sync, and multiplayer smoke for claim/release/host takeover. | Product polish: clearer front-console art and longer real-device multiplayer QA. |
| Merge station mechanics | Partial | Station route has wider/longer walkable path, wet-floor slipping, gravity failure, CHORUS sensing, host-authoritative interactions, ceiling ambusher, and host-synced tape extraction. | Bring remaining mechanics from `apps/lookdev` if needed: pickups/combat feedback parity and stronger host event polish. |
| Expand the station | Done for vertical slice | Current chain has engineering/mechanical, archive/password, security/laser, command center, left/right branches, lockers, monster pressure, command-to-airlock extraction, and smoke-covered branch jobs for medical patch recovery, bypass winch priming, and survey tape recovery. | Product polish: more art passes, clearer signage, and optional mission rewards. |
| Endgame | Done for vertical slice | Physical tape pickup -> coolant valve -> breaker reroute -> airlock extraction -> Earth recovery debrief is implemented and smoke-tested. | Product polish: dedicated return-capsule scene and richer debrief. |

## Milestone Order

1. Flow authority
   - Done when every scene exposes `flowSession`, smoke asserts stage/roster/endgame, and room/host/player slot survive all transitions.

2. Lobby voice and crew slots
   - Done when mic permission, mute, meter, speaker/nameplate, NPC replacement, and leave/rejoin behavior work before launch.

3. Launch and capsule continuity
   - Done for the vertical slice: boarding connector, tower clearing, attached capsule, seated crew, and capsule interior handoff are visually/statefully continuous and smoke-tested.

4. Docking ownership
   - Done for the vertical slice: one player owns the pilot console, others see spectator/control UI, release/takeover rules work, host sync owns dock state, and smoke covers claim/release/takeover.

5. Station route and mechanics
   - Done for the vertical slice: the engineering/archive/security/command sections all have mission work, door gating, left/right branches, monster pressure, wet floors, gravity failure, ceiling/roof reaction, and smoke-covered optional branch work.

6. Return/extraction
   - Done for the vertical slice: tapes are physically recovered, carried out, returned to Earth, and the debrief confirms what happened.

## Verification Gates

- `pnpm smoke:lookdev:flow` must pass after every flow, lobby, launch, docking, or station change.
- `pnpm smoke:lookdev:run` must pass after station mechanics change.
- Multiplayer slot/voice/docking changes need a local signaling browser smoke.
- A plan item only moves to Done when the relevant smoke covers it.
