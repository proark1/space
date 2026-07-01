# SIGNAL LOST - Playable Flow Roadmap

Last updated: 2026-07-01

This is the finish-line tracker for the current playable game idea. The target flow is:

`lobby -> boardRocket -> launch -> capsule -> docking -> station -> command -> returnExtraction`

## Locked Direction

- Final game target: players recover physical tapes in the command center and bring them back to Earth.
- Temporary vertical-slice ending: the current station still sends recordings to Earth. This stays as a working proof until return/extraction is implemented.
- Every scene must expose one authoritative flow session with stage, room code, player name, roster, objective, and endgame. The first implementation lives in `lookdev/flow.js` as `flowSession()`.
- Real players replace NPC crew slots immediately. NPCs are fallback crew only.
- Host owns objectives, docking authority, and station threat/objective state. Clients can request actions, but the host decides final state.
- A row is not "done" until it has a smoke check or a targeted test.

## Status By Plan Item

| Plan item | Status | Implemented now | Still missing before done |
|---|---|---|---|
| Unify the playable flow | Partial | `flow.js` carries room/name/roster params and now exposes `flowSession()`; full-flow smoke covers lobby -> pad -> capsule -> docking -> station and command promotion. | Replace query-only handoff with a stronger FlowSession object for all scenes, add return/extraction stage, and make objective state persistent beyond station. |
| Build real lobby voice | Partial | `lookdev/voice_chat.js` has mic permission, mute/unmute, level meter, WebRTC peer audio tracks, and lobby UI. | Add clearer first-entry mic permission UX, speaker/nameplate icons per real player, smoke-friendly UI checks, and decide whether voice UI persists beyond lobby. |
| Fix live crew replacement | Partial | Lobby builds player roster; station replaces NPC labels/slots when peers join; flow params preserve named crew. | Make slot 2-4 claiming explicit across all scenes, restore NPCs on pre-launch leave, and verify replacement in lobby, capsule, docking, and station. |
| Make launch physically believable | Partial | Pad scene has exterior rocket, attached capsule, crew access arm/connector, arm clearing, ascent camera, and smoke coverage. | Tie lobby boarding to the outside connector more clearly, preserve seat assignments into capsule interior, and add assertions that capsule remains attached through ascent. |
| Add docking ownership | Partial | Dock scene has TAKE PILOT UI, first-claim control, spectator text, and auto/manual smoke coverage. | Add explicit release/takeover rules, host-authoritative docking state sync, and multiplayer smoke for pilot ownership. |
| Merge station mechanics | Partial | Station route has wider/longer walkable path, wet-floor slipping, gravity failure, CHORUS sensing, host-authoritative interactions, and ceiling ambusher. | Bring remaining mechanics from `apps/lookdev` if needed: pickups/extraction/combat feedback parity, stronger host events, and final return/extraction loop. |
| Expand the station | Partial | Current chain has engineering/mechanical, archive/password, security/laser, command center, left/right branches, mission work, lockers, and monster pressure. | Add more branch depth, section-specific mission work, and a clearer command-to-extraction route. |
| Endgame | Decided, not implemented | Current ending sends recordings to Earth and is smoke-tested. | Replace or extend it with physical tape pickup -> return/extraction -> Earth/debrief. |

## Milestone Order

1. Flow authority
   - Done when every scene exposes `flowSession`, smoke asserts stage/roster/endgame, and room/host/player slot survive all transitions.

2. Lobby voice and crew slots
   - Done when mic permission, mute, meter, speaker/nameplate, NPC replacement, and leave/rejoin behavior work before launch.

3. Launch and capsule continuity
   - Done when boarding connector, tower clearing, attached capsule, seated crew, and capsule interior handoff are visually and statefully continuous.

4. Docking ownership
   - Done when one player owns the pilot console, others see spectator/control UI, release/takeover rules work, and host sync owns final dock state.

5. Station route and mechanics
   - Done when the engineering/archive/security/command sections all have mission work, door gating, left/right branches, monster pressure, wet floors, gravity failure, and ceiling/roof reaction.

6. Return/extraction
   - Done when tapes are physically recovered, carried out, returned to Earth, and the debrief confirms what happened.

## Verification Gates

- `pnpm smoke:lookdev:flow` must pass after every flow, lobby, launch, docking, or station change.
- `pnpm smoke:lookdev:run` must pass after station mechanics change.
- Multiplayer slot/voice/docking changes need a local signaling browser smoke.
- A plan item only moves to Done when the relevant smoke covers it.
