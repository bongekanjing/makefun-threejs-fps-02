// Agents: the player and the nine bots. One body factory (low-poly humanoid
// from boxes, team-coloured), shared movement + collision, one hitscan
// routine for every gun, and the bot brain: waypoint routes, line-of-sight
// duels, strafing, planting and defusing.
import * as THREE from 'three';
import { WEAPONS, makeTracer, makeImpact } from './weapons.js';
import { collideCircle } from './world.js';

const TEAM_COLOUR = { V: 0x2dd4bf, R: 0xf97316 };
const TEAM_DARK = { V: 0x0f766e, R: 0x9a3412 };

export function createAgent(id, name, team, isPlayer, pos, yaw) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: TEAM_COLOUR[team], roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.7, metalness: 0.3 });
  const vest = new THREE.MeshStandardMaterial({ color: TEAM_DARK[team], roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(mat, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }
  const legL = part(dark, 0.17, 0.78, 0.19, -0.12, 0.39, 0);
  const legR = part(dark, 0.17, 0.78, 0.19, 0.12, 0.39, 0);
  const torso = part(suit, 0.56, 0.62, 0.3, 0, 1.1, 0);
  part(vest, 0.58, 0.4, 0.34, 0, 1.14, 0); // vest plate
  const head = part(suit, 0.3, 0.3, 0.3, 0, 1.6, 0);
  const visor = part(new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.15, metalness: 0.8 }), 0.24, 0.1, 0.05, 0, 1.6, 0.16);
  const armR = part(dark, 0.13, 0.5, 0.13, 0.32, 1.18, 0.12);
  armR.rotation.x = -1.1;
  const gun = part(dark, 0.07, 0.09, 0.62, 0.2, 1.28, 0.32);
  // muzzle flash sprite at the gun tip (bots only show it when they fire)
  const flashMat = new THREE.SpriteMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.9, 0.9, 1);
  flash.position.set(0.2, 1.28, 0.68);
  group.add(flash);

  group.position.copy(pos);
  group.rotation.y = yaw;
  const agent = {
    id, name, team, isPlayer, pos: pos.clone(), yaw,
    hp: 100, armour: 0, alive: true, money: 800,
    weaponKey: 'sidearm', mag: WEAPONS.sidearm.mag, reserve: WEAPONS.sidearm.reserve,
    owned: ['sidearm'], grenades: 0, kills: 0, deaths: 0,
    speed: 4.4, radius: 0.45, velY: 0, grounded: true,
    lastShotAt: -10, reloadEnd: 0, reloading: false,
    mesh: group, legL, legR, torso, head, flash, flashMat,
    walkPhase: 0, flashUntil: 0, hurtAt: -10,
    bot: null,
  };
  // raycast targets: torso = body, head = headshot
  for (const m of [legL, legR, torso, head, visor, armR, gun]) {
    m.userData.agent = agent;
    m.userData.part = m === head || m === visor ? 'head' : 'body';
  }
  agent.hitMeshes = [legL, legR, torso, head, visor, armR, gun];
  return agent;
}

/** BFS over the waypoint graph: list of node indices from `from` to `to`. */
export function findPath(adjacency, from, to) {
  if (from === to) return [to];
  const prev = new Array(adjacency.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const n = queue.shift();
    for (const m of adjacency[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let c = to;
          while (c !== from) {
            c = prev[c];
            path.unshift(c);
          }
          return path;
        }
        queue.push(m);
      }
    }
  }
  return [to];
}

export function nearestWaypoint(waypoints, pos) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const d = (waypoints[i].x - pos.x) ** 2 + (waypoints[i].z - pos.z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Move an agent by a wish direction (world XZ), with AABB collision. */
export function moveAgent(world, agent, dirX, dirZ, speed, dt) {
  if (!agent.alive) return 0;
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-6) return 0;
  const nx = dirX / len;
  const nz = dirZ / len;
  agent.pos.x += nx * speed * dt;
  agent.pos.z += nz * speed * dt;
  collideCircle(agent.pos, agent.radius, world.colliders, world.bounds);
  agent.walkPhase += speed * dt * 2.4;
  const swing = Math.sin(agent.walkPhase) * 0.45;
  agent.legL.rotation.x = swing;
  agent.legR.rotation.x = -swing;
  agent.mesh.position.copy(agent.pos);
  agent.mesh.position.y = agent.pos.y;
  agent.mesh.rotation.y = agent.yaw;
  return speed * dt;
}

