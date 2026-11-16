// Procedural textures for VESPER YARD. Everything is drawn on offscreen
// canvases at load time: no image, font or network asset is ever fetched.
// A tiny seeded RNG keeps the speckle identical on every run.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, rng, n, alpha, light, dark) {
  for (let i = 0; i < n; i++) {
    const v = rng();
    ctx.fillStyle = v > 0.5 ? light : dark;
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Asphalt yard floor: dark blue-grey with faint tyre arcs, cracks and paint. */
export function asphaltTexture(rng) {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#23282e';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, rng, 5200, 0.16, '#3a4149', '#14171b');
  // faint tyre arcs
  ctx.strokeStyle = 'rgba(10,12,14,0.35)';
  ctx.lineWidth = 9;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(80 + rng() * 350, 80 + rng() * 350, 60 + rng() * 130, rng() * 3, rng() * 2 + 1);
    ctx.stroke();
  }
  // cracks
  ctx.strokeStyle = 'rgba(8,9,11,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    let x = rng() * 512;
    let y = rng() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rng() - 0.5) * 70;
      y += (rng() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // faded lane paint
  ctx.fillStyle = 'rgba(214,178,60,0.28)';
  ctx.fillRect(250, 0, 6, 512);
  ctx.fillStyle = 'rgba(214,178,60,0.16)';
  ctx.fillRect(0, 250, 512, 6);
  return toTexture(c, 8, 6);
}

/** Poured concrete for walls and the dock slab: pale, stained, panel joints. */
export function concreteTexture(rng) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#5d636b';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 2600, 0.14, '#7d838c', '#43484f');
  ctx.fillStyle = 'rgba(30,34,38,0.35)';
  for (let i = 0; i < 7; i++) {
    const x = rng() * 256;
    ctx.fillRect(x, 0, 2 + rng() * 8, 256);
  }
  ctx.strokeStyle = 'rgba(20,22,25,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  // damp stains near the base
  const g = ctx.createLinearGradient(0, 170, 0, 256);
  g.addColorStop(0, 'rgba(18,22,26,0)');
  g.addColorStop(1, 'rgba(18,22,26,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 170, 256, 86);
  return toTexture(c, 2, 1);
}

/** Corrugated shipping container side in a given paint colour. */
export function containerTexture(rng, base, dark, light) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.35, base);
    g.addColorStop(0.65, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 256);
  }
  speckle(ctx, 256, 256, rng, 900, 0.2, '#000000', '#ffffff');
  // rust streaks from the top edge
  for (let i = 0; i < 14; i++) {
    const x = rng() * 256;
    const w = 2 + rng() * 5;
    const h = 20 + rng() * 90;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(96,52,24,0.55)');
    g.addColorStop(1, 'rgba(96,52,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, h);
  }
  // stencilled code
  ctx.fillStyle = 'rgba(235,232,220,0.75)';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('VSPU 481 7', 18, 52);
  ctx.font = '16px monospace';
  ctx.fillText('MAX 30480 KG', 18, 78);
  return toTexture(c, 1, 1);
}

/** Hazard chevrons for site markers and the dock edge. */
export function hazardTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#d9a521';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#15181c';
  for (let x = -64; x < 192; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + 32, 128);
    ctx.lineTo(x + 96, 0);
    ctx.lineTo(x + 64, 0);
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(c, 1, 1);
}

/** Riveted steel plate for crates and the crane base. */
export function steelTexture(rng) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#3c434b';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 1800, 0.12, '#565e68', '#262b31');
  ctx.strokeStyle = 'rgba(16,18,21,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.fillStyle = '#20242a';
  for (const [x, y] of [[14, 14], [242, 14], [14, 242], [242, 242], [128, 14], [128, 242], [14, 128], [242, 128]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1, 1);
}

/** A soft radial glow used for lamp halos and the moon. */
export function glowTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.35, 'rgba(255,220,150,0.45)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
