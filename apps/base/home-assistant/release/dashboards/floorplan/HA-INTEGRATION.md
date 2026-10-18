# Rolling the floorplan prototype into Home Assistant

Status: Phase 1 is LIVE via GitOps -- this directory is deployed as a
ConfigMap (`home-assistant-dashboards-floorplan`, see ../kustomization.yaml)
mounted read-only at `/config/www/dashboards/floorplan`, served by HA at
`/local/dashboards/floorplan/index.html`. Edit files here, commit, push, Flux
reconciles; configMap volume updates propagate without a pod restart.
Mock-HA mode: append `#ha=mock`. The notes below cover Phases 2-4. The prototype in `release/dashboards/floorplan/`
is a self-contained static app: `index.html` + `js/data.js` (declarative house),
`js/build.js` (three.js scene builder), `js/app.js` (render loop, simulated
controls), `vendor/three.min.js` (pinned three.js 0.160.0, works offline).

HA runs in-cluster (`apps/base/home-assistant`), internal-only behind
`envoy-internal` at `home-assistant.j6n.internal` / `hass.j6n.internal`,
config on a Longhorn PVC, ZHA + Zigbee coordinator on a labelled node.

---

## Phase 0 — entity audit (no code)

Walk the HA instance and fill in the `ha:` block per room in `js/data.js`:

```js
rooms: [
  { id: 'living', name: 'Living Room', ...,
    ha: {
      lights:  ['light.living_room'],       // one or more, first = "primary"
      temp:    'sensor.living_room_temperature',
      hum:     'sensor.living_room_humidity',
      co2:     'sensor.living_room_co2'      // optional, chip shows it if present
    } }
]
```

Conventions to settle now:

- Prefer **light groups / areas** over individual bulbs so toggling a room is
  one `light.turn_on` call (`homeassistant.turn_on` on an area even works with
  no light entity).
- Door sensors / covers later: `binary_sensor.*_door` for the open/closed
  animation, `cover.*` for garage if ever motorised.
- The weather widget maps to the existing `weather.*` entity; day/night maps to
  `sun.sun` (elevation → `dayFactor()`), replacing the time slider.

## Phase 1 — host the app under HA (quick win)

Serve the static files from HA itself so everything is **same-origin** — no
tokens in query strings, no CORS, no new HTTPRoute.

GitOps mechanics (fits the existing app-template HelmRelease):

1. Promote the prototype to `apps/base/home-assistant/floorplan/` as one
   ConfigMap **per file** (`index`, `data.js`, `build.js`, `app.js`) — the
   ConfigMap 1 MiB limit forces `three.min.js` (670 KB) into its own ConfigMap.
   Generate them from the prototype dir with a small script so there is a
   single source of truth (no hand-pasted YAML blobs to drift).
2. Mount them into the HA pod at `/config/www/floorplan/` via
   `controllers.home-assistant.containers.app.configMaps` +
   volume mounts, exactly like `matter-server.yaml` is wired.
3. HA then serves them at
   `http://home-assistant.j6n.internal/local/floorplan/index.html`.
4. Surface it in Lovelace with a **Webpage card** (or a dashboard tab /
   `panel_iframe` sidebar panel — the card needs zero `configuration.yaml`
   changes, which matters because `/config` is PVC state, not GitOps state).

Auth for the app in this phase: a **long-lived access token** created in the
HA user profile, stored in the browser (prompted on first load, kept in
`localStorage`) and used for REST + WebSocket. Fine for a single-user internal
dashboard; the token never leaves the client. (An alternative that avoids even
that is Phase 3.)

## Phase 2 — swap the simulation for real state

`js/app.js` already funnels all state through two choke points, which keeps
this phase small:

- **Read path**: open a WebSocket (`/api/websocket`), `auth` with the token,
  `subscribe_entities` for every mapped entity. On each event, update the same
  `state.lights[key]`, temp/hum/co2 structures the sim writes today. Chips,
  lighting, weather widget and `syncUI()` keep working untouched.
  Bulb brightness (`light.brightness`) maps to the existing `lightMul` per
  room; colour temp could tint the point light later.
- **Write path**: clicking a room calls `services` on the WS
  (`light.toggle` with `entity_id`). The tween on `li.intensity` already gives
  us the fade-in animation on real state changes.
- **Time of day**: replace `state.time` with `sun.sun` elevation —
  `dayFactor()` becomes a function of real elevation (keep the slider as an
  override, double-click resets to "sun").
- Keep the simulation behind a `#sim` hash so the prototype stays demo-able
  offline (useful for the automated screenshot tests too).

## Phase 3 — proper Lovelace card (optional, the "right" way)

Refactor `app.js` into a custom element (`floorplan-card`) registered via a
Lovelace resource. HA then injects the `hass` object: entity state, live
subscription, and service calls with **no token at all**, and the card becomes
drop-in on any dashboard. Work involved: wrap the IIFE in a
`LitElement`-style class (or vanilla `HTMLElement`), move the boot sequence
into `setConfig()`/`connectedCallback()`, and render into a shadow root.
Phase 1 + 2 already keep all HA access behind one small `ha-client.js`, so
this is a swap of that one module plus the element wrapper.

## Phase 4 — polish & operability

- **Discovery**: the floorplan lives inside HA's route — homepage/gatus
  registration is already handled by HA's own HTTPRoute; nothing to annotate.
- **Testing**: the headless-Chrome + vision-critique loop keeps working —
  point it at the HA URL with `#sim` to test visuals, and add a mock-WS
  harness to test state wiring without touching real lights.
- **Scaling**: room-level light pools are already cheap (one PointLight per
  room). If entity count grows, `subscribe_entities` is still one WS message
  per change; nothing to re-architect.
- **Backup**: `/config/www/floorplan` is a mount, not PVC state — rebuilding
  the pod from Git is the recovery path, which is the point.

## Risks / notes

- ConfigMap 1 MiB limit → per-file ConfigMaps; regenerate script must fail if
  a file crosses the limit (three.js already does at ~670 KB source).
- HA serves `/local` with no cache headers and no ETag — fine for a private
  dashboard; if it ever matters, add a version query string from the CM hash
  (we already do `?v=` in the prototype).
- Long-lived token (Phase 1–2) is per-user and revocable; acceptable
  internally, but Phase 3 removes it entirely.
- No external exposure: HA is deliberately internal-only (no OIDC); the
  floorplan inherits that boundary for free.
- three.js 0.160.0 is vendored and offline — no CDN dependency to rot.

## Suggested order

Phase 0 (audit, 30 min) → Phase 1 (hosting, ~1 evening) → Phase 2 (state
wiring, the real work) → Phase 3 only if the iframe/token flow annoys.
