// VESPER YARD — the map. A night container yard on a harbour quay: two bomb
// sites (A "Crane", B "Dock"), three lanes, stacked containers for cover.
// Everything is built from boxes, cylinders and procedural textures; the
// layout is fixed (seeded decoration only), so every run plays the same map.
import * as THREE from 'three';
import { asphaltTexture, concreteTexture, containerTexture, hazardTexture, steelTexture, glowTexture, mulberry32 } from './textures.js';

export const MAP = {
  name: 'VESPER YARD',
  bounds: { minX: -32, maxX: 32, minZ: -24, maxZ: 24 },
  sites: {
    A: { label: 'A · CRANE', pos: new THREE.Vector3(-20, 0, -16), radius: 5 },
    B: { label: 'B · DOCK', pos: new THREE.Vector3(20, 0, 16), radius: 5 },
  },
  spawns: {
    attack: [
      new THREE.Vector3(-28, 0, -4), new THREE.Vector3(-28, 0, 0), new THREE.Vector3(-28, 0, 4),
      new THREE.Vector3(-26, 0, -6), new THREE.Vector3(-26, 0, 6),
    ],
    defend: [
      new THREE.Vector3(28, 0, -4), new THREE.Vector3(28, 0, 0), new THREE.Vector3(28, 0, 4),
      new THREE.Vector3(26, 0, -6), new THREE.Vector3(26, 0, 6),
    ],
  },
};

// Waypoint graph the bots walk. Nodes are hand-placed on open ground; edges
// join neighbours along the three lanes and around the yard.
const WAYPOINTS = [
  [-28, 0], [-22, -8], [-22, 8], [-14, -16], [-14, 0], [-14, 14],
  [-6, -18], [-6, -8], [-6, 6], [-6, 16], [2, -14], [5, 0],
  [2, 12], [10, -16], [10, -4], [10, 8], [18, -12], [18, 2],
  [18, 14], [26, -6], [26, 6], [28, 0], [-20, -16], [20, 16],
  [0, -20], [0, 20],
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [3, 22],
  [4, 7], [4, 8], [5, 9], [6, 10], [6, 24], [7, 10], [7, 11], [8, 11],
  [8, 12], [9, 12], [9, 25], [10, 13], [11, 14], [12, 15], [13, 16],
  [13, 14], [14, 15], [14, 17], [15, 18], [16, 19], [16, 17], [17, 20],
  [17, 18], [18, 23], [19, 21], [20, 21], [24, 10], [25, 12], [22, 3],
  [23, 18], [1, 22], [15, 23],
];

// [x, z, width(x), depth(z), height, colour-index] — axis-aligned on purpose:
// collision is a circle-vs-AABB test, so nothing here is rotated.
const CONTAINERS = [
  [-18, -10, 6, 2.4, 2.6, 0], [-18, 10, 6, 2.4, 2.6, 1],
  [-10, -16, 6, 2.4, 2.6, 2], [-10, 16, 6, 2.4, 2.6, 3],
  [-2, -12, 6, 2.4, 2.6, 1], [-2, 12, 6, 2.4, 2.6, 0],
  [6, -8, 2.4, 6, 2.6, 2], [6, 8, 2.4, 6, 2.6, 3],
  [14, -14, 6, 2.4, 2.6, 0], [14, 12, 6, 2.4, 2.6, 1],
  [22, -16, 6, 2.4, 2.6, 2], [24, 10, 2.4, 6, 2.6, 3],
  [-26, -14, 6, 2.4, 2.6, 3], [-26, 14, 6, 2.4, 2.6, 2],
  [26, -14, 6, 2.4, 2.6, 1], [26, 14, 6, 2.4, 2.6, 0],
  [0, 0, 6, 6, 2.6, 1],
  // second storey on three stacks — height, and a sight-line over mid
  [-18, -10, 6, 2.4, 2.6, 2], [-2, 12, 6, 2.4, 2.6, 3], [0, 0, 6, 6, 2.6, 0],
];
const CRATES = [
  [-24, -2, 1.2], [-24, 2, 1.2], [-12, -4, 1.2], [-12, 4, 1.2], [-4, -4, 1.2],
  [-4, 4, 1.2], [4, -14, 1.2], [4, 14, 1.2], [12, -8, 1.2], [12, 4, 1.2],
  [16, -4, 1.2], [22, 4, 1.2], [-20, -10, 1.2], [20, 10, 1.2], [0, -8, 1.2], [0, 8, 1.2],
];
const BARRELS = [
  [-24, -12], [-24, 12], [-12, -18], [-12, 18], [2, -18], [2, 18],
  [16, -18], [16, 18], [28, -12], [28, 12], [-6, -2], [8, 2], [-16, 2], [14, -2],
];