/** Line of sight between two eye positions, blocked only by world geometry. */
export function hasLineOfSight(raycaster, world, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(world.shootables, false);
  return hits.length === 0;
}

/**
 * One hitscan shot. `dir` is already spread-adjusted. Returns the hit agent
 * (or null), the hit point and whether it was a headshot.
 */
export function fireHitscan(G, shooter, origin, dir, weapon) {
  const raycaster = G.raycaster;
  raycaster.set(origin, dir);
  raycaster.far = weapon.range;
  const targets = [];
  for (const a of G.agents) {
    if (a.alive && a !== shooter) targets.push(...a.hitMeshes);
  }
  const hits = raycaster.intersectObjects([...targets, ...G.world.shootables], false);
  const hit = hits[0];
  const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, weapon.range);
  const muzzle = shooter.isPlayer ? G.viewmodelMuzzleWorld() : shooter.mesh.localToWorld(new THREE.Vector3(0.2, 1.28, 0.68));
  G.tracers.push(makeTracer(G.scene, muzzle, end));
  let victim = null;
  let headshot = false;
  if (hit) {
    if (hit.object.userData.agent) {
      victim = hit.object.userData.agent;
      headshot = hit.object.userData.part === 'head';
      const dist = origin.distanceTo(hit.point);
      const falloff = dist > 25 ? Math.max(0.55, 1 - (dist - 25) * 0.008) : 1;
      const dmg = weapon.damage * (headshot ? weapon.headMult : 1) * falloff;
      G.impacts.push(makeImpact(G.scene, hit.point, 0xff6b5e));
      applyDamage(G, victim, dmg, shooter, headshot);
    } else {
      G.impacts.push(makeImpact(G.scene, hit.point, 0xffd9a0));
    }
  }
  shooter.flashUntil = G.time + 0.05;
  return { victim, headshot, point: end };
}

export function applyDamage(G, victim, dmg, attacker, headshot) {
  if (!victim.alive) return;
  let remaining = dmg;
  if (victim.armour > 0) {
    const absorbed = Math.min(victim.armour, remaining * 0.5);
    victim.armour -= absorbed;
    remaining -= absorbed;
  }
  victim.hp -= remaining;
  victim.hurtAt = performance.now() / 1000;
  if (victim.isPlayer) {
    G.hud.damageFlash();
    G.audio.hurt();
    G.hud.setHealth(victim.hp, victim.armour);
  } else if (attacker && attacker.isPlayer) {
    G.hud.hitmarker(false);
    G.audio.hit();
  }
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;
    victim.mesh.rotation.x = -Math.PI / 2;
    victim.mesh.position.y = 0.25;
    if (attacker && attacker !== victim) {
      attacker.kills++;
      attacker.money += 300;
      if (attacker.isPlayer) {
        G.hud.hitmarker(true);
        G.audio.kill();
        G.hud.setMoney(attacker.money);
      }
    }
    G.hud.killfeed(
      attacker ? attacker.name : 'VESPER YARD',
      victim.name,
      attacker ? attacker.team : victim.team,
      victim.team,
      headshot,
    );
    if (victim.bot && victim.bot.bombCarrier) {
      victim.bot.bombCarrier = false;
      G.bombCarrier = null;
    }
    G.checkRoundEnd();
  }
}

// ---------------------------------------------------------------- bot brain

const BOT_NAMES_V = ['Rani', 'Bimo', 'Sari', 'Dimas'];
const BOT_NAMES_R = ['Kobra', 'Raka', 'Yuda', 'Gilang', 'Fajar'];
export { BOT_NAMES_V, BOT_NAMES_R };

export function makeBot(id, name, team, pos, yaw) {
  const agent = createAgent(id, name, team, false, pos, yaw);
  agent.bot = {
    state: 'patrol', path: [], pathI: 0, destNode: -1,
    thinkAt: Math.random() * 0.2, target: null, seenAt: -10,
    reactUntil: 0, burstLeft: 0, nextShotAt: 0, strafeDir: 1, strafeUntil: 0,
    plantT: 0, defuseT: 0, bombCarrier: false, siteKey: null,
    stuckAt: 0, lastX: pos.x, lastZ: pos.z, aimErr: 0.028 + Math.random() * 0.012,
    holdUntil: 0,
  };
  return agent;
}

