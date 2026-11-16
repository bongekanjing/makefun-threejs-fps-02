// Weapons of VESPER YARD. Original names, Counter-Strike-style roles:
// a free sidearm, a rifle, an SMG, a heavy sniper and a shotgun, plus armour
// and a grenade in the buy menu. All hitscan; damage falls off with range.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export const WEAPONS = {
  sidearm: {
    key: 'sidearm', name: 'P9 Wasp', price: 0, damage: 34, headMult: 3.2,
    mag: 12, reserve: 36, rate: 320, auto: false, spread: 0.011, range: 60,
    reload: 1.15, kick: 0.011, moveSpeed: 1.0, zoom: 1, sound: 'pistol',
  },
  rifle: {
    key: 'rifle', name: 'Kestrel-5', price: 2700, damage: 33, headMult: 4,
    mag: 30, reserve: 90, rate: 600, auto: true, spread: 0.014, range: 90,
    reload: 2.1, kick: 0.016, moveSpeed: 0.94, zoom: 1, sound: 'rifle',
  },
  smg: {
    key: 'smg', name: 'Falcon-9', price: 750, damage: 26, headMult: 3.4,
    mag: 32, reserve: 96, rate: 800, auto: true, spread: 0.02, range: 55,
    reload: 1.8, kick: 0.011, moveSpeed: 1.0, zoom: 1, sound: 'smg',
  },
  sniper: {
    key: 'sniper', name: 'Longbow', price: 4750, damage: 88, headMult: 2.2,
    mag: 5, reserve: 15, rate: 55, auto: false, spread: 0.001, range: 140,
    reload: 3.0, kick: 0.05, moveSpeed: 0.9, zoom: 2.4, sound: 'sniper',
  },
  shotgun: {
    key: 'shotgun', name: 'Mastiff-12', price: 950, damage: 11, headMult: 2.4,
    mag: 6, reserve: 24, rate: 75, auto: false, spread: 0.05, range: 26,
    pellets: 8, reload: 2.6, kick: 0.035, moveSpeed: 0.96, zoom: 1, sound: 'shotgun',
  },
};

export const BUY_MENU = [
  { key: 'rifle', slot: '1' },
  { key: 'smg', slot: '2' },
  { key: 'sniper', slot: '3' },
  { key: 'shotgun', slot: '4' },
  { key: 'armour', slot: '5', name: 'Kevlar vest', price: 650 },
  { key: 'grenade', slot: '6', name: 'HE grenade', price: 300 },
];

/** A low-poly gun that rides with the camera: receiver, barrel, grip, sight. */
export function buildViewmodel(weaponKey) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.42, metalness: 0.7 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x565e68, roughness: 0.45, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.4, metalness: 0.4, emissive: 0x0d5a50, emissiveIntensity: 0.7 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(mat, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  // receiver + barrel, sized per weapon class
  const long = weaponKey === 'sniper' || weaponKey === 'rifle';
  const barrelLen = weaponKey === 'shotgun' ? 0.55 : long ? 0.62 : 0.4;
  part(dark, 0.09, 0.11, 0.42, 0, 0, -0.1);
  part(mid, 0.055, 0.055, barrelLen, 0, 0.015, -0.32 - barrelLen / 2 + 0.2);
  part(dark, 0.07, 0.13, 0.09, 0, -0.1, 0.02); // grip
  part(dark, 0.05, 0.05, 0.16, 0, -0.085, -0.16); // magazine / pump
  part(accent, 0.02, 0.03, 0.05, 0, 0.075, -0.28); // front sight
  if (weaponKey === 'sniper') {
    part(dark, 0.06, 0.06, 0.2, 0, 0.085, -0.05); // scope
    part(new THREE.MeshStandardMaterial({ color: 0x0a0f18, roughness: 0.15, metalness: 0.9 }), 0.055, 0.055, 0.01, 0, 0.085, -0.16);
  }
  if (weaponKey === 'shotgun') part(mid, 0.06, 0.06, 0.34, 0, -0.03, -0.3); // pump tube
  group.position.set(0.28, -0.26, -0.5);
  group.rotation.y = 0.03;
  group.scale.setScalar(0.82);

  // muzzle flash: a radial glow sprite + point light at the barrel tip
  const flashMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.55, 0.55, 1);
  flash.position.set(0, 0.015, -0.32 - barrelLen + 0.15);
  group.add(flash);
  const flashLight = new THREE.PointLight(0xffb45e, 0, 6, 1.8);
  flashLight.position.copy(flash.position);
  group.add(flashLight);

  return { group, flash, flashMat, flashLight, muzzleLocal: flash.position.clone(), kick: 0 };
}

/** A fading tracer line from muzzle to impact point. */
export function makeTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  return { line, mat, life: 0.09 };
}

export function updateTracers(tracers, dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.mat.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) {
      t.line.geometry.dispose();
      t.line.material.dispose();
      t.line.parent?.remove(t.line);
      tracers.splice(i, 1);
    }
  }
}

/** A short-lived impact spark (a few additive points) at a hit position. */
export function makeImpact(scene, pos, colour = 0xffd9a0) {
  const n = 7;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x;
    p[i * 3 + 1] = pos.y;
    p[i * 3 + 2] = pos.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color: colour, size: 0.14, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return { pts, mat, life: 0.16, vel: Array.from({ length: n }, () => new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 3)) };
}

export function updateImpacts(impacts, dt) {
  for (let i = impacts.length - 1; i >= 0; i--) {
    const im = impacts[i];
    im.life -= dt;
    const pos = im.pts.geometry.attributes.position;
    for (let j = 0; j < im.vel.length; j++) {
      pos.array[j * 3] += im.vel[j].x * dt;
      pos.array[j * 3 + 1] += im.vel[j].y * dt;
      pos.array[j * 3 + 2] += im.vel[j].z * dt;
      im.vel[j].y -= 6 * dt;
    }
    pos.needsUpdate = true;
    im.mat.opacity = Math.max(0, im.life / 0.16);
    if (im.life <= 0) {
      im.pts.geometry.dispose();
      im.pts.material.dispose();
      im.pts.parent?.remove(im.pts);
      impacts.splice(i, 1);
    }
  }
}
