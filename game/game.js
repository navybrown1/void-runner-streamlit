(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('scoreDisplay');
  const statusEl = document.getElementById('statusText');
  const weaponEl = document.getElementById('weaponDisplay');
  const heatEl = document.getElementById('heatDisplay');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const finalScoreEl = document.getElementById('finalScore');
  const finalKillsEl = document.getElementById('finalKills');
  const audioToggleBtn = document.getElementById('audioToggle');

  const keys = Object.create(null);

  // --- CONFIG ---
  const PLAYER_SPEED = 380;
  const BOUNDS_PADDING = 22;
  const MAX_DT = 1 / 30;
  const SPAWN_BASE_MS = 950;
  
  // Weapon Definitions
  const WEAPONS = {
    BLASTER: { name: 'BLASTER MK-II', heat: 7, cool: 35, delay: 86, speed: 960, color: '#3af4ff', spread: 0, count: 1, damage: 1 },
    SCATTER: { name: 'SCATTER VULCAN', heat: 12, cool: 30, delay: 110, speed: 850, color: '#ffeb3b', spread: 0.35, count: 5, damage: 0.8 },
    PLASMA:  { name: 'PLASMA CASTER', heat: 35, cool: 20, delay: 350, speed: 600, color: '#8eff87', spread: 0, count: 1, damage: 8, radius: 12 }
  };

  const WEAPON_OVERHEAT_LIMIT = 100;
  const WEAPON_RECOVER_AT = 40;

  const player = {
    x: 0, y: 0, w: 36, h: 48, vx: 0, vy: 0, tilt: 0,
    weapon: 'BLASTER',
    hp: 1,
    shield: 0,
    invuln: 0
  };

  // Entities
  let asteroids = [];
  let enemies = []; // New Interceptor ships
  let bullets = [];
  let particles = [];
  let shockwaves = [];
  let powerups = []; // Floating drops
  let stars = [];

  // State
  let score = 0;
  let kills = 0;
  let running = false;
  let gameOver = false;
  let baseFallSpeed = 160;
  let spawnTimerMs = 0;
  let enemySpawnTimerMs = 0;
  let lastFrameMs = 0;
  let shakePower = 0;
  let hitStop = 0; // Freezes frame briefly on impact
  let thrustParticleTimer = 0;
  let lastThrustSoundAt = 0;
  let lastShotAt = -1000;
  let milestoneReached = 0;
  let weaponHeat = 0;
  let weaponOverheated = false;
  let pointerFiring = false;
  let pointerSteering = false;
  let pointerTargetX = 0;
  let pointerTargetY = 0;

  const audio = createAudioEngine();

  // --- MATH & UTILS ---
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(from, to, t) { return from + (to - from) * t; }
  function randRange(min, max) { return min + Math.random() * (max - min); }
  function rotateOffset(x, y, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: x * c - y * s, y: x * s + y * c };
  }
  function shipCenter() { return { x: player.x + player.w / 2, y: player.y + player.h / 2 }; }
  function circlesCollide(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy <= (ar + br) * (ar + br);
  }

  // --- AUDIO ENGINE ---
  function createAudioEngine() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ctxRef = null, masterGain, sfxGain, musicGain;
    let enabled = true;
    let nextBeatTime = 0, beatStep = 0;

    const leadPattern = [220, 220, 262, 196, 220, 220, 330, 165]; // Cyberpunk bassline
    
    function ensureContext() {
      if (!Ctx) return false;
      if (ctxRef) return true;
      ctxRef = new Ctx();
      masterGain = ctxRef.createGain();
      musicGain = ctxRef.createGain();
      sfxGain = ctxRef.createGain();
      masterGain.gain.value = 0.8;
      musicGain.gain.value = 0.4;
      sfxGain.gain.value = 0.8;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctxRef.destination);
      return true;
    }

    function tone(opts) {
      if (!enabled || !ensureContext()) return;
      const t = ctxRef.currentTime + (opts.delay || 0);
      const osc = ctxRef.createOscillator();
      const g = ctxRef.createGain();
      const f = ctxRef.createBiquadFilter();
      
      osc.type = opts.wave || 'triangle';
      osc.frequency.setValueAtTime(opts.freq, t);
      if(opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t + opts.duration);
      
      f.frequency.setValueAtTime(opts.filter || 3000, t);
      f.Q.value = opts.q || 0;

      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(opts.gain || 0.1, t + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.001, t + opts.duration + 0.05);

      osc.connect(f); f.connect(g); g.connect(opts.kind === 'music' ? musicGain : sfxGain);
      osc.start(t); osc.stop(t + opts.duration + 0.1);
    }

    function noise(dur, gain) {
      if (!enabled || !ensureContext()) return;
      const t = ctxRef.currentTime;
      const buf = ctxRef.createBuffer(1, ctxRef.sampleRate * dur, ctxRef.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0; i<d.length; i++) d[i] = Math.random() * 2 - 1;
      
      const src = ctxRef.createBufferSource();
      const g = ctxRef.createGain();
      const f = ctxRef.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1000, t);
      f.frequency.linearRampToValueAtTime(100, t + dur);
      
      src.buffer = buf;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      
      src.connect(f); f.connect(g); g.connect(sfxGain);
      src.start(t);
    }

    return {
      unlock: () => { ensureContext(); if(ctxRef.state === 'suspended') ctxRef.resume(); },
      setEnabled: (v) => { enabled = v; if(enabled) ensureContext(); },
      tickMusic: () => {
        if (!enabled || !running || !ctxRef) return;
        const t = ctxRef.currentTime;
        if (t >= nextBeatTime) {
           const freq = leadPattern[beatStep % leadPattern.length];
           tone({ kind:'music', wave: 'sawtooth', freq: freq, endFreq: freq/2, duration: 0.12, gain: 0.1, filter: 800 });
           tone({ kind:'music', wave: 'sine', freq: freq/4, duration: 0.12, gain: 0.3 }); // Sub bass
           nextBeatTime = t + 0.15;
           beatStep++;
        }
      },
      resetMusic: () => { beatStep = 0; if(ctxRef) nextBeatTime = ctxRef.currentTime; },
      get enabled() { return enabled; },
      // SFX Methods
      shoot: (type) => {
        if(type === 'SCATTER') tone({ wave: 'sawtooth', freq: 150, endFreq: 50, duration: 0.1, gain: 0.08, filter: 2000 });
        else if(type === 'PLASMA') tone({ wave: 'square', freq: 80, endFreq: 400, duration: 0.3, gain: 0.1, filter: 500 });
        else tone({ wave: 'triangle', freq: 800, endFreq: 100, duration: 0.08, gain: 0.05 });
      },
      explode: () => { noise(0.3, 0.2); tone({ wave: 'sawtooth', freq: 100, endFreq: 10, duration: 0.4, gain: 0.2 }); },
      powerup: () => { tone({ wave: 'sine', freq: 600, endFreq: 1200, duration: 0.3, gain: 0.1 }); tone({ wave: 'square', freq: 600, endFreq: 1200, duration: 0.3, gain: 0.05, delay: 0.05 }); },
      hit: () => tone({ wave: 'square', freq: 200, endFreq: 50, duration: 0.05, gain: 0.05 }),
      overheat: () => tone({ wave: 'sawtooth', freq: 500, endFreq: 100, duration: 0.5, gain: 0.1 }),
      thrust: () => noise(0.05, 0.02)
    };
  }

  // --- GAMEPLAY FUNCTIONS ---

  function initStars() {
    stars = [];
    // Deep space parallax
    for(let i=0; i<100; i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.5, s: 20, a: Math.random() });
    // Mid space
    for(let i=0; i<50; i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*2.5, s: 60, a: Math.random() });
  }

  function spawnAsteroid() {
    const r = randRange(18, 45);
    const hp = Math.floor(r / 8) + (score > 500 ? 2 : 0);
    asteroids.push({
      x: randRange(r, canvas.width - r), y: -r - 50,
      r, vx: randRange(-40, 40), vy: baseFallSpeed * randRange(0.9, 1.2),
      rot: Math.random(), spin: randRange(-2, 2),
      hp, maxHp: hp, flash: 0,
      points: Array.from({length: 9}, (_,i) => ({ a: i/9*Math.PI*2, r: r*randRange(0.8, 1.2) }))
    });
  }

  function spawnEnemy() {
    if (score < 300) return; // No enemies early game
    const r = 24;
    enemies.push({
      x: randRange(50, canvas.width - 50), y: -50,
      r, vx: 0, vy: baseFallSpeed * 1.3,
      hp: 3, maxHp: 3, flash: 0
    });
  }

  function spawnPowerup(x, y) {
    const roll = Math.random();
    let type = 'REPAIR';
    if (roll < 0.3) type = 'PLASMA';
    else if (roll < 0.6) type = 'SCATTER';
    else if (player.hp >= 1) type = 'BLASTER'; // Reset to blaster if full hp

    powerups.push({ x, y, type, vy: 80, r: 16, rot: 0 });
  }

  function fireCannons(nowMs) {
    const def = WEAPONS[player.weapon];
    const muzzle = shipCenter();
    muzzle.y -= player.h * 0.4;
    
    // Spread Logic
    const count = def.count;
    const startAngle = -def.spread / 2;
    const step = count > 1 ? def.spread / (count - 1) : 0;

    for(let i=0; i<count; i++) {
      const angle = startAngle + step * i + player.tilt * 0.2;
      bullets.push({
        x: muzzle.x + Math.sin(angle)*10, y: muzzle.y - Math.cos(angle)*10,
        vx: Math.sin(angle) * def.speed + player.vx * 0.2,
        vy: -Math.cos(angle) * def.speed,
        r: def.radius || 3,
        damage: def.damage,
        color: def.color,
        type: player.weapon,
        life: 1.2
      });
    }

    // Recoil / Heat
    lastShotAt = nowMs;
    weaponHeat = Math.min(WEAPON_OVERHEAT_LIMIT, weaponHeat + def.heat);
    shakePower = Math.max(shakePower, def.heat * 0.5); 
    player.y += 2; // Physics recoil

    // FX
    for(let i=0; i<8; i++) {
        particles.push({
            x: muzzle.x, y: muzzle.y, 
            vx: randRange(-100, 100), vy: randRange(-100, 50), 
            life: 0.2, color: def.color, size: randRange(2,4)
        });
    }

    audio.shoot(player.weapon);
    if (weaponHeat >= WEAPON_OVERHEAT_LIMIT) {
      weaponOverheated = true;
      audio.overheat();
    }
  }

  function createExplosion(x, y, scale, color) {
    const count = 20 * scale;
    for(let i=0; i<count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(50, 400 * scale);
      particles.push({
        x, y, 
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        life: randRange(0.4, 0.8),
        color: color || (Math.random() > 0.5 ? '#ffaa00' : '#ffffff'),
        size: randRange(2, 6) * scale,
        drag: 0.95
      });
    }
    shockwaves.push({ x, y, r: 10, maxR: 100 * scale, life: 0.4 });
    audio.explode();
    shakePower = 8 * scale;
    hitStop = 40 * scale; // Freeze frame
  }

  // --- UPDATE LOOPS ---

  function updatePlayer(dt, nowMs) {
    // Input
    const left = keys.ArrowLeft || keys.KeyA || (pointerSteering && pointerTargetX < player.x);
    const right = keys.ArrowRight || keys.KeyD || (pointerSteering && pointerTargetX > player.x);
    const up = keys.ArrowUp || keys.KeyW || (pointerSteering && pointerTargetY < player.y);
    const down = keys.ArrowDown || keys.KeyS || (pointerSteering && pointerTargetY > player.y);

    let ax = 0, ay = 0;
    if (left) ax = -1; if (right) ax = 1;
    if (up) ay = -1; if (down) ay = 1;
    
    // Smooth movement with inertia
    player.vx = lerp(player.vx, ax * PLAYER_SPEED, dt * 8);
    player.vy = lerp(player.vy, ay * PLAYER_SPEED, dt * 8);
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Boundary
    player.x = clamp(player.x, BOUNDS_PADDING, canvas.width - player.w - BOUNDS_PADDING);
    player.y = clamp(player.y, BOUNDS_PADDING, canvas.height - player.h - BOUNDS_PADDING);
    player.tilt = lerp(player.tilt, player.vx / PLAYER_SPEED, dt * 5);

    // Heat
    const def = WEAPONS[player.weapon];
    weaponHeat = Math.max(0, weaponHeat - def.cool * dt);
    if(weaponOverheated && weaponHeat < WEAPON_RECOVER_AT) {
        weaponOverheated = false;
        statusEl.textContent = "READY";
    }

    // Firing
    const wantsFire = keys.Space || keys.KeyJ || pointerFiring;
    if(wantsFire && !weaponOverheated && nowMs - lastShotAt > def.delay) {
        fireCannons(nowMs);
    }
    
    // Thruster FX
    if(Math.abs(player.vx) > 10 || Math.abs(player.vy) > 10) {
        if(nowMs - lastThrustSoundAt > 100) { audio.thrust(); lastThrustSoundAt = nowMs; }
        particles.push({
            x: player.x + player.w/2 + randRange(-5,5), y: player.y + player.h + randRange(0,5),
            vx: randRange(-20,20), vy: randRange(100,200),
            life: 0.3, color: '#3af4ff', size: randRange(2,4)
        });
    }

    updateWeaponHud();
  }

  function updateEntities(dt) {
    const center = shipCenter();
    const radius = player.w * 0.4;

    // --- BULLETS ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if(b.life <= 0 || b.y < -50 || b.x < 0 || b.x > canvas.width) { bullets.splice(i, 1); continue; }

      // Check Collision Asteroids
      let hit = false;
      for (const a of asteroids) {
        if(circlesCollide(b.x, b.y, b.r, a.x, a.y, a.r)) {
            a.hp -= b.damage; a.flash = 0.1;
            hit = true;
            particles.push({x:b.x, y:b.y, vx:-b.vx*0.3, vy:-b.vy*0.3, life:0.2, color:b.color, size:2});
            if(a.hp <= 0) {
                if(Math.random() < 0.15) spawnPowerup(a.x, a.y);
                createExplosion(a.x, a.y, a.r/30, '#ffaa00');
                asteroids.splice(asteroids.indexOf(a), 1);
                score += 100; kills++;
            } else {
                audio.hit();
            }
            break;
        }
      }
      
      // Check Collision Enemies
      if(!hit) {
        for(const e of enemies) {
            if(circlesCollide(b.x, b.y, b.r, e.x, e.y, e.r)) {
                e.hp -= b.damage; e.flash = 0.1; hit = true;
                if(e.hp <= 0) {
                    createExplosion(e.x, e.y, 1.2, '#ff3333');
                    enemies.splice(enemies.indexOf(e), 1);
                    score += 250; kills++;
                    spawnPowerup(e.x, e.y); // Enemies always drop powerups? maybe too easy.
                } else audio.hit();
                break;
            }
        }
      }

      if(hit && b.type !== 'PLASMA') bullets.splice(i, 1); // Plasma goes through
    }

    // --- ASTEROIDS ---
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.y += a.vy * dt; a.x += a.vx * dt; a.rot += a.spin * dt;
      if(a.y > canvas.height + 100) { asteroids.splice(i, 1); continue; }
      if(circlesCollide(a.x, a.y, a.r*0.8, center.x, center.y, radius)) killPlayer();
    }

    // --- ENEMIES (Interceptors) ---
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        // AI: Move down and towards player
        const dx = center.x - e.x;
        e.vx = lerp(e.vx, dx * 1.5, dt * 2); 
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot = e.vx * 0.005;

        if(e.y > canvas.height + 50) { enemies.splice(i, 1); continue; }
        if(circlesCollide(e.x, e.y, e.r, center.x, center.y, radius)) killPlayer();
    }

    // --- POWERUPS ---
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.y += p.vy * dt; p.rot += dt * 3;
        if(p.y > canvas.height + 50) { powerups.splice(i, 1); continue; }
        
        if(circlesCollide(p.x, p.y, p.r + 10, center.x, center.y, radius)) {
            audio.powerup();
            if(p.type === 'REPAIR') {
                score += 500;
                statusEl.textContent = "SYSTEM REPAIRED";
            } else {
                player.weapon = p.type;
                statusEl.textContent = "WEAPON UPGRADED";
            }
            player.shield = 0.5; // Shield flash
            powerups.splice(i, 1);
        }
    }
  }

  function killPlayer() {
    if(gameOver) return;
    createExplosion(player.x+player.w/2, player.y+player.h/2, 2.0, '#00ffff');
    gameOver = true;
    running = false;
    finalScoreEl.innerText = Math.floor(score);
    finalKillsEl.innerText = kills;
    scoreEl.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    statusEl.textContent = "CRITICAL FAILURE";
  }

  // --- RENDER ---
  function drawGame(dt) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Background (Starfield)
    ctx.fillStyle = '#020307';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    ctx.fillStyle = 'white';
    stars.forEach(s => {
        s.y += s.s * dt + (baseFallSpeed*0.1*dt);
        if(s.y > canvas.height) { s.y = 0; s.x = Math.random()*canvas.width; }
        ctx.globalAlpha = 0.3 + Math.sin(Date.now()*0.005 + s.a)*0.2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Shake
    ctx.save();
    if(shakePower > 0) {
        ctx.translate(Math.random()*shakePower - shakePower/2, Math.random()*shakePower - shakePower/2);
        shakePower = Math.max(0, shakePower - dt * 30);
    }

    // --- GLOW FX MODE ---
    ctx.globalCompositeOperation = 'lighter';

    // Particles
    particles.forEach(p => {
        p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
        if(p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
    });
    
    // Shockwaves
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    shockwaves.forEach(s => {
        s.life -= dt; s.r += (s.maxR - s.r) * dt * 5;
        ctx.globalAlpha = s.life;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.stroke();
    });

    // Bullets
    bullets.forEach(b => {
        ctx.shadowBlur = 10; ctx.shadowColor = b.color;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Enemies (Interceptors)
    ctx.globalCompositeOperation = 'source-over'; // Back to normal for solids
    enemies.forEach(e => {
        const flash = e.flash > 0 ? 255 : 50;
        ctx.fillStyle = `rgb(${flash}, 50, 50)`;
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10; ctx.shadowColor = '#ff0000';
        
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        ctx.beginPath();
        ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r); ctx.lineTo(0, -e.r*0.5); ctx.lineTo(-e.r, -e.r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        
        // Engine glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc(0, -e.r, e.r*0.4 + Math.random()*5, 0, 6.28); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    });

    // Asteroids
    asteroids.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        
        const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, a.r);
        if(a.flash > 0) {
            g.addColorStop(0, '#fff'); g.addColorStop(1, '#fff');
            a.flash -= dt;
        } else {
            g.addColorStop(0, '#888'); g.addColorStop(0.5, '#444'); g.addColorStop(1, '#222');
        }
        ctx.fillStyle = g;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        a.points.forEach((p, i) => {
            const x = Math.cos(p.a) * p.r;
            const y = Math.sin(p.a) * p.r;
            if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
    });

    // Powerups
    powerups.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.shadowBlur = 15;
        let color = '#fff';
        let label = '?';
        if(p.type === 'BLASTER') { color = '#3af4ff'; label = 'B'; }
        if(p.type === 'SCATTER') { color = '#ffeb3b'; label = 'S'; }
        if(p.type === 'PLASMA') { color = '#8eff87'; label = 'P'; }
        
        ctx.shadowColor = color;
        ctx.fillStyle = 'rgba(20,20,20,0.8)';
        ctx.strokeStyle = color;
        
        ctx.beginPath();
        ctx.rect(-12, -12, 24, 24);
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 1);
        ctx.restore();
    });

    // Player
    if(running) {
        ctx.save();
        ctx.translate(player.x + player.w/2, player.y + player.h/2);
        ctx.rotate(player.tilt * 0.5);

        // Shield Effect
        if(player.shield > 0) {
            player.shield -= dt;
            ctx.strokeStyle = `rgba(100, 200, 255, ${player.shield})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0,0, 45, 0, 6.28); ctx.stroke();
        }

        // Ship Body
        ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 15;
        ctx.fillStyle = '#0d1e30';
        ctx.strokeStyle = '#00eaff';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(18, 20);
        ctx.lineTo(0, 12);
        ctx.lineTo(-18, 20);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        
        // Cockpit
        ctx.fillStyle = '#ccffff';
        ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.fill();

        ctx.restore();
    }
    
    ctx.restore(); // End shake/global
  }

  // --- LOOP ---
  function step(frameMs) {
    requestAnimationFrame(step);
    if (hitStop > 0) { hitStop--; render(frameMs/1000, 0); return; } // Frozen frame
    
    const dt = lastFrameMs ? Math.min(MAX_DT, (frameMs - lastFrameMs) / 1000) : 0;
    lastFrameMs = frameMs;

    if (running) {
      updatePlayer(dt, frameMs);
      updateEntities(dt);
      
      score += dt * 10;
      baseFallSpeed = 160 + score * 0.1;

      // Spawners
      spawnTimerMs += dt * 1000;
      if(spawnTimerMs > SPAWN_BASE_MS - (score*0.05)) {
        spawnAsteroid();
        spawnTimerMs = 0;
      }
      
      enemySpawnTimerMs += dt * 1000;
      if(enemySpawnTimerMs > 4000 && enemies.length < 2) {
        spawnEnemy();
        enemySpawnTimerMs = 0;
      }

      audio.tickMusic();
    }
    
    drawGame(dt);
  }

  function render() { /* Helper for redraws if needed */ }

  // --- UI & EVENTS ---
  function updateWeaponHud() {
    const heatPct = Math.round(weaponHeat);
    heatEl.textContent = heatPct + '%';
    heatEl.style.color = heatPct > 80 ? 'red' : (heatPct > 50 ? 'orange' : '#9fffb3');
    const w = WEAPONS[player.weapon];
    weaponEl.textContent = weaponOverheated ? 'OVERHEATED' : w.name;
    weaponEl.style.color = w.color;
    scoreEl.textContent = Math.floor(score);
  }

  function startGame() {
    running = true; gameOver = false;
    score = 0; kills = 0;
    asteroids = []; bullets = []; particles = []; enemies = []; powerups = [];
    player.x = canvas.width/2; player.y = canvas.height - 100; player.vx = 0; player.vy = 0;
    player.weapon = 'BLASTER'; weaponHeat = 0; weaponOverheated = false;
    baseFallSpeed = 160;
    
    initStars();
    audio.unlock(); audio.resetMusic();
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreEl.classList.remove('hidden');
  }

  window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  window.dispatchEvent(new Event('resize'));

  const inputDown = (e) => {
    if(e.code) keys[e.code] = true;
    if(!running || gameOver) startGame();
  };
  const inputUp = (e) => { if(e.code) keys[e.code] = false; };
  
  window.addEventListener('keydown', inputDown);
  window.addEventListener('keyup', inputUp);
  canvas.addEventListener('pointerdown', (e) => { 
    pointerFiring = true; 
    pointerSteering = true; 
    pointerTargetX = e.clientX; pointerTargetY = e.clientY;
    if(!running) startGame();
  });
  canvas.addEventListener('pointermove', e => { pointerTargetX = e.clientX; pointerTargetY = e.clientY; });
  canvas.addEventListener('pointerup', () => { pointerFiring = false; pointerSteering = false; });
  
  audioToggleBtn.addEventListener('click', () => { 
      audio.setEnabled(!audio.enabled); 
      audioToggleBtn.textContent = audio.enabled ? "SOUND: ON" : "SOUND: OFF"; 
  });

  requestAnimationFrame(step);
})();
