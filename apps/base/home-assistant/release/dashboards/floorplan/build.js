/* =============================================================================
 * build.js — turns the declarative data in data.js into three.js geometry.
 * Exposes window.BLD with textures, materials and builders.
 * ===========================================================================*/
(function () {
  'use strict';

  const T = THREE;

  /* ------------------------------------------------------------------ *
   * small helpers
   * ------------------------------------------------------------------ */
  const _cache = new Map();
  function mat(color, opts) {
    const key = color + '|' + JSON.stringify(opts || {});
    if (_cache.has(key)) return _cache.get(key);
    const m = new T.MeshStandardMaterial(Object.assign({
      color: color, roughness: 0.85, metalness: 0.0
    }, opts || {}));
    _cache.set(key, m);
    return m;
  }

  function box(w, h, d, material, x, y, z, ry) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (ry) m.rotation.y = ry;
    return m;
  }
  function cyl(r, h, material, x, y, z, seg) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg || 16), material);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  /* ------------------------------------------------------------------ *
   * procedural canvas textures
   * ------------------------------------------------------------------ */
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function noise(g, size, amount, alpha) {
    for (let i = 0; i < amount; i++) {
      const v = Math.floor(Math.random() * 255);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + alpha + ')';
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  }

  const TEX = {};
  TEX.wood = canvasTex(256, (g, s) => {
    g.fillStyle = '#c78d4f'; g.fillRect(0, 0, s, s);
    const plank = s / 4;
    for (let i = 0; i < 4; i++) {
      const shade = ['#c78d4f', '#bd8143', '#cf9557', '#b87a3a'][i % 4];
      g.fillStyle = shade; g.fillRect(0, i * plank, s, plank);
      g.strokeStyle = 'rgba(120,70,30,0.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, i * plank); g.lineTo(s, i * plank); g.stroke();
      // grain
      g.strokeStyle = 'rgba(150,95,45,0.28)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        const y = i * plank + 4 + Math.random() * (plank - 8);
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + 3, s * 0.6, y - 3, s, y);
        g.stroke();
      }
    }
    noise(g, s, 900, 0.05);
  });

  TEX.tile = canvasTex(256, (g, s) => {
    g.fillStyle = '#e8e2d4'; g.fillRect(0, 0, s, s);
    const n = 4, c = s / n;
    g.strokeStyle = '#c3b9a6'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke();
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = 'rgba(200,190,170,' + (0.06 + Math.random() * 0.09) + ')';
      g.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
    }
    noise(g, s, 500, 0.04);
  });

  TEX.checker = canvasTex(256, (g, s) => {
    const n = 8, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = ((i + j) % 2) ? '#cfc4ae' : '#efe9df';
      g.fillRect(i * c, j * c, c, c);
    }
    noise(g, s, 400, 0.04);
  });
  TEX.checker.center.set(0.5, 0.5); TEX.checker.rotation = Math.PI / 4;

  TEX.carpet = canvasTex(256, (g, s) => {
    g.fillStyle = '#8f8c86'; g.fillRect(0, 0, s, s);
    noise(g, s, 12000, 0.10);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 3000; i++) g.fillRect(Math.random() * s, Math.random() * s, 1, 3);
  });

  TEX.concrete = canvasTex(256, (g, s) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 30, 0, 7); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.06) + ')';
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 26, 0, 7); g.fill();
    }
    noise(g, s, 4000, 0.05);
  });

  TEX.grass = canvasTex(256, (g, s) => {
    g.fillStyle = '#41582d'; g.fillRect(0, 0, s, s);
    const shades = ['#4c6633', '#3a4f28', '#557038', '#33471f', '#5d7740'];
    g.lineWidth = 1;
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      g.strokeStyle = shades[Math.floor(Math.random() * shades.length)];
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.random() * 2 - 1, y - 2 - Math.random() * 2); g.stroke();
    }
  });
  TEX.glow = canvasTex(128, (g, s) => {
    const r = s / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0.00, 'rgba(255,226,180,1)');
    grd.addColorStop(0.18, 'rgba(255,198,120,0.62)');
    grd.addColorStop(0.45, 'rgba(255,160,70,0.20)');
    grd.addColorStop(1.00, 'rgba(255,140,50,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });

  TEX.shadow = canvasTex(128, (g, s) => {
    const r = s / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0.0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    grd.addColorStop(1.0, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });

  function surfaceMat(kind, w, d) {
    const src = TEX[kind] || TEX.concrete;
    const t = src.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(0.6, w / 1.1), Math.max(0.6, d / 1.1));
    return new T.MeshStandardMaterial({ map: t, roughness: kind === 'tile' ? 0.45 : 0.92, metalness: 0.0 });
  }

  /* ------------------------------------------------------------------ *
   * materials
   * ------------------------------------------------------------------ */
  const COL = {
    wallInt: 0xeadfc9,
    wallExt: 0xa89c8b,
    cap: 0xdcc9ae,
    slab: 0x8f8a7d,
    door: 0xd9cbb0,
    glass: 0xa8c8e0,
    metal: 0x8d939a,
    dark: 0x2b2b2b,
    wood: 0x9c6a3c
  };

  function wallMats(kind) {
    const face = mat(kind === 'ext' ? COL.wallExt : COL.wallInt, { roughness: 0.96 });
    const cap = mat(COL.cap, { roughness: 0.9, emissive: 0x4a3c2c, emissiveIntensity: 0.45 });
    return [face, face, cap, face, face, face]; // +x,-x,+y,-y,+z,-z
  }

  /* ------------------------------------------------------------------ *
   * walls with openings
   * ------------------------------------------------------------------ */
  function buildWall(parent, w, opts) {
    const o = opts || {};
    const t = w.t === 'ext' ? (o.ext || 0.18) : (o.int || 0.10);
    const H = o.height || 2.5;
    const mats = wallMats(w.t);
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const len = Math.hypot(dx, dz);
    const doors = [], segs = [];
    if (len < 1e-4) return { doors: doors, segs: segs };
    const ux = dx / len, uz = dz / len;
    const ang = Math.atan2(-uz, ux);            // rotation so local +x follows the wall
    const cx0 = w.x1, cz0 = w.z1;

    // wall-perpendicular + midpoint, consumed by the dollhouse cutaway in app.js
    const info = {
      nx: -uz, nz: ux,
      mx: (w.x1 + w.x2) / 2, mz: (w.z1 + w.z2) / 2,
      perim: w.t === 'ext'
    };
    function tag(m, y, h, kind) {
      m.userData.wseg = {
        y0: y, h: h, nx: info.nx, nz: info.nz,
        mx: info.mx, mz: info.mz, perim: info.perim, kind: kind, k: 1
      };
      segs.push(m);
    }

    function seg(a, b, y, h, material) {
      const l = b - a;
      if (l <= 1e-3 || h <= 1e-3) return;
      const cx = cx0 + ux * (a + b) / 2;
      const cz = cz0 + uz * (a + b) / 2;
      const m = new T.Mesh(new T.BoxGeometry(l, h, t), material || mats);
      m.position.set(cx, y + h / 2, cz);
      m.rotation.y = ang;
      tag(m, y, h, 'wall');
      parent.add(m);
    }

    const ops = (w.openings || []).slice().sort((a, b) => a.at - b.at);
    let cur = 0;
    const runs = [];
    for (const op of ops) {
      const a = Math.max(0, Math.min(len, op.at));
      const b = Math.max(a, Math.min(len, op.at + op.width));
      if (a > cur) runs.push([cur, a, 'solid', null]);
      runs.push([a, b, op.kind, op]);
      cur = b;
    }
    if (cur < len) runs.push([cur, len, 'solid', null]);

    const DOOR_H = 2.05, WIN_SILL = 0.9, WIN_HEAD = 2.1, OPEN_HEAD = 2.2;

    for (const [a, b, kind, op] of runs) {
      if (kind === 'solid') { seg(a, b, 0, H); continue; }
      if (kind === 'door') {
        seg(a, b, DOOR_H, H - DOOR_H);                       // lintel
        const leaves = makeDoorLeaf(parent, op, a, b, cx0, cz0, ux, uz, ang, t);
        for (const lf of leaves) {
          const bd = o.bounds;
          if (bd) {
            const L = lf.userData.len || 0;
            const tx = lf.position.x + L * Math.cos(lf.userData.open);
            const tz = lf.position.z - L * Math.sin(lf.userData.open);
            if (tx < bd[0] + 0.03 || tx > bd[2] - 0.03 || tz < bd[1] + 0.03 || tz > bd[3] - 0.03) {
              lf.userData.open = lf.userData.base - (lf.userData.open - lf.userData.base);
            }
          }
          tag(lf, 0, 2.0, 'door'); doors.push(lf);
        }
      } else if (kind === 'window') {
        seg(a, b, 0, WIN_SILL);                              // below sill
        seg(a, b, WIN_HEAD, H - WIN_HEAD);                   // above head
        // glass
        const l = b - a;
        const cx = cx0 + ux * (a + b) / 2, cz = cz0 + uz * (a + b) / 2;
        const gm = new T.Mesh(new T.BoxGeometry(l - 0.06, WIN_HEAD - WIN_SILL - 0.06, 0.03),
          new T.MeshStandardMaterial({ color: 0xbfd8ea, transparent: true, opacity: 0.22,
            roughness: 0.1, metalness: 0.1, emissive: 0xffcf8f, emissiveIntensity: 0 }));
        gm.position.set(cx, (WIN_SILL + WIN_HEAD) / 2, cz);
        gm.rotation.y = ang;
        gm.userData.isGlass = true;
        tag(gm, WIN_SILL, WIN_HEAD - WIN_SILL, 'glass');
        parent.add(gm);
      } else { // cased opening
        seg(a, b, OPEN_HEAD, H - OPEN_HEAD);
      }
    }
    return { doors: doors, segs: segs };
  }

  function makeDoorLeaf(parent, op, a, b, cx0, cz0, ux, uz, ang, t) {
    const l = b - a;
    const hingeAtEnd = op.hinge === 'end';
    const hx = cx0 + ux * (hingeAtEnd ? b : a);
    const hz = cz0 + uz * (hingeAtEnd ? b : a);
    const pivot = new T.Group();
    pivot.position.set(hx, 0, hz);
    const base = hingeAtEnd ? ang + Math.PI : ang;
    pivot.rotation.y = base;
    const leafMat = mat(COL.door, { roughness: 0.7 });
    const half = op.dbl ? (l / 2) : l;
    const leaf = box(l - 0.05, 2.0, 0.045, leafMat, 0, 1.0, 0);
    if (op.dbl) {
      leaf.scale.x = 0.5; leaf.position.x = (l / 2) * 0.5;
      pivot.add(leaf);
      const p2 = new T.Group();
      p2.position.set(cx0 + ux * b, 0, cz0 + uz * b);
      p2.rotation.y = (hingeAtEnd ? ang : ang + Math.PI) + Math.PI;
      const leaf2 = box(l - 0.05, 2.0, 0.045, leafMat, 0, 1.0, 0);
      leaf2.scale.x = 0.5; leaf2.position.x = (l / 2) * 0.5;
      p2.add(leaf2);
      parent.add(p2);
      pivot.userData.partner = p2;
      p2.userData.partner = pivot;
    } else {
      leaf.position.x = (l - 0.05) / 2;
      pivot.add(leaf);
    }
    pivot.userData.len = op.dbl ? (l - 0.05) * 0.5 : (l - 0.05);
    if (op.dbl && pivot.userData.partner) pivot.userData.partner.userData.len = (l - 0.05) * 0.5;
    const swing = (op.swing === -1 ? -1 : 1);
    pivot.userData.base = base;
    pivot.userData.open = base + swing * Math.PI * 0.46 * (hingeAtEnd ? -1 : 1);
    pivot.userData.door = true;
    parent.add(pivot);
    const out = [pivot];
    if (op.dbl && pivot.userData.partner) out.push(pivot.userData.partner);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * stairs
   * ------------------------------------------------------------------ */
  function buildStairs(parent, s) {
    const g = new T.Group();
    const steps = 12;
    const rise = s.h / steps;
    const tread = s.d / steps;
    const m = mat(0xb98a52, { roughness: 0.8 });
    const sm = mat(0x8a6a44, { roughness: 0.85, emissive: 0x3a2410, emissiveIntensity: 0.8 });
    for (let i = 0; i < steps; i++) {
      let w, d, x, z;
      if (s.dir === 'n' || s.dir === 's') {
        w = s.w; d = tread;
        x = s.x + s.w / 2;
        z = s.dir === 'n' ? s.z + s.d - (i + 0.5) * tread : s.z + (i + 0.5) * tread;
      } else {
        w = tread; d = s.d;
        x = s.dir === 'e' ? s.x + (i + 0.5) * tread : s.x + s.d - (i + 0.5) * tread;
        z = s.z + s.d / 2;
      }
      const h = rise * (i + 1);
      g.add(box(w, h, d, m, x, h / 2, z));
      g.add(box(w, 0.04, d + 0.02, sm, x, h + 0.02, z));
    }
    parent.add(g);
    return g;
  }

  /* ------------------------------------------------------------------ *
   * furniture
   * ------------------------------------------------------------------ */
  const WOOD = 0x9c6a3c, WOOD_D = 0x7a4a28, FABRIC = 0x8fa3b8, WHITE = 0xf2efe8;

  function contact(g, w, d, y) {
    const s = new T.Mesh(new T.PlaneGeometry(w * 1.5, d * 1.5),
      new T.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.rotation.x = -Math.PI / 2;
    s.position.y = (y || 0) + 0.045;
    g.add(s);
  }

  const FURN = {
    bed: (it) => {
      const g = new T.Group();
      const w = it.w, d = it.d, cover = it.cover || 0xe0d6c4;
      g.add(box(w, 0.32, d, mat(WOOD_D), 0, 0.16, 0));
      g.add(box(w - 0.08, 0.24, d - 0.10, mat(cover, { roughness: 0.95 }), 0, 0.42, 0.02));
      g.add(box(w, 0.85, 0.09, mat(WOOD), 0, 0.42, -d / 2 + 0.045));           // headboard
      g.add(box(w * 0.42, 0.12, 0.34, mat(WHITE, { roughness: 0.95 }), -w * 0.22, 0.60, -d / 2 + 0.30));
      g.add(box(w * 0.42, 0.12, 0.34, mat(WHITE, { roughness: 0.95 }), w * 0.22, 0.60, -d / 2 + 0.30));
      g.add(box(w - 0.02, 0.06, d * 0.34, mat(it.throw || 0xb8724a, { roughness: 0.95 }), 0, 0.56, d * 0.30));
      contact(g, w, d);
      return g;
    },
    nightstand: (it) => {
      const g = new T.Group();
      g.add(box(0.45, 0.5, 0.40, mat(WOOD), 0, 0.25, 0));
      g.add(box(0.40, 0.05, 0.36, mat(0x6b4326), 0, 0.34, 0.01));
      if (it.lamp) {
        g.add(cyl(0.045, 0.14, mat(WOOD_D), 0, 0.57, 0));
        const shade = new T.Mesh(new T.CylinderGeometry(0.09, 0.13, 0.16, 16, 1, true),
          new T.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc888, emissiveIntensity: 0,
            side: T.DoubleSide, roughness: 0.9 }));
        shade.position.set(0, 0.72, 0);
        g.add(shade);
        g.userData.lampShade = shade;
      }
      return g;
    },
    wardrobe: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 1.95, it.d, mat(WOOD), 0, 0.975, 0));
      g.add(box(0.02, 1.9, it.d + 0.01, mat(0x6b4326), 0, 0.975, 0));
      g.add(cyl(0.012, 0.12, mat(COL.metal), -0.03, 1.05, it.d / 2 + 0.01));
      g.add(cyl(0.012, 0.12, mat(COL.metal), 0.03, 1.05, it.d / 2 + 0.01));
      contact(g, it.w, it.d);
      return g;
    },
    sofa: (it) => {
      const g = new T.Group();
      const w = it.w, d = it.d, c = it.color || FABRIC;
      g.add(box(w, 0.34, d, mat(c, { roughness: 0.95 }), 0, 0.17, 0));
      g.add(box(w * 0.34, 0.42, d, mat(c, { roughness: 0.95 }), -w * 0.33, 0.55, 0)); // back (west)
      g.add(box(w, 0.22, 0.18, mat(c, { roughness: 0.95 }), 0, 0.44, -d / 2 + 0.09));
      g.add(box(w, 0.22, 0.18, mat(c, { roughness: 0.95 }), 0, 0.44, d / 2 - 0.09));
      g.add(box(w * 0.30, 0.30, d * 0.34, mat(0xd8b98a, { roughness: 0.95 }), w * 0.06, 0.52, 0));
      contact(g, w, d);
      return g;
    },
    armchair: (it) => {
      const g = new T.Group();
      const c = it.color || FABRIC;
      g.add(box(0.75, 0.34, 0.75, mat(c, { roughness: 0.95 }), 0, 0.17, 0));
      g.add(box(0.75, 0.42, 0.18, mat(c, { roughness: 0.95 }), 0, 0.55, -0.28));
      g.add(box(0.16, 0.24, 0.75, mat(c, { roughness: 0.95 }), -0.30, 0.46, 0));
      g.add(box(0.16, 0.24, 0.75, mat(c, { roughness: 0.95 }), 0.30, 0.46, 0));
      contact(g, 0.75, 0.75);
      return g;
    },
    coffee: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.05, it.d, mat(WOOD), 0, 0.40, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(box(0.05, 0.40, 0.05, mat(WOOD_D), sx * (it.w / 2 - 0.06), 0.20, sz * (it.d / 2 - 0.06)));
      g.add(cyl(0.05, 0.14, mat(0x9db88a), -0.10, 0.50, 0.05));
      g.add(box(0.22, 0.03, 0.16, mat(0x6b5b4a), 0.12, 0.44, -0.05));
      contact(g, it.w, it.d);
      return g;
    },
    table: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.05, it.d, mat(WOOD), 0, 0.74, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(box(0.06, 0.72, 0.06, mat(WOOD_D), sx * (it.w / 2 - 0.08), 0.36, sz * (it.d / 2 - 0.08)));
      if (it.chairs) {
        const n = it.chairs;
        const long = it.w >= it.d;
        for (let i = 0; i < n; i++) {
          const side = (i % 2) ? 1 : -1;
          const k = Math.floor(i / 2);
          const off = (k - (Math.ceil(n / 2) - 1) / 2) * 0.55;
          let cx, cz, ry;
          if (long) { cx = off; cz = side * (it.d / 2 + 0.30); ry = side > 0 ? Math.PI : 0; }
          else { cx = side * (it.w / 2 + 0.30); cz = off; ry = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
          const ch = FURN.chair({});
          ch.position.set(cx, 0, cz); ch.rotation.y = ry;
          g.add(ch);
        }
        // vase
        g.add(cyl(0.05, 0.12, mat(0xbfd8ea), 0, 0.83, 0));
      }
      contact(g, it.w, it.d);
      return g;
    },
    chair: () => {
      const g = new T.Group();
      g.add(box(0.42, 0.05, 0.42, mat(WOOD), 0, 0.45, 0));
      g.add(box(0.42, 0.45, 0.05, mat(WOOD), 0, 0.68, -0.18));
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(box(0.04, 0.45, 0.04, mat(WOOD_D), sx * 0.17, 0.225, sz * 0.17));
      return g;
    },
    counter: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.86, it.d, mat(0x8fa98a), 0, 0.43, 0));
      g.add(box(it.w + 0.04, 0.05, it.d + 0.04, mat(0x2f3438, { roughness: 0.4 }), 0, 0.885, 0));
      return g;
    },
    upper: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.70, it.d, mat(0x8fa98a), 0, 1.75, 0));
      return g;
    },
    island: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.86, it.d, mat(0x8fa98a), 0, 0.43, 0));
      g.add(box(it.w + 0.06, 0.06, it.d + 0.06, mat(0x2f3438, { roughness: 0.4 }), 0, 0.89, 0));
      // sink
      g.add(box(0.46, 0.06, 0.34, mat(0xb9c2c8, { metalness: 0.7, roughness: 0.25 }), -0.30, 0.90, 0));
      g.add(cyl(0.02, 0.22, mat(COL.metal, { metalness: 0.8, roughness: 0.25 }), -0.30, 1.02, -0.16));
      // boards
      g.add(box(0.30, 0.03, 0.22, mat(WOOD), 0.28, 0.92, 0.05));
      return g;
    },
    stove: (it) => {
      const g = new T.Group();
      g.add(box(0.58, 0.03, 0.52, mat(0x1e1e1e, { roughness: 0.35 }), 0, 0.92, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        g.add(cyl(0.055, 0.012, mat(0x3a3a3a), sx * 0.13, 0.935, sz * 0.11, 20));
      return g;
    },
    fridge: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 1.80, it.d, mat(0xd7dadd, { metalness: 0.5, roughness: 0.35 }), 0, 0.90, 0));
      g.add(box(0.03, 0.55, 0.03, mat(COL.metal), it.w / 2 - 0.08, 1.25, it.d / 2 + 0.01));
      g.add(box(it.w, 0.01, it.d, mat(0x9aa0a6), 0, 0.98, 0));
      contact(g, it.w, it.d);
      return g;
    },
    sideboard: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.72, it.d, mat(0xa0522d), 0, 0.36, 0));
      g.add(box(it.w + 0.03, 0.04, it.d + 0.03, mat(0x6b4326), 0, 0.74, 0));
      g.add(cyl(0.06, 0.22, mat(0x9db88a), -0.05, 0.86, 0.3));
      return g;
    },
    tv: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.38, 0.38, mat(WOOD_D), 0, 0.19, 0));
      g.add(box(0.07, 0.20, 0.07, mat(COL.dark), 0, 0.48, 0));
      const scr = new T.Mesh(new T.BoxGeometry(it.w, it.w * 0.56, 0.035),
        new T.MeshStandardMaterial({ color: 0x14161a, emissive: 0x24466b, emissiveIntensity: 0.38, roughness: 0.35 }));
      scr.position.set(0, 0.86, 0);
      g.add(scr);
      g.userData.screen = scr;
      return g;
    },
    fireplace: (it) => {
      const g = new T.Group();
      g.add(box(0.62, 1.25, 0.55, mat(0x2b2b2b, { roughness: 0.6 }), 0, 0.62, 0));
      const fire = new T.Mesh(new T.CircleGeometry(0.13, 24),
        new T.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xff7b2e, emissiveIntensity: 2.4 }));
      fire.position.set(0, 0.55, -0.29); fire.rotation.y = Math.PI;
      g.add(fire);
      g.userData.fire = fire;
      g.add(cyl(0.07, 1.25, mat(0x2b2b2b, { roughness: 0.6 }), 0, 1.85, 0, 12));
      return g;
    },
    rug: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.02, it.d, mat(it.color || 0x6f87a8, { roughness: 1.0 }), 0, 0.05, 0));
      return g;
    },
    car: (it) => {
      const g = new T.Group();
      const paint = mat(it.color || 0x8c3030, { roughness: 0.35, metalness: 0.55 });
      const glass = mat(0x223244, { roughness: 0.15, metalness: 0.4 });
      const tire = mat(0x1c1c1e, { roughness: 0.95 });
      g.add(box(1.78, 0.52, 4.30, paint, 0, 0.56, 0));                 // body
      g.add(box(1.66, 0.50, 2.05, paint, 0, 1.07, -0.15));             // cabin shell
      g.add(box(1.68, 0.34, 1.86, glass, 0, 1.11, -0.15));             // glass band
      g.add(box(1.80, 0.14, 0.34, paint, 0, 0.30, 2.05));              // front bumper
      g.add(box(1.80, 0.14, 0.34, paint, 0, 0.30, -2.05));             // rear bumper
      const wg = new T.CylinderGeometry(0.33, 0.33, 0.24, 18);
      [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]].forEach((p) => {
        const w = new T.Mesh(wg, tire);
        w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.33, p[1]); g.add(w);
      });
      [-0.6, 0.6].forEach((x) => g.add(box(0.35, 0.12, 0.06,
        mat(0xfff2cf, { emissive: 0xffd9a0, emissiveIntensity: 0.5, roughness: 0.3 }), x, 0.66, -2.16)));
      contact(g, 2.0, 4.6);
      return g;
    },
    lawnchair: (it) => {
      const g = new T.Group();
      const c = mat(it.color || 0xb9c79a, { roughness: 0.95 });
      const fr = mat(0x6b6f66, { roughness: 0.6, metalness: 0.5 });
      const seat = box(0.62, 0.05, 0.55, c, 0, 0.32, 0.10); seat.rotation.x = -0.12; g.add(seat);
      const back = box(0.62, 0.05, 0.62, c, 0, 0.55, -0.30); back.rotation.x = -0.55; g.add(back);
      [-0.27, 0.27].forEach((x) => {
        g.add(box(0.05, 0.34, 0.05, fr, x, 0.16, 0.30));
        g.add(box(0.05, 0.55, 0.05, fr, x, 0.28, -0.55));
      });
      contact(g, 0.75, 0.85);
      return g;
    },
    grill: (it) => {
      const g = new T.Group();
      const mtl = mat(0x2e3033, { roughness: 0.45, metalness: 0.6 });
      g.add(box(0.55, 0.62, 0.52, mtl, 0, 0.82, 0));                   // cook box
      g.add(box(0.62, 0.06, 0.58, mtl, 0, 1.17, 0));                   // lid
      g.add(box(0.26, 0.55, 0.40, mat(0x3a3d42, { roughness: 0.6, metalness: 0.4 }), 0.42, 0.72, 0)); // hopper
      g.add(cyl(0.05, 0.34, mtl, -0.15, 1.40, -0.10));                 // chimney
      g.add(box(0.08, 0.72, 0.08, mtl, 0, 0.36, 0.22));                // front leg
      const wg = new T.CylinderGeometry(0.10, 0.10, 0.08, 12);
      [-0.26, 0.26].forEach((x) => {
        const w = new T.Mesh(wg, mat(0x1c1c1e, { roughness: 0.95 }));
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.10, -0.22); g.add(w);
      });
      contact(g, 0.95, 0.8);
      return g;
    },
    gardenbed: (it) => {
      const g = new T.Group();
      const w = it.w || 1.6, d = it.d || 0.45;
      g.add(box(w, 0.30, d, mat(0x7a5c3e, { roughness: 0.95 }), 0, 0.15, 0));
      g.add(box(w - 0.10, 0.06, d - 0.10, mat(0x3a2f24, { roughness: 1.0 }), 0, 0.30, 0));
      for (let i = 0; i < 5; i++) {
        const b = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), mat(0x4d6b33, { roughness: 1.0 }));
        b.position.set(-w / 2 + 0.18 + i * (w - 0.36) / 4, 0.40, (Math.random() - 0.5) * Math.max(0.05, d - 0.34));
        b.scale.y = 0.8; g.add(b);
      }
      contact(g, w, d);
      return g;
    },
    toilet: (it) => {
      const g = new T.Group();
      g.add(box(0.38, 0.42, 0.20, mat(WHITE, { roughness: 0.3 }), 0, 0.55, -0.22));
      g.add(box(0.36, 0.36, 0.30, mat(WHITE, { roughness: 0.3 }), 0, 0.18, 0.02));
      g.add(cyl(0.17, 0.10, mat(WHITE, { roughness: 0.3 }), 0, 0.40, 0.02, 20));
      return g;
    },
    tub: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.55, it.d, mat(WHITE, { roughness: 0.25 }), 0, 0.275, 0));
      g.add(box(it.w - 0.16, 0.10, it.d - 0.16, mat(0xdff0f6, { roughness: 0.2 }), 0, 0.52, 0));
      g.add(cyl(0.02, 0.22, mat(COL.metal, { metalness: 0.8 }), -it.w / 2 + 0.14, 0.62, -it.d / 2 + 0.14));
      return g;
    },
    shower: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.08, it.d, mat(0xdfe6e9, { roughness: 0.3 }), 0, 0.04, 0));
      const glass = new T.MeshStandardMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.18, roughness: 0.05 });
      g.add(box(0.03, 1.9, it.d, glass, -it.w / 2, 0.95, 0));
      g.add(box(it.w, 1.9, 0.03, glass, 0, 0.95, it.d / 2));
      g.add(cyl(0.02, 0.30, mat(COL.metal, { metalness: 0.8 }), 0, 2.05, -it.d / 2 + 0.2));
      return g;
    },
    vanity: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.82, it.d, mat(0xe6e2d8), 0, 0.41, 0));
      g.add(box(it.w + 0.03, 0.05, it.d + 0.03, mat(0xdcd6c8), 0, 0.845, 0));
      g.add(cyl(0.11, 0.06, mat(WHITE), 0, 0.87, 0, 20));
      g.add(cyl(0.015, 0.18, mat(COL.metal, { metalness: 0.8 }), 0, 0.97, -0.10));
      return g;
    },
    waterheater: (it) => {
      const g = new T.Group();
      g.add(cyl(0.28, 1.45, mat(0xd7dadd, { metalness: 0.4, roughness: 0.4 }), 0, 0.725, 0, 24));
      g.add(cyl(0.10, 0.10, mat(COL.metal), 0, 1.50, 0, 16));
      return g;
    },
    washer: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.85, it.d, mat(0xe8eaec, { roughness: 0.4 }), 0, 0.425, 0));
      const door = new T.Mesh(new T.CircleGeometry(0.20, 24),
        new T.MeshStandardMaterial({ color: 0x2b3a44, emissive: 0x6fb6d6, emissiveIntensity: 0.5, roughness: 0.2 }));
      door.position.set(0, 0.46, it.d / 2 + 0.005);
      g.add(door);
      return g;
    },
    shelf: (it) => {
      const g = new T.Group();
      const h = 1.5;
      g.add(box(it.w, h, it.d, mat(0x8a6a44), 0, h / 2, 0));
      for (let i = 1; i <= 3; i++) g.add(box(it.w + 0.03, 0.03, it.d + 0.02, mat(0x6b4326), 0, i * h / 4, 0));
      for (let i = 0; i < 4; i++) {
        g.add(box(0.06, 0.22, 0.16, mat([0xa34f3f, 0x4a6fa5, 0x9db88a, 0xe8a24c][i % 4]), -it.w / 2 + 0.10, i * 0.34 + 0.42, 0.02));
      }
      return g;
    },
    closet: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 1.9, it.d, mat(0xcfc6b4), 0, 0.95, 0));
      g.add(box(it.w + 0.02, 0.02, it.d, mat(0xb8ad98), 0, 1.05, 0));
      return g;
    },
    console: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.04, it.d, mat(WOOD), 0, 0.80, 0));
      for (const sz of [-1, 1]) g.add(box(it.w - 0.04, 0.78, 0.04, mat(WOOD_D), 0, 0.40, sz * (it.d / 2 - 0.03)));
      return g;
    },
    desk: (it) => {
      const g = new T.Group();
      g.add(box(it.w, 0.04, it.d, mat(WOOD), 0, 0.74, 0));
      for (const sz of [-1, 1]) g.add(box(it.w - 0.04, 0.72, 0.04, mat(WOOD_D), 0, 0.37, sz * (it.d / 2 - 0.03)));
      g.add(box(0.02, 0.34, 0.52, mat(0x1c1c1c), 0, 0.94, -0.12));
      g.add(box(0.34, 0.02, 0.22, mat(0x2b2b2b), 0.0, 0.77, 0.22));
      return g;
    },
    plant: (it) => {
      const g = new T.Group();
      g.add(cyl(0.16, 0.28, mat(0xa0522d), 0, 0.14, 0, 18));
      const leaf = mat(0x5d7a3f, { roughness: 0.95 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const b = new T.Mesh(new T.SphereGeometry(0.20, 12, 10), leaf);
        b.position.set(Math.cos(a) * 0.12, 0.45 + (i % 2) * 0.12, Math.sin(a) * 0.12);
        b.scale.y = 0.8;
        g.add(b);
      }
      return g;
    }
  };

  /* ------------------------------------------------------------------ *
   * per-room light (single point light + emissive bulb + glow sprite)
   * ------------------------------------------------------------------ */
  function buildRoomLight(room, on) {
    const g = new T.Group();
    const lx = room.light ? room.light.x : room.x + room.w / 2;
    const lz = room.light ? room.light.z : room.z + room.d / 2;
    const kind = (room.light && room.light.kind) || 'pendant';
    const y = 2.30;

    if (kind === 'pendant') {
      g.add(cyl(0.012, 0.18, mat(0x2b2b2b), lx, y + 0.12, lz, 8));
      const shade = new T.Mesh(new T.CylinderGeometry(0.10, 0.19, 0.20, 20, 1, true),
        new T.MeshStandardMaterial({ color: 0xf6ead2, emissive: 0xffd9a0, emissiveIntensity: 0,
          side: T.DoubleSide, roughness: 0.85 }));
      shade.position.set(lx, y, lz);
      g.add(shade);
      g.userData.shade = shade;
      const bulb = new T.Mesh(new T.SphereGeometry(0.05, 12, 10),
        new T.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffe3b0, emissiveIntensity: 0 }));
      bulb.position.set(lx, y - 0.05, lz);
      g.add(bulb);
      g.userData.bulb = bulb;
    } else if (kind === 'bulb') {
      const bulb = new T.Mesh(new T.SphereGeometry(0.07, 12, 10),
        new T.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffe3b0, emissiveIntensity: 0 }));
      bulb.position.set(lx, y, lz);
      g.add(bulb);
      g.userData.bulb = bulb;
    }

    const light = new T.PointLight(0xffd2a0, 0, 11, 1.6);
    light.position.set(lx, y - 0.12, lz);
    g.add(light);
    g.userData.light = light;

    const glow = new T.Sprite(new T.SpriteMaterial({
      map: TEX.glow, color: 0xffc27a, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    glow.position.set(lx, y - 0.08, lz);
    glow.scale.set(1.0, 1.0, 1);
    g.add(glow);
    g.userData.glow = glow;

    return g;
  }

  /* ------------------------------------------------------------------ *
   * whole floor
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * backyard (attached north of a floor, below floor level)
   * ------------------------------------------------------------------ */
  function buildBackyard(parent, bk, house, out) {
    const W = house.width, ext = house.ext, D = bk.depth;
    const by = new T.Group();
    by.position.y = -bk.drop;
    parent.add(by);

    // lawn + concrete driveway
    const gw = W + ext * 2;
    by.add(box(gw, 0.10, D + ext, surfaceMat('grass', gw, D + ext), W / 2, -0.05, -D / 2 + ext / 2 - ext / 2 - 0.00));
    by.add(box(2.15, 0.12, D - 3.3, surfaceMat('concrete', 2.15, D - 3.3), 2.35, 0.01, -(D + 3.3) / 2));
    by.add(box(1.00, 0.12, 3.3, surfaceMat('concrete', 1.0, 3.3), 2.45, -0.01, -1.65));

    // cutaway-aware wall segments
    const wallM = mat(COL.wallExt, { roughness: 0.9 });
    const addSeg = (w, h, d, x, y, z, nx, nz, perim) => {
      const m = box(w, h, d, wallM, x, y, z);
      m.userData.wseg = { y0: y - h / 2, h: h, nx: nx, nz: nz, mx: x, mz: z, perim: perim, kind: 'wall', k: 1 };
      out.wallSegs.push(m); by.add(m);
      return m;
    };

    // garage wall across the far end (no roof)
    const doorX0 = 2.45;
    const gz = -D + 0.09;
    addSeg(gw, 2.50, 0.18, W / 2, 1.25, gz, 0, 1, true);
    // garage door panel + grooves (cut with the wall)
    const panel = box(2.40, 2.05, 0.07, mat(0xcfd2d4, { roughness: 0.55, metalness: 0.25 }), W / 2, 1.03, gz + 0.13);
    panel.userData.wseg = { y0: 0, h: 2.05, nx: 0, nz: 1, mx: W / 2, mz: gz, perim: true, kind: 'wall', k: 1 };
    out.wallSegs.push(panel); by.add(panel);
    for (let i = 1; i < 4; i++)
      by.add(box(2.40, 0.03, 0.02, mat(0x9aa0a3, { roughness: 0.7 }), W / 2, (i * 2.05) / 4, gz + 0.17));

    // low side fences
    addSeg(0.10, 1.05, D + ext, -ext / 2, 0.525, -D / 2, 1, 0, true);
    addSeg(0.10, 1.05, D + ext, W + ext / 2, 0.525, -D / 2, 1, 0, true);

    // porch light over the breakfast-nook door
    by.add(box(0.16, 0.10, 0.16, mat(0x2b2b2b), doorX0, 2.30, 0.28));
    const pl = new T.PointLight(0xffd2a0, 1.1, 2.4, 1.8);
    pl.position.set(doorX0, 2.25, 0.50); by.add(pl);

    // steps up to the breakfast-nook door
    const doorX = 2.45;
    for (let i = 0; i < 3; i++) {
      const h = bk.drop * (3 - i) / 3;
      by.add(box(1.05, h, 0.28, mat(COL.cap, { roughness: 0.9 }), doorX, h / 2, -0.14 - i * 0.28));
    }

    // furniture
    for (const it of (bk.furniture || [])) {
      const fn = FURN[it.type];
      if (!fn) continue;
      const f = fn(it);
      f.position.set(it.x, 0, it.z);
      f.rotation.y = (it.rot || 0) * Math.PI / 180;
      by.add(f);
    }
    return by;
  }

  function buildFloor(def, house) {
    const g = new T.Group();
    const W = house.width, D = house.depth;
    const slab = house.slab, ext = house.ext, int = house.int;
    const out = { def: def, group: g, rooms: [], doors: [], lights: [], glasses: [], pickables: [], wallSegs: [] };

    // base slab (the visible "cut" plate)
    const slabMat = mat(COL.slab, { roughness: 0.9 });
    g.add(box(W + ext * 2, slab, D + ext * 2, slabMat, W / 2, -slab / 2, D / 2));

    // room surfaces
    for (const r of def.rooms) {
      const m = new T.Mesh(new T.BoxGeometry(r.w, 0.04, r.d), surfaceMat(r.floor, r.w, r.d));
      m.position.set(r.x + r.w / 2, 0.02, r.z + r.d / 2);
      g.add(m);
      const pick = new T.Mesh(new T.BoxGeometry(r.w, 0.001, r.d), new T.MeshBasicMaterial({ visible: false }));
      pick.position.copy(m.position);
      pick.userData.roomId = r.id;
      g.add(pick);
      out.pickables.push(pick);

      const light = buildRoomLight(r, false);
      g.add(light);
      const entry = { def: r, mesh: m, pick: pick, light: light, floor: def, on: false, temp: r.temp, hum: r.hum };
      out.rooms.push(entry);
      out.lights.push(entry);
    }

    // walls
    for (const w of def.walls) {
      const res = buildWall(g, w, { ext: ext, int: int, height: house.wallHeight, bounds: [0, 0, house.width, house.depth] });
      out.doors.push.apply(out.doors, res.doors);
      out.wallSegs.push.apply(out.wallSegs, res.segs);
    }

    // glass tinting hook-up
    g.traverse((o) => { if (o.userData && o.userData.isGlass) out.glasses.push(o); });

    // stairs
    for (const s of (def.stairs || [])) buildStairs(g, s);

    // backyard
    if (def.backyard) buildBackyard(g, def.backyard, house, out);

    // furniture
    for (const it of (def.furniture || [])) {
      const fn = FURN[it.type];
      if (!fn) continue;
      const f = fn(it);
      f.position.set(it.x, 0, it.z);
      f.rotation.y = (it.rot || 0) * Math.PI / 180;
      f.traverse((o) => { if (o.userData && o.userData.lampShade) out.lampShades = out.lampShades || []; });
      g.add(f);
    }

    // collect lamp shades for emissive control
    out.lampShades = [];
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive && o.material.color &&
          o.material.color.getHex() === 0xfff0d0) out.lampShades.push(o);
    });

    return out;
  }

  window.BLD = {
    TEX: TEX, COL: COL, mat: mat, box: box, cyl: cyl,
    surfaceMat: surfaceMat, buildWall: buildWall, buildStairs: buildStairs,
    buildFloor: buildFloor, FURN: FURN
  };
})();
