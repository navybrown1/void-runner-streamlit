(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('scoreDisplay');
  const statusEl = document.getElementById('statusText');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const finalScoreEl = document.getElementById('finalScore');
  const audioToggleBtn = document.getElementById('audioToggle');

  const keys = Object.create(null);

  const PLAYER_SPEED = 340;
  const BOUNDS_PADDING = 22;
  const MAX_DT = 1 / 30;
  const SPAWN_BASE_MS = 980;
  const MILESTONE_STEP = 25;

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
  let particles = [];
  let stars = [];
  let score = 0;
  let running = false;
  let gameOver = false;
  let baseFallSpeed = 150;
  let spawnTimerMs = 0;
  let lastFrameMs = 0;
  let shakePower = 0;
  let thrustParticleTimer = 0;
  let lastThrustSoundAt = 0;
  let milestoneReached = 0;

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

    function noiseBurst(duration, gain) {
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
      filter.frequency.value = 420;
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
      crash() {
        noiseBurst(0.45, 0.24);
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

  function initStars() {
    stars = [];
    const layers = [
      { count: 130, sizeMin: 0.4, sizeMax: 1.35, speed: 22, alphaMin: 0.18, alphaMax: 0.48 },
      { count: 70, sizeMin: 0.9, sizeMax: 2.0, speed: 42, alphaMin: 0.35, alphaMax: 0.72 },
      { count: 34, sizeMin: 1.4, sizeMax: 3.0, speed: 76, alphaMin: 0.45, alphaMax: 0.9 }
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
    const r = randRange(14, 34);
    const points = [];
    const pointCount = Math.floor(randRange(7, 11));

    for (let i = 0; i < pointCount; i++) {
      points.push({
        angle: (i / pointCount) * Math.PI * 2,
        radius: r * randRange(0.7, 1.15)
      });
    }

    const craters = [];
    const craterCount = Math.floor(randRange(2, 5));
    for (let i = 0; i < craterCount; i++) {
      craters.push({
        x: randRange(-0.45, 0.45) * r,
        y: randRange(-0.45, 0.45) * r,
        r: randRange(0.11, 0.2) * r
      });
    }

    asteroids.push({
      x: randRange(BOUNDS_PADDING + r, canvas.width - BOUNDS_PADDING - r),
      y: -r - 18,
      r,
      vx: randRange(-48, 48),
      vy: baseFallSpeed * randRange(0.8, 1.3),
      rot: randRange(0, Math.PI * 2),
      spin: randRange(-1.6, 1.6),
      points,
      craters
    });

    if (asteroids.length > 160) {
      asteroids.shift();
    }

    audio.asteroidSpawn();
  }

  function emitTrailParticle() {
    const c = shipCenter();
    const tailX = c.x - Math.sin(player.tilt) * (player.h * 0.28);
    const tailY = c.y + Math.cos(player.tilt) * (player.h * 0.28);

    particles.push({
      kind: 'trail',
      x: tailX + randRange(-4, 4),
      y: tailY + randRange(-2, 6),
      vx: randRange(-30, 30) - player.vx * 0.18,
      vy: randRange(120, 210) - player.vy * 0.08,
      life: randRange(0.2, 0.42),
      maxLife: randRange(0.2, 0.42),
      size: randRange(1.8, 4.6),
      hue: randRange(174, 212)
    });
  }

  function emitExplosion(x, y) {
    const count = 85;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(80, 360);
      particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randRange(0.35, 1.0),
        maxLife: randRange(0.35, 1.0),
        size: randRange(1.8, 5.2),
        hue: randRange(8, 48)
      });
    }
  }

  function startRun() {
    running = true;
    gameOver = false;
    score = 0;
    milestoneReached = 0;
    baseFallSpeed = 150;
    spawnTimerMs = 0;
    shakePower = 0;
    thrustParticleTimer = 0;
    lastThrustSoundAt = 0;
    asteroids = [];
    particles = [];

    placePlayerAtStart();

    scoreEl.textContent = '0';
    scoreEl.classList.remove('hidden');
    statusEl.textContent = 'ENGAGED';
    finalScoreEl.textContent = '0';

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

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
    shakePower = 18;

    scoreEl.classList.add('hidden');
    statusEl.textContent = 'DESTROYED';
    finalScoreEl.textContent = String(Math.floor(score));
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

    const targetTilt = clamp(player.vx / PLAYER_SPEED, -1, 1) * 0.48;
    player.tilt = lerp(player.tilt, targetTilt, 0.18);

    const moving = moveLeft || moveRight || moveUp || moveDown;
    if (moving) {
      thrustParticleTimer += dt;
      while (thrustParticleTimer >= 0.012) {
        thrustParticleTimer -= 0.012;
        emitTrailParticle();
      }

      if (nowMs - lastThrustSoundAt > 86) {
        audio.thrustPulse();
        lastThrustSoundAt = nowMs;
      }
    }
  }

  function updateAsteroids(dt) {
    const c = shipCenter();
    const radius = shipRadius();

    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.spin * dt;

      if (a.x < BOUNDS_PADDING + a.r) {
        a.x = BOUNDS_PADDING + a.r;
        a.vx *= -1;
      }
      if (a.x > canvas.width - BOUNDS_PADDING - a.r) {
        a.x = canvas.width - BOUNDS_PADDING - a.r;
        a.vx *= -1;
      }

      if (a.y - a.r > canvas.height + 60) {
        asteroids.splice(i, 1);
        continue;
      }

      if (circlesCollide(a.x, a.y, a.r * 0.86, c.x, c.y, radius)) {
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
      } else {
        p.vy += 210 * dt;
        p.vx *= 0.985;
      }
    }
  }

  function updateGame(dt, nowMs) {
    updatePlayer(dt, nowMs);

    score += dt * (10.5 + baseFallSpeed * 0.018);
    baseFallSpeed = 150 + score * 1.65;

    const spawnInterval = Math.max(250, SPAWN_BASE_MS - Math.min(score * 6.2, 700));
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
    statusEl.textContent = baseFallSpeed > 330 ? 'OVERDRIVE' : 'ENGAGED';
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

    drawStars(nowSeconds, dt);
    drawGrid(nowSeconds);
  }

  function drawStars(nowSeconds, dt) {
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > canvas.height + 4) {
        s.y = -4;
        s.x = Math.random() * canvas.width;
      }

      const twinkle = s.alpha * (0.58 + 0.42 * Math.sin(nowSeconds * s.twinkle + s.phase));
      ctx.fillStyle = 'rgba(190, 228, 255, ' + twinkle.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
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

  function drawTrailParticles() {
    for (const p of particles) {
      if (p.kind !== 'trail') continue;

      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const color = 'hsla(' + p.hue.toFixed(0) + ', 98%, 68%, ' + (alpha * 0.9).toFixed(3) + ')';

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSparkParticles() {
    for (const p of particles) {
      if (p.kind !== 'spark') continue;

      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const color = 'hsla(' + p.hue.toFixed(0) + ', 96%, 62%, ' + (alpha * 0.95).toFixed(3) + ')';

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.45 + alpha * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAsteroids() {
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);

      const body = ctx.createRadialGradient(-a.r * 0.28, -a.r * 0.34, a.r * 0.16, 0, 0, a.r * 1.2);
      body.addColorStop(0, '#f4be9a');
      body.addColorStop(0.5, '#8e5f50');
      body.addColorStop(1, '#40282a');

      ctx.fillStyle = body;
      ctx.strokeStyle = 'rgba(255, 133, 106, 0.55)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255, 120, 87, 0.42)';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      for (let i = 0; i < a.points.length; i++) {
        const p = a.points[i];
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
      for (const c of a.craters) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawShip() {
    const c = shipCenter();
    const moving = Math.abs(player.vx) + Math.abs(player.vy) > 2;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(player.tilt);

    const bodyGradient = ctx.createLinearGradient(0, -player.h / 2, 0, player.h / 2);
    bodyGradient.addColorStop(0, '#f7fdff');
    bodyGradient.addColorStop(0.35, '#7de9ff');
    bodyGradient.addColorStop(1, '#2f9cd7');

    ctx.shadowColor = 'rgba(58, 244, 255, 0.75)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = 'rgba(161, 242, 255, 0.95)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, -player.h * 0.58);
    ctx.lineTo(-player.w * 0.52, player.h * 0.5);
    ctx.lineTo(-player.w * 0.08, player.h * 0.28);
    ctx.lineTo(player.w * 0.08, player.h * 0.28);
    ctx.lineTo(player.w * 0.52, player.h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(8, 31, 60, 0.8)';
    ctx.beginPath();
    ctx.moveTo(0, -player.h * 0.22);
    ctx.lineTo(-player.w * 0.14, player.h * 0.1);
    ctx.lineTo(player.w * 0.14, player.h * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(140, 251, 255, 0.9)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, -player.h * 0.03, player.w * 0.1, 0, Math.PI * 2);
    ctx.fill();

    if (moving) {
      const flame = ctx.createLinearGradient(0, player.h * 0.16, 0, player.h * 0.88);
      flame.addColorStop(0, 'rgba(255, 247, 169, 0.9)');
      flame.addColorStop(0.55, 'rgba(255, 156, 83, 0.85)');
      flame.addColorStop(1, 'rgba(255, 75, 75, 0)');
      ctx.fillStyle = flame;
      ctx.shadowColor = 'rgba(255, 136, 76, 0.65)';
      ctx.shadowBlur = 20;

      const flameLength = randRange(player.h * 0.45, player.h * 0.78);
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
    drawTrailParticles();
    drawAsteroids();

    if (running) {
      drawShip();
    }

    drawSparkParticles();

    ctx.restore();
  }

  function step(frameMs) {
    requestAnimationFrame(step);

    const dt = lastFrameMs ? Math.min(MAX_DT, (frameMs - lastFrameMs) / 1000) : 0;
    lastFrameMs = frameMs;

    updateParticles(dt);

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

  startScreen.addEventListener('click', launchOrRestart);
  gameOverScreen.addEventListener('click', launchOrRestart);
  canvas.addEventListener('pointerdown', launchOrRestart);

  audioToggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.unlock();
    audio.setEnabled(!audio.enabled);
    updateAudioToggleLabel();
    audio.toggleClick();
  });

  window.addEventListener('resize', resize);

  updateAudioToggleLabel();
  resize();
  placePlayerAtStart();
  requestAnimationFrame(step);
})();