const CONTAINER_COLOURS = [
  ['#7a4a2b', '#5d3820', '#96603a'], // rust
  ['#2e5f6b', '#23444d', '#3f7d8c'], // teal
  ['#6b6f35', '#51542a', '#878b45'], // olive
  ['#54423a', '#3f312b', '#6b564b'], // umber
];

function letterSprite(letter, colour) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,14,18,0.55)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.4, 2.4, 1);
  return s;
}

export function buildWorld(scene) {
  const rng = mulberry32(20261116);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const shootables = []; // meshes the hitscan ray tests against
  const animated = { lamps: [], craneHook: null };

  const texAsphalt = asphaltTexture(rng);
  const texConcrete = concreteTexture(rng);
  const texHazard = hazardTexture();
  const texSteel = steelTexture(rng);
  const texGlow = glowTexture();
  const containerTex = CONTAINER_COLOURS.map(([b, d, l]) => containerTexture(rng, b, d, l));

  // --- sky, fog, lights -------------------------------------------------
  scene.background = new THREE.Color(0x0a1220);
  scene.fog = new THREE.FogExp2(0x0a1220, 0.016);

  const hemi = new THREE.HemisphereLight(0x3d5578, 0x241c16, 0.95);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9db8e8, 1.5);
  moon.position.set(-18, 30, -12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -36;
  moon.shadow.camera.right = 36;
  moon.shadow.camera.top = 28;
  moon.shadow.camera.bottom = -28;
  moon.shadow.camera.far = 80;
  scene.add(moon);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2;
    const e = 0.15 + rng() * 1.2;
    const r = 180;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.9, sizeAttenuation: false, fog: false })));

  // moon disc
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texGlow, color: 0xdfeaff, transparent: true, depthWrite: false, fog: false }));
  moonSprite.position.set(-90, 70, -60);
  moonSprite.scale.set(26, 26, 1);
  scene.add(moonSprite);

  // --- ground -----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshStandardMaterial({ map: texAsphalt, roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // --- perimeter walls --------------------------------------------------
  const wallMat = new THREE.MeshStandardMaterial({ map: texConcrete, roughness: 0.9 });
  const wallGeo = new THREE.BoxGeometry(1, 4, 1);
  function wall(x, z, w, d) {
    const m = new THREE.Mesh(wallGeo, wallMat);
    m.scale.set(w, 1, d);
    m.position.set(x, 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    shootables.push(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  wall(0, -24.5, 66, 1);
  wall(0, 24.5, 66, 1);
  wall(-32.5, 0, 1, 50);
  wall(32.5, 0, 1, 50);

  // --- containers -------------------------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const secondStorey = new Set([16, 17, 18]); // indices stacked on top
  CONTAINERS.forEach(([x, z, w, d, h, ci], i) => {
    const y = secondStorey.has(i) ? h + h / 2 : h / 2;
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: containerTex[ci], roughness: 0.75, metalness: 0.35 }));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    shootables.push(m);
    if (!secondStorey.has(i)) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  });

  // --- crates and barrels ----------------------------------------------
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.9 });
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, z, s] of CRATES) {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.scale.setScalar(s);
    m.position.set(x, s / 2, z);
    m.rotation.y = rng() * 0.6;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    shootables.push(m);
    colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 });
  }
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.6, metalness: 0.5 });
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12);
  for (const [x, z] of BARRELS) {
    const m = new THREE.Mesh(barrelGeo, barrelMat);
    m.position.set(x, 0.525, z);
    m.castShadow = true;
    scene.add(m);
    shootables.push(m);
    colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
  }

  // --- site markers: hazard border + floating letter --------------------
  const hazardMat = new THREE.MeshStandardMaterial({ map: texHazard, roughness: 0.85 });
  const stripGeo = new THREE.BoxGeometry(1, 0.06, 0.5);
  for (const [key, site] of Object.entries(MAP.sites)) {
    const r = site.radius;
    const colour = key === 'A' ? '#f0a830' : '#2dd4bf';
    for (const [sx, sz, w, rot] of [
      [site.pos.x, site.pos.z - r, r * 2, 0], [site.pos.x, site.pos.z + r, r * 2, 0],
      [site.pos.x - r, site.pos.z, r * 2, 1], [site.pos.x + r, site.pos.z, r * 2, 1],
    ]) {
      const s = new THREE.Mesh(stripGeo, hazardMat);
      s.scale.x = w;
      s.position.set(sx, 0.03, sz);
      if (rot) s.rotation.y = Math.PI / 2;
      scene.add(s);
    }
    const sprite = letterSprite(key, colour);
    sprite.position.set(site.pos.x, 4.6, site.pos.z);
    scene.add(sprite);
    // a low concrete plinth under each site
    const plinth = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: texConcrete, roughness: 0.95 }));
    plinth.scale.set(r * 1.6, 0.18, r * 1.6);
    plinth.position.set(site.pos.x, 0.09, site.pos.z);
    plinth.receiveShadow = true;
    scene.add(plinth);
    shootables.push(plinth);
  }

  // --- gantry crane over site A (silhouette, animated hook) ------------
  const craneMat = new THREE.MeshStandardMaterial({ map: texSteel, roughness: 0.6, metalness: 0.6 });
  const crane = new THREE.Group();
  for (const [lx, lz] of [[-26, -20], [-14, -20], [-26, -12], [-14, -12]]) {
    const leg = new THREE.Mesh(boxGeo, craneMat);
    leg.scale.set(0.7, 11, 0.7);
    leg.position.set(lx, 5.5, lz);
    leg.castShadow = true;
    crane.add(leg);
    colliders.push({ minX: lx - 0.35, maxX: lx + 0.35, minZ: lz - 0.35, maxZ: lz + 0.35 });
  }
  const beam = new THREE.Mesh(boxGeo, craneMat);
  beam.scale.set(14, 1, 1);
  beam.position.set(-20, 11, -20);
  crane.add(beam);
  const jib = new THREE.Mesh(boxGeo, craneMat);
  jib.scale.set(20, 0.8, 0.8);
  jib.position.set(-12, 11.4, -16);
  crane.add(jib);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5, 6), new THREE.MeshBasicMaterial({ color: 0x111417 }));
  cable.position.set(-4, 8.8, -16);
  crane.add(cable);
  const hook = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xd9a521, roughness: 0.5, metalness: 0.6 }));
  hook.scale.set(0.9, 0.9, 0.9);
  hook.position.set(-4, 6.2, -16);
  crane.add(hook);
  animated.craneHook = hook;
  // a container hangs from the hook
  const hung = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: containerTex[0], roughness: 0.75, metalness: 0.35 }));
  hung.scale.set(3, 2, 2.2);
  hung.position.set(-4, 4.6, -16);
  crane.add(hung);
  scene.add(crane);
  crane.traverse((o) => { if (o.isMesh) shootables.push(o); });

  // --- floodlight poles --------------------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.7 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 2.2 });
  const polePositions = [[-8, -22, true], [8, 22, true], [-8, 22, false], [8, -22, false]];
  for (const [px, pz, real] of polePositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), poleMat);
    pole.position.set(px, 4.5, pz);
    pole.castShadow = true;
    scene.add(pole);
    colliders.push({ minX: px - 0.2, maxX: px + 0.2, minZ: pz - 0.2, maxZ: pz + 0.2 });
    const lamp = new THREE.Mesh(boxGeo, lampMat);
    lamp.scale.set(1.4, 0.5, 0.5);
    lamp.position.set(px, 9, pz);
    scene.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texGlow, color: 0xffd9a0, transparent: true, depthWrite: false }));
    glow.scale.set(7, 7, 1);
    glow.position.set(px, 9, pz);
    scene.add(glow);
    animated.lamps.push(glow.material);
    if (real) {
      const spot = new THREE.SpotLight(0xffd9a0, 520, 52, 0.62, 0.55, 1.4);
      spot.position.set(px, 9, pz);
      spot.target.position.set(px * 0.4, 0, pz * 0.4);
      scene.add(spot, spot.target);
    }
  }

  // distant harbour silhouettes outside the walls (cheap boxes, no collision)
  const silMat = new THREE.MeshStandardMaterial({ color: 0x0d1522, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const h = 8 + rng() * 16;
    const s = new THREE.Mesh(boxGeo, silMat);
    const side = i % 2 === 0 ? -1 : 1;
    s.scale.set(4 + rng() * 6, h, 4);
    s.position.set(side * (40 + rng() * 14), h / 2, -30 + i * 6.5);
    scene.add(s);
  }

  const waypoints = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const edges = EDGES.map(([a, b]) => [a, b]);
  const adjacency = waypoints.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function update(dt, t) {
    // slow crane sway; one lamp flickers faintly
    if (animated.craneHook) {
      animated.craneHook.position.x = -4 + Math.sin(t * 0.35) * 1.1;
      animated.craneHook.position.z = -16 + Math.cos(t * 0.22) * 0.5;
    }
    if (animated.lamps[1]) {
      const f = Math.sin(t * 13.7) > 0.96 ? 0.25 : 1;
      animated.lamps[1].opacity = 0.85 * f;
    }
  }

  return { colliders, shootables, waypoints, adjacency, sites: MAP.sites, spawns: MAP.spawns, bounds: MAP.bounds, update };
}

/** Push a circle (x, z, radius) out of every AABB it overlaps. Mutates pos. */
export function collideCircle(pos, radius, colliders, bounds) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, pos.x));
  pos.z = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, pos.z));
}
