/* =============================================================================
 * data.js — declarative description of the house.
 *
 * Coordinate system (metres):
 *   x : 0 (west)  -> width  (east)
 *   z : 0 (north) -> depth  (south)   <-- camera looks at the south facade
 *   y : 0 (floor) -> up
 *
 * Dimensions are taken from the architectural floor plan (11'3" interior
 * width = 3.43 m).  They are approximations rounded to a few cm — tweak here,
 * everything else rebuilds itself.
 * ===========================================================================*/
(function () {
  'use strict';

  const W = 3.43;   // interior width
  const D = 16.60;  // interior depth (all three floors stack)

  /* -------------------------------------------------------------------------
   * Room + furniture catalogue.  `floor` selects the surface material.
   * ---------------------------------------------------------------------- */
  const floors = [
    /* ======================= BASEMENT (level 0) ======================= */
    {
      id: 'basement', name: 'Basement', short: 'B', level: 0,
      tint: '#6f7d8c',
      rooms: [
        { id: 'bed0',    name: 'Bedroom',        x: 0,    z: 0,    w: 3.43, d: 4.55, floor: 'carpet',   temp: 19.8, hum: 58 },
        { id: 'closet0', name: 'Closet',         x: 0,    z: 4.55, w: 0.90, d: 1.85, floor: 'concrete', temp: 19.4, hum: 60 },
        { id: 'hall0',   name: 'Hall',           x: 0.90, z: 4.55, w: 1.26, d: 4.94, floor: 'concrete', temp: 19.6, hum: 59 },
        { id: 'util',    name: 'Utility',        x: 2.16, z: 4.55, w: 1.27, d: 2.35, floor: 'concrete', temp: 20.6, hum: 55 },
        { id: 'bath0',   name: 'Bath',           x: 2.16, z: 6.90, w: 1.27, d: 2.59, floor: 'tile',     temp: 21.0, hum: 66 },
        { id: 'rec',     name: 'Recreation Room',x: 0,    z: 9.49, w: 3.43, d: 7.11, floor: 'carpet',   temp: 20.2, hum: 57 }
      ],
      walls: [
        // --- perimeter (openings measured from the wall's start point) ---
        { x1: 0,   z1: 0,   x2: W,   z2: 0,   t: 'ext', openings: [ { at: 1.80, width: 0.90, kind: 'window' } ] },
        { x1: W,   z1: 0,   x2: W,   z2: D,   t: 'ext', openings: [ { at: 7.60, width: 0.70, kind: 'window' } ] },
        { x1: 0,   z1: D,   x2: W,   z2: D,   t: 'ext', openings: [] },
        { x1: 0,   z1: 0,   x2: 0,   z2: D,   t: 'ext', openings: [ { at: 0.60, width: 0.80, kind: 'window' } ] },
        // --- interior ---
        { x1: 0,    z1: 4.55, x2: W,    z2: 4.55, t: 'int', openings: [ { at: 1.00, width: 1.40, kind: 'door', hinge: 'start', swing: 1, dbl: true } ] },
        { x1: 0.90, z1: 4.55, x2: 0.90, z2: 6.40, t: 'int', openings: [] },
        { x1: 0,    z1: 6.40, x2: 0.90, z2: 6.40, t: 'int', openings: [] },
        { x1: 2.16, z1: 4.55, x2: 2.16, z2: 6.90, t: 'int', openings: [ { at: 0.50, width: 0.85, kind: 'door', hinge: 'start', swing: -1 } ] },
        { x1: 2.16, z1: 6.90, x2: W,    z2: 6.90, t: 'int', openings: [] },
        { x1: 2.16, z1: 6.90, x2: 2.16, z2: 9.49, t: 'int', openings: [ { at: 0.60, width: 0.85, kind: 'door', hinge: 'end', swing: 1 } ] },
        { x1: 2.16, z1: 9.49, x2: W,    z2: 9.49, t: 'int', openings: [] },
        { x1: 0,    z1: 9.49, x2: 2.16, z2: 9.49, t: 'int', openings: [ { at: 0.55, width: 1.00, kind: 'open' } ] },
        { x1: 2.85, z1: 0.40, x2: 2.85, z2: 4.30, t: 'int', openings: [] }
      ],
      stairs: [ { x: 0.15, z: 9.60, w: 1.25, d: 1.70, h: 2.50, dir: 'n' } ],
      furniture: [
        { type: 'bed',        x: 1.75, z: 2.15, w: 1.45, d: 2.05, rot: 0 },
        { type: 'nightstand', x: 0.55, z: 0.90, lamp: true },
        { type: 'wardrobe',   x: 2.95, z: 3.50, w: 0.60, d: 1.20 },
        { type: 'rug',        x: 1.70, z: 2.70, w: 2.20, d: 2.60, color: 0x5c6b7d },
        { type: 'shelf',      x: 0.45, z: 5.40, w: 0.70, d: 1.40 },
        { type: 'rug',        x: 1.50, z: 7.00, w: 0.90, d: 2.40, color: 0x4a5566 },
        { type: 'waterheater',x: 2.80, z: 5.30 },
        { type: 'washer',     x: 2.75, z: 6.45, w: 0.60, d: 0.60 },
        { type: 'toilet',     x: 2.78, z: 7.35, rot: -90 },
        { type: 'shower',     x: 2.80, z: 8.95, w: 0.95, d: 0.95 },
        { type: 'sofa',       x: 0.72, z: 12.60, w: 0.85, d: 2.20, rot: 0, color: 0x7d94aa },
        { type: 'coffee',     x: 1.95, z: 12.60, w: 0.60, d: 1.00 },
        { type: 'tv',         x: 3.26, z: 12.60, rot: -90, w: 1.20 },
        { type: 'rug',        x: 1.85, z: 12.60, w: 2.60, d: 3.00, color: 0x6f87a8 },
        { type: 'shelf',      x: 0.40, z: 15.70, w: 0.70, d: 1.20 },
        { type: 'plant',      x: 2.90, z: 15.80 }
      ]
    },

    /* ======================= 1st FLOOR (level 1) ====================== */
    {
      id: 'ground', name: '1st Floor', short: '1', level: 1,
      tint: '#c78d4f',
      rooms: [
        { id: 'nook',    name: 'Breakfast Nook', x: 0, z: 0,     w: 3.43, d: 2.35, floor: 'wood',    temp: 22.4, hum: 54 },
        { id: 'kitchen', name: 'Kitchen',        x: 0, z: 2.35,  w: 3.43, d: 3.91, floor: 'checker', temp: 23.1, hum: 52 },
        { id: 'dining',  name: 'Dining Area',    x: 0, z: 6.26,  w: 3.43, d: 4.33, floor: 'wood',    temp: 22.8, hum: 53 },
        { id: 'living',  name: 'Living Room',    x: 0, z: 10.59, w: 3.43, d: 3.80, floor: 'wood',    temp: 22.9, hum: 52, co2: 947 },
        { id: 'foyer',   name: 'Foyer',          x: 0, z: 14.39, w: 3.43, d: 2.21, floor: 'tile',    temp: 21.6, hum: 55 }
      ],
      walls: [
        { x1: 0,   z1: 0,   x2: W, z2: 0, t: 'ext', openings: [
            { at: 0.35, width: 0.90, kind: 'window' },
            { at: 2.00, width: 0.90, kind: 'door', hinge: 'end', swing: 1 } ] },
        { x1: W,   z1: 0,   x2: W, z2: D, t: 'ext', openings: [] },
        { x1: 0,   z1: D,   x2: W, z2: D, t: 'ext', openings: [
            { at: 0.40, width: 1.50, kind: 'window' },
            { at: 2.20, width: 0.90, kind: 'door', hinge: 'start', swing: -1 } ] },
        { x1: 0,   z1: 0,   x2: 0, z2: D, t: 'ext', openings: [
            { at: 3.40, width: 0.90, kind: 'door', hinge: 'start', swing: 1 },
            { at: 7.00, width: 0.90, kind: 'window' } ] },
        // foyer <-> living, with the flue block left solid in the middle
        { x1: 0,   z1: 14.39, x2: W, z2: 14.39, t: 'int', openings: [
            { at: 0.25, width: 1.10, kind: 'open' },
            { at: 2.05, width: 1.15, kind: 'open' } ] },
        { x1: 0.65, z1: 14.65, x2: 0.65, z2: 16.35, t: 'int', openings: [] },
        { x1: 0,   z1: 6.26, x2: 0.70, z2: 6.26, t: 'int', openings: [] },
        { x1: 0,   z1: 2.35, x2: 0.45, z2: 2.35, t: 'int', openings: [] },
        { x1: 2.95, z1: 2.35, x2: W,   z2: 2.35, t: 'int', openings: [] }
      ],
      stairs: [ { x: 0.15, z: 11.50, w: 1.25, d: 2.00, h: 2.50, dir: 'n' } ],
      backyard: {
        depth: 9.50, drop: 1.00,
        furniture: [
          // car on the east driveway, nose pulled clear of the garage door
          { type: 'car',       x: 2.35, z: -6.40 },
          // garden-bed divider across the yard (gap = walkway at x 1.9..2.9)
          { type: 'gardenbed', x: 0.95, z: -3.40, w: 1.80, d: 0.45 },
          { type: 'gardenbed', x: 3.17, z: -3.40, w: 0.40, d: 0.45 },
          // furniture on the patio, house-side of the divider, facing the house
          { type: 'lawnchair', x: 0.60, z: -1.80, rot: 0, color: 0xd6cfa8 },
          { type: 'lawnchair', x: 0.60, z: -2.70, rot: 0, color: 0xd6cfa8 },
          { type: 'grill',     x: 1.30, z: -2.55, rot: 90 }
        ]
      },
      furniture: [
        { type: 'table',  x: 1.70, z: 1.20, w: 1.15, d: 0.80, chairs: 2, rot: 0 },
        { type: 'counter',x: 0.30, z: 3.90, w: 0.60, d: 2.60, rot: 0 },
        { type: 'stove',  x: 0.30, z: 3.30 },
        { type: 'upper',  x: 0.32, z: 4.30, w: 0.35, d: 1.60, rot: 0 },
        { type: 'island', x: 1.95, z: 5.00, w: 1.30, d: 0.80, rot: 90 },
        { type: 'fridge', x: 0.35, z: 2.70, w: 0.70, d: 0.70, rot: 90 },
        { type: 'table',  x: 1.70, z: 8.40, w: 1.40, d: 0.90, chairs: 4, rot: 0 },
        { type: 'sideboard', x: 3.10, z: 8.40, w: 0.50, d: 1.30 },
        { type: 'sofa',   x: 0.72, z: 11.90, w: 0.85, d: 2.20, rot: 0, color: 0x8fa3b8 },
        { type: 'coffee', x: 1.95, z: 11.90, w: 0.60, d: 1.00 },
        { type: 'tv',     x: 3.26, z: 11.90, rot: -90, w: 1.20 },
        { type: 'rug',    x: 2.35, z: 11.90, w: 1.80, d: 2.60, color: 0x7d99c0 },
        { type: 'fireplace', x: 1.75, z: 14.15 },
        { type: 'armchair',  x: 2.65, z: 13.45, rot: 180, color: 0x8fa3b8 },
        { type: 'closet', x: 0.45, z: 15.50, w: 0.65, d: 1.50 },
        { type: 'console',x: 2.85, z: 15.20, w: 0.45, d: 0.90 },
        { type: 'rug',    x: 1.80, z: 15.40, w: 2.00, d: 1.40, color: 0x8a7560 }
      ]
    },

    /* ======================= 2nd FLOOR (level 2) ====================== */
    {
      id: 'upper', name: '2nd Floor', short: '2', level: 2,
      tint: '#8fa3b8',
      rooms: [
        { id: 'primary', name: 'Primary Bedroom', x: 0,    z: 0,     w: 3.43, d: 4.33, floor: 'carpet', temp: 21.4, hum: 51 },
        { id: 'bath2',   name: 'Bath',            x: 0,    z: 4.33,  w: 2.29, d: 1.61, floor: 'tile',   temp: 22.2, hum: 63 },
        { id: 'hall2',   name: 'Hall',            x: 2.29, z: 4.33,  w: 1.14, d: 6.05, floor: 'wood',   temp: 21.6, hum: 54 },
        { id: 'midbed',  name: 'Bedroom',         x: 0,    z: 5.94,  w: 2.65, d: 2.91, floor: 'carpet', temp: 21.3, hum: 52 },
        { id: 'stair2',  name: 'Landing',         x: 0,    z: 8.85,  w: 1.50, d: 1.53, floor: 'wood',   temp: 21.5, hum: 53 },
        { id: 'closet2', name: 'Closet',          x: 2.70, z: 10.38, w: 0.73, d: 1.12, floor: 'wood',   temp: 21.0, hum: 55 },
        { id: 'bed2',    name: 'Bedroom',         x: 0,    z: 10.38, w: 3.43, d: 6.22, floor: 'carpet', temp: 21.2, hum: 52 }
      ],
      walls: [
        { x1: 0,   z1: 0,   x2: W,   z2: 0,   t: 'ext', openings: [ { at: 0.40, width: 1.60, kind: 'window' } ] },
        { x1: W,   z1: 0,   x2: W,   z2: D,   t: 'ext', openings: [] },
        { x1: 0,   z1: D,   x2: W,   z2: D,   t: 'ext', openings: [ { at: 0.80, width: 1.60, kind: 'window' } ] },
        { x1: 0,   z1: 0,   x2: 0,   z2: D,   t: 'ext', openings: [
            { at: 4.50, width: 0.70, kind: 'window' },
            { at: 6.20, width: 0.80, kind: 'window' },
            { at: 8.90, width: 1.00, kind: 'window' } ] },
        { x1: 0,    z1: 4.33,  x2: W,    z2: 4.33,  t: 'int', openings: [ { at: 2.20, width: 0.85, kind: 'door', hinge: 'end', swing: 1 } ] },
        { x1: 2.29, z1: 4.33,  x2: 2.29, z2: 5.94,  t: 'int', openings: [ { at: 0.15, width: 0.85, kind: 'door', hinge: 'start', swing: -1 } ] },
        { x1: 0,    z1: 5.94,  x2: 2.29, z2: 5.94,  t: 'int', openings: [] },
        { x1: 2.65, z1: 5.94,  x2: 2.65, z2: 8.85,  t: 'int', openings: [ { at: 2.00, width: 0.80, kind: 'door', hinge: 'end', swing: 1 } ] },
        { x1: 0,    z1: 8.85,  x2: 2.65, z2: 8.85,  t: 'int', openings: [] },
        { x1: 0,    z1: 10.38, x2: 1.50, z2: 10.38, t: 'int', openings: [] },
        { x1: 0,    z1: 10.38, x2: W,    z2: 10.38, t: 'int', openings: [ { at: 1.10, width: 0.85, kind: 'door', hinge: 'start', swing: 1 } ] },
        { x1: 2.70, z1: 10.38, x2: 2.70, z2: 11.50, t: 'int', openings: [] },
        { x1: 2.70, z1: 11.50, x2: W,    z2: 11.50, t: 'int', openings: [] }
      ],
      stairs: [ { x: 0.15, z: 8.90, w: 1.30, d: 1.40, h: 2.50, dir: 'e' } ],
      furniture: [
        { type: 'bed',        x: 1.75, z: 2.00, w: 1.50, d: 2.05, rot: 0, cover: 0xe8a24c },
        { type: 'nightstand', x: 0.55, z: 0.90, lamp: true },
        { type: 'nightstand', x: 2.95, z: 0.90, lamp: true },
        { type: 'wardrobe',   x: 0.95, z: 4.05, w: 1.60, d: 0.55 },
        { type: 'rug',        x: 1.70, z: 2.80, w: 2.30, d: 2.80, color: 0x7d99c0 },
        { type: 'tub',        x: 0.58, z: 5.10, w: 0.95, d: 1.50, rot: 0 },
        { type: 'toilet',     x: 1.75, z: 5.60, rot: 180 },
        { type: 'vanity',     x: 2.02, z: 4.65, w: 0.45, d: 0.60 },
        { type: 'bed',        x: 1.15, z: 7.50, w: 1.25, d: 1.95, rot: 0, cover: 0x9db88a },
        { type: 'nightstand', x: 0.35, z: 6.40, lamp: true },
        { type: 'wardrobe',   x: 2.30, z: 6.60, w: 0.55, d: 1.00 },
        { type: 'rug',        x: 2.85, z: 6.50, w: 0.70, d: 2.50, color: 0x4a5566 },
        { type: 'console',    x: 2.90, z: 4.90, w: 0.40, d: 0.80 },
        { type: 'shelf',      x: 3.05, z: 10.95, w: 0.60, d: 1.00 },
        { type: 'bed',        x: 1.70, z: 13.00, w: 1.45, d: 2.00, rot: 0, cover: 0x9db88a },
        { type: 'nightstand', x: 0.50, z: 12.10, lamp: true },
        { type: 'nightstand', x: 2.90, z: 12.10, lamp: true },
        { type: 'wardrobe',   x: 0.95, z: 15.90, w: 1.60, d: 0.55 },
        { type: 'desk',       x: 2.90, z: 14.00, w: 0.50, d: 1.10 },
        { type: 'rug',        x: 1.70, z: 13.60, w: 2.20, d: 2.60, color: 0x6f87a8 }
      ]
    }
  ];

  /* -------------------------------------------------------------------------
   * Outdoor / whole-house simulation inputs
   * ---------------------------------------------------------------------- */
  const outdoor = {
    name: 'Homelab House',
    place: 'j6n.internal',
    // hourly outdoor temperature curve (°C), index = hour
    curve: [ 4, 4, 3, 3, 3, 4, 6, 8, 11, 13, 15, 17, 18, 19, 19, 18, 16, 13, 10, 8, 7, 6, 5, 4 ],
    hum: 78,
    wind: 4.3,
    uv: 0
  };

  window.HOUSE = { width: W, depth: D, wallHeight: 2.5, slab: 0.16, ext: 0.18, int: 0.10, floors, outdoor };
})();
