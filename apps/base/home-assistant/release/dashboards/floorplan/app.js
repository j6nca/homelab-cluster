/* =============================================================================
 * app.js — scene, camera, interactions, simulation.
 * ===========================================================================*/
(function () {
  'use strict';

  const T = THREE;
  const H = window.HOUSE;
  const B = window.BLD;
  const FLOOR_STEP = H.wallHeight + H.slab + 0.04;
  const EXPLODE_X = H.width + 1.60;

  /* ------------------------------------------------------------------ *
   * state
   * ------------------------------------------------------------------ */
  const state = {
    floor: 1,             // 0 | 1 | 2 | 'all'
    time: 21.5,
    autoLights: true,
    doorsOpen: false,
    doorAmt: 0,
    showChips: true,
    autoRotate: false,
    lightMul: 1.0,
    exposure: 1.10,
    away: false,
    lights: {},           // "floorId:roomId" -> bool
    targetLights: {},
    ha: null,                // HAC client when running against (mock) HA
    hacErr: ''
  };

  /* ------------------------------------------------------------------ *
   * renderer / scene / camera
   * ------------------------------------------------------------------ */
  const canvas = document.getElementById('stage');
  const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = state.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();

  const VIEW_H = 22;
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, -200, 400);

  const SDAY = new T.Vector3(-8, 22, 26), SNIGHT = new T.Vector3(30, 18, 34);
  const C_DAY = new T.Color(0xffe9c9), C_NIGHT = new T.Color(0x9ab4d8);
  const _ca = new T.Color(), _cb = new T.Color();
  let bgDf = -1;
  function skyCss(df) {
    _ca.set(0x141821).lerp(_cb.set(0x6f9dc9), df);
    const top = '#' + _ca.getHexString();
    _ca.set(0x08080a).lerp(_cb.set(0xd3e2f0), df);
    return 'radial-gradient(125% 95% at 64% 16%, ' + top + ', #' + _ca.getHexString() + ')';
  }

  // lighting rig
  const hemi = new T.HemisphereLight(0x9fc6e8, 0x2a2620, 0.5);
  scene.add(hemi);
  const ambient = new T.AmbientLight(0xffffff, 0.10);
  scene.add(ambient);
  const sun = new T.DirectionalLight(0xffe9c9, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // faint cool moon light so silhouettes separate from the void at night
  const moon = new T.DirectionalLight(0x9ab4d8, 0.10);
  moon.position.set(-30, 18, -34);
  scene.add(moon);

  /* ------------------------------------------------------------------ *
   * build the three floors
   * ------------------------------------------------------------------ */
  const floors = H.floors.map((def) => {
    const f = B.buildFloor(def, H);
    f.group.position.y = def.level * FLOOR_STEP;
    scene.add(f.group);
    f.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.isGlass || o.material.transparent) { o.castShadow = false; o.receiveShadow = false; return; }
      if (o.geometry && o.geometry.type === 'PlaneGeometry') return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return f;
  });

  // initial light state
  floors.forEach((f) => f.rooms.forEach((r) => {
    state.lights[key(r)] = false;
    state.targetLights[key(r)] = false;
  }));
  function key(r) { return r.floor.id + ':' + r.def.id; }

  /* ------------------------------------------------------------------ *
   * camera orbit controls (custom, no external deps)
   * ------------------------------------------------------------------ */
  const cam = { az: 1.25, el: 0.88, target: new T.Vector3(H.width / 2, 1, H.depth / 2), userZoom: 1, fit: 1 };

  function applyCamera() {
    const r = 60;
    camera.position.set(
      cam.target.x + r * Math.cos(cam.el) * Math.sin(cam.az),
      cam.target.y + r * Math.sin(cam.el),
      cam.target.z + r * Math.cos(cam.el) * Math.cos(cam.az)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.updateMatrixWorld();
    camera.zoom = cam.fit * cam.userZoom;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -VIEW_H * aspect / 2;
    camera.right = VIEW_H * aspect / 2;
    camera.top = VIEW_H / 2;
    camera.bottom = -VIEW_H / 2;
    camera.updateProjectionMatrix();
    updateChipsVisibility();
    if (typeof fitView === 'function' && floors.length) fitView(false);
  }

  function visibleBox() {
    const box = new T.Box3();
    let any = false;
    floors.forEach((f) => {
      if (!f.group.visible) return;
      const bk = f.def.backyard;
      const b = new T.Box3(
        new T.Vector3(f.group.position.x - H.ext, f.group.position.y - (bk ? bk.drop + 0.15 : 0), f.group.position.z - (bk ? bk.depth + H.ext : H.ext)),
        new T.Vector3(f.group.position.x + H.width + H.ext, f.group.position.y + H.wallHeight, f.group.position.z + H.depth + H.ext)
      );
      box.union(b); any = true;
    });
    if (!any) box.set(new T.Vector3(0, 0, 0), new T.Vector3(H.width, H.wallHeight, H.depth));
    return box;
  }

  // free area left over after the fixed UI chrome, in CSS pixels
  function safeRect() {
    const W = window.innerWidth, H = window.innerHeight;
    let l = 18, r = W - 18, t = 18, b = H - 18;
    const q = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
    const bar = q('.topbar'); if (bar && bar.height) t = Math.max(t, bar.bottom + 10);
    const wx = q('#weather'); if (wx && wx.width) t = Math.max(t, wx.bottom + 10);
    const pn = q('#panel'); if (pn && pn.width) l = Math.max(l, pn.right + 10);
    const hn = q('#hint'); if (hn && hn.height) b = Math.min(b, hn.top - 10);
    if (r - l < 340) l = 18;
    if (b - t < 260) t = 18;
    return { cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
  }

  function fitView(animate) {
    const box = visibleBox();
    const center = new T.Vector3(); box.getCenter(center);
    cam.target.copy(center);
    applyCamera();
    // project the 8 corners into view space and size the frustum
    const inv = new T.Matrix4().copy(camera.matrixWorld).invert();
    const corners = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new T.Vector3(x, y, z).applyMatrix4(inv));
    const maxX = Math.max.apply(null, corners.map((p) => Math.abs(p.x)));
    const maxY = Math.max.apply(null, corners.map((p) => Math.abs(p.y)));
    const sr = safeRect();
    const aspect = window.innerWidth / window.innerHeight;
    const sx = sr.w / window.innerWidth, sy = sr.h / window.innerHeight;
    const z = Math.min(
      (VIEW_H / 2) * sy / Math.max(maxY, 0.001),
      (VIEW_H * aspect / 2) * sx / Math.max(maxX, 0.001)
    ) * 0.90;
    // slide the model into the middle of the free area so panels never sit on it
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const pxPerUnit = (window.innerHeight / VIEW_H) * z;
    cam.target
      .addScaledVector(right, -(sr.cx - window.innerWidth / 2) / pxPerUnit)
      .addScaledVector(up, (sr.cy - window.innerHeight / 2) / pxPerUnit);
    const prev = cam.fit * cam.userZoom;
    cam.fit = z; cam.userZoom = 1;
    applyCamera();
    if (animate === false) zoomTween = null;
    else tweenZoom(prev, z);
  }

  let zoomTween = null;
  function tweenZoom(from, to) {
    zoomTween = { from: from, to: to, t: 0, dur: 0.5, fit: to };
    cam.userZoom = 1;
  }

  /* ------------------------------------------------------------------ *
   * dollhouse cutaway — near-facing walls are lowered so the interior
   * is readable from any orbit angle.
   * ------------------------------------------------------------------ */
  const CUT = 0.28;                 // fraction of full wall height kept
  const camDir = new T.Vector3();
  function applyCutaway(dt) {
    camDir.subVectors(camera.position, cam.target);
    camDir.y = 0;
    if (camDir.lengthSq() < 1e-6) return;
    camDir.normalize();
    const cx = H.width / 2, cz = H.depth / 2;
    const lerp = Math.min(1, dt * 7);
    for (const f of floors) {
      if (!f.group.visible) continue;
      for (const m of f.wallSegs) {
        const s = m.userData.wseg;
        const perp = Math.abs(s.nx * camDir.x + s.nz * camDir.z);
        const near = (s.mx - cx) * camDir.x + (s.mz - cz) * camDir.z;
        const facing = perp > 0.12 && (!s.perim || near > 0);
        const edge = Math.min(1, Math.max(0, (perp - 0.12) / 0.20));
        const goal = facing ? (1 - edge * (1 - (state.floor === 'all' ? 0.17 : CUT))) : 1;
        s.k += (goal - s.k) * lerp;
        const k = s.k;
        if (s.kind === 'wall') {
          const top = s.h * k;
          if (s.y0 >= top - 0.02) { m.visible = false; }
          else {
            m.visible = true;
            const nh = Math.min(s.h, top - s.y0);
            m.scale.y = nh / s.h;
            m.position.y = s.y0 + nh / 2;
          }
        } else {
          m.visible = k > 0.92;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * pointer interaction
   * ------------------------------------------------------------------ */
  let drag = null;
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  let hovered = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, mode: (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit', moved: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { onHover(e); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'orbit') {
      cam.az -= dx * 0.006;
      cam.el = Math.max(0.10, Math.min(1.35, cam.el + dy * 0.005));
    } else {
      const s = (VIEW_H / window.innerHeight) / (cam.fit * cam.userZoom);
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      cam.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    }
    applyCamera();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 6) onClick(e);
    drag = null;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.userZoom = Math.max(0.25, Math.min(6, cam.userZoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    applyCamera();
  }, { passive: false });

  function pickRoom(e) {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(floors.reduce((a, f) => a.concat(f.group.visible ? f.pickables : []), []), false);
    return hits.length ? hits[0].object.userData.roomId : null;
  }
  function roomById(id) {
    for (const f of floors) for (const r of f.rooms) if (r.def.id === id) return r;
    return null;
  }
  function onHover(e) {
    const id = pickRoom(e);
    if (id === (hovered && hovered.def.id)) return;
    if (hovered) hovered.mesh.material.emissive.setHex(0x000000);
    hovered = id ? roomById(id) : null;
    if (hovered) { hovered.mesh.material.emissive.setHex(0x3a2f18); hovered.mesh.material.emissiveIntensity = 1; }
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }
  function onClick(e) {
    const id = pickRoom(e);
    if (!id) return;
    const r = roomById(id);
    toggleRoom(r, !state.lights[key(r)]);
    state.autoLights = false;
    syncUI();
  }

  /* ------------------------------------------------------------------ *
   * lighting
   * ------------------------------------------------------------------ */
  function toggleRoom(r, on) {
    if (state.ha) {
      // async round-trip: the subscription diff below flips state.lights
      state.ha.callService('light', on ? 'turn_on' : 'turn_off',
        { entity_id: HAC.entityIdFor(r.floor.id, r.def.id) });
      return;
    }
    state.lights[key(r)] = !!on;
    state.targetLights[key(r)] = !!on;
  }

  function dayFactor() {
    // 0 = deep night, 1 = full daylight
    const h = state.time;
    const raw = Math.sin((h - 6.5) / 13 * Math.PI);   // peaks ~13:00
    return Math.max(0, Math.min(1, raw * 1.25));
  }

  function autoSchedule(r) {
    const h = state.time;
    const night = h < 7.6 || h > 17.4;
    if (!night) return false;
    const n = r.def.name.toLowerCase();
    if (n.indexOf('bedroom') >= 0 && h > 23.2) return false;
    if (n.indexOf('hall') >= 0 || n.indexOf('landing') >= 0) return h < 7 || h > 18.5;
    if (n.indexOf('closet') >= 0) return false;
    if (r.floor.id === 'basement') return h < 7.2 || h > 18.8;
    return true;
  }

  function updateAutoLights() {
    if (!state.autoLights) return;
    floors.forEach((f) => f.rooms.forEach((r) => {
      const on = state.away ? false : autoSchedule(r);
      state.lights[key(r)] = on;
      state.targetLights[key(r)] = on;
    }));
  }

  function applyLighting() {
    const df = dayFactor();
    // 1 = every room lit, 0 = fully dark; dims the night ambience without
    // losing the moonlit silhouettes
    let on = 0, tot = 0;
    floors.forEach((f) => f.rooms.forEach((r) => { tot++; if (state.lights[key(r)]) on++; }));
    const lf = tot ? on / tot : 0;
    const dim = 0.22 + 0.78 * lf;
    // a single shadow-casting key light: warm high sun by day, cool low moon by night
    sun.position.lerpVectors(SNIGHT, SDAY, df);
    sun.color.copy(C_NIGHT).lerp(C_DAY, df);
    sun.intensity = (0.10 + 0.30 * lf) * (1 - df) + 2.4 * df;
    sun.target.position.set(H.width / 2, 0, H.depth / 2);
    sun.target.updateMatrixWorld();
    hemi.intensity = (0.085 + 0.215 * lf) * (1 - df) + (0.30 + df * 1.15) * df;
    hemi.color.setHSL(0.58, 0.45, 0.55 + df * 0.25);
    hemi.groundColor.setHSL(0.09, 0.25, 0.10 + df * 0.25);
    ambient.intensity = (0.03 + 0.11 * lf) * (1 - df) + (0.14 + df * 0.22) * df;
    if (state.floor === 'all') { hemi.intensity += 0.40; ambient.intensity += 0.22; }
    renderer.toneMappingExposure = state.exposure * (df * 1 + (1 - df) * (0.88 + 0.12 * lf));
    if (Math.abs(df - bgDf) > 0.012) { bgDf = df; document.body.style.background = skyCss(df); }

    const BASE = 20;
    floors.forEach((f) => {
      let anyOn = false;
      f.rooms.forEach((r) => {
        const on = !!state.lights[key(r)];
        if (on) anyOn = true;
        const p = r.light;
        const li = p.userData.light;
        const target = on ? BASE * state.lightMul : 0;
        // whole-building view: clamp the light's reach below the storey
        // spacing so upper floors don't bleed through the slabs onto the
        // storeys below (point lights cast no shadows)
        li.distance = state.floor === 'all' ? 4.2 : 11;
        li.intensity += (target - li.intensity) * 0.16;
        if (p.userData.glow) p.userData.glow.material.opacity = (li.intensity / BASE) * 0.45;
        if (p.userData.bulb) p.userData.bulb.material.emissiveIntensity = (li.intensity / BASE) * 0.75;
        if (p.userData.shade) p.userData.shade.material.emissiveIntensity = (li.intensity / BASE) * 0.6;
      });
      // table-lamp shades follow the room's own light
      const shadeOn = f.rooms.some((r) => state.lights[key(r)]);
      (f.lampShades || []).forEach((s) => { s.material.emissiveIntensity = shadeOn ? 0.9 : 0.0; });
      f.glasses.forEach((gm) => { gm.material.emissiveIntensity = anyOn ? 1.5 : 0.10; });
    });
  }

  /* ------------------------------------------------------------------ *
   * layout / visibility
   * ------------------------------------------------------------------ */
  function layout() {
    const all = state.floor === 'all';
    floors.forEach((f) => {
      const show = all || f.def.level === state.floor;
      f.group.visible = show;
      const ox = all ? f.def.level * 0.30 : 0;
      const oy = all ? f.def.level * 1.20 : 0;
      f.group.position.x = ox;
      f.group.position.y = f.def.level * FLOOR_STEP + oy;
      f.group.position.z = 0;
    });
    // hide floors that are not shown, from the pick list too
    document.getElementById('tabs').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', String(b.dataset.floor) === String(state.floor));
    });
    buildChips();
    fitView(true);
    updateChipsVisibility();
  }

  /* ------------------------------------------------------------------ *
   * room chips (DOM overlay projected from 3-D)
   * ------------------------------------------------------------------ */
  let guardUntil = performance.now() / 1000 + 5;
  const debugOn = location.hash.indexOf('debug') >= 0;
  let dbgT = 0;
  const roomsByKey = {};
  floors.forEach((f) => f.rooms.forEach((r) => { roomsByKey[key(r)] = r; }));

  const chipLayer = document.getElementById('chips');
  let chips = [];

  function buildChips() {
    if (state.floor === 'all') { chipLayer.innerHTML = ''; chips = []; return; }
    chipLayer.innerHTML = '';
    chips = [];
    floors.forEach((f) => {
      if (!f.group.visible) return;
      f.rooms.forEach((r) => {
        const el = document.createElement('div');
        el.className = 'chip';
        el.innerHTML =
          '<span class="dot"></span>' +
          '<span class="cname">' + r.def.name + '</span>' +
          '<span class="cvals"><span class="t">--</span><span class="h">--</span></span>';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleRoom(r, !state.lights[key(r)]);
          state.autoLights = false;
          syncUI();
        });
        chipLayer.appendChild(el);
        const anchor = new T.Vector3(
          f.group.position.x + r.def.x + r.def.w / 2,
          f.group.position.y + 1.20,
          r.def.z + r.def.d / 2
        );
        chips.push({ el: el, room: r, anchor: anchor, t: el.querySelector('.t'), h: el.querySelector('.h') });
      });
    });
  }

  const proj = new T.Vector3();
  const MIN_GAP = 30;                 // px of vertical spacing enforced between chips
  const _place = [];
  function updateChips() {
    const w = window.innerWidth, h = window.innerHeight;
    _place.length = 0;
    for (const c of chips) {
      proj.copy(c.anchor).project(camera);
      const x = (proj.x * 0.5 + 0.5) * w;
      const y = (-proj.y * 0.5 + 0.5) * h;
      const vis = state.showChips && proj.z < 1 && x > -140 && x < w + 140 && y > -80 && y < h + 80;
      if (!vis) { c.el.style.display = 'none'; continue; }
      _place.push({ c: c, x: x, y: y });
    }
    // simple top-down de-overlap so long narrow floors do not stack labels
    _place.sort((a, b) => a.y - b.y);
    let lastY = -1e9;
    for (const p of _place) {
      let y = p.y - 64;
      if (y - lastY < MIN_GAP) y = lastY + MIN_GAP;
      lastY = y;
      const lead = Math.max(0, p.y - y - 13);
      p.c.el.style.setProperty('--lead', lead.toFixed(0) + 'px');
      p.c.el.classList.toggle('nolead', lead < 5);
      p.c.el.style.display = 'flex';
      p.c.el.style.transform = 'translate(-50%,-50%) translate(' + p.x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
  }
  const _v4 = new T.Vector3();
  function modelOnScreen() {
    const box = visibleBox();
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          _v4.set(x, y, z).project(camera);
          const sx = (_v4.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-_v4.y * 0.5 + 0.5) * window.innerHeight;
          if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
        }
    const m = 40; // px of tolerance
    const w = window.innerWidth, h = window.innerHeight;
    return maxX > -m && minX < w + m && maxY > -m && minY < h + m;
  }

  function updateChipsVisibility() { updateChips(); }

  /* ------------------------------------------------------------------ *
   * simulation tick
   * ------------------------------------------------------------------ */
  const outdoor = H.outdoor;
  function outdoorTemp() {
    const h = state.time, i = Math.floor(h) % 24, j = (i + 1) % 24, t = h - Math.floor(h);
    return outdoor.curve[i] * (1 - t) + outdoor.curve[j] * t;
  }
  function outdoorHum() {
    const t = outdoorTemp();
    return Math.max(35, Math.min(95, 88 - (t - 2) * 1.6));
  }

  let simAcc = 0;
  function simulate(dt) {
    simAcc += dt;
    if (simAcc < 1.0) return;
    simAcc = 0;
    const out = outdoorTemp();
    if (!state.ha) {
      floors.forEach((f) => f.rooms.forEach((r) => {
        const on = state.lights[key(r)];
        const target = out + (r.def.temp - 20) * 0.15 + (on ? 0.55 : 0);
        r.temp += (target - r.temp) * 0.06 + (Math.random() - 0.5) * 0.05;
        r.hum += (Math.random() - 0.5) * 0.4;
        r.hum = Math.max(35, Math.min(72, r.hum));
        if (r.def.co2) r.def.co2 = Math.round(r.def.co2 + (on ? 6 : -4) + (Math.random() - 0.5) * 6);
      }));
      updateAutoLights();
    }
    // clock advance
    state.time = (state.time + 0.02) % 24;
    const ts = document.getElementById('timeslider');
    if (ts && !ts.matches(':active')) ts.value = state.time;
    refreshReadouts();
  }

  function refreshReadouts() {
    for (const c of chips) {
      c.t.textContent = c.room.temp.toFixed(1) + '°';
      c.h.textContent = c.room.hum.toFixed(0) + '%';
      c.el.classList.toggle('lit', !!state.lights[key(c.room)]);
    }
    const oh = Math.floor(state.time), om = Math.floor((state.time - oh) * 60);
    document.getElementById('clock').textContent =
      String(oh).padStart(2, '0') + ':' + String(om).padStart(2, '0');
    document.getElementById('wtemp').textContent = outdoorTemp().toFixed(1) + '°C';
    document.getElementById('whum').textContent = Math.round(outdoorHum()) + '%';
    document.getElementById('wwind').textContent = outdoor.wind.toFixed(1) + ' km/h';
    const lit = Object.keys(state.lights).filter((k) => state.lights[k]).length;
    let shown = 0;
    floors.forEach((f) => { if (f.group.visible) f.rooms.forEach((r) => { if (state.lights[key(r)]) shown++; }); });
    document.getElementById('wpwr').textContent = (lit * 11.4).toFixed(1) + ' W';
    document.getElementById('litcount').textContent = shown + '/' + floors.reduce((n, f) => n + (f.group.visible ? f.rooms.length : 0), 0) + ' on';
  }

  /* ------------------------------------------------------------------ *
   * UI wiring
   * ------------------------------------------------------------------ */
  function syncUI() {
    const tl = document.getElementById('timelabel');
    if (tl) { const th = Math.floor(state.time), tm = Math.floor((state.time - th) * 60);
      tl.textContent = String(th).padStart(2, '0') + ':' + String(tm).padStart(2, '0'); }
    const lml = document.getElementById('lmlabel'); if (lml) lml.textContent = Math.round(state.lightMul * 100) + '%';
    const exl = document.getElementById('exlabel'); if (exl) exl.textContent = state.exposure.toFixed(2);
    document.getElementById('auto').classList.toggle('on', state.autoLights);
    document.getElementById('doors').classList.toggle('on', state.doorsOpen);
    document.getElementById('chipsToggle').classList.toggle('on', state.showChips);
    document.getElementById('rotate').classList.toggle('on', state.autoRotate);
    document.getElementById('away').classList.toggle('on', state.away);
    document.getElementById('lightlist').innerHTML = floors
      .filter((f) => f.group.visible)
      .map((f) => f.rooms.slice().sort((a, b) => b.def.z - a.def.z).map((r) =>
        '<button class="lrow' + (state.lights[key(r)] ? ' on' : '') + '" data-k="' + key(r) + '">' +
        '<span class="ldot"></span>' + f.def.short + ' · ' + r.def.name + '</button>').join(''))
      .join('');
    document.querySelectorAll('.lrow').forEach((b) => b.addEventListener('click', () => {
      const room = roomsByKey[b.dataset.k];
      if (room) { toggleRoom(room, !state.lights[b.dataset.k]); state.autoLights = false; }
      syncUI();
    }));
    refreshReadouts();
  }

  function bind() {
    document.getElementById('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.floor = b.dataset.floor === 'all' ? 'all' : Number(b.dataset.floor);
      cam.el = state.floor === 'all' ? 0.78 : 0.88;
      cam.fit = 1; zoomTween = null;
      layout(); syncUI();
    });
    document.getElementById('timeslider').addEventListener('input', (e) => {
      state.time = Number(e.target.value); updateAutoLights(); applyLighting(); refreshReadouts();
    });
    document.getElementById('auto').addEventListener('click', () => {
      state.autoLights = !state.autoLights; if (state.autoLights) updateAutoLights(); syncUI();
    });
    document.getElementById('doors').addEventListener('click', () => {
      state.doorsOpen = !state.doorsOpen; syncUI();
    });
    document.getElementById('chipsToggle').addEventListener('click', () => { state.showChips = !state.showChips; syncUI(); });
    document.getElementById('rotate').addEventListener('click', () => { state.autoRotate = !state.autoRotate; syncUI(); });
    document.getElementById('away').addEventListener('click', () => {
      state.away = !state.away; updateAutoLights(); syncUI();
    });
    document.getElementById('allOn').addEventListener('click', () => {
      floors.forEach((f) => f.rooms.forEach((r) => { toggleRoom(r, true); }));
      state.autoLights = false; syncUI();
    });
    document.getElementById('allOff').addEventListener('click', () => {
      floors.forEach((f) => f.rooms.forEach((r) => { toggleRoom(r, false); }));
      state.autoLights = false; syncUI();
    });
    document.getElementById('reset').addEventListener('click', () => {
      cam.az = 1.25; cam.el = 0.88; cam.userZoom = 1; fitView(false);
    });
    const lm = document.getElementById('lightmul');
    lm.addEventListener('input', () => { state.lightMul = Number(lm.value); });
    const ex = document.getElementById('exposure');
    ex.addEventListener('input', () => { state.exposure = Number(ex.value); applyLighting(); });

    window.addEventListener('resize', () => { resize(); fitView(false); });
  // any user camera input cancels the boot-time framing guard
  window.addEventListener('pointerdown', () => { guardUntil = 0; });
  window.addEventListener('wheel', () => { guardUntil = 0; }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === '1') { state.floor = 0; layout(); syncUI(); }
      if (e.key === '2') { state.floor = 1; layout(); syncUI(); }
      if (e.key === '3') { state.floor = 2; layout(); syncUI(); }
      if (e.key === '0') { state.floor = 'all'; layout(); syncUI(); }
      if (e.key === 'd') { state.doorsOpen = !state.doorsOpen; syncUI(); }
      if (e.key === 'r') { cam.az = 1.25; cam.el = 0.88; cam.userZoom = 1; fitView(false); }
      if (e.key === 'l') { state.showChips = !state.showChips; syncUI(); }
    });
  }

  /* ------------------------------------------------------------------ *
   * animation loop
   * ------------------------------------------------------------------ */
  const clock = new T.Clock();
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, clock.getDelta());

    if (state.autoRotate) { cam.az += dt * 0.12; applyCamera(); }

    // doors
    const goal = state.doorsOpen ? 1 : 0;
    state.doorAmt += (goal - state.doorAmt) * Math.min(1, dt * 6);
    for (const f of floors) {
      if (!f.group.visible) continue;
      for (const d of f.doors) {
        if (!d.userData || !d.userData.door) continue;
        d.rotation.y = d.userData.base + (d.userData.open - d.userData.base) * state.doorAmt;
      }
    }

    if (zoomTween) {
      zoomTween.t += dt / zoomTween.dur;
      const k = Math.min(1, zoomTween.t);
      const e = 1 - Math.pow(1 - k, 3);
      cam.fit = zoomTween.from + (zoomTween.to - zoomTween.from) * e;
      cam.userZoom = 1;
      applyCamera();
      if (k >= 1) zoomTween = null;
    }

    if (guardUntil > now) {
      guardUntil = now;
      if (!modelOnScreen()) { fitView(false); guardUntil = now + 0.5; }
      else guardUntil = 0; // on-screen: stop checking
    }
    applyCutaway(dt);
    simulate(dt);
    applyLighting();
    updateChips();
    renderer.render(scene, camera);
    if (debugOn) { dbgT += dt; if (dbgT > 0.5) { dbgT = 0; debugTitle(); } }
  }

  /* ------------------------------------------------------------------ *
   * boot
   * ------------------------------------------------------------------ */
  // deep-linkable initial state, e.g. index.html#floor=all&time=12&az=1.25
  try {
    const qs = new URLSearchParams(String(location.hash).replace(/^#/, ''));
    if (qs.has('floor')) state.floor = qs.get('floor') === 'all' ? 'all' : Number(qs.get('floor'));
    if (qs.has('time')) { state.time = Number(qs.get('time')); document.getElementById('timeslider').value = String(state.time); }
    if (qs.has('az')) cam.az = Number(qs.get('az'));
    if (qs.has('el')) cam.el = Number(qs.get('el'));
    if (qs.has('chips')) state.showChips = qs.get('chips') !== '0';
    if (qs.has('auto')) state.autoLights = qs.get('auto') !== '0';
    if (qs.has('lights')) {
      state.autoLights = false;
      const v = qs.get('lights') !== '0';
      floors.forEach((f) => f.rooms.forEach((r) => {
        state.lights[key(r)] = v; state.targetLights[key(r)] = v;
      }));
    }
  } catch (e) { /* ignore malformed hash */ }

  resize();
  layout();
  fitView(false);

  // HA wiring: #ha=mock develops against the fake entity set;
  // #ha=real&token=... points at a live instance (Phase 2)
  try {
    const qs = new URLSearchParams(String(location.hash).replace(/^#/, ''));
    if (qs.has('ha')) {
      const mode = qs.get('ha');
      HAC.connect(mode === 'real'
        ? { impl: 'real', token: qs.get('token') || localStorage.getItem('ha_token') }
        : { impl: 'mock' })
        .then((client) => {
          state.ha = client;
          state.autoLights = false;
          client.subscribeEntities((ev) => {
            const c = ev.c || {};
            Object.keys(c).forEach((eid) => {
              const st = c[eid];
              const m = /^light\.((\w+)_(\w+))$/.exec(eid);
              if (m) {
                const k = m[2] + ':' + m[3];
                if (roomsByKey[k]) {
                  state.lights[k] = st.s === 'on';
                  state.targetLights[k] = st.s === 'on';
                }
                return;
              }
              const sm = /^sensor\.((\w+)_(\w+?)_(temperature|humidity|co2))$/.exec(eid);
              if (sm) {
                const k = sm[2] + ':' + sm[3];
                const r = roomsByKey[k];
                if (!r) return;
                if (sm[4] === 'temperature') r.temp = parseFloat(st.s);
                else if (sm[4] === 'humidity') r.hum = parseFloat(st.s);
                else r.def.co2 = parseInt(st.s, 10);
              }
            });
            syncUI(); refreshReadouts();
          }).catch((e) => { state.hacErr = 'sub ' + e.message; });
          syncUI();
          if (qs.has('hatest')) {
            const eid = HAC.entityIdFor('ground', 'living');
            const litAfterSnapshot = Object.keys(state.lights).filter((k) => state.lights[k]).length;
            client.callService('light', 'turn_on', { entity_id: eid }).then(() => {
              setTimeout(() => {
                const on = Object.keys(state.lights).filter((k) => state.lights[k]);
                const ok = litAfterSnapshot === 0 && on.length === 1 && on[0] === 'ground:living';
                document.title = 'HATEST ' + (ok ? 'PASS' : 'FAIL') +
                  ' snapshot=' + litAfterSnapshot + ' on=' + on.join(',');
              }, 500);
            });
          }
        })
        .catch((e) => { state.hacErr = 'conn ' + e.message; });
    }
  } catch (e) { state.hacErr = 'boot ' + e.message; } bind();
  updateAutoLights();
  syncUI();
  refreshReadouts();
  tick();
  // re-fit once the page has fully settled (fonts/scrollbars can shift the safe area)
  let settles = 0;
  const refit = () => { if (settles++ < 4) { fitView(false); setTimeout(refit, 250); } };
  window.addEventListener('load', refit);
  setTimeout(refit, 250);
  const _pm = /probe=([\d.]+),([\d.]+)/.exec(location.hash);
  if (_pm) {
    try {
      for (let i = 0; i < 60; i++) applyCutaway(0.2);
      const px = +_pm[1], py = +_pm[2];
      const rc = new T.Raycaster();
      rc.setFromCamera(new T.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1), camera);
      const vis = function (o) { while (o) { if (o.visible === false) return false; o = o.parent; } return true; };
      const hits = rc.intersectObjects(scene.children, true).filter(function (h) { return vis(h.object); }).slice(0, 5).map(function (h) {
        const o = h.object;
        const mm = Array.isArray(o.material) ? o.material[0] : o.material;
        const c = (mm && mm.color) ? mm.color.getHexString() : '?';
        const wp = o.getWorldPosition(new T.Vector3());
        return o.geometry.type + '#' + c + '@' + wp.x.toFixed(2) + ',' + wp.y.toFixed(2) + ',' + wp.z.toFixed(2) + '/d' + h.distance.toFixed(1);
      });
      document.title = 'PROBE ' + hits.join(' | ');
    } catch (e) { document.title = 'PROBEERR ' + e.message; }
  }

  let dbgBar = null, dbgBox = null, dbgLine = '';
  function ensureDebugDom() {
    if (dbgBar) return;
    dbgBar = document.createElement('div');
    dbgBar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:99;' +
      'background:rgba(10,10,12,.92);border:1px solid #444;border-radius:8px;padding:8px 10px;' +
      'font:11px/1.4 ui-monospace,Menlo,monospace;color:#cfe3ff;max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer';
    dbgBar.title = 'click to copy';
    dbgBar.addEventListener('click', function () {
      try { navigator.clipboard.writeText(dbgLine); dbgBar.style.outline = '2px solid #7fb5ff'; setTimeout(function () { dbgBar.style.outline = ''; }, 400); } catch (e) {}
    });
    document.body.appendChild(dbgBar);
    dbgBox = document.createElement('div');
    dbgBox.style.cssText = 'position:fixed;border:2px dashed rgba(120,180,255,.85);z-index:98;pointer-events:none';
    document.body.appendChild(dbgBox);
  }

  function debugTitle() {
    try {
      const b = visibleBox();
      const inv = new T.Matrix4().copy(camera.matrixWorld).invert();
      let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
      const v = new T.Vector3();
      for (const X of [b.min.x, b.max.x]) for (const Y of [b.min.y, b.max.y]) for (const Z of [b.min.z, b.max.z]) {
        v.set(X, Y, Z).applyMatrix4(inv);
        const px = ((v.x * camera.zoom / camera.right) * 0.5 + 0.5) * window.innerWidth;
        const py = (-(v.y * camera.zoom / camera.top) * 0.5 + 0.5) * window.innerHeight;
        sx0 = Math.min(sx0, px); sx1 = Math.max(sx1, px);
        sy0 = Math.min(sy0, py); sy1 = Math.max(sy1, py);
      }
      const _sr = safeRect(), _b = visibleBox();
      ensureDebugDom();
      dbgLine = 'DBG sr=' + _sr.w.toFixed(0) + 'x' + _sr.h.toFixed(0) +
        ' vw=' + window.innerWidth + 'x' + window.innerHeight +
        ' tgt=' + cam.target.x.toFixed(1) + ',' + cam.target.y.toFixed(1) + ',' + cam.target.z.toFixed(1) +
        ' cam=' + camera.position.x.toFixed(1) + ',' + camera.position.y.toFixed(1) + ',' + camera.position.z.toFixed(1) +
        ' zoom=' + camera.zoom.toFixed(2) +
        ' x=' + sx0.toFixed(0) + '..' + sx1.toFixed(0) +
        ' y=' + sy0.toFixed(0) + '..' + sy1.toFixed(0) +
        ' lights=' + Object.keys(state.lights).filter(function (k) { return state.lights[k]; }).length
        + ' cnv=' + Math.round(canvas.clientWidth) + 'x' + Math.round(canvas.clientHeight)
        + '/' + canvas.width + 'x' + canvas.height
        + ' scroll=' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight
        + ' dpr=' + (window.devicePixelRatio || 1)
        + ' ha=' + (state.ha ? state.ha.impl : 'sim') + (state.hacErr ? ' ERR:' + state.hacErr : '');
      document.title = dbgLine;
      dbgBar.textContent = dbgLine + '  (click to copy)';
      dbgBox.style.left = sx0 + 'px'; dbgBox.style.top = sy0 + 'px';
      dbgBox.style.width = Math.max(0, sx1 - sx0) + 'px'; dbgBox.style.height = Math.max(0, sy1 - sy0) + 'px';
      dbgBox.style.display = (sx1 > sx0 && sy1 > sy0) ? 'block' : 'none';
    } catch (e) { document.title = 'DBGERR ' + e.message; }
  }
  if (debugOn) debugTitle();

  const lo = document.getElementById('loading');
  lo.classList.add('hidden');
  setTimeout(function () { lo.style.display = 'none'; }, 600);
})();
