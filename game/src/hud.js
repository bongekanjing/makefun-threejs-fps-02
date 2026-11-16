// The DOM HUD: health, armour, ammo, money, timer, score, kill feed,
// hitmarker, round banners, buy menu, bomb timer and the 2D minimap.
// The 3D scene never draws UI text; the HUD is plain DOM + one canvas.
import { WEAPONS, BUY_MENU } from './weapons.js';

export class HUD {
  constructor(doc) {
    this.doc = doc;
    const $ = (id) => doc.getElementById(id);
    this.el = {
      healthNum: $('health-num'), healthBar: $('health-bar'), armourNum: $('armour-num'),
      ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
      money: $('money'), timer: $('timer'), scoreV: $('score-v'), scoreR: $('score-r'),
      aliveV: $('alive-v'), aliveR: $('alive-r'), roundLabel: $('round-label'),
      killfeed: $('killfeed'), hitmarker: $('hitmarker'), crosshair: $('crosshair'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      buy: $('buy'), buyList: $('buy-list'), buyMoney: $('buy-money'),
      bomb: $('bomb'), bombTime: $('bomb-time'), bombBar: $('bomb-bar'),
      interact: $('interact'), interactFill: $('interact-fill'), interactLabel: $('interact-label'),
      damage: $('damage'), minimap: $('minimap'), overlay: $('overlay'),
      overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'), play: $('play'),
      end: $('end'), endTitle: $('end-title'), endSub: $('end-sub'), endScore: $('end-score'),
      restart: $('restart'), teamTag: $('team-tag'), hint: $('hint'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._hitTimer = 0;
    this._bannerTimer = 0;
    this._killSeq = 0;
  }

  setHealth(hp, armour) {
    this.el.healthNum.textContent = Math.max(0, Math.ceil(hp));
    this.el.healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.el.healthBar.style.background = hp > 50 ? '#2dd4bf' : hp > 25 ? '#f0a830' : '#e5484d';
    this.el.armourNum.textContent = Math.ceil(armour);
  }

  setAmmo(mag, reserve, name) {
    this.el.ammoMag.textContent = mag;
    this.el.ammoReserve.textContent = `/ ${reserve}`;
    this.el.weaponName.textContent = name;
    this.el.ammoMag.closest('#ammo').classList.toggle('empty', mag === 0);
  }

  setMoney(m) {
    this.el.money.textContent = `$${m}`;
    this.el.buyMoney.textContent = `$${m}`;
  }

  setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.el.timer.textContent = `${mm}:${ss}`;
    this.el.timer.classList.toggle('urgent', s <= 10 && phase === 'live');
    this.el.roundLabel.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND' : 'ROUND OVER';
  }

  setScore(v, r, round, aliveV, aliveR) {
    this.el.scoreV.textContent = v;
    this.el.scoreR.textContent = r;
    this.el.aliveV.textContent = aliveV;
    this.el.aliveR.textContent = aliveR;
    this.el.roundLabel.dataset.round = `ROUND ${round}`;
  }

  setTeamTag(attacking) {
    this.el.teamTag.textContent = attacking ? 'ATTACK · PLANT THE SPIKE' : 'DEFEND · HOLD THE SITES';
    this.el.teamTag.classList.toggle('defend', !attacking);
  }

  killfeed(killer, victim, killerTeam, victimTeam, headshot) {
    const line = this.doc.createElement('div');
    line.className = 'feed-line';
    const kc = killerTeam === 'V' ? 'team-v' : 'team-r';
    const vc = victimTeam === 'V' ? 'team-v' : 'team-r';
    line.innerHTML = `<span class="${kc}">${this._esc(killer)}</span> <span class="feed-weapon">${headshot ? '◉' : '✕'}</span> <span class="${vc}">${this._esc(victim)}</span>`;
    this.el.killfeed.prepend(line);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    if (this._sticky) return; // staged screenshots keep their feed on screen
    setTimeout(() => line.classList.add('fade'), 4200);
    setTimeout(() => line.remove(), 5000);
  }

  _esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  hitmarker(kill) {
    this.el.hitmarker.classList.add('on');
    this.el.hitmarker.classList.toggle('kill', !!kill);
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => this.el.hitmarker.classList.remove('on', 'kill'), 140);
  }

  damageFlash() {
    this.el.damage.classList.remove('flash');
    void this.el.damage.offsetWidth;
    this.el.damage.classList.add('flash');
  }

  banner(title, sub, ms = 3200) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), ms);
  }

  hideBanner() {
    this.el.banner.classList.remove('show');
  }

  showBuy(money, owned) {
    this.el.buy.classList.remove('hidden');
    this.el.buyList.innerHTML = '';
    for (const item of BUY_MENU) {
      const def = item.key === 'armour' || item.key === 'grenade'
        ? { name: item.name, price: item.price }
        : WEAPONS[item.key];
      const row = this.doc.createElement('div');
      row.className = 'buy-row';
      const afford = money >= def.price;
      const has = owned.includes(item.key);
      row.innerHTML = `<span class="buy-key">${item.slot}</span><span class="buy-name">${def.name}</span><span class="buy-price ${afford ? '' : 'poor'}">${has ? 'OWNED' : '$' + def.price}</span>`;
      if (!afford && !has) row.classList.add('cant');
      this.el.buyList.appendChild(row);
    }
    this.setMoney(money);
  }

  hideBuy() {
    this.el.buy.classList.add('hidden');
  }

  setBomb(seconds, total) {
    if (seconds === null) {
      this.el.bomb.classList.add('hidden');
      return;
    }
    this.el.bomb.classList.remove('hidden');
    this.el.bombTime.textContent = seconds.toFixed(1);
    this.el.bombBar.style.width = `${(seconds / total) * 100}%`;
  }

  setInteract(label, progress) {
    if (!label) {
      this.el.interact.classList.add('hidden');
      return;
    }
    this.el.interact.classList.remove('hidden');
    this.el.interactLabel.textContent = label;
    this.el.interactFill.style.width = `${Math.round(progress * 100)}%`;
  }

  setCrosshairSpread(px) {
    this.el.crosshair.style.setProperty('--gap', `${px}px`);
  }

  showOverlay(title, copy, button) {
    this.el.overlayTitle.textContent = title;
    this.el.overlayCopy.textContent = copy;
    this.el.play.textContent = button;
    this.el.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.el.overlay.classList.add('hidden');
  }

  showEnd(title, sub, scoreLine) {
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.endScore.textContent = scoreLine;
    this.el.end.classList.remove('hidden');
  }

  hideEnd() {
    this.el.end.classList.add('hidden');
  }

  setHint(text) {
    this.el.hint.textContent = text;
  }

  /** Top-down minimap: walls, sites, bomb, agents, view cone. */
  drawMinimap(world, agents, player, bomb) {
    const ctx = this.mapCtx;
    const W = 168;
    const H = 126;
    const b = world.bounds;
    const sx = (x) => ((x - b.minX) / (b.maxX - b.minX)) * W;
    const sy = (z) => ((z - b.minZ) / (b.maxZ - b.minZ)) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(13,18,24,0.82)';
    ctx.fillRect(0, 0, W, H);
    // containers as blocks
    ctx.fillStyle = '#3d4a55';
    for (const c of world.colliders) {
      if (c.maxX - c.minX > 60 || c.maxZ - c.minZ > 40) continue; // perimeter walls
      ctx.fillRect(sx(c.minX), sy(c.minZ), Math.max(2, sx(c.maxX) - sx(c.minX)), Math.max(2, sy(c.maxZ) - sy(c.minZ)));
    }
    // sites
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, site] of Object.entries(world.sites)) {
      ctx.fillStyle = key === 'A' ? 'rgba(240,168,48,0.9)' : 'rgba(45,212,191,0.9)';
      ctx.beginPath();
      ctx.arc(sx(site.pos.x), sy(site.pos.z), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0f14';
      ctx.fillText(key, sx(site.pos.x), sy(site.pos.z));
    }
    if (bomb && bomb.planted) {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      ctx.fillStyle = blink ? '#ff5a3c' : '#ffd9a0';
      ctx.beginPath();
      ctx.arc(sx(bomb.pos.x), sy(bomb.pos.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const a of agents) {
      if (!a.alive) continue;
      ctx.fillStyle = a.team === 'V' ? '#2dd4bf' : '#f97316';
      ctx.beginPath();
      ctx.arc(sx(a.pos.x), sy(a.pos.z), a.isPlayer ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (a.isPlayer) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(sx(a.pos.x), sy(a.pos.z));
        ctx.lineTo(sx(a.pos.x - Math.sin(a.yaw) * 9), sy(a.pos.z - Math.cos(a.yaw) * 9));
        ctx.stroke();
      }
    }
  }
}
