/* =============================================================================
 * ha.js — Home Assistant client layer.
 *
 * Two implementations behind one interface:
 *   mock : in-browser fake HA built from window.HOUSE — for developing the
 *          integration without a live instance. Ships fake `light.*` and
 *          `sensor.*` entities, mimics HA's subscribe_entities push protocol
 *          (initial snapshot + incremental diffs) and adds simulated latency.
 *   real : the actual HA WebSocket API (auth -> get_states +
 *          subscribe_entities -> call_service). Point it at a long-lived
 *          access token when Phase 1 lands.
 *
 * Usage:
 *   HAC.connect({ impl: 'mock' })                     // fake entity per room
 *   HAC.connect({ impl: 'real', url, token })         // live HA
 *     .then(client => client.subscribeEntities(cb))   // cb({c: {...diffs}})
 *     .then(() => client.callService('light', 'turn_on', { entity_id }))
 * ===========================================================================*/
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * mock — fake entities generated from the house definition
   * ------------------------------------------------------------------ */
  function mockConnect() {
    const entities = {};   // id -> { s: state-string, a: attributes }
    const subs = [];
    let timer = null;

    const emit = (diff) => { subs.forEach((cb) => { try { cb({ c: diff }); } catch (e) {} }); };

    // build lights + sensors from the declarative house
    (window.HOUSE.floors || []).forEach((f) => {
      (f.rooms || []).forEach((r) => {
        const base = f.id + '_' + r.id;
        const eid = 'light.' + base;
        entities[eid] = { s: 'off', a: { friendly_name: r.name + ' Lights', brightness: 0 } };
        entities['sensor.' + base + '_temperature'] = { s: String(r.temp), a: { unit_of_measurement: '°C', device_class: 'temperature' } };
        entities['sensor.' + base + '_humidity'] = { s: String(r.hum), a: { unit_of_measurement: '%', device_class: 'humidity' } };
        if (r.co2) entities['sensor.' + base + '_co2'] = { s: String(r.co2), a: { unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' } };
      });
    });

    function applyService(domain, service, data) {
      if (domain !== 'light') return;
      const id = (data && data.entity_id) || [];
      const ids = Array.isArray(id) ? id : [id];
      ids.forEach((eid) => {
        const e = entities[eid];
        if (!e) return;
        const on = service === 'toggle' ? e.s !== 'on'
          : service === 'turn_on';
        e.s = on ? 'on' : 'off';
        e.a.brightness = on ? (data && data.brightness != null ? data.brightness : 254) : 0;
        emit({ [eid]: { s: e.s, a: e.a } });
      });
    }

    return new Promise((resolve) => {
      const client = {
        impl: 'mock',
        states: entities,
        subscribeEntities(cb) {
          subs.push(cb);
          // initial snapshot, then incremental diffs
          cb({ c: Object.assign({}, entities) });
          return Promise.resolve(() => {});
        },
        callService(domain, service, data) {
          return new Promise((res) => {
            setTimeout(() => { applyService(domain, service, data); res({ ok: true }); }, 120);
          });
        },
        close() { if (timer) clearInterval(timer); }
      };
      // lazy sensor drift, so chips visibly tick like a live instance
      timer = setInterval(() => {
        const diff = {};
        Object.keys(entities).forEach((id) => {
          if (id.indexOf('sensor.') !== 0 || id.indexOf('_temperature') < 0) return;
          const v = parseFloat(entities[id].s) + (Math.random() - 0.5) * 0.2;
          entities[id].s = v.toFixed(1);
          diff[id] = { s: entities[id].s, a: entities[id].a };
        });
        if (Object.keys(diff).length) emit(diff);
      }, 4000);
      setTimeout(() => resolve(client), 80);   // pretend to connect
    });
  }

  /* ------------------------------------------------------------------ *
   * real — the HA WebSocket API
   * ------------------------------------------------------------------ */
  function realConnect(opts) {
    const url = opts.url || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/websocket';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let msgId = 1;
      const pending = {};       // msgId -> {resolve, onEvent}
      const subs = [];

      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: opts.token }));
        } else if (m.type === 'auth_ok') {
          resolve({
            impl: 'real',
            subscribeEntities(cb) {
              subs.push(cb);
              const id = msgId++;
              return new Promise((res) => {
                pending[id] = { resolve: res };
                // seed with full states, then subscribe for diffs
                ws.send(JSON.stringify({ id: id, type: 'subscribe_entities' }));
                ws.send(JSON.stringify({ id: msgId++, type: 'get_states' }));
              });
            },
            callService(domain, service, data) {
              const id = msgId++;
              return new Promise((res, rej) => {
                pending[id] = { resolve: res, reject: rej };
                ws.send(JSON.stringify({ id: id, type: 'call_service', domain: domain, service: service, service_data: data || {} }));
              });
            },
            close() { ws.close(); }
          });
        } else if (m.type === 'auth_invalid') {
          reject(new Error('auth_invalid'));
        } else if (m.type === 'event' && pending[m.id]) {
          const d = (m.event && m.event.data) || {};
          if (d.c) subs.forEach((cb) => cb({ c: d.c }));
        } else if (m.type === 'result' && pending[m.id]) {
          if (m.success) {
            if (Array.isArray(m.result)) {
              // get_states snapshot -> same {c: {...}} shape as diffs
              const snap = {};
              m.result.forEach((s) => { snap[s.entity_id] = { s: s.state, a: s.attributes }; });
              subs.slice().forEach((cb) => cb({ c: snap }));
            }
            if (pending[m.id].resolve) pending[m.id].resolve({ ok: true });
          } else if (pending[m.id].reject) {
            pending[m.id].reject(new Error(m.error && m.error.message));
          }
          delete pending[m.id];
        }
      };
      ws.onerror = () => reject(new Error('websocket error'));
    });
  }

  /* ------------------------------------------------------------------ *
   * public
   * ------------------------------------------------------------------ */
  const HAC = {
    // derive the entity id a room's primary light would have
    entityIdFor: (floorId, roomId) => 'light.' + floorId + '_' + roomId,
    connect: (opts) => (opts && opts.impl === 'real' ? realConnect(opts) : mockConnect())
  };
  window.HAC = HAC;
})();