/** Pick a weapon a bot can afford, weighted to its money. */
export function botBuy(bot) {
  const m = bot.money;
  const pick = m >= 4750 && Math.random() < 0.25 ? 'sniper'
    : m >= 2700 && Math.random() < 0.55 ? 'rifle'
    : m >= 1500 && Math.random() < 0.7 ? 'smg'
    : m >= 1200 && Math.random() < 0.4 ? 'shotgun' : 'sidearm';
  const def = WEAPONS[pick];
  if (pick !== 'sidearm') {
    bot.money -= def.price;
    bot.owned.push(pick);
  }
  if (m >= 650 && Math.random() < 0.6) {
    bot.money -= 650;
    bot.armour = 100;
  }
  if (Math.random() < 0.3 && bot.money >= 300) {
    bot.money -= 300;
    bot.grenades = 1;
  }
  bot.weaponKey = pick;
  bot.mag = def.mag;
  bot.reserve = def.reserve;
}

function botFace(bot, x, z) {
  bot.yaw = Math.atan2(x - bot.pos.x, z - bot.pos.z);
  bot.mesh.rotation.y = bot.yaw;
}

function botSetPath(G, bot, destNode) {
  const from = nearestWaypoint(G.world.waypoints, bot.pos);
  bot.bot.path = findPath(G.world.adjacency, from, destNode);
  bot.bot.pathI = 0;
  bot.bot.destNode = destNode;
}

function siteNode(G, key) {
  return key === 'A' ? 22 : 23;
}

