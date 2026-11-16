// VESPER YARD — round-based tactical FPS (Counter-Strike-style, original
// map, art, sounds and names). Single-player against bots, three.js 0.187.0,
// static files only, no network requests. 5v5, first to 5 rounds, plant /
// defuse objective, buy economy between rounds.
//
// Screenshot modes (used by the maker's own capture script, never by play):
//   ?shot=start  buy phase at the attacker spawn, buy menu open
//   ?shot=play   mid-round duel: rifle out, tracer and muzzle flash frozen
//   ?shot=end    round-won banner over the yard at dusk light
// Each mode is deterministic (fixed seed, frozen AI) so a re-capture matches.
import * as THREE from 'three';
import { buildWorld, collideCircle } from './world.js';
import { WEAPONS, BUY_MENU, buildViewmodel, updateTracers, updateImpacts, makeImpact } from './weapons.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { createAgent, makeBot, botBuy, fireHitscan, applyDamage, updateBot, BOT_NAMES_V, BOT_NAMES_R } from './entities.js';

const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const BUY_TIME = 12;
const ROUND_TIME = 100;
const BOMB_TIME = 35;
const EYE = 1.62;

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // null | 'start' | 'play' | 'end'
const SEED = Number(params.get('seed') || 1);

window.addEventListener('error', (e) => {
  document.title = `ERROR: ${e.message}`;
});

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (params.get('lowfx')) {
      // low-end / headless-testing mode: no shadow maps, no supersampling
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // a dim helmet lamp so the viewmodel and near ground read at night
    this.cameraLight = new THREE.PointLight(0xbfd4ff, 2.2, 7, 1.6);
    this.cameraLight.position.set(0.3, 0.3, 0.1);
    this.camera.add(this.cameraLight);

    this.world = buildWorld(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.audio = new SoundBank();
    this.input = new Input(this.renderer.domElement);
    this.input.attach();
    this.hud = new HUD(document);
    this.tracers = [];
    this.impacts = [];
    this.grenades = [];

    this.phase = 'menu';
    this.round = 0;
    this.score = { V: 0, R: 0 };
    this.attackersAre = 'V';
    this.bomb = { planted: false, site: null, pos: new THREE.Vector3(), timer: 0, mesh: null, light: null };
    this.bombCarrier = null;
    this.phaseT = 0;
    this.frozen = !!SHOT;
    this.time = 0;
    this.shake = 0;
    this.bloom = 0;
    this.interactT = 0;
    this.prevMouseDown = false;
    this.zoomed = false;
    this.stepT = 0;

    this.agents = [];
    this.player = null;
    this.buildAgents();
    this.buildViewmodel('sidearm');
    this.buildBombProp();

    this.hud.el.play.addEventListener('click', () => this.startMatch());
    this.hud.el.restart.addEventListener('click', () => location.reload());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.phase === 'live' || this.phase === 'buy') {
        this.audio.ensure();
        this.input.requestLock();
      }
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    if (SHOT) this.setupShot(SHOT);
    else this.hud.showOverlay('VESPER YARD', 'Night shift on the harbour quay. Five against five, first to five rounds — plant the spike or wipe the other crew. Click to play.', 'Click to play');
    window.__vesper = this; // debug / test handle

    this.clock = null;
    this._lastT = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildAgents() {
    const spawnV = this.world.spawns.attack;
    const spawnR = this.world.spawns.defend;
    this.player = createAgent('p0', 'Nofan', 'V', true, spawnV[0].clone(), -Math.PI / 2);
    this.player.mesh.visible = false; // first person: the body is a hitbox only
    this.scene.add(this.player.mesh);
    this.agents.push(this.player);
    BOT_NAMES_V.forEach((name, i) => {
      const a = makeBot(`v${i + 1}`, name, 'V', spawnV[i + 1].clone(), -Math.PI / 2);
      this.scene.add(a.mesh);
      this.agents.push(a);
    });
    BOT_NAMES_R.forEach((name, i) => {
      const a = makeBot(`r${i + 1}`, name, 'R', spawnR[i].clone(), Math.PI / 2);
      this.scene.add(a.mesh);
      this.agents.push(a);
    });
  }

  buildViewmodel(weaponKey) {
    if (this.viewmodel) {
      this.camera.remove(this.viewmodel.group);
      this.viewmodel = null;
    }
    this.viewmodel = buildViewmodel(weaponKey);
    this.camera.add(this.viewmodel.group);
    this.viewmodelKick = 0;
  }

  buildBombProp() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.6 }),
    );
    box.castShadow = true;
    g.add(box);
    const light = new THREE.PointLight(0xff3b30, 0, 6, 2);
    light.position.set(0, 0.2, 0);
    g.add(light);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    );
    dot.position.set(0, 0.13, 0);
    g.add(dot);
    g.visible = false;
    this.scene.add(g);
    this.bomb.mesh = g;
    this.bomb.light = light;
    this.bomb.dot = dot;
  }

  viewmodelMuzzleWorld() {
    return this.viewmodel.group.localToWorld(this.viewmodel.muzzleLocal.clone());
  }

  // ------------------------------------------------------------ match flow

  startMatch() {
    this.audio.ensure();
    this.hud.hideOverlay();
    this.input.requestLock();
    this.score = { V: 0, R: 0 };
    this.round = 0;
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.round > MAX_ROUNDS || this.score.V >= WIN_ROUNDS || this.score.R >= WIN_ROUNDS) {
      this.endMatch();
      return;
    }
    this.attackersAre = this.round % 2 === 1 ? 'V' : 'R';
    this.bomb.planted = false;
    this.bomb.site = null;
    this.bomb.mesh.visible = false;
    this.hud.setBomb(null);
    this.hud.hideBanner();
    this.hud.hideBuy();
    this.interactT = 0;

    // reset everyone at their spawn
    const spawns = this.attackersAre === 'V' ? this.world.spawns.attack : this.world.spawns.defend;
    const defSpawns = this.attackersAre === 'V' ? this.world.spawns.defend : this.world.spawns.attack;
    for (const a of this.agents) {
      const list = a.team === this.attackersAre ? spawns : defSpawns;
      const idx = a.team === 'V' ? this.agents.filter((x) => x.team === 'V').indexOf(a) : this.agents.filter((x) => x.team === 'R').indexOf(a);
      const spawn = list[Math.min(idx, list.length - 1)];
      a.pos.copy(spawn);
      a.pos.y = 0;
      a.yaw = a.team === this.attackersAre ? -Math.PI / 2 : Math.PI / 2;
      a.hp = 100;
      a.alive = true;
      a.velY = 0;
      a.mag = WEAPONS[a.weaponKey].mag;
      a.reserve = WEAPONS[a.weaponKey].reserve;
      a.reloading = false;
      a.reloadEnd = 0;
      a.mesh.visible = !a.isPlayer;
      a.mesh.rotation.set(0, a.yaw, 0);
      a.mesh.position.copy(a.pos);
      if (a.bot) {
        a.bot.path = [];
        a.bot.pathI = 0;
        a.bot.destNode = -1;
        a.bot.target = null;
        a.bot.siteKey = null;
        a.bot.plantT = 0;
        a.bot.defuseT = 0;
        a.bot.bombCarrier = false;
        a.bot.state = 'patrol';
        botBuy(a);
      }
    }
    // the spike goes to a random attacker (sometimes the player)
    const attackers = this.agents.filter((a) => a.team === this.attackersAre && a.alive);
    const carrier = attackers[Math.floor(Math.random() * attackers.length)];
    this.bombCarrier = carrier;
    if (carrier.bot) carrier.bot.bombCarrier = true;

    // the player's bought loadout persists between rounds
    this.buildViewmodel(this.player.weaponKey);
    this.phase = 'buy';
    this.phaseT = BUY_TIME;
    this.hud.setTeamTag(this.player.team === this.attackersAre);
    this.hud.setScore(this.score.V, this.score.R, this.round, 5, 5);
    this.hud.setHealth(this.player.hp, this.player.armour);
    this.hud.setMoney(this.player.money);
    this.hud.setAmmo(this.player.mag, this.player.reserve, WEAPONS[this.player.weaponKey].name);
    this.hud.banner(`ROUND ${this.round}`, this.player.team === this.attackersAre ? 'Attack — plant the spike at A or B' : 'Defend — hold both sites', 2600);
    this.openBuy();
    this.syncCameraToPlayer();
  }

  openBuy() {
    if (this.phase !== 'buy') return;
    this.hud.showBuy(this.player.money, this.player.owned);
    this.hud.setHint('B closes the buy menu · 1–6 to buy · the round starts when the timer ends');
  }

  closeBuy() {
    this.hud.hideBuy();
  }

  buy(key) {
    const p = this.player;
    if (key === 'armour') {
      if (p.armour >= 100 || p.money < 650) return this.audio.denied();
      p.money -= 650;
      p.armour = 100;
    } else if (key === 'grenade') {
      if (p.money < 300) return this.audio.denied();
      p.money -= 300;
      p.grenades++;
    } else {
      const def = WEAPONS[key];
      if (!def || p.owned.includes(key) || p.money < def.price) return this.audio.denied();
      p.money -= def.price;
      p.owned.push(key);
      p.weaponKey = key;
      p.mag = def.mag;
      p.reserve = def.reserve;
      this.buildViewmodel(key);
    }
    this.audio.buy();
    this.hud.setMoney(p.money);
    this.hud.setAmmo(p.mag, p.reserve, WEAPONS[p.weaponKey].name);
    this.hud.showBuy(p.money, p.owned);
  }

  startLive() {
    this.phase = 'live';
    this.phaseT = ROUND_TIME;
    this.closeBuy();
    this.hud.setHint('E plants / defuses · G throws a grenade · hold right-click to scope the Longbow');
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.phase = 'roundEnd';
    this.phaseT = 4;
    this.score[winner]++;
    for (const a of this.agents) {
      if (!a.alive) continue;
      a.money += a.team === winner ? 3250 : 1900;
    }
    if (this.player.team === winner) this.audio.roundWin();
    else this.audio.roundLose();
    const vWon = winner === 'V';
    this.hud.banner(
      vWon ? 'VESPER TAKES THE ROUND' : 'RUST TAKES THE ROUND',
      reason,
      3400,
    );
    this.hud.setScore(this.score.V, this.score.R, this.round, this.aliveCount('V'), this.aliveCount('R'));
    this.hud.setMoney(this.player.money);
    this.hud.setBomb(null);
    if (this.bomb.planted) {
      this.bomb.planted = false;
      this.bomb.mesh.visible = false;
    }
  }

  endMatch() {
    this.phase = 'matchEnd';
    this.input.exitLock();
    const v = this.score.V;
    const r = this.score.R;
    const title = v === r ? 'DRAW ON THE QUAY' : v > r ? 'VESPER YARD IS YOURS' : 'RUST TAKES THE YARD';
    this.hud.showEnd(title, `Final score — Vesper ${v} · Rust ${r}. First to ${WIN_ROUNDS} rounds.`, `Your line: ${this.player.kills} eliminations · ${this.player.deaths} deaths`);
    this.hud.setHint('Click Play again to run it back');
  }

  aliveCount(team) {
    return this.agents.filter((a) => a.team === team && a.alive).length;
  }

  checkRoundEnd() {
    if (this.phase !== 'live') return;
    const vAlive = this.aliveCount('V');
    const rAlive = this.aliveCount('R');
    if (this.bomb.planted) {
      if (vAlive === 0 && this.attackersAre === 'V') return; // spike still ticks
      if (rAlive === 0 && this.attackersAre === 'R') return;
      if (this.attackersAre === 'V' && rAlive === 0) return this.endRound('V', 'Site clear — nobody left to defuse');
      if (this.attackersAre === 'R' && vAlive === 0) return this.endRound('R', 'Site clear — nobody left to defuse');
      return;
    }
    if (vAlive === 0) return this.endRound('R', 'Vesper crew eliminated');
    if (rAlive === 0) return this.endRound('V', 'Rust crew eliminated');
  }

  plantBomb(siteKey, agent) {
    const site = this.world.sites[siteKey];
    this.bomb.planted = true;
    this.bomb.site = siteKey;
    this.bomb.pos.copy(site.pos);
    this.bomb.timer = BOMB_TIME;
    this.bomb.mesh.position.set(site.pos.x, 0.22, site.pos.z);
    this.bomb.mesh.visible = true;
    this.bombCarrier = null;
    if (agent) {
      agent.money += 300;
      if (agent.isPlayer) this.hud.setMoney(agent.money);
    }
    this.hud.banner('SPIKE PLANTED', `Site ${siteKey} — ${BOMB_TIME} seconds to detonation`, 3000);
    this.audio.plantBeep(true);
    for (const a of this.agents) {
      if (a.bot) {
        a.bot.path = [];
        a.bot.pathI = 0;
        a.bot.destNode = -1;
        a.bot.state = 'rotate';
      }
    }
  }

  defuseBomb(agent) {
    this.bomb.planted = false;
    this.bomb.mesh.visible = false;
    this.hud.setBomb(null);
    this.audio.roundWin();
    const defenders = this.attackersAre === 'V' ? 'R' : 'V';
    this.endRound(defenders, `${agent.name} defused the spike`);
  }

  explodeBomb() {
    this.bomb.planted = false;
    this.bomb.mesh.visible = false;
    this.audio.explosion();
    this.shake = 1.2;
    const pos = this.bomb.pos;
    this.impacts.push(makeImpact(this.scene, new THREE.Vector3(pos.x, 1, pos.z), 0xff6b3c));
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(pos);
      if (d < 9) applyDamage(this, a, 140 * (1 - d / 10), null, false);
    }
    this.endRound(this.attackersAre, 'The spike detonated');
  }

  // ------------------------------------------------------------ per-frame

  frame() {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - this._lastT) / 1000, 0.05);
    this._lastT = nowMs;
    this.time += dt;
    // Bot brains run on GAME time (this.time), not wall time, so fire rates,
    // reactions and patrols stay in step with movement at any frame rate.
    const now = this.time;
    this.world.update(dt, this.time);

    if (this.phase === 'buy') {
      this.phaseT -= dt;
      this.updatePlayer(dt, true);
      this.updateBots(dt, now);
      if (this.phaseT <= 0) this.startLive();
    } else if (this.phase === 'live') {
      this.phaseT -= dt;
      if (this.bomb.planted) {
        this.bomb.timer -= dt;
        this.hud.setBomb(Math.max(0, this.bomb.timer), BOMB_TIME);
        const blink = Math.floor(this.time * 2.4) % 2 === 0;
        this.bomb.light.intensity = blink ? 2.2 : 0.15;
        this.bomb.dot.material.color.setHex(blink ? 0xff3b30 : 0x551512);
        if (Math.floor(this.bomb.timer) !== Math.floor(this.bomb.timer + dt)) this.audio.plantBeep();
        if (this.bomb.timer <= 0) this.explodeBomb();
      }
      this.updatePlayer(dt, false);
      this.updateBots(dt, now);
      this.updateInteract(dt);
      if (this.phaseT <= 0 && !this.bomb.planted) {
        this.endRound(this.attackersAre === 'V' ? 'R' : 'V', 'Time — the defence holds');
      }
    } else if (this.phase === 'roundEnd') {
      this.phaseT -= dt;
      this.updateBots(dt, now);
      if (this.phaseT <= 0) this.nextRound();
    } else if (this.phase === 'menu') {
      // slow orbit over the yard behind the title card
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 26, 13, Math.cos(t) * 20);
      this.camera.lookAt(0, 1, 0);
    }

    if (this.phase !== 'menu') this.updateCamera(dt);
    this.updateGrenades(dt);
    updateTracers(this.tracers, dt);
    updateImpacts(this.impacts, dt);
    this.updateViewmodel(dt);
    if (this.phase === 'live' || this.phase === 'buy') {
      if (!SHOT) {
        this.hud.setTimer(this.phaseT, this.phase);
        this.hud.setScore(this.score.V, this.score.R, this.round, this.aliveCount('V'), this.aliveCount('R'));
      }
      this.hud.drawMinimap(this.world, this.agents, this.player, this.bomb);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.12;
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    if (SHOT && !this._shotReady) {
      this._shotReady = true;
      // re-stage the kill feed so it is still on screen when the capture lands
      this.hud.killfeed('Nofan', 'Kobra', 'V', 'R', true);
      this.hud.killfeed('Rani', 'Yuda', 'V', 'R', false);
      document.title = 'READY';
    }
  }

  syncCameraToPlayer() {
    this.camera.position.set(this.player.pos.x, EYE, this.player.pos.z);
    this.camera.rotation.set(0, this.player.yaw, 0);
  }

  updateCamera() {
    const p = this.player;
    const crouch = this.input.keys.has('ControlLeft') && p.alive;
    const eye = crouch ? 1.15 : EYE;
    this.camera.position.set(p.pos.x, p.pos.y + eye, p.pos.z);
    this.camera.rotation.y = p.yaw;
    // pitch is stored on the camera directly (player has no pitch field)
    this.camera.rotation.x = this._pitch ?? 0;
    const wantZoom = this.input.mouseDownRight && WEAPONS[p.weaponKey].zoom > 1;
    this.zoomed = wantZoom;
    const targetFov = wantZoom ? 75 / WEAPONS[p.weaponKey].zoom : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.25;
      this.camera.updateProjectionMatrix();
    }
  }

  updatePlayer(dt, buyPhase) {
    const p = this.player;
    const inp = this.input;
    if (!p.alive) return;

    // look
    p.yaw -= inp.lookDX * 0.0022;
    this._pitch = Math.max(-1.5, Math.min(1.5, (this._pitch ?? 0) - inp.lookDY * 0.0022));

    // move
    const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    let mx = 0;
    let mz = 0;
    if (inp.keys.has('KeyW')) { mx += fwd.x; mz += fwd.z; }
    if (inp.keys.has('KeyS')) { mx -= fwd.x; mz -= fwd.z; }
    if (inp.keys.has('KeyD')) { mx += right.x; mz += right.z; }
    if (inp.keys.has('KeyA')) { mx -= right.x; mz -= right.z; }
    const weapon = WEAPONS[p.weaponKey];
    let speed = p.speed * weapon.moveSpeed;
    if (inp.keys.has('ControlLeft')) speed *= 0.55;
    if (this.zoomed) speed *= 0.6;
    const moved = Math.hypot(mx, mz) > 0;
    if (moved && !buyPhase) {
      const stepInterval = inp.keys.has('ShiftLeft') ? 0.34 : 0.42;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = stepInterval;
        this.audio.step(inp.keys.has('ShiftLeft'));
      }
    }
    if (moved) {
      const len = Math.hypot(mx, mz);
      p.pos.x += (mx / len) * speed * dt;
      p.pos.z += (mz / len) * speed * dt;
      collideCircle(p.pos, p.radius, this.world.colliders, this.world.bounds);
      p.walkPhase += speed * dt * 2.4;
      this.bloom = Math.min(1, this.bloom + dt * 1.4);
    } else {
      this.bloom = Math.max(0, this.bloom - dt * 2.2);
    }
    p.mesh.position.copy(p.pos);

    // gravity / jump
    if (inp.pressed('Space') && p.grounded) {
      p.velY = 6.4;
      p.grounded = false;
    }
    if (!p.grounded) {
      p.velY -= 18 * dt;
      p.pos.y += p.velY * dt;
      if (p.pos.y <= 0) {
        p.pos.y = 0;
        p.velY = 0;
        p.grounded = true;
      }
    }

    // buy keys
    if (buyPhase) {
      if (inp.pressed('KeyB')) this.closeBuy();
      for (const item of BUY_MENU) {
        if (inp.pressed(`Digit${item.slot}`)) this.buy(item.key);
      }
    } else if (inp.pressed('KeyB')) {
      this.hud.setHint('The buy menu only opens between rounds');
    }

    // grenade
    if ((inp.pressed('KeyG') || inp.pressed('Digit4')) && p.grenades > 0 && !buyPhase) {
      this.throwGrenade();
    }

    // reload
    if (inp.pressed('KeyR') && !p.reloading && p.mag < weapon.mag && p.reserve > 0) {
      p.reloading = true;
      p.reloadEnd = performance.now() / 1000 + weapon.reload;
      this.audio.reload();
    }
    if (p.reloading && performance.now() / 1000 >= p.reloadEnd) {
      const need = weapon.mag - p.mag;
      const take = Math.min(need, p.reserve);
      p.mag += take;
      p.reserve -= take;
      p.reloading = false;
      this.hud.setAmmo(p.mag, p.reserve, weapon.name);
    }

    // fire
    const wantFire = weapon.auto ? inp.mouseDown : inp.mouseDown && !this.prevMouseDown;
    this.prevMouseDown = inp.mouseDown;
    const now = performance.now() / 1000;
    if (wantFire && !buyPhase && inp.locked && !p.reloading && now - p.lastShotAt >= 60 / weapon.rate) {
      if (p.mag <= 0) {
        this.audio.dryFire();
        p.lastShotAt = now;
      } else {
        p.lastShotAt = now;
        p.mag--;
        this.hud.setAmmo(p.mag, p.reserve, weapon.name);
        this.audio.shot(weapon.sound);
        const spread = weapon.spread * (1 + this.bloom * 1.6 + (moved ? 0.7 : 0)) * (this.zoomed ? 0.35 : 1);
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const pellets = weapon.pellets ?? 1;
        for (let i = 0; i < pellets; i++) {
          const d = dir.clone();
          d.x += (Math.random() - 0.5) * spread * 2;
          d.y += (Math.random() - 0.5) * spread * 2;
          d.z += (Math.random() - 0.5) * spread * 2;
          d.normalize();
          const origin = this.camera.position.clone();
          fireHitscan(this, p, origin, d, weapon);
        }
        this.viewmodelKick = Math.min(0.09, this.viewmodelKick + weapon.kick * 2.2);
        this._pitch = Math.min(1.5, (this._pitch ?? 0) + weapon.kick * 0.55);
        this.bloom = Math.min(1, this.bloom + 0.22);
        this.viewmodel.flashMat.opacity = 1;
        this.viewmodel.flashLight.intensity = 14;
        setTimeout(() => {
          this.viewmodel.flashMat.opacity = 0;
          this.viewmodel.flashLight.intensity = 0;
        }, 55);
        if (p.mag === 0) {
          p.reloading = true;
          p.reloadEnd = now + weapon.reload;
          this.audio.reload();
        }
      }
    }

    // crosshair gap follows bloom
    this.hud.setCrosshairSpread(4 + this.bloom * 14 + (moved ? 4 : 0));
  }

  updateInteract(dt) {
    const p = this.player;
    const inp = this.input;
    if (!p.alive || this.phase !== 'live') {
      this.hud.setInteract(null, 0);
      return;
    }
    const holding = inp.keys.has('KeyE');
    if (this.bombCarrier === p && p.team === this.attackersAre && !this.bomb.planted) {
      const site = Object.entries(this.world.sites).find(([, s]) => p.pos.distanceTo(s.pos) < s.radius);
      if (site) {
        if (holding) {
          this.interactT += dt;
          this.hud.setInteract(`PLANTING SPIKE — SITE ${site[0]}`, this.interactT / 3);
          if (Math.floor(this.interactT * 2) !== Math.floor((this.interactT - dt) * 2)) this.audio.plantBeep();
          if (this.interactT >= 3) {
            this.interactT = 0;
            this.plantBomb(site[0], p);
          }
        } else {
          this.interactT = 0;
          this.hud.setInteract(`HOLD E — PLANT THE SPIKE (SITE ${site[0]})`, 0);
        }
        return;
      }
    }
    if (this.bomb.planted && p.team !== this.attackersAre) {
      const d = p.pos.distanceTo(this.bomb.pos);
      if (d < 1.8) {
        if (holding) {
          this.interactT += dt;
          this.hud.setInteract('DEFUSING THE SPIKE', this.interactT / 5);
          if (Math.floor(this.interactT * 3) !== Math.floor((this.interactT - dt) * 3)) this.audio.defuseBeep();
          if (this.interactT >= 5) {
            this.interactT = 0;
            this.defuseBomb(p);
          }
        } else {
          this.interactT = 0;
          this.hud.setInteract('HOLD E — DEFUSE THE SPIKE', 0);
        }
        return;
      }
    }
    this.interactT = 0;
    this.hud.setInteract(null, 0);
  }

  throwGrenade() {
    const p = this.player;
    p.grenades--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.4, metalness: 0.7 }),
    );
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.5);
    this.scene.add(mesh);
    this.grenades.push({
      mesh,
      vel: dir.multiplyScalar(13).add(new THREE.Vector3(0, 3.4, 0)),
      life: 1.6,
    });
    this.audio.shot('pistol');
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.life -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const pos = g.mesh.position;
      if (pos.y < 0.09) {
        pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.42;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      const before = { x: pos.x, z: pos.z };
      collideCircle(pos, 0.1, this.world.colliders, this.world.bounds);
      if (pos.x !== before.x) g.vel.x *= -0.45;
      if (pos.z !== before.z) g.vel.z *= -0.45;
      let boom = g.life <= 0;
      if (!boom) {
        for (const a of this.agents) {
          if (a.alive && a !== this.player && a.pos.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)) < 1.1) boom = true;
        }
      }
      if (boom) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.audio.explosion();
        this.impacts.push(makeImpact(this.scene, pos.clone(), 0xffb45e));
        const flash = new THREE.PointLight(0xffb45e, 90, 18, 1.8);
        flash.position.copy(pos);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 220);
        this.explodeGrenade(pos.clone());
      }
    }
  }

  explodeGrenade(pos) {
    // shared death / kill-feed path with bullets; the thrower is never hurt
    // by their own grenade at point-blank range
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(new THREE.Vector3(pos.x, 0, pos.z));
      if (d >= 7) continue;
      if (a === this.player && d < 2) continue;
      applyDamage(this, a, 95 * (1 - d / 7.5), this.player, false);
    }
    if (this.player.pos.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)) < 12) this.shake = Math.max(this.shake, 0.7);
  }

  updateBots(dt, now) {
    if (this.frozen) return;
    for (const a of this.agents) {
      if (a.bot) updateBot(this, a, dt, now);
    }
  }

  updateViewmodel(dt) {
    const vm = this.viewmodel;
    if (!vm) return;
    this.viewmodelKick = Math.max(0, this.viewmodelKick - dt * 0.45);
    const bob = this.player.alive && this.player.walkPhase ? Math.sin(this.player.walkPhase) * 0.008 : 0;
    const bobY = this.player.alive && this.player.walkPhase ? Math.abs(Math.cos(this.player.walkPhase)) * 0.01 : 0;
    const reloading = this.player.reloading;
    const dip = reloading ? -0.12 : 0;
    vm.group.position.set(
      0.28 + bob,
      -0.26 - bobY + dip,
      -0.5 + this.viewmodelKick,
    );
    vm.group.rotation.x = this.viewmodelKick * 1.4 + (reloading ? 0.5 : 0);
    vm.group.rotation.z = bob * 0.4;
  }

  // ------------------------------------------------------------ screenshots

  setupShot(mode) {
    // deterministic staged scene: no menu, no live AI, fixed camera + HUD
    this.score = { V: 2, R: 1 };
    this.round = 4;
    this.attackersAre = 'V';
    this.hud.hideOverlay();
    this.hud.hideEnd();
    this.hud._sticky = true; // staged screenshots keep their kill feed on screen
    this.phase = mode === 'start' ? 'buy' : 'live';
    this.phaseT = mode === 'start' ? BUY_TIME : 64;
    const p = this.player;
    p.money = 4700;
    p.owned = ['sidearm', 'rifle'];
    p.weaponKey = 'rifle';
    p.mag = 30;
    p.reserve = 90;
    p.hp = 100;
    p.armour = 50;
    p.grenades = 1;
    this.buildViewmodel('rifle');
    this.hud.setHealth(100, 50);
    this.hud.setMoney(4700);
    this.hud.setAmmo(30, 90, 'Kestrel-5');
    this.hud.setScore(2, 1, 4, 5, 5);
    this.hud.setTeamTag(true);
    this.hud.setTimer(this.phaseT, this.phase);

    // stage the bots at fixed, visible spots
    const spots = [
      { id: 'v1', x: -24, z: -3, yaw: -Math.PI / 2 },
      { id: 'v2', x: -20, z: 6, yaw: -Math.PI / 2 },
      { id: 'r1', x: 2, z: -8, yaw: Math.PI / 2 },
      { id: 'r2', x: 4, z: 8, yaw: Math.PI * 0.75 },
      { id: 'r3', x: 8, z: -4, yaw: Math.PI / 2 },
    ];
    for (const s of spots) {
      const a = this.agents.find((x) => x.id === s.id);
      if (!a) continue;
      a.pos.set(s.x, 0, s.z);
      a.yaw = s.yaw;
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.set(0, s.yaw, 0);
      a.mesh.visible = true;
      a.alive = true;
      a.hp = 100;
    }
    // the rest of the crew waits out of frame
    for (const a of this.agents) {
      if (!spots.find((s) => s.id === a.id) && a !== p) {
        a.pos.set(28, 0, a.team === 'R' ? -20 : 20);
        a.mesh.position.copy(a.pos);
      }
    }
    // the kill feed is staged when the first frame lands (see frame()),
    // so it is still on screen when a slow capture finally reads the frame

    if (mode === 'start') {
      p.pos.set(-27, 0, 0);
      p.yaw = -Math.PI / 2 + 0.12;
      this._pitch = 0.02;
      this.syncCameraToPlayer();
      this.openBuy();
      this.hud.setHint('Buy phase — 1 Kestrel-5 · 2 Falcon-9 · 3 Longbow · 4 Mastiff-12 · 5 Kevlar · 6 HE grenade');
    } else if (mode === 'play') {
      p.pos.set(-11, 0, 3);
      p.yaw = -Math.PI / 2 - 0.35;
      this._pitch = -0.01;
      this.syncCameraToPlayer();
      // a frozen muzzle flash + tracer down the lane, as if mid-burst
      const origin = this.camera.position.clone();
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const end = origin.clone().addScaledVector(dir, 26);
      const tracerLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([this.viewmodelMuzzleWorld(), end]),
        new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 }),
      );
      this.scene.add(tracerLine);
      this.viewmodel.flashMat.opacity = 1;
      this.viewmodel.flashLight.intensity = 14;
      this.hud.hitmarker(false);
      this.hud.setCrosshairSpread(9);
    } else if (mode === 'end') {
      p.pos.set(-8, 0, -2);
      p.yaw = -Math.PI / 2 - 0.55;
      this._pitch = 0.0;
      this.syncCameraToPlayer();
      this.hud.banner('VESPER TAKES THE ROUND', 'Site A clear — Rust crew eliminated', 60000);
      this.score = { V: 3, R: 1 };
      this.hud.setScore(3, 1, 4, 3, 0);
      this.hud.setHealth(64, 25);
      this.hud.setAmmo(17, 60, 'Kestrel-5');
      p.hp = 64;
      p.armour = 25;
      p.mag = 17;
      p.reserve = 60;
    }
    this.syncCameraToPlayer();
    if (mode === 'end') {
      // keep the banner camera after sync
      this.camera.rotation.y = p.yaw;
      this.camera.rotation.x = 0.04;
    }
  }
}

new Game();
