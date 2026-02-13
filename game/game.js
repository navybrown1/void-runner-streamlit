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

  const PLAYER_SPEED = 340;
  const BOUNDS_PADDING = 22;
  const MAX_DT = 1 / 30;
  const SPAWN_BASE_MS = 950;
  const MILESTONE_STEP = 25;

  const SHOT_INTERVAL_MS = 86;
  const BULLET_SPEED = 960;
  const WEAPON_HEAT_PER_SHOT = 8;
  const WEAPON_COOL_RATE = 34;
  const WEAPON_OVERHEAT_LIMIT = 100;
  const WEAPON_RECOVER_AT = 40;

  const player = {
    x: 0,
    y: 0,
    w: 36,
    h: 48,
    vx: 0,
    vy: 0,
    tilt: 0
  };

  let asteroids = [];
  let bullets = [];
  let particles = [];
  let shockwaves = [];
  let stars = [];

  let score = 0;
  let kills = 0;
  let running = false;
  let gameOver = false;
  let baseFallSpeed = 160;
  let spawnTimerMs = 0;
  let lastFrameMs = 0;
  let shakePower = 0;
  let thrustParticleTimer = 0;
  let lastThrustSoundAt = 0;
  let lastShotAt = -1000;
  let milestoneReached = 0;
  let weaponHeat = 0;
  let weaponOverheated = false;
  let pointerFiring = false;

  const audio = createAudioEngine();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(from, to, t) {
    return from + (to - from) * t;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function rotateOffset(x, y, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      x: x * c - y * s,
      y: x * s + y * c
    };
  }

  function shipCenter() {
    return {
      x: player.x + player.w / 2,
      y: player.y + player.h / 2
    };
  }

  function shipRadius() {
    return Math.max(player.w, player.h) * 0.34;
  }

  function circlesCollide(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy <= (ar + br) * (ar + br);
  }

  function wantsToFire() {
    return Boolean(keys.Space || keys.KeyJ || pointerFiring);
  }

  function createAudioEngine() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    let ctxRef = null;
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;
    let enabled = true;
    let nextBeatTime = 0;
    let beatStep = 0;

    const leadPattern = [220, 262, 330, 392, 330, 262, 196, 247];
    const bassPattern = [55, 55, 82, 55, 65, 49, 73, 55];

    function ensureContext() {
      if (!Ctx) return false;
      if (ctxRef) return true;

      ctxRef = new Ctx();
      masterGain = ctxRef.createGain();
      musicGain = ctxRef.createGain();
      sfxGain = ctxRef.createGain();

      masterGain.gain.value = 0.85;
      musicGain.gain.value = 0.5;
      sfxGain.gain.value = 0.85;

      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctxRef.destination);

      return true;
    }

    function outputBus(kind) {
      return kind === 'music' ? musicGain : sfxGain;
    }

    function tone(options) {
      if (!enabled) return;
      if (!ensureContext()) return;

      const bus = outputBus(options.kind || 'sfx');
      const now = ctxRef.currentTime;
      const start = now + (options.delay || 0);
      const attack = options.attack || 0.01;
      const release = options.release || 0.08;
      const duration = Math.max(0.02, options.duration || 0.12);
      const end = start + duration;
      const startFreq = options.freq || 220;
      const endFreq = options.endFreq || startFreq;
      const gainAmount = options.gain || 0.1;

      const osc = ctxRef.createOscillator();
      const amp = ctxRef.createGain();
      const filter = ctxRef.createBiquadFilter();

      osc.type = options.wave || 'triangle';
      osc.frequency.setValueAtTime(startFreq, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), end);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(options.filterFreq || 2400, start);
      filter.Q.value = options.q || 0.8;

      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gainAmount, start + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, end + release);

      osc.connect(filter);
      filter.connect(amp);
      amp.connect(bus);

      osc.start(start);
      osc.stop(end + release + 0.02);
    }

    function noiseBurst(duration, gain, freq) {
      if (!enabled) return;
      if (!ensureContext()) return;

      const now = ctxRef.currentTime;
      const source = ctxRef.createBufferSource();
      const buffer = ctxRef.createBuffer(1, Math.floor(ctxRef.sampleRate * duration), ctxRef.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }

      const filter = ctxRef.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq || 420;
      filter.Q.value = 0.8;

      const amp = ctxRef.createGain();
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.buffer = buffer;
      source.connect(filter);
      filter.connect(amp);
      amp.connect(sfxGain);
      source.start(now);
      source.stop(now + duration + 0.02);
    }

    function unlock() {
      if (!ensureContext()) return;
      if (ctxRef.state === 'suspended') {
        ctxRef.resume();
      }
      if (nextBeatTime === 0) {
        nextBeatTime = ctxRef.currentTime + 0.08;
      }
    }

    function setEnabled(next) {
      enabled = Boolean(next);
      if (!ensureContext()) return;
      const now = ctxRef.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(enabled ? 0.85 : 0.0001, now, 0.03);
    }

    function tickMusic() {
      if (!enabled || !ctxRef || ctxRef.state !== 'running' || !running) {
        return;
      }

      while (ctxRef.currentTime + 0.08 >= nextBeatTime) {
        const lead = leadPattern[beatStep % leadPattern.length];
        const bass = bassPattern[beatStep % bassPattern.length];

        tone({
          kind: 'music',
          wave: 'triangle',
          freq: lead,
          endFreq: lead * 0.985,
          delay: nextBeatTime - ctxRef.currentTime,
          duration: 0.15,
          gain: 0.055,
          attack: 0.008,
          release: 0.05,
          filterFreq: 2200
        });

        tone({
          kind: 'music',
          wave: 'sine',
          freq: bass,
          endFreq: bass,
          delay: nextBeatTime - ctxRef.currentTime,
          duration: 0.2,
          gain: 0.048,
          attack: 0.01,
          release: 0.08,
          filterFreq: 560
        });

        nextBeatTime += 0.23;
        beatStep += 1;
      }
    }

    function resetMusic() {
      if (!ensureContext()) return;
      nextBeatTime = ctxRef.currentTime + 0.08;
      beatStep = 0;
    }

    return {
      unlock,
      setEnabled,
      tickMusic,
      resetMusic,
      get enabled() {
        return enabled;
      },
      startJingle() {
        tone({ wave: 'square', freq: 260, endFreq: 360, duration: 0.11, gain: 0.12, filterFreq: 1800 });
        tone({ wave: 'square', freq: 360, endFreq: 520, duration: 0.14, gain: 0.1, delay: 0.11, filterFreq: 2200 });
      },
      asteroidSpawn() {
        tone({ wave: 'triangle', freq: 180, endFreq: 140, duration: 0.06, gain: 0.055, filterFreq: 1300 });
      },
      thrustPulse() {
        tone({ wave: 'sawtooth', freq: 120, endFreq: 95, duration: 0.05, gain: 0.042, filterFreq: 900 });
      },
      milestone() {
        tone({ wave: 'triangle', freq: 440, endFreq: 620, duration: 0.08, gain: 0.09, filterFreq: 2500 });
        tone({ wave: 'triangle', freq: 660, endFreq: 720, duration: 0.1, gain: 0.07, delay: 0.09, filterFreq: 2600 });
      },
      gunShot() {
        tone({ wave: 'square', freq: 1080, endFreq: 260, duration: 0.05, gain: 0.07, filterFreq: 3000 });
        tone({ wave: 'triangle', freq: 640, endFreq: 180, duration: 0.06, gain: 0.05, filterFreq: 2200 });
      },
      bulletHit() {
        tone({ wave: 'triangle', freq: 480, endFreq: 190, duration: 0.04, gain: 0.045, filterFreq: 2000 });
      },
      asteroidBreak() {
        noiseBurst(0.22, 0.12, 680);
        tone({ wave: 'sawtooth', freq: 280, endFreq: 95, duration: 0.18, gain: 0.08, filterFreq: 1450 });
      },
      weaponOverheat() {
        tone({ wave: 'square', freq: 260, endFreq: 110, duration: 0.24, gain: 0.09, filterFreq: 1100 });
        tone({ wave: 'square', freq: 180, endFreq: 80, duration: 0.28, gain: 0.05, delay: 0.03, filterFreq: 800 });
      },
      weaponReady() {
        tone({ wave: 'triangle', freq: 320, endFreq: 510, duration: 0.07, gain: 0.055, filterFreq: 2200 });
      },
      crash() {
        noiseBurst(0.45, 0.24, 420);
        tone({ wave: 'sawtooth', freq: 250, endFreq: 48, duration: 0.4, gain: 0.12, filterFreq: 1200 });
        tone({ wave: 'square', freq: 142, endFreq: 40, duration: 0.34, gain: 0.08, delay: 0.03, filterFreq: 900 });
      },
      toggleClick() {
        tone({ wave: 'triangle', freq: 460, endFreq: 520, duration: 0.05, gain: 0.05, filterFreq: 2200 });
      }
    };
  }

  function updateAudioToggleLabel() {
    audioToggleBtn.textContent = audio.enabled ? 'SOUND: ON' : 'SOUND: OFF';
    audioToggleBtn.setAttribute('aria-pressed', audio.enabled ? 'true' : 'false');
  }

  function updateWeaponHud() {
    const heatPct = Math.round(weaponHeat);
    heatEl.textContent = heatPct + '%';
    heatEl.classList.toggle('warning', heatPct >= 68 && !weaponOverheated);
    heatEl.classList.toggle('critical', weaponOverheated || heatPct >= 92);
    weaponEl.textContent = weaponOverheated ? 'COOLING' : 'BLASTER MK-II';
  }

  function initStars() {
    stars = [];
    const layers = [
      { count: 180, sizeMin: 0.35, sizeMax: 1.3, speed: 24, alphaMin: 0.15, alphaMax: 0.46 },
      { count: 92, sizeMin: 0.7, sizeMax: 2.15, speed: 46, alphaMin: 0.35, alphaMax: 0.72 },
      { count: 48, sizeMin: 1.2, sizeMax: 3.3, speed: 82, alphaMin: 0.45, alphaMax: 0.92 }
    ];

    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: randRange(layer.sizeMin, layer.sizeMax),
          speed: layer.speed,
          alpha: randRange(layer.alphaMin, layer.alphaMax),
          phase: Math.random() * Math.PI * 2,
          twinkle: randRange(1.2, 2.8)
        });
      }
    }
  }

  function placePlayerAtStart() {
    player.x = canvas.width / 2 - player.w / 2;
    player.y = canvas.height - player.h - 54;
    player.vx = 0;
    player.vy = 0;
    player.tilt = 0;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();

    if (!running) {
      placePlayerAtStart();
    } else {
      player.x = clamp(player.x, BOUNDS_PADDING, canvas.width - player.w - BOUNDS_PADDING);
      player.y = clamp(player.y, BOUNDS_PADDING, canvas.height - player.h - BOUNDS_PADDING);
    }
  }

  function spawnAsteroid() {
    const r = randRange(14, 38);
    const points = [];
    const pointCount = Math.floor(randRange(8, 13));

    for (let i = 0; i < pointCount; i++) {
      points.push({
        angle: (i / pointCount) * Math.PI * 2,
        radius: r * randRange(0.7, 1.15)
      });
    }

    const craters = [];
    const craterCount = Math.floor(randRange(2, 6));
    for (let i = 0; i < craterCount; i++) {
      craters.push({
        x: randRange(-0.45, 0.45) * r,
        y: randRange(-0.45, 0.45) * r,
        r: randRange(0.09, 0.22) * r
      });
    }

    const crackSegments = [];
    const crackCount = Math.floor(randRange(4, 8));
    for (let i = 0; i < crackCount; i++) {
      crackSegments.push({
        angle: randRange(0, Math.PI * 2),
        len: r * randRange(0.28, 0.62)
      });
    }

    let hp = Math.max(1, Math.floor(r / 11));
    if (score > 220) hp += 1;

    asteroids.push({
      x: randRange(BOUNDS_PADDING + r, canvas.width - BOUNDS_PADDING - r),
      y: -r - 24,
      r,
      vx: randRange(-62, 62),
      vy: baseFallSpeed * randRange(0.82, 1.32),
      rot: randRange(0, Math.PI * 2),
      spin: randRange(-1.9, 1.9),
      points,
      craters,
      crackSegments,
      hp,
      maxHp: hp,
      flash: 0
    });

    if (asteroids.length > 180) {
      asteroids.shift();
    }

    audio.asteroidSpawn();
  }

  function emitTrailParticle() {
    const c = shipCenter();
    const tail = rotateOffset(0, player.h * 0.28, player.tilt);

    particles.push({
      kind: 'trail',
      x: c.x + tail.x + randRange(-4, 4),
      y: c.y + tail.y + randRange(-2, 6),
      vx: randRange(-30, 30) - player.vx * 0.18,
      vy: randRange(120, 210) - player.vy * 0.08,
      life: randRange(0.2, 0.42),
      maxLife: randRange(0.2, 0.42),
      size: randRange(1.8, 4.6),
      hue: randRange(174, 212)
    });
  }

  function emitMuzzleFlash(x, y, dirX, dirY) {
    for (let i = 0; i < 5; i++) {
      particles.push({
        kind: 'muzzle',
        x: x + randRange(-2, 2),
        y: y + randRange(-2, 2),
        vx: dirX * randRange(120, 360) + randRange(-60, 60),
        vy: dirY * randRange(120, 360) + randRange(-40, 40),
        life: randRange(0.06, 0.14),
        maxLife: randRange(0.06, 0.14),
        size: randRange(1.5, 3.8),
        hue: randRange(34, 56)
      });
    }
  }

  function emitImpactBurst(x, y, vx, vy) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(70, 260);
      particles.push({
        kind: 'impact',
        x,
        y,
        vx: Math.cos(angle) * speed + vx * 0.03,
        vy: Math.sin(angle) * speed + vy * 0.03,
        life: randRange(0.1, 0.28),
        maxLife: randRange(0.1, 0.28),
        size: randRange(1.4, 3.6),
        hue: randRange(185, 212)
      });
    }
  }

  function emitAsteroidDebris(asteroid) {
    const count = Math.floor(asteroid.r * 1.4);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(40, 280);
      particles.push({
        kind: i % 3 === 0 ? 'spark' : 'debris',
        x: asteroid.x,
        y: asteroid.y,
        vx: Math.cos(angle) * speed + asteroid.vx * 0.2,
        vy: Math.sin(angle) * speed + asteroid.vy * 0.2,
        life: randRange(0.28, 0.85),
        maxLife: randRange(0.28, 0.85),
        size: randRange(1.4, 4.4),
        hue: i % 3 === 0 ? randRange(14, 52) : randRange(18, 28)
      });
    }
  }

  function emitExplosion(x, y) {
    for (let i = 0; i < 95; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(80, 380);
      particles.push({
        kind: i % 2 === 0 ? 'spark' : 'debris',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randRange(0.35, 1.0),
        maxLife: randRange(0.35, 1.0),
        size: randRange(1.8, 5.2),
        hue: i % 2 === 0 ? randRange(8, 54) : randRange(16, 33)
      });
    }
  }

  function addShockwave(x, y, radius) {
    shockwaves.push({
      x,
      y,
      radius,
      life: 0.35,
      maxLife: 0.35
    });
  }

  function cannonMuzzles() {
    const c = shipCenter();
    const left = rotateOffset(-player.w * 0.3, -player.h * 0.08, player.tilt);
    const right = rotateOffset(player.w * 0.3, -player.h * 0.08, player.tilt);
    return [
      { x: c.x + left.x, y: c.y + left.y },
      { x: c.x + right.x, y: c.y + right.y }
    ];
  }

  function fireCannons(nowMs) {
    const dirX = Math.sin(player.tilt);
    const dirY = -Math.cos(player.tilt);
    const muzzles = cannonMuzzles();

    for (let i = 0; i < muzzles.length; i++) {
      const muzzle = muzzles[i];
      const spread = i === 0 ? -18 : 18;

      bullets.push({
        x: muzzle.x + dirX * 8,
        y: muzzle.y + dirY * 8,
        vx: dirX * BULLET_SPEED + player.vx * 0.2 + spread,
        vy: dirY * BULLET_SPEED + player.vy * 0.2,
        r: 3,
        life: 1.05,
        damage: 1
      });

      emitMuzzleFlash(muzzle.x + dirX * 8, muzzle.y + dirY * 8, dirX, dirY);
    }

    if (bullets.length > 260) {
      bullets.splice(0, bullets.length - 260);
    }

    lastShotAt = nowMs;
    weaponHeat = Math.min(WEAPON_OVERHEAT_LIMIT, weaponHeat + WEAPON_HEAT_PER_SHOT);
    shakePower = Math.max(shakePower, 0.85);
    audio.gunShot();

    if (weaponHeat >= WEAPON_OVERHEAT_LIMIT) {
      weaponOverheated = true;
      audio.weaponOverheat();
    }
  }

  function destroyAsteroid(index) {
    const asteroid = asteroids[index];
    if (!asteroid) return;

    asteroids.splice(index, 1);
    kills += 1;
    score += 12 + asteroid.r * 2.1;

    emitAsteroidDebris(asteroid);
    addShockwave(asteroid.x, asteroid.y, clamp(asteroid.r * 0.5, 9, 22));

    shakePower = Math.max(shakePower, Math.min(18, 4 + asteroid.r * 0.22));
    audio.asteroidBreak();
  }

  function applyBulletHit(asteroidIndex, bullet) {
    const asteroid = asteroids[asteroidIndex];
    if (!asteroid) return;

    asteroid.hp -= bullet.damage;
    asteroid.flash = 0.12;
    score += 0.25;

    emitImpactBurst(bullet.x, bullet.y, bullet.vx, bullet.vy);
    audio.bulletHit();

    if (asteroid.hp <= 0) {
      destroyAsteroid(asteroidIndex);
    }
  }

  function startRun() {
    running = true;
    gameOver = false;
    score = 0;
    kills = 0;
    milestoneReached = 0;
    baseFallSpeed = 160;
    spawnTimerMs = 0;
    shakePower = 0;
    thrustParticleTimer = 0;
    lastThrustSoundAt = 0;
    lastShotAt = -1000;
    weaponHeat = 0;
    weaponOverheated = false;
    pointerFiring = false;
    asteroids = [];
    bullets = [];
    particles = [];
    shockwaves = [];

    placePlayerAtStart();

    scoreEl.textContent = '0';
    scoreEl.classList.remove('hidden');
    statusEl.textContent = 'ENGAGED';
    finalScoreEl.textContent = '0';
    finalKillsEl.textContent = '0';

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    updateWeaponHud();

    audio.unlock();
    audio.resetMusic();
    audio.startJingle();
  }

  function endRun() {
    if (gameOver) return;

    gameOver = true;
    running = false;

    const c = shipCenter();
    emitExplosion(c.x, c.y);
    addShockwave(c.x, c.y, 16);
    shakePower = 20;

    scoreEl.classList.add('hidden');
    statusEl.textContent = 'DESTROYED';
    finalScoreEl.textContent = String(Math.floor(score));
    finalKillsEl.textContent = String(kills);
    gameOverScreen.classList.remove('hidden');

    audio.crash();
  }

  function updatePlayer(dt, nowMs) {
    const moveLeft = Boolean(keys.ArrowLeft || keys.KeyA);
    const moveRight = Boolean(keys.ArrowRight || keys.KeyD);
    const moveUp = Boolean(keys.ArrowUp || keys.KeyW);
    const moveDown = Boolean(keys.ArrowDown || keys.KeyS);

    player.vx = (moveRight - moveLeft) * PLAYER_SPEED;
    player.vy = (moveDown - moveUp) * PLAYER_SPEED;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, BOUNDS_PADDING, canvas.width - player.w - BOUNDS_PADDING);
    player.y = clamp(player.y, BOUNDS_PADDING, canvas.height - player.h - BOUNDS_PADDING);

    const targetTilt = clamp(player.vx / PLAYER_SPEED, -1, 1) * 0.5;
    player.tilt = lerp(player.tilt, targetTilt, 0.18);

    const moving = moveLeft || moveRight || moveUp || moveDown;
    if (moving || wantsToFire()) {
      thrustParticleTimer += dt;
      while (thrustParticleTimer >= 0.012) {
        thrustParticleTimer -= 0.012;
        emitTrailParticle();
      }

      if (moving && nowMs - lastThrustSoundAt > 86) {
        audio.thrustPulse();
        lastThrustSoundAt = nowMs;
      }
    }
  }

  function updateWeapons(dt, nowMs) {
    weaponHeat = Math.max(0, weaponHeat - WEAPON_COOL_RATE * dt);

    if (weaponOverheated && weaponHeat <= WEAPON_RECOVER_AT) {
      weaponOverheated = false;
      audio.weaponReady();
    }

    if (wantsToFire() && !weaponOverheated && nowMs - lastShotAt >= SHOT_INTERVAL_MS) {
      fireCannons(nowMs);
    }

    updateWeaponHud();
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      bullet.life -= dt;

      if (bullet.life <= 0) {
        bullets.splice(i, 1);
        continue;
      }

      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (bullet.y < -70 || bullet.x < -70 || bullet.x > canvas.width + 70 || bullet.y > canvas.height + 80) {
        bullets.splice(i, 1);
        continue;
      }

      let collided = false;
      for (let j = asteroids.length - 1; j >= 0; j--) {
        const asteroid = asteroids[j];
        if (circlesCollide(bullet.x, bullet.y, bullet.r, asteroid.x, asteroid.y, asteroid.r * 0.88)) {
          applyBulletHit(j, bullet);
          collided = true;
          break;
        }
      }

      if (collided) {
        bullets.splice(i, 1);
      }
    }
  }

  function updateAsteroids(dt) {
    const c = shipCenter();
    const radius = shipRadius();

    for (let i = asteroids.length - 1; i >= 0; i--) {
      const asteroid = asteroids[i];
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rot += asteroid.spin * dt;
      asteroid.flash = Math.max(0, asteroid.flash - dt);

      if (asteroid.x < BOUNDS_PADDING + asteroid.r) {
        asteroid.x = BOUNDS_PADDING + asteroid.r;
        asteroid.vx *= -1;
      }
      if (asteroid.x > canvas.width - BOUNDS_PADDING - asteroid.r) {
        asteroid.x = canvas.width - BOUNDS_PADDING - asteroid.r;
        asteroid.vx *= -1;
      }

      if (asteroid.y - asteroid.r > canvas.height + 80) {
        asteroids.splice(i, 1);
        continue;
      }

      if (circlesCollide(asteroid.x, asteroid.y, asteroid.r * 0.86, c.x, c.y, radius)) {
        endRun();
        break;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.kind === 'trail') {
        p.vy += 65 * dt;
        p.vx *= 0.97;
      } else if (p.kind === 'muzzle') {
        p.vy += 12 * dt;
        p.vx *= 0.87;
        p.vy *= 0.88;
      } else if (p.kind === 'impact') {
        p.vy += 120 * dt;
        p.vx *= 0.92;
      } else if (p.kind === 'debris') {
        p.vy += 205 * dt;
        p.vx *= 0.988;
      } else {
        p.vy += 210 * dt;
        p.vx *= 0.985;
      }
    }
  }

  function updateShockwaves(dt) {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const wave = shockwaves[i];
      wave.life -= dt;
      wave.radius += 280 * dt;
      if (wave.life <= 0) {
        shockwaves.splice(i, 1);
      }
    }
  }

  function updateGame(dt, nowMs) {
    updatePlayer(dt, nowMs);
    updateWeapons(dt, nowMs);
    updateBullets(dt);

    score += dt * (11 + baseFallSpeed * 0.017 + kills * 0.018);
    baseFallSpeed = 160 + score * 1.6 + kills * 1.4;

    const spawnInterval = Math.max(210, SPAWN_BASE_MS - Math.min(score * 4.8 + kills * 2.5, 720));
    spawnTimerMs += dt * 1000;

    while (spawnTimerMs >= spawnInterval) {
      spawnTimerMs -= spawnInterval;
      spawnAsteroid();
    }

    updateAsteroids(dt);

    const hitMilestone = Math.floor(score / MILESTONE_STEP);
    if (hitMilestone > milestoneReached) {
      milestoneReached = hitMilestone;
      audio.milestone();
    }

    scoreEl.textContent = String(Math.floor(score));

    if (weaponOverheated) {
      statusEl.textContent = 'WEAPON COOLING';
    } else if (baseFallSpeed > 400) {
      statusEl.textContent = 'COMBAT OVERDRIVE';
    } else {
      statusEl.textContent = 'ENGAGED';
    }
  }

  function drawBackground(nowSeconds, dt) {
    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#050a1c');
    baseGradient.addColorStop(0.58, '#08102a');
    baseGradient.addColorStop(1, '#020307');

    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pulse = 0.52 + Math.sin(nowSeconds * 0.44) * 0.19;
    const nebula = ctx.createRadialGradient(
      canvas.width * 0.72,
      canvas.height * 0.28,
      20,
      canvas.width * 0.72,
      canvas.height * 0.28,
      canvas.width * 0.85
    );
    nebula.addColorStop(0, 'rgba(74, 155, 255, ' + (0.12 + pulse * 0.08).toFixed(3) + ')');
    nebula.addColorStop(0.65, 'rgba(35, 89, 166, 0.08)');
    nebula.addColorStop(1, 'rgba(3, 7, 18, 0)');

    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawPlanet(nowSeconds);
    drawStars(nowSeconds, dt);
    drawGrid(nowSeconds);
    drawMotionLines();
  }

  function drawPlanet(nowSeconds) {
    const r = Math.min(canvas.width, canvas.height) * 0.2;
    const x = canvas.width * 0.16;
    const y = canvas.height * 0.26;

    const planet = ctx.createRadialGradient(x - r * 0.32, y - r * 0.4, r * 0.2, x, y, r * 1.2);
    planet.addColorStop(0, '#9cd4ff');
    planet.addColorStop(0.4, '#5a8ac8');
    planet.addColorStop(0.82, '#243c69');
    planet.addColorStop(1, 'rgba(20, 31, 60, 0.22)');

    ctx.fillStyle = planet;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    const atmosphere = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.35);
    atmosphere.addColorStop(0, 'rgba(94, 173, 255, 0.18)');
    atmosphere.addColorStop(1, 'rgba(94, 173, 255, 0)');
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    const cloudAlpha = 0.07 + 0.04 * Math.sin(nowSeconds * 0.6);
    ctx.strokeStyle = 'rgba(208, 240, 255, ' + cloudAlpha.toFixed(3) + ')';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const sweepY = y - r * 0.5 + i * (r * 0.26);
      ctx.beginPath();
      ctx.ellipse(x, sweepY, r * 0.8, r * (0.12 + i * 0.01), 0.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawStars(nowSeconds, dt) {
    for (const star of stars) {
      star.y += star.speed * dt;
      if (star.y > canvas.height + 4) {
        star.y = -4;
        star.x = Math.random() * canvas.width;
      }

      const twinkle = star.alpha * (0.58 + 0.42 * Math.sin(nowSeconds * star.twinkle + star.phase));
      ctx.fillStyle = 'rgba(190, 228, 255, ' + twinkle.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGrid(nowSeconds) {
    const horizon = canvas.height * 0.63;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(73, 161, 255, 0.24)';

    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const y = horizon + Math.pow(t, 1.7) * (canvas.height - horizon);
      ctx.globalAlpha = 0.08 + t * 0.15;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.16;
    const wobble = Math.sin(nowSeconds * 0.7) * 16;
    for (let x = -canvas.width; x < canvas.width * 2; x += 72) {
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, horizon);
      ctx.lineTo(x + wobble, canvas.height);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawMotionLines() {
    const intensity = clamp((baseFallSpeed - 180) / 280, 0, 1);
    if (!running || intensity < 0.05) return;

    const count = Math.floor(12 + intensity * 52);

    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = randRange(0, canvas.width);
      const y = randRange(0, canvas.height * 0.85);
      const len = randRange(14, 42) * (0.6 + intensity);
      const alpha = randRange(0.04, 0.16) * intensity;
      ctx.strokeStyle = 'rgba(138, 215, 255, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = randRange(0.8, 1.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + player.tilt * 28, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShockwaves() {
    for (const wave of shockwaves) {
      const alpha = clamp(wave.life / wave.maxLife, 0, 1);
      ctx.strokeStyle = 'rgba(142, 229, 255, ' + (alpha * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 2 + (1 - alpha) * 2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      let color = 'rgba(255,255,255,0.6)';
      let radius = p.size * (0.45 + alpha * 0.65);
      let blur = 10;

      if (p.kind === 'trail') {
        color = 'hsla(' + p.hue.toFixed(0) + ', 98%, 68%, ' + (alpha * 0.9).toFixed(3) + ')';
        radius = p.size * alpha;
        blur = 12;
      } else if (p.kind === 'muzzle') {
        color = 'hsla(' + p.hue.toFixed(0) + ', 100%, 70%, ' + (alpha * 0.9).toFixed(3) + ')';
        radius = p.size * (0.35 + alpha * 0.7);
        blur = 18;
      } else if (p.kind === 'impact') {
        color = 'hsla(' + p.hue.toFixed(0) + ', 98%, 72%, ' + (alpha * 0.8).toFixed(3) + ')';
        radius = p.size * (0.4 + alpha * 0.8);
        blur = 14;
      } else if (p.kind === 'spark') {
        color = 'hsla(' + p.hue.toFixed(0) + ', 96%, 62%, ' + (alpha * 0.95).toFixed(3) + ')';
        blur = 14;
      } else if (p.kind === 'debris') {
        color = 'hsla(' + p.hue.toFixed(0) + ', 74%, 52%, ' + (alpha * 0.72).toFixed(3) + ')';
        blur = 8;
      }

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  function drawBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const bullet of bullets) {
      const tailX = bullet.x - bullet.vx * 0.017;
      const tailY = bullet.y - bullet.vy * 0.017;
      const alpha = clamp(bullet.life / 1.05, 0, 1);

      ctx.strokeStyle = 'rgba(130, 235, 255, ' + (0.35 + alpha * 0.65).toFixed(3) + ')';
      ctx.lineWidth = 2.1;
      ctx.shadowColor = 'rgba(117, 235, 255, 0.95)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAsteroids() {
    for (const asteroid of asteroids) {
      const trailAlpha = clamp((asteroid.vy - 80) / 340, 0, 0.2);
      if (trailAlpha > 0.02) {
        ctx.fillStyle = 'rgba(255, 125, 92, ' + trailAlpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(
          asteroid.x - asteroid.vx * 0.04,
          asteroid.y - asteroid.vy * 0.06,
          asteroid.r * 0.72,
          asteroid.r * 1.35,
          Math.atan2(asteroid.vy, asteroid.vx) - Math.PI / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.save();
      ctx.translate(asteroid.x, asteroid.y);
      ctx.rotate(asteroid.rot);

      const damageRatio = 1 - asteroid.hp / asteroid.maxHp;
      const flashBoost = asteroid.flash > 0 ? asteroid.flash * 1.2 : 0;

      const body = ctx.createRadialGradient(-asteroid.r * 0.28, -asteroid.r * 0.34, asteroid.r * 0.16, 0, 0, asteroid.r * 1.2);
      body.addColorStop(0, '#ffd8bd');
      body.addColorStop(0.5, '#986455');
      body.addColorStop(1, '#41282a');

      ctx.fillStyle = body;
      ctx.strokeStyle = 'rgba(255, 133, 106, ' + (0.45 + damageRatio * 0.28 + flashBoost).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255, 120, 87, ' + (0.32 + damageRatio * 0.22).toFixed(3) + ')';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      for (let i = 0; i < asteroid.points.length; i++) {
        const p = asteroid.points[i];
        const px = Math.cos(p.angle) * p.radius;
        const py = Math.sin(p.angle) * p.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(32, 20, 20, 0.38)';
      for (const crater of asteroid.craters) {
        ctx.beginPath();
        ctx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const crackCount = Math.ceil(asteroid.crackSegments.length * damageRatio);
      if (crackCount > 0) {
        ctx.strokeStyle = 'rgba(255, 209, 168, ' + (0.25 + damageRatio * 0.48).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < crackCount; i++) {
          const crack = asteroid.crackSegments[i];
          const angle = crack.angle;
          const crackLen = crack.len;
          const sx = Math.cos(angle) * asteroid.r * 0.16;
          const sy = Math.sin(angle) * asteroid.r * 0.16;
          const ex = Math.cos(angle) * crackLen;
          const ey = Math.sin(angle) * crackLen;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }

      if (asteroid.flash > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (asteroid.flash * 0.55).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(0, 0, asteroid.r * 0.94, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawTargetingHud(nowSeconds) {
    if (!running || asteroids.length === 0) return;

    const c = shipCenter();
    let target = null;
    let best = Number.POSITIVE_INFINITY;

    for (const asteroid of asteroids) {
      const dx = asteroid.x - c.x;
      const dy = asteroid.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        target = asteroid;
      }
    }

    if (!target) return;

    const pulse = 0.55 + 0.45 * Math.sin(nowSeconds * 5.2);
    const reticleR = target.r + 12 + pulse * 5;

    ctx.save();
    ctx.strokeStyle = 'rgba(114, 235, 255, 0.78)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -nowSeconds * 45;
    ctx.beginPath();
    ctx.arc(target.x, target.y, reticleR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(target.x - reticleR - 10, target.y);
    ctx.lineTo(target.x - reticleR + 1, target.y);
    ctx.moveTo(target.x + reticleR - 1, target.y);
    ctx.lineTo(target.x + reticleR + 10, target.y);
    ctx.moveTo(target.x, target.y - reticleR - 10);
    ctx.lineTo(target.x, target.y - reticleR + 1);
    ctx.moveTo(target.x, target.y + reticleR - 1);
    ctx.lineTo(target.x, target.y + reticleR + 10);
    ctx.stroke();

    ctx.font = '700 12px Oxanium, Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(164, 246, 255, 0.8)';
    ctx.fillText('HP ' + target.hp, target.x + reticleR + 14, target.y - reticleR + 4);
    ctx.restore();
  }

  function drawShip() {
    const c = shipCenter();
    const moving = Math.abs(player.vx) + Math.abs(player.vy) > 2;
    const firing = wantsToFire() && !weaponOverheated;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(player.tilt);

    const wingGrad = ctx.createLinearGradient(0, -player.h / 2, 0, player.h / 2);
    wingGrad.addColorStop(0, '#f3fbff');
    wingGrad.addColorStop(0.4, '#7de9ff');
    wingGrad.addColorStop(1, '#2f9cd7');

    ctx.shadowColor = 'rgba(58, 244, 255, 0.75)';
    ctx.shadowBlur = 24;

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = 'rgba(161, 242, 255, 0.95)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, -player.h * 0.62);
    ctx.lineTo(-player.w * 0.58, player.h * 0.42);
    ctx.lineTo(-player.w * 0.14, player.h * 0.26);
    ctx.lineTo(player.w * 0.14, player.h * 0.26);
    ctx.lineTo(player.w * 0.58, player.h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(9, 28, 52, 0.72)';
    ctx.beginPath();
    ctx.moveTo(0, -player.h * 0.24);
    ctx.lineTo(-player.w * 0.17, player.h * 0.08);
    ctx.lineTo(player.w * 0.17, player.h * 0.08);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(151, 248, 255, 0.88)';
    ctx.beginPath();
    ctx.arc(0, -player.h * 0.04, player.w * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 9;
    ctx.fillStyle = 'rgba(27, 93, 124, 0.95)';
    const barrelW = player.w * 0.12;
    const barrelH = player.h * 0.42;
    ctx.fillRect(-player.w * 0.35 - barrelW / 2, -player.h * 0.5, barrelW, barrelH);
    ctx.fillRect(player.w * 0.35 - barrelW / 2, -player.h * 0.5, barrelW, barrelH);

    if (firing) {
      ctx.fillStyle = 'rgba(255, 233, 160, 0.78)';
      ctx.shadowColor = 'rgba(255, 210, 125, 0.9)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(-player.w * 0.35, -player.h * 0.51, 3.2, 0, Math.PI * 2);
      ctx.arc(player.w * 0.35, -player.h * 0.51, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (moving || firing) {
      const flame = ctx.createLinearGradient(0, player.h * 0.16, 0, player.h * 0.98);
      flame.addColorStop(0, 'rgba(255, 247, 169, 0.9)');
      flame.addColorStop(0.55, 'rgba(255, 156, 83, 0.85)');
      flame.addColorStop(1, 'rgba(255, 75, 75, 0)');
      ctx.fillStyle = flame;
      ctx.shadowColor = 'rgba(255, 136, 76, 0.7)';
      ctx.shadowBlur = 20;

      const flameLength = randRange(player.h * 0.42, player.h * 0.84);
      ctx.beginPath();
      ctx.moveTo(-player.w * 0.14, player.h * 0.22);
      ctx.lineTo(0, flameLength);
      ctx.lineTo(player.w * 0.14, player.h * 0.22);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function render(nowSeconds, dt) {
    ctx.save();

    if (shakePower > 0.01) {
      const sx = randRange(-shakePower, shakePower);
      const sy = randRange(-shakePower, shakePower);
      ctx.translate(sx, sy);
      shakePower = Math.max(0, shakePower - dt * 18);
    }

    drawBackground(nowSeconds, dt);
    drawShockwaves();
    drawAsteroids();
    drawBullets();

    if (running) {
      drawShip();
    }

    drawParticles();
    drawTargetingHud(nowSeconds);

    ctx.restore();
  }

  function step(frameMs) {
    requestAnimationFrame(step);

    const dt = lastFrameMs ? Math.min(MAX_DT, (frameMs - lastFrameMs) / 1000) : 0;
    lastFrameMs = frameMs;

    updateParticles(dt);
    updateShockwaves(dt);

    if (running) {
      updateGame(dt, frameMs);
      audio.tickMusic();
    }

    render(frameMs / 1000, dt);
  }

  function launchOrRestart() {
    audio.unlock();
    if (!running || gameOver) {
      startRun();
    }
  }

  document.addEventListener('keydown', function (e) {
    if (
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'KeyA' ||
      e.code === 'KeyD' ||
      e.code === 'KeyW' ||
      e.code === 'KeyS' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }

    keys[e.code] = true;

    if (!running || gameOver) {
      launchOrRestart();
    }
  });

  document.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  window.addEventListener('blur', function () {
    pointerFiring = false;
    for (const key of Object.keys(keys)) {
      keys[key] = false;
    }
  });

  startScreen.addEventListener('click', launchOrRestart);
  gameOverScreen.addEventListener('click', launchOrRestart);

  canvas.addEventListener('pointerdown', function () {
    audio.unlock();
    if (!running || gameOver) {
      launchOrRestart();
      return;
    }
    pointerFiring = true;
  });

  window.addEventListener('pointerup', function () {
    pointerFiring = false;
  });

  window.addEventListener('pointercancel', function () {
    pointerFiring = false;
  });

  audioToggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.unlock();
    audio.setEnabled(!audio.enabled);
    updateAudioToggleLabel();
    audio.toggleClick();
  });

  window.addEventListener('resize', resize);

  updateAudioToggleLabel();
  updateWeaponHud();
  resize();
  placePlayerAtStart();
  requestAnimationFrame(step);
})();