export function updateBot(G, bot, dt, now) {
  const b = bot.bot;
  if (!bot.alive) return;
  const world = G.world;

  // --- think (cheap decisions at 6 Hz) ---------------------------------
  if (now >= b.thinkAt) {
    b.thinkAt = now + 0.15;
    // nearest visible enemy
    let best = null;
    let bestD = Infinity;
    for (const a of G.agents) {
      if (!a.alive || a.team === bot.team) continue;
      const d = bot.pos.distanceTo(a.pos);
      if (d > 55 || d >= bestD) continue;
      const eye = new THREE.Vector3(bot.pos.x, 1.62, bot.pos.z);
      const target = new THREE.Vector3(a.pos.x, a.pos.y + 1.3, a.pos.z);
      if (hasLineOfSight(G.raycaster, world, eye, target)) {
        best = a;
        bestD = d;
      }
    }
    if (best) {
      if (b.target !== best) {
        b.target = best;
        b.seenAt = now;
        b.reactUntil = now + 0.35 + Math.random() * 0.35; // reaction time
        b.burstLeft = 0;
      }
    } else if (b.target && now - b.seenAt > 1.2) {
      b.target = null;
    }

    // objective state
    if (G.bomb.planted) {
      // everyone converges on the planted site: defenders to defuse, attackers to hold it
      if (b.destNode !== siteNode(G, G.bomb.site)) botSetPath(G, bot, siteNode(G, G.bomb.site));
      b.state = 'rotate';
    } else if (bot.team === G.attackersAre) {
      if (b.bombCarrier) {
        if (!b.siteKey) b.siteKey = bot.pos.distanceTo(world.sites.A.pos) < bot.pos.distanceTo(world.sites.B.pos) ? 'A' : 'B';
        const site = world.sites[b.siteKey];
        if (bot.pos.distanceTo(site.pos) < site.radius - 1) {
          b.state = 'plant';
        } else {
          if (b.destNode !== siteNode(G, b.siteKey)) botSetPath(G, bot, siteNode(G, b.siteKey));
          b.state = 'push';
        }
      } else if (b.destNode < 0 || b.pathI >= b.path.length) {
        const siteKey = b.siteKey ?? (Math.random() < 0.5 ? 'A' : 'B');
        b.siteKey = siteKey;
        botSetPath(G, bot, siteNode(G, siteKey));
        b.state = 'push';
      }
    } else if (b.destNode < 0 || b.pathI >= b.path.length || now > b.holdUntil) {
      // defenders: hold a lane near a site, shuffle every few seconds
      const near = Math.random() < 0.5 ? [13, 16, 19, 10] : [3, 6, 22, 7];
      const node = near[Math.floor(Math.random() * near.length)];
      botSetPath(G, bot, node);
      b.holdUntil = now + 6 + Math.random() * 6;
      b.state = 'hold';
    }

    // stuck detection: barely moved in 1.5 s while trying to walk
    if (b.state === 'push' || b.state === 'rotate' || b.state === 'hold') {
      const moved = Math.hypot(bot.pos.x - b.lastX, bot.pos.z - b.lastZ);
      if (moved < 0.15) {
        if (now - b.stuckAt > 1.5) {
          const node = Math.floor(Math.random() * world.waypoints.length);
          botSetPath(G, bot, node);
          b.stuckAt = now;
        }
      } else {
        b.stuckAt = now;
        b.lastX = bot.pos.x;
        b.lastZ = bot.pos.z;
      }
    }
  }

  // --- combat ------------------------------------------------------------
  if (b.target && b.target.alive) {
    const t = b.target;
    botFace(bot, t.pos.x, t.pos.z);
    const weapon = WEAPONS[bot.weaponKey];
    if (now >= b.reactUntil && now >= b.nextShotAt && bot.reloadEnd <= now) {
      if (b.burstLeft <= 0) {
        b.burstLeft = weapon.auto ? 3 + Math.floor(Math.random() * 3) : 1;
        b.nextShotAt = now + 0.25 + Math.random() * 0.4;
      } else if (bot.mag > 0) {
        const dist = bot.pos.distanceTo(t.pos);
        const err = b.aimErr + dist * 0.0009 + (bot.moving ? 0.012 : 0);
        const origin = new THREE.Vector3(bot.pos.x, 1.62, bot.pos.z);
        const aim = new THREE.Vector3(t.pos.x, t.pos.y + 1.25 + (Math.random() - 0.5) * 0.5, t.pos.z);
        const dir = aim.sub(origin).normalize();
        dir.x += (Math.random() - 0.5) * err * 2;
        dir.y += (Math.random() - 0.5) * err * 2;
        dir.z += (Math.random() - 0.5) * err * 2;
        dir.normalize();
        fireHitscan(G, bot, origin, dir, weapon);
        G.audio.shot(weapon.sound);
        bot.mag--;
        b.burstLeft--;
        b.nextShotAt = now + 60 / weapon.rate;
        if (bot.mag === 0) {
          bot.reloadEnd = now + weapon.reload;
          bot.reloading = true;
        }
      }
    }
    // strafe while duelling
    if (now > b.strafeUntil) {
      b.strafeDir = Math.random() < 0.5 ? -1 : 1;
      b.strafeUntil = now + 0.6 + Math.random() * 0.9;
    }
    const fx = Math.sin(bot.yaw);
    const fz = Math.cos(bot.yaw);
    const sx = fz * b.strafeDir;
    const sz = -fx * b.strafeDir;
    bot.moving = moveAgent(world, bot, sx, sz, 2.2, dt) > 0;
    // reload when the duel ends
    if (bot.mag < weapon.mag * 0.4 && !b.target) {
      bot.reloadEnd = now + weapon.reload;
      bot.reloading = true;
    }
  } else {
    bot.moving = false;
    // --- plant / defuse --------------------------------------------------
    if (b.state === 'plant' && bot.team === G.attackersAre && !G.bomb.planted) {
      b.plantT += dt;
      G.audio.plantBeep(b.plantT > 2.6);
      if (b.plantT >= 3) {
        b.plantT = 0;
        G.plantBomb(b.siteKey, bot);
      }
      return;
    }
    if (G.bomb.planted && bot.team !== G.attackersAre) {
      const d = bot.pos.distanceTo(G.bomb.pos);
      if (d < 1.6) {
        b.defuseT += dt;
        if (Math.floor(b.defuseT * 4) !== Math.floor((b.defuseT - dt) * 4)) G.audio.defuseBeep();
        if (b.defuseT >= 5) {
          b.defuseT = 0;
          G.defuseBomb(bot);
        }
        return;
      }
    }
    // --- walk the path ----------------------------------------------------
    if (b.path.length && b.pathI < b.path.length) {
      const node = world.waypoints[b.path[b.pathI]];
      const dx = node.x - bot.pos.x;
      const dz = node.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9) {
        b.pathI++;
      } else {
        botFace(bot, node.x, node.z);
        bot.moving = moveAgent(world, bot, dx, dz, 3.7, dt) > 0;
      }
    }
  }

  // reload bookkeeping
  if (bot.reloading && now >= bot.reloadEnd) {
    const w = WEAPONS[bot.weaponKey];
    const need = w.mag - bot.mag;
    const take = Math.min(need, bot.reserve);
    bot.mag += take;
    bot.reserve -= take;
    bot.reloading = false;
  }
  // muzzle flash decay
  bot.flashMat.opacity = now < bot.flashUntil ? 0.95 : 0;
}
