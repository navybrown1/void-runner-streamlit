/**
 * VOID RUNNER: HYPERDRIVE EDITION
 * Epic Space Shooter with 6 Weapons, Co-op, Bosses & More!
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION & CONSTANTS
  // ============================================
  const CONFIG = {
    CANVAS_WIDTH: window.innerWidth,
    CANVAS_HEIGHT: window.innerHeight,
    PLAYER_MAX_HEALTH: 100,
    PLAYER_SPEED: 420,
    PLAYER_DASH_SPEED: 800,
    PLAYER_DASH_DURATION: 200,
    PLAYER_DASH_COOLDOWN: 1500,
    BULLET_SPEED: 750,
    ASTEROID_BASE_SPEED: 120,
    ASTEROID_SPEED_INCREASE: 15,
    COMBO_TIMEOUT: 2000,
    COMBO_MAX: 32,
    SHIELD_MAX: 100,
    SHIELD_REGEN_RATE: 8,
    HEAT_MAX: 100,
    HEAT_COOLDOWN_RATE: 25,
    HEAT_FIRE_PENALTY: 40,
    HYPER_MAX: 100,
    HYPER_NOVA_DAMAGE: 9999,
    HYPER_NOVA_BOSS_DAMAGE: 900,
    HYPER_NOVA_RADIUS: 440,
    FRENZY_COMBO_THRESHOLD: 8,
    FRENZY_DURATION: 6000,
    WAVE_DURATION: 25000,
    BOSS_WAVE_INTERVAL: 5,
    EVENT_INTERVAL_MIN: 14000,
    EVENT_INTERVAL_MAX: 22000,
    EVENT_DURATION: 10000,
    DRONE_SPAWN_CHANCE: 0.15,
    POWERUP_DROP_CHANCE: 0.12,
    PARTICLE_MAX: 500,
    SCREEN_SHAKE_DECAY: 0.88,
    BLOOM_INTENSITY: 0.6
  };

  // Weapon Definitions
  const WEAPONS = [
    { name: 'BLASTER MK-II', icon: '⚡', heatCost: 3, damage: 12, fireRate: 120, color: '#00f3ff', type: 'rapid' },
    { name: 'SCATTER BLASTER', icon: '💥', heatCost: 8, damage: 8, fireRate: 350, color: '#ff2e97', type: 'spread', count: 5, spread: 45 },
    { name: 'RAILGUN', icon: '🔷', heatCost: 25, damage: 80, fireRate: 800, color: '#b537ff', type: 'pierce', speed: 1400 },
    { name: 'VOID BEAM', icon: '🌟', heatCost: 15, damage: 35, fireRate: 0, color: '#ff8c00', type: 'beam', continuous: true },
    { name: 'SWARM MISSILES', icon: '🚀', heatCost: 18, damage: 25, fireRate: 500, color: '#7fff6d', type: 'homing', count: 6 },
    { name: 'SINGULARITY', icon: '🌀', heatCost: 35, damage: 150, fireRate: 1200, color: '#bd00ff', type: 'gravity' }
  ];

  // Colors
  const COLORS = {
    cyan: '#00f3ff',
    pink: '#ff0055',
    lime: '#7fff6d',
    orange: '#ff8c00',
    purple: '#bd00ff',
    red: '#ff3300',
    yellow: '#ffe28b',
    white: '#ffffff'
  };

  // ============================================
  // GAME STATE
  // ============================================
  let canvas, ctx;
  let gameState = 'start'; // start, playing, paused, gameover
  let gameMode = 1; // 1 or 2 players
  let players = [];
  let bullets = [];
  let asteroids = [];
  let particles = [];
  let drones = [];
  let powerups = [];
  let boss = null;
  let score = 0;
  let kills = 0;
  let wave = 1;
  let waveTimer = 0;
  let combo = 1;
  let comboTimer = 0;
  let maxCombo = 1;
  let bestScore = 0;
  let bestWave = 1;
  let hyperCharge = 0;
  let frenzyTimer = 0;
  let frenzyActive = false;
  let activeEvent = null;
  let eventTimer = 0;
  let eventSpawnTimer = 0;
  let nextEventIn = CONFIG.EVENT_INTERVAL_MIN;
  let screenShake = { x: 0, y: 0, intensity: 0 };
  let bloomCanvas, bloomCtx;
  let audioCtx = null;
  let audioEnabled = true;
  let lastTime = 0;
  let deltaTime = 0;

  // Input state
  const keys = {};
  const keysPressed = {};

  // ============================================
  // AUDIO SYSTEM
  // ============================================
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.3;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);

        this.initialized = true;
        this.startMusic();
      } catch (e) {
        console.warn('Audio initialization failed:', e);
      }
    }

    startMusic() {
      if (!this.initialized) return;
      // Create ambient synth drone
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;
      osc2.type = 'sine';
      osc2.frequency.value = 110;

      filter.type = 'lowpass';
      filter.frequency.value = 400;
      filter.Q.value = 5;

      lfo.type = 'sine';
      lfo.frequency.value = 0.1;
      lfoGain.gain.value = 100;

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(this.musicGain);

      osc1.start();
      osc2.start();
      lfo.start();
    }

    playShoot(weaponType) {
      if (!this.initialized || !audioEnabled) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      const freqs = { 0: 880, 1: 440, 2: 220, 3: 1200, 4: 660, 5: 110 };
      const freq = freqs[weaponType] || 660;

      osc.type = weaponType === 2 ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + 0.1);

      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    }

    playExplosion(size = 1) {
      if (!this.initialized || !audioEnabled) return;
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
      }

      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000 * size;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4 * size, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start();
    }

    playPowerup() {
      if (!this.initialized || !audioEnabled) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    }

    playCombo() {
      if (!this.initialized || !audioEnabled) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.value = 220 * combo;

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    }

    playBossSpawn() {
      if (!this.initialized || !audioEnabled) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(55, this.ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(220, this.ctx.currentTime + 1.5);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(110, this.ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(55, this.ctx.currentTime + 1.5);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfxGain);

      osc1.start();
      osc2.start();
      osc1.stop(this.ctx.currentTime + 1.5);
      osc2.stop(this.ctx.currentTime + 1.5);
    }

    playPlayerHit() {
      if (!this.initialized || !audioEnabled) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    }
  }

  const audio = new AudioEngine();

  // ============================================
  // PLAYER CLASS
  // ============================================
  class Player {
    constructor(id, x, y, color, controls) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.color = color;
      this.controls = controls;
      this.vx = 0;
      this.vy = 0;
      this.radius = 18;
      this.health = CONFIG.PLAYER_MAX_HEALTH;
      this.shield = 0;
      this.weaponIndex = 0;
      this.weaponHeat = 0;
      this.fireCooldown = 0;
      this.dashCooldown = 0;
      this.isDashing = false;
      this.dashTime = 0;
      this.isAlive = true;
      this.overdrive = false;
      this.overdriveTimer = 0;
      this.invulnerable = 0;
      this.score = 0;
      this.kills = 0;
      this.beamEndX = null;
      this.beamEndY = null;
    }

    update(dt) {
      if (!this.isAlive) return;

      // Handle dash
      if (this.isDashing) {
        this.dashTime += dt;
        if (this.dashTime >= CONFIG.PLAYER_DASH_DURATION) {
          this.isDashing = false;
          this.dashTime = 0;
        }
      } else {
        // Movement
        let ax = 0, ay = 0;
        if (keys[this.controls.up]) ay -= 1;
        if (keys[this.controls.down]) ay += 1;
        if (keys[this.controls.left]) ax -= 1;
        if (keys[this.controls.right]) ax += 1;

        // Normalize diagonal movement
        if (ax !== 0 && ay !== 0) {
          const len = Math.sqrt(ax * ax + ay * ay);
          ax /= len;
          ay /= len;
        }

        const speed = this.isDashing ? CONFIG.PLAYER_DASH_SPEED : CONFIG.PLAYER_SPEED;
        this.vx += ax * speed * dt * 3;
        this.vy += ay * speed * dt * 3;

        // Apply drag
        this.vx *= 0.92;
        this.vy *= 0.92;
      }

      // Update position
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Boundary collision
      this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
      this.y = Math.max(this.radius + 60, Math.min(canvas.height - this.radius, this.y));

      // Cooldowns
      if (this.fireCooldown > 0) this.fireCooldown -= dt * 1000;
      if (this.dashCooldown > 0) this.dashCooldown -= dt * 1000;
      if (this.weaponHeat > 0) this.weaponHeat = Math.max(0, this.weaponHeat - CONFIG.HEAT_COOLDOWN_RATE * dt);
      if (this.invulnerable > 0) this.invulnerable -= dt * 1000;
      if (this.overdrive) {
        this.overdriveTimer -= dt * 1000;
        if (this.overdriveTimer <= 0) {
          this.overdrive = false;
          updateStatusText();
        }
      }

      // Shield regen
      if (this.shield < CONFIG.SHIELD_MAX && !this.overdrive) {
        this.shield += CONFIG.SHIELD_REGEN_RATE * dt;
        this.shield = Math.min(CONFIG.SHIELD_MAX, this.shield);
      }

      // Fire weapon
      const weapon = WEAPONS[this.weaponIndex];
      if (keys[this.controls.fire] && this.fireCooldown <= 0 && this.weaponHeat < CONFIG.HEAT_MAX) {
        this.fire(weapon);
      }

      // Beam weapon update
      if (weapon.type === 'beam' && keys[this.controls.fire]) {
        this.updateBeam();
      } else {
        this.beamEndX = null;
        this.beamEndY = null;
      }

      // Switch weapon
      if (keysPressed[this.controls.switch]) {
        this.weaponIndex = (this.weaponIndex + 1) % WEAPONS.length;
        updateWeaponDisplay(this);
        delete keysPressed[this.controls.switch];
      }

      // Dash
      if (keysPressed[this.controls.dash] && this.dashCooldown <= 0 && !this.isDashing) {
        this.isDashing = true;
        this.dashTime = 0;
        this.dashCooldown = CONFIG.PLAYER_DASH_COOLDOWN;
        const angle = Math.atan2(this.vy, this.vx) || 0;
        this.vx = Math.cos(angle) * CONFIG.PLAYER_DASH_SPEED;
        this.vy = Math.sin(angle) * CONFIG.PLAYER_DASH_SPEED;
        screenShake.intensity = 5;
        audio.playShoot(2);
        delete keysPressed[this.controls.dash];
      }

      // Hyper nova
      if (this.controls.nova && keysPressed[this.controls.nova]) {
        activateHyperNova(this);
        delete keysPressed[this.controls.nova];
      }
    }

    fire(weapon) {
      if (weapon.type === 'beam') {
        // Beam is handled in update
        return;
      }

      this.weaponHeat += weapon.heatCost;
      const fireRateMultiplier = frenzyActive ? 0.65 : 1;
      this.fireCooldown = weapon.fireRate * fireRateMultiplier;
      const damageMultiplier = this.overdrive ? 1.25 : (frenzyActive ? 1.18 : 1);

      const baseAngle = Math.atan2(this.vy, this.vx) || -Math.PI / 2;

      if (weapon.type === 'spread') {
        for (let i = 0; i < weapon.count; i++) {
          const angle = baseAngle + (i - Math.floor(weapon.count / 2)) * (weapon.spread * Math.PI / 180 / weapon.count);
          bullets.push(new Bullet(
            this.x, this.y,
            Math.cos(angle) * (weapon.speed || CONFIG.BULLET_SPEED),
            Math.sin(angle) * (weapon.speed || CONFIG.BULLET_SPEED),
            weapon, this.id, null, damageMultiplier
          ));
        }
      } else if (weapon.type === 'homing') {
        const targets = this.getHomingTargets(weapon.count);
        const hasTargets = targets.length > 0;
        for (let i = 0; i < weapon.count; i++) {
          const target = hasTargets ? targets[i % targets.length] : null;
          bullets.push(new Bullet(
            this.x, this.y,
            Math.cos(baseAngle + (Math.random() - 0.5) * 0.3) * 500,
            Math.sin(baseAngle + (Math.random() - 0.5) * 0.3) * 500,
            weapon, this.id, target, damageMultiplier
          ));
        }
      } else if (weapon.type === 'gravity') {
        bullets.push(new Bullet(
          this.x, this.y,
          Math.cos(baseAngle) * 300,
          Math.sin(baseAngle) * 300,
          weapon, this.id, null, damageMultiplier
        ));
      } else {
        bullets.push(new Bullet(
          this.x + Math.cos(baseAngle) * 25,
          this.y + Math.sin(baseAngle) * 25,
          Math.cos(baseAngle) * (weapon.speed || CONFIG.BULLET_SPEED),
          Math.sin(baseAngle) * (weapon.speed || CONFIG.BULLET_SPEED),
          weapon, this.id, null, damageMultiplier
        ));
      }

      audio.playShoot(this.weaponIndex);

      // Recoil
      this.vx -= Math.cos(baseAngle) * 50;
      this.vy -= Math.sin(baseAngle) * 50;

      // Spawn particles
      for (let i = 0; i < 5; i++) {
        particles.push(new Particle(
          this.x + Math.cos(baseAngle) * 20,
          this.y + Math.sin(baseAngle) * 20,
          -Math.cos(baseAngle) * (100 + Math.random() * 100) + (Math.random() - 0.5) * 100,
          -Math.sin(baseAngle) * (100 + Math.random() * 100) + (Math.random() - 0.5) * 100,
          weapon.color, 'smoke', 0.3
        ));
      }
    }

    getHomingTargets(count) {
      const targets = [];
      const allTargets = [...asteroids, ...drones];
      for (let i = 0; i < Math.min(count, allTargets.length); i++) {
        if (allTargets[i]) targets.push(allTargets[i]);
      }
      return targets;
    }

    updateBeam() {
      const weapon = WEAPONS[this.weaponIndex];
      this.weaponHeat += weapon.heatCost * deltaTime * 0.05;

      if (this.weaponHeat >= CONFIG.HEAT_MAX) return;

      // Find closest target in direction
      let closestDist = 600;
      let closestTarget = null;
      const angle = Math.atan2(this.vy, this.vx) || -Math.PI / 2;

      for (const asteroid of asteroids) {
        const dx = asteroid.x - this.x;
        const dy = asteroid.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToTarget = Math.atan2(dy, dx);
        const angleDiff = Math.abs(angle - angleToTarget);

        if (dist < closestDist && angleDiff < 0.4) {
          closestDist = dist;
          closestTarget = asteroid;
        }
      }

      if (closestTarget) {
        this.beamEndX = closestTarget.x;
        this.beamEndY = closestTarget.y;
        closestTarget.takeDamage(weapon.damage * deltaTime * 0.1, this.id);

        // Beam particles
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50,
          weapon.color, 'spark', 0.15
        ));
      } else {
        this.beamEndX = this.x + Math.cos(angle) * 600;
        this.beamEndY = this.y + Math.sin(angle) * 600;
      }
    }

    takeDamage(amount) {
      if (this.invulnerable > 0 || this.isDashing) return;

      if (this.shield > 0) {
        this.shield -= amount;
        if (this.shield < 0) {
          this.health += this.shield;
          this.shield = 0;
        }
      } else {
        this.health -= amount;
      }

      this.invulnerable = 500;
      screenShake.intensity = 15;
      audio.playPlayerHit();
      updateVitalsDisplay();

      // Hit particles
      for (let i = 0; i < 10; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 300,
          (Math.random() - 0.5) * 300,
          this.color, 'explosion', 0.4
        ));
      }

      if (this.health <= 0) {
        this.die();
      }
    }

    die() {
      this.isAlive = false;
      screenShake.intensity = 30;

      // Death explosion
      for (let i = 0; i < 30; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 400,
          this.color, 'explosion', 0.8
        ));
      }
      audio.playExplosion(1.5);
    }

    draw() {
      if (!this.isAlive) return;

      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);

      // Invulnerability flash
      if (this.invulnerable > 0 && Math.floor(this.invulnerable / 50) % 2 === 0) {
        ctx.globalAlpha = 0.5;
      }

      // Overdrive glow
      if (this.overdrive) {
        ctx.shadowColor = COLORS.yellow;
        ctx.shadowBlur = 30;
      }

      // Shield effect
      if (this.shield > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3 + (this.shield / CONFIG.SHIELD_MAX) * 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw ship
      const angle = Math.atan2(this.vy, this.vx) || -Math.PI / 2;
      ctx.rotate(angle + Math.PI / 2);

      // Ship body
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(-this.radius * 0.7, this.radius * 0.8);
      ctx.lineTo(0, this.radius * 0.4);
      ctx.lineTo(this.radius * 0.7, this.radius * 0.8);
      ctx.closePath();

      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Engine glow
      if (Math.abs(this.vx) > 10 || Math.abs(this.vy) > 10) {
        const gradient = ctx.createRadialGradient(0, this.radius * 0.5, 0, 0, this.radius * 0.5, this.radius);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(0, this.radius * 0.5, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.5;
        ctx.fill();
      }

      ctx.restore();

      // Draw beam
      if (this.beamEndX !== null) {
        ctx.beginPath();
        ctx.moveTo(this.x + screenShake.x, this.y + screenShake.y);
        ctx.lineTo(this.beamEndX + screenShake.x, this.beamEndY + screenShake.y);
        ctx.strokeStyle = WEAPONS[this.weaponIndex].color;
        ctx.lineWidth = 8;
        ctx.shadowColor = WEAPONS[this.weaponIndex].color;
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw player indicator
      if (gameMode === 2) {
        ctx.fillStyle = this.color;
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`P${this.id}`, this.x + screenShake.x, this.y - this.radius - 15);
      }
    }
  }

  // ============================================
  // BULLET CLASS
  // ============================================
  class Bullet {
    constructor(x, y, vx, vy, weapon, ownerId, homingTarget = null, damageMultiplier = 1) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.weapon = weapon;
      this.ownerId = ownerId;
      this.radius = weapon.type === 'gravity' ? 12 : 6;
      this.damage = (weapon.damage || 10) * damageMultiplier;
      this.homingTarget = homingTarget;
      this.life = 3;
      this.pierceCount = weapon.type === 'pierce' ? 5 : 1;
      this.hitList = [];
      this.gravityWell = null;
    }

    update(dt) {
      this.life -= dt;

      // Homing behavior
      if (this.homingTarget && this.homingTarget.isAlive !== false) {
        const dx = this.homingTarget.x - this.x;
        const dy = this.homingTarget.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.vx += (dx / dist) * 800 * dt;
          this.vy += (dy / dist) * 800 * dt;
          const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
          if (speed > 600) {
            this.vx = (this.vx / speed) * 600;
            this.vy = (this.vy / speed) * 600;
          }
        }
      }

      // Gravity behavior
      if (this.weapon.type === 'gravity') {
        if (!this.gravityWell) {
          this.gravityWell = { x: this.x, y: this.y, life: 1.5 };
        }
        this.gravityWell.life -= dt;

        // Pull asteroids toward gravity well
        for (const asteroid of asteroids) {
          const dx = this.gravityWell.x - asteroid.x;
          const dy = this.gravityWell.y - asteroid.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 10 && dist < 400) {
            asteroid.vx += (dx / dist) * 200 * dt;
            asteroid.vy += (dy / dist) * 200 * dt;
          }
        }

        // Expand radius
        this.radius += dt * 30;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Trail particles
      if (Math.random() < 0.5) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30,
          this.weapon.color, 'trail', 0.2
        ));
      }

      return this.life > 0 &&
             this.x > -50 && this.x < canvas.width + 50 &&
             this.y > -50 && this.y < canvas.height + 50 &&
             (this.weapon.type !== 'gravity' || this.gravityWell.life > 0);
    }

    draw() {
      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);

      if (this.weapon.type === 'gravity') {
        // Gravity well visual
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, this.weapon.color);
        gradient.addColorStop(0.5, 'rgba(189, 0, 255, 0.5)');
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      } else if (this.weapon.type === 'homing') {
        // Missile visual
        const angle = Math.atan2(this.vy, this.vx);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fillStyle = this.weapon.color;
        ctx.shadowColor = this.weapon.color;
        ctx.shadowBlur = 10;
        ctx.fill();
      } else {
        // Standard bullet
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.weapon.color;
        ctx.shadowColor = this.weapon.color;
        ctx.shadowBlur = 15;
        ctx.fill();
      }

      ctx.restore();
    }

    checkCollision(entity) {
      if (this.hitList.includes(entity)) return false;

      const dx = entity.x - this.x;
      const dy = entity.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.radius + (entity.radius || 20)) {
        if (this.weapon.type === 'pierce') {
          this.hitList.push(entity);
          this.pierceCount--;
          if (this.pierceCount <= 0) this.life = 0;
        } else if (this.weapon.type !== 'gravity') {
          this.life = 0;
        }
        return true;
      }
      return false;
    }
  }

  // ============================================
  // ASTEROID CLASS
  // ============================================
  class Asteroid {
    constructor(x, y, size, isElite = false) {
      this.x = x;
      this.y = y;
      this.size = size; // 1 = small, 2 = medium, 3 = large
      this.radius = size * 20;
      this.isElite = isElite;
      this.health = size * (isElite ? 50 : 30);
      this.maxHealth = this.health;
      this.vx = (Math.random() - 0.5) * CONFIG.ASTEROID_BASE_SPEED;
      this.vy = (Math.random() - 0.5) * CONFIG.ASTEROID_BASE_SPEED;
      this.rotation = 0;
      this.rotationSpeed = (Math.random() - 0.5) * 2;
      this.points = this.generatePoints();
      this.color = isElite ? COLORS.red : COLORS.lime;
    }

    generatePoints() {
      const points = [];
      const numPoints = 8 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const dist = this.radius * (0.7 + Math.random() * 0.6);
        points.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist
        });
      }
      return points;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.rotationSpeed * dt;

      // Bounce off walls
      if (this.x < this.radius || this.x > canvas.width - this.radius) {
        this.vx *= -1;
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
      }
      if (this.y < this.radius || this.y > canvas.height - this.radius) {
        this.vy *= -1;
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
      }

      // Return true if alive
      return this.health > 0;
    }

    takeDamage(amount, attackerId) {
      this.health -= amount;

      // Hit flash
      for (let i = 0; i < 5; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 150,
          (Math.random() - 0.5) * 150,
          this.color, 'spark', 0.3
        ));
      }

      if (this.health <= 0) {
        this.destroy(attackerId);
      }
    }

    destroy(attackerId) {
      // Score
      const points = this.size * (this.isElite ? 500 : 100);
      addScore(points, this.x, this.y);
      gainHyper(this.isElite ? 10 : this.size * 4);

      // Explosion particles
      const particleCount = this.isElite ? 40 : 20;
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 300,
          (Math.random() - 0.5) * 300,
          this.color, 'explosion', 0.6
        ));
      }

      audio.playExplosion(this.size * 0.5);
      screenShake.intensity = this.isElite ? 20 : 8;

      // Spawn smaller asteroids
      if (this.size > 1) {
        for (let i = 0; i < 2; i++) {
          asteroids.push(new Asteroid(
            this.x + (Math.random() - 0.5) * 30,
            this.y + (Math.random() - 0.5) * 30,
            this.size - 1,
            this.isElite && Math.random() < 0.3
          ));
        }
      }

      // Drop powerup
      if (Math.random() < CONFIG.POWERUP_DROP_CHANCE) {
        powerups.push(new Powerup(this.x, this.y));
      }

      // Update kills
      kills++;
      updateKillsDisplay();
    }

    draw() {
      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);
      ctx.rotate(this.rotation);

      // Glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.isElite ? 25 : 15;

      // Draw asteroid
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      ctx.closePath();

      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(0.7, '#0f0f1a');
      gradient.addColorStop(1, this.color);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.isElite ? 3 : 2;
      ctx.stroke();

      // Elite indicator
      if (this.isElite) {
        ctx.font = 'bold 16px Orbitron';
        ctx.fillStyle = COLORS.red;
        ctx.textAlign = 'center';
        ctx.fillText('⚠', 0, -this.radius - 10);
      }

      // Health bar for damaged asteroids
      if (this.health < this.maxHealth) {
        ctx.rotate(-this.rotation);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-20, -this.radius - 8, 40, 4);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(-20, -this.radius - 8, 40 * (this.health / this.maxHealth), 4);
      }

      ctx.restore();
    }
  }

  // ============================================
  // DRONE CLASS (Enemy)
  // ============================================
  class Drone {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 15;
      this.health = 40;
      this.speed = 150 + Math.random() * 50;
      this.targetPlayer = null;
      this.vx = 0;
      this.vy = 0;
      this.color = COLORS.pink;
      this.points = 200;
    }

    update(dt) {
      // Find closest player
      let closestDist = Infinity;
      for (const player of players) {
        if (!player.isAlive) continue;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          this.targetPlayer = player;
        }
      }

      if (this.targetPlayer) {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.vx = (dx / dist) * this.speed;
          this.vy = (dy / dist) * this.speed;
        }
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      return this.health > 0;
    }

    takeDamage(amount, attackerId) {
      this.health -= amount;

      for (let i = 0; i < 3; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          this.color, 'spark', 0.2
        ));
      }

      if (this.health <= 0) {
        addScore(this.points, this.x, this.y);
        gainHyper(7);
        kills++;
        updateKillsDisplay();

        for (let i = 0; i < 15; i++) {
          particles.push(new Particle(
            this.x, this.y,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200,
            this.color, 'explosion', 0.5
          ));
        }

        audio.playExplosion(0.8);
        screenShake.intensity = 10;

        if (Math.random() < CONFIG.POWERUP_DROP_CHANCE) {
          powerups.push(new Powerup(this.x, this.y));
        }
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);

      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);

      // Drone body
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 10);
      ctx.closePath();

      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Eye
      ctx.beginPath();
      ctx.arc(5, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.red;
      ctx.fill();

      ctx.restore();
    }
  }

  // ============================================
  // BOSS CLASS
  // ============================================
  class Boss {
    constructor(wave) {
      this.x = canvas.width / 2;
      this.y = -100;
      this.targetY = 150;
      this.radius = 60;
      this.health = 500 + wave * 200;
      this.maxHealth = this.health;
      this.phase = 0;
      this.phaseTimer = 0;
      this.angle = 0;
      this.color = COLORS.purple;
      this.points = 5000;
      this.isEntering = true;
      this.spawnedMinions70 = false;
      this.spawnedMinions40 = false;
    }

    update(dt) {
      // Entry animation
      if (this.isEntering) {
        this.y += 100 * dt;
        if (this.y >= this.targetY) {
          this.y = this.targetY;
          this.isEntering = false;
          audio.playBossSpawn();
        }
        return true;
      }

      this.angle += dt * 0.5;
      this.phaseTimer += dt * 1000;

      // Phase transitions
      if (this.phaseTimer > 5000) {
        this.phase = (this.phase + 1) % 3;
        this.phaseTimer = 0;
      }

      const healthRatio = this.health / this.maxHealth;
      if (healthRatio < 0.7 && !this.spawnedMinions70) {
        spawnBossMinions(3);
        this.spawnedMinions70 = true;
        showEventAlert('BOSS DEPLOYED DRONES', 'warning', 1800);
      }
      if (healthRatio < 0.4 && !this.spawnedMinions40) {
        spawnBossMinions(5);
        this.spawnedMinions40 = true;
        showEventAlert('BOSS RAGE PROTOCOL', 'warning', 1800);
      }

      // Movement pattern based on phase
      if (this.phase === 0) {
        // Hover side to side
        this.x = canvas.width / 2 + Math.sin(this.angle * 2) * 200;
      } else if (this.phase === 1) {
        // Circle movement
        this.x = canvas.width / 2 + Math.cos(this.angle) * 250;
        this.y = 150 + Math.sin(this.angle * 2) * 50;
      } else {
        // Chase player
        const target = players.find(p => p.isAlive);
        if (target) {
          const dx = target.x - this.x;
          const dy = target.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 200) {
            this.x += (dx / dist) * 80 * dt;
            this.y += (dy / dist) * 80 * dt;
          }
        }
      }

      // Keep in bounds
      this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(canvas.height / 2, this.y));

      // Shoot at players
      if (Math.random() < dt * (2 + wave * 0.05)) {
        const target = players.find(p => p.isAlive);
        if (target) {
          const angle = Math.atan2(target.y - this.y, target.x - this.x);
          bullets.push(new Bullet(
            this.x, this.y,
            Math.cos(angle) * 300,
            Math.sin(angle) * 300,
            { type: 'normal', damage: 15, color: COLORS.red },
            0
          ));
        }
      }

      return this.health > 0;
    }

    takeDamage(amount, attackerId) {
      this.health -= amount;
      gainHyper(Math.min(1.5, amount * 0.01));

      screenShake.intensity = 5;

      for (let i = 0; i < 5; i++) {
        particles.push(new Particle(
          this.x + (Math.random() - 0.5) * 40,
          this.y + (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          this.color, 'spark', 0.3
        ));
      }

      if (this.health <= 0) {
        // Boss defeated!
        addScore(this.points, this.x, this.y);
        gainHyper(30);
        screenShake.intensity = 50;

        for (let i = 0; i < 80; i++) {
          particles.push(new Particle(
            this.x, this.y,
            (Math.random() - 0.5) * 500,
            (Math.random() - 0.5) * 500,
            this.color, 'explosion', 1
          ));
        }

        audio.playExplosion(3);
        boss = null;
        wave++;
        updateWaveDisplay();
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);
      ctx.rotate(this.angle);

      // Outer glow
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 1.5);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(0.5, 'rgba(189, 0, 255, 0.3)');
      gradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Main body
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * this.radius;
        const y = Math.sin(angle) * this.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#1a0a2e';
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 30;
      ctx.stroke();

      // Core
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();

      // Phase indicator
      ctx.rotate(-this.angle);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(['SWEEP', 'ORBIT', 'CHASE'][this.phase], 0, -this.radius - 20);

      // Health bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-60, this.radius + 15, 120, 8);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-60, this.radius + 15, 120 * (this.health / this.maxHealth), 8);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(-60, this.radius + 15, 120, 8);

      ctx.restore();
    }
  }

  // ============================================
  // POWERUP CLASS
  // ============================================
  class Powerup {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 18;
      this.type = ['shield', 'overdrive', 'weapon', 'health'][Math.floor(Math.random() * 4)];
      this.color = {
        shield: COLORS.cyan,
        overdrive: COLORS.yellow,
        weapon: COLORS.orange,
        health: COLORS.lime
      }[this.type];
      this.icon = {
        shield: '🛡',
        overdrive: '⚡',
        weapon: '🔫',
        health: '💖'
      }[this.type];
      this.vy = 50;
      this.rotation = 0;
      this.life = 10;
    }

    update(dt) {
      this.y += this.vy * dt;
      this.rotation += dt * 2;
      this.life -= dt;
      return this.life > 0 && this.y < canvas.height + 50;
    }

    draw() {
      ctx.save();
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);
      ctx.rotate(this.rotation);

      // Glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 20;

      // Circle
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Icon
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);

      // Label
      ctx.rotate(-this.rotation);
      ctx.font = 'bold 10px Orbitron';
      ctx.fillStyle = this.color;
      ctx.fillText(this.type.toUpperCase(), 0, this.radius + 15);

      ctx.restore();
    }

    collect(player) {
      audio.playPowerup();

      switch (this.type) {
        case 'shield':
          player.shield = CONFIG.SHIELD_MAX;
          break;
        case 'overdrive':
          player.overdrive = true;
          player.overdriveTimer = 10000;
          player.health = Math.min(CONFIG.PLAYER_MAX_HEALTH, player.health + 30);
          break;
        case 'weapon':
          player.weaponIndex = (player.weaponIndex + 1) % WEAPONS.length;
          updateWeaponDisplay(player);
          break;
        case 'health':
          player.health = Math.min(CONFIG.PLAYER_MAX_HEALTH, player.health + 25);
          break;
      }

      updateVitalsDisplay();

      // Collection particles
      for (let i = 0; i < 10; i++) {
        particles.push(new Particle(
          this.x, this.y,
          (Math.random() - 0.5) * 150,
          (Math.random() - 0.5) * 150,
          this.color, 'spark', 0.4
        ));
      }
    }
  }

  // ============================================
  // PARTICLE CLASS
  // ============================================
  class Particle {
    constructor(x, y, vx, vy, color, type, life) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.type = type;
      this.life = life;
      this.maxLife = life;
      this.size = type === 'explosion' ? 4 + Math.random() * 6 : 2 + Math.random() * 3;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;

      // Different behaviors
      if (this.type === 'explosion') {
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.size *= 0.97;
      } else if (this.type === 'smoke') {
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.size *= 1.02;
      } else if (this.type === 'trail') {
        this.size *= 0.9;
      }

      return this.life > 0;
    }

    draw() {
      const alpha = this.life / this.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x + screenShake.x, this.y + screenShake.y);

      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = this.type === 'explosion' ? 10 : 5;
      ctx.fill();

      ctx.restore();
    }
  }

  // ============================================
  // BACKGROUND & EFFECTS
  // ============================================
  let stars = [];
  let nebulaOffset = 0;

  function initBackground() {
    stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 30 + 10,
        brightness: Math.random() * 0.5 + 0.5
      });
    }
  }

  function drawBackground(dt) {
    // Dark space background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nebula effect
    nebulaOffset += dt * 10;
    const nebulaGradient = ctx.createRadialGradient(
      canvas.width * 0.3 + Math.sin(nebulaOffset * 0.001) * 50,
      canvas.height * 0.4 + Math.cos(nebulaOffset * 0.0015) * 30,
      0,
      canvas.width * 0.3,
      canvas.height * 0.4,
      400
    );
    nebulaGradient.addColorStop(0, 'rgba(189, 0, 255, 0.1)');
    nebulaGradient.addColorStop(0.5, 'rgba(77, 0, 128, 0.05)');
    nebulaGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = nebulaGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const nebula2Gradient = ctx.createRadialGradient(
      canvas.width * 0.7 + Math.cos(nebulaOffset * 0.0012) * 40,
      canvas.height * 0.6 + Math.sin(nebulaOffset * 0.0008) * 50,
      0,
      canvas.width * 0.7,
      canvas.height * 0.6,
      350
    );
    nebula2Gradient.addColorStop(0, 'rgba(0, 243, 255, 0.08)');
    nebula2Gradient.addColorStop(0.5, 'rgba(0, 100, 128, 0.04)');
    nebula2Gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = nebula2Gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    for (const star of stars) {
      star.y += star.speed * dt;
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }

      const twinkle = 0.5 + Math.sin(nebulaOffset * 0.01 + star.x) * 0.3;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * twinkle})`;
      ctx.fill();
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 80;
    const gridOffset = (nebulaOffset * 0.5) % gridSize;

    for (let y = gridOffset; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }

  // ============================================
  // GAME LOGIC
  // ============================================
  function randomSpawnFromEdge(offset = 50) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: Math.random() * canvas.width, y: -offset };
    if (side === 1) return { x: canvas.width + offset, y: Math.random() * canvas.height };
    if (side === 2) return { x: Math.random() * canvas.width, y: canvas.height + offset };
    return { x: -offset, y: Math.random() * canvas.height };
  }

  function showEventAlert(message, flavor = '', duration = 2000) {
    const el = document.getElementById('eventAlert');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'frenzy', 'warning');
    if (flavor) {
      el.classList.add(flavor);
    }
    setTimeout(() => {
      if (el.textContent === message) {
        el.classList.add('hidden');
      }
    }, duration);
  }

  function updateEventAlert() {
    const el = document.getElementById('eventAlert');
    if (!el) return;

    if (frenzyActive) {
      el.textContent = `FRENZY ACTIVE ${Math.ceil(frenzyTimer / 1000)}s`;
      el.classList.remove('hidden', 'warning');
      el.classList.add('frenzy');
      return;
    }

    if (activeEvent) {
      const typeLabels = {
        meteor: 'METEOR STORM',
        swarm: 'DRONE SWARM',
        elite: 'ELITE RAIN'
      };
      el.textContent = `${typeLabels[activeEvent] || 'EVENT'} ${Math.ceil(eventTimer / 1000)}s`;
      el.classList.remove('hidden', 'frenzy');
      el.classList.add('warning');
      return;
    }

    el.classList.add('hidden');
    el.classList.remove('frenzy', 'warning');
  }

  function updateHyperDisplay() {
    const bar = document.getElementById('hyperBar');
    const label = document.getElementById('hyperDisplay');
    if (!bar || !label) return;

    bar.style.width = `${hyperCharge}%`;
    label.textContent = `${Math.floor(hyperCharge)}%`;

    const isReady = hyperCharge >= CONFIG.HYPER_MAX;
    bar.classList.toggle('ready', isReady);
    label.classList.toggle('ready', isReady);
  }

  function gainHyper(amount) {
    if (gameState !== 'playing') return;
    hyperCharge = Math.min(CONFIG.HYPER_MAX, hyperCharge + amount);
    updateHyperDisplay();
  }

  function activateHyperNova(player) {
    if (hyperCharge < CONFIG.HYPER_MAX || !player || !player.isAlive) return false;

    hyperCharge = 0;
    updateHyperDisplay();
    screenShake.intensity = 45;
    showEventAlert('HYPER NOVA DEPLOYED', 'frenzy', 1500);

    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * Math.PI * 2;
      const speed = 200 + Math.random() * 500;
      particles.push(new Particle(
        player.x,
        player.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        COLORS.orange,
        'explosion',
        1
      ));
    }

    const asteroidTargets = asteroids.slice();
    const droneTargets = drones.slice();
    for (const asteroid of asteroidTargets) {
      const dx = asteroid.x - player.x;
      const dy = asteroid.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CONFIG.HYPER_NOVA_RADIUS) {
        asteroid.takeDamage(CONFIG.HYPER_NOVA_DAMAGE, player.id);
      }
    }

    for (const drone of droneTargets) {
      const dx = drone.x - player.x;
      const dy = drone.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CONFIG.HYPER_NOVA_RADIUS * 1.1) {
        drone.takeDamage(CONFIG.HYPER_NOVA_DAMAGE, player.id);
      }
    }

    if (boss) {
      const dx = boss.x - player.x;
      const dy = boss.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CONFIG.HYPER_NOVA_RADIUS * 1.5) {
        boss.takeDamage(CONFIG.HYPER_NOVA_BOSS_DAMAGE, player.id);
      }
    }
    audio.playExplosion(2.5);
    return true;
  }

  function startFrenzy() {
    frenzyActive = true;
    frenzyTimer = CONFIG.FRENZY_DURATION;
    showEventAlert('FRENZY MODE ENGAGED', 'frenzy', 1500);
    updateStatusText();
  }

  function spawnBossMinions(count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = boss ? boss.radius + 40 : 80;
      const x = (boss ? boss.x : canvas.width / 2) + Math.cos(angle) * distance;
      const y = (boss ? boss.y : 150) + Math.sin(angle) * distance;
      drones.push(new Drone(x, y));
    }
  }

  function startEvent(type) {
    activeEvent = type;
    eventTimer = CONFIG.EVENT_DURATION + wave * 120;
    eventSpawnTimer = 0;
    updateEventAlert();
  }

  function updateEventSystem(dt) {
    if (boss || gameState !== 'playing') {
      if (boss) {
        activeEvent = null;
      }
      updateEventAlert();
      return;
    }

    if (!activeEvent) {
      nextEventIn -= dt * 1000;
      if (nextEventIn <= 0) {
        const eventTypes = ['meteor', 'swarm', 'elite'];
        const index = Math.floor(Math.random() * eventTypes.length);
        startEvent(eventTypes[index]);
        nextEventIn = CONFIG.EVENT_INTERVAL_MIN + Math.random() * (CONFIG.EVENT_INTERVAL_MAX - CONFIG.EVENT_INTERVAL_MIN);
      }
      updateEventAlert();
      return;
    }

    eventTimer -= dt * 1000;
    eventSpawnTimer -= dt * 1000;

    if (activeEvent === 'meteor' && eventSpawnTimer <= 0) {
      const x = Math.random() * canvas.width;
      const asteroid = new Asteroid(x, -60, 1, Math.random() < 0.2);
      asteroid.vx = (Math.random() - 0.5) * 200;
      asteroid.vy = 280 + Math.random() * 150 + wave * 4;
      asteroids.push(asteroid);
      eventSpawnTimer = 180;
    } else if (activeEvent === 'swarm' && eventSpawnTimer <= 0) {
      const spawn = randomSpawnFromEdge(40);
      drones.push(new Drone(spawn.x, spawn.y));
      eventSpawnTimer = 260;
    } else if (activeEvent === 'elite' && eventSpawnTimer <= 0) {
      const spawn = randomSpawnFromEdge(70);
      const eliteAsteroid = new Asteroid(spawn.x, spawn.y, Math.random() < 0.6 ? 2 : 3, true);
      asteroids.push(eliteAsteroid);
      eventSpawnTimer = 900;
    }

    if (eventTimer <= 0) {
      activeEvent = null;
    }
    updateEventAlert();
  }

  function spawnWave() {
    const isBossWave = wave % CONFIG.BOSS_WAVE_INTERVAL === 0;

    if (isBossWave && !boss) {
      // Spawn boss
      boss = new Boss(wave);
      audio.playBossSpawn();
      showEventAlert(`BOSS WAVE ${wave}`, 'warning', 2300);
    } else if (!boss) {
      // Regular wave spawning
      const asteroidCount = 4 + Math.floor(wave * 1.6);
      const speedMult = 1 + wave * 0.1;
      showEventAlert(`WAVE ${wave} INCOMING`, 'warning', 1400);

      for (let i = 0; i < asteroidCount; i++) {
        const spawn = randomSpawnFromEdge(50);
        const x = spawn.x;
        const y = spawn.y;

        const size = Math.random() < 0.3 ? 3 : Math.random() < 0.6 ? 2 : 1;
        const isElite = wave > 3 && Math.random() < 0.15;

        const asteroid = new Asteroid(x, y, size, isElite);
        asteroid.vx *= speedMult;
        asteroid.vy *= speedMult;
        asteroids.push(asteroid);
      }

      // Spawn drones
      if (wave > 2 && Math.random() < Math.min(0.8, CONFIG.DRONE_SPAWN_CHANCE * wave)) {
        const droneCount = Math.min(wave, 5);
        for (let i = 0; i < droneCount; i++) {
          const spawn = randomSpawnFromEdge(30);
          drones.push(new Drone(spawn.x, spawn.y));
        }
      }
    }
  }

  function addScore(points, x, y) {
    const multipliedPoints = Math.floor(points * combo);
    score += multipliedPoints;
    updateScoreDisplay();

    // Floating score text
    particles.push(new Particle(
      x, y,
      (Math.random() - 0.5) * 50,
      -50,
      COLORS.yellow,
      'smoke',
      0.8
    ));

    // Combo system
    comboTimer = CONFIG.COMBO_TIMEOUT;
    if (combo < CONFIG.COMBO_MAX) {
      combo = Math.min(CONFIG.COMBO_MAX, combo * 1.2);
      combo = Math.floor(combo * 2) / 2; // Round to nearest 0.5
      if (combo > maxCombo) {
        maxCombo = combo;
        audio.playCombo();
      }
    }

    if (combo >= CONFIG.FRENZY_COMBO_THRESHOLD && !frenzyActive) {
      startFrenzy();
    }
    updateComboDisplay();
  }

  function updateScreenShake() {
    if (screenShake.intensity > 0) {
      screenShake.x = (Math.random() - 0.5) * screenShake.intensity * 2;
      screenShake.y = (Math.random() - 0.5) * screenShake.intensity * 2;
      screenShake.intensity *= CONFIG.SCREEN_SHAKE_DECAY;
      if (screenShake.intensity < 0.5) screenShake.intensity = 0;
    } else {
      screenShake.x = 0;
      screenShake.y = 0;
    }
  }

  function checkCollisions() {
    // Bullets vs Asteroids/Drones/Boss
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (bullet.ownerId <= 0) continue;

      // Vs Asteroids
      for (let j = asteroids.length - 1; j >= 0; j--) {
        if (bullet.checkCollision(asteroids[j])) {
          asteroids[j].takeDamage(bullet.damage, bullet.ownerId);
          if (bullet.life <= 0) break;
        }
      }

      // Vs Drones
      for (let j = drones.length - 1; j >= 0; j--) {
        if (bullet.checkCollision(drones[j])) {
          drones[j].takeDamage(bullet.damage, bullet.ownerId);
          if (bullet.life <= 0) break;
        }
      }

      // Vs Boss
      if (boss && !boss.isEntering) {
        const dx = boss.x - bullet.x;
        const dy = boss.y - bullet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bullet.radius + boss.radius) {
          boss.takeDamage(bullet.damage, bullet.ownerId);
          bullet.life = 0;
        }
      }
    }

    // Players vs Asteroids/Drones/Bullets/Powerups
    for (const player of players) {
      if (!player.isAlive) continue;

      // Vs Asteroids
      for (const asteroid of asteroids) {
        const dx = asteroid.x - player.x;
        const dy = asteroid.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < asteroid.radius + player.radius) {
          player.takeDamage(20);
          const safeDist = Math.max(dist, 0.0001);
          asteroid.vx = dx / safeDist * 200;
          asteroid.vy = dy / safeDist * 200;
        }
      }

      // Vs Drones
      for (const drone of drones) {
        const dx = drone.x - player.x;
        const dy = drone.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < drone.radius + player.radius) {
          player.takeDamage(15);
          drone.health = 0; // Drone explodes on contact
        }
      }

      // Vs Enemy bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (bullet.ownerId !== 0) continue;

        const dx = bullet.x - player.x;
        const dy = bullet.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bullet.radius + player.radius) {
          player.takeDamage(bullet.damage);
          bullet.life = 0;
        }
      }

      // Vs Boss
      if (boss && !boss.isEntering) {
        const dx = boss.x - player.x;
        const dy = boss.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < boss.radius + player.radius) {
          player.takeDamage(30);
        }
      }

      // Vs Powerups
      for (let i = powerups.length - 1; i >= 0; i--) {
        const powerup = powerups[i];
        const dx = powerup.x - player.x;
        const dy = powerup.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < powerup.radius + player.radius) {
          powerup.collect(player);
          powerups.splice(i, 1);
        }
      }
    }
  }

  function checkGameOver() {
    const alivePlayers = players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      setGameOver();
    }
  }

  // ============================================
  // UI UPDATES
  // ============================================
  function updateScoreDisplay() {
    const el = document.getElementById('scoreDisplay');
    if (el) {
      el.textContent = score.toLocaleString();
      el.classList.remove('hidden');
    }
  }

  function updateKillsDisplay() {
    const el = document.getElementById('killsDisplay');
    if (el) el.textContent = kills;
  }

  function updateWaveDisplay() {
    const el = document.getElementById('waveDisplay');
    if (el) el.textContent = wave;
  }

  function updateComboDisplay() {
    const el = document.getElementById('comboDisplay');
    if (el) {
      el.textContent = `x${combo}`;
      const chip = el.closest('.combo-chip');
      if (chip) {
        if (combo >= 4) chip.classList.add('hot');
        else chip.classList.remove('hot');
      }
    }
  }

  function updateVitalsDisplay() {
    if (!players[0]) {
      updateHyperDisplay();
      return;
    }

    const healthEl = document.getElementById('healthDisplay');
    if (healthEl) {
      const health = Math.max(0, Math.floor(players[0].health));
      healthEl.textContent = health;
      healthEl.classList.toggle('warning', health <= 30);
    }

    const shieldEl = document.getElementById('shieldDisplay');
    if (shieldEl) {
      shieldEl.textContent = Math.floor(players[0].shield);
      if (players[0].shield > 0) shieldEl.classList.add('active');
      else shieldEl.classList.remove('active');
    }

    const heatEl = document.getElementById('heatDisplay');
    const heatBar = document.getElementById('heatBar');
    if (heatEl && heatBar) {
      const heat = players[0].weaponHeat;
      heatEl.textContent = `${Math.floor(heat)}%`;
      heatBar.style.width = `${heat}%`;

      heatEl.classList.remove('warning', 'critical');
      heatBar.classList.remove('warning', 'critical');
      if (heat >= 90) {
        heatEl.classList.add('critical');
        heatBar.classList.add('critical');
      } else if (heat >= 70) {
        heatEl.classList.add('warning');
        heatBar.classList.add('warning');
      }
    }

    updateHyperDisplay();
  }

  function updateWeaponDisplay(player) {
    const el = document.getElementById('weaponDisplay');
    const iconEl = document.getElementById('weaponIcon');
    if (el && iconEl && player) {
      const weapon = WEAPONS[player.weaponIndex];
      el.textContent = weapon.name;
      iconEl.textContent = weapon.icon;
    }
  }

  function updateStatusText() {
    const el = document.getElementById('statusText');
    if (!el) return;

    if (frenzyActive) {
      el.textContent = 'FRENZY';
      el.classList.add('frenzy');
      el.classList.remove('overdrive', 'alert');
    } else if (players[0] && players[0].overdrive) {
      el.textContent = 'OVERDRIVE';
      el.classList.add('overdrive');
      el.classList.remove('alert', 'frenzy');
    } else if (players[0] && players[0].health < 30) {
      el.textContent = 'CRITICAL';
      el.classList.add('alert');
      el.classList.remove('overdrive', 'frenzy');
    } else if (activeEvent) {
      el.textContent = 'EVENT';
      el.classList.add('alert');
      el.classList.remove('overdrive', 'frenzy');
    } else {
      el.textContent = 'READY';
      el.classList.remove('overdrive', 'alert', 'frenzy');
    }
  }

  // ============================================
  // GAME STATE MANAGEMENT
  // ============================================
  function startGame(mode) {
    gameMode = mode;
    gameState = 'playing';

    // Reset game state
    score = 0;
    kills = 0;
    wave = 1;
    combo = 1;
    maxCombo = 1;
    comboTimer = 0;
    waveTimer = 0;
    hyperCharge = 0;
    frenzyTimer = 0;
    frenzyActive = false;
    activeEvent = null;
    eventTimer = 0;
    eventSpawnTimer = 0;
    nextEventIn = CONFIG.EVENT_INTERVAL_MIN + Math.random() * (CONFIG.EVENT_INTERVAL_MAX - CONFIG.EVENT_INTERVAL_MIN);
    bullets = [];
    asteroids = [];
    particles = [];
    drones = [];
    powerups = [];
    boss = null;
    for (const code in keys) delete keys[code];
    for (const code in keysPressed) delete keysPressed[code];

    // Create players
    players = [];
    if (mode >= 1) {
      players.push(new Player(1, canvas.width * 0.3, canvas.height / 2, COLORS.cyan, {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        fire: 'Space', switch: 'KeyQ', dash: 'ShiftLeft', nova: 'KeyX'
      }));
    }
    if (mode >= 2) {
      players.push(new Player(2, canvas.width * 0.7, canvas.height / 2, COLORS.pink, {
        up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
        fire: 'KeyF', switch: 'KeyE', dash: 'KeyC', nova: 'KeyV'
      }));
    }

    // Update UI
    updateScoreDisplay();
    updateKillsDisplay();
    updateWaveDisplay();
    updateComboDisplay();
    updateVitalsDisplay();
    updateWeaponDisplay(players[0]);
    updateStatusText();
    updateEventAlert();

    // Hide start screen, show HUD
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('scoreDisplay').classList.remove('hidden');

    // Initialize audio
    audio.init();

    // Spawn first wave
    spawnWave();

    // Update body class
    document.body.classList.toggle('single-player', mode === 1);
  }

  function setGameOver() {
    gameState = 'gameover';
    frenzyActive = false;
    activeEvent = null;

    if (score > bestScore) {
      bestScore = score;
    }
    if (wave > bestWave) {
      bestWave = wave;
    }
    try {
      localStorage.setItem('voidRunnerBestScore', String(bestScore));
      localStorage.setItem('voidRunnerBestWave', String(bestWave));
    } catch (e) {
      // Ignore storage failures in restrictive environments.
    }

    document.getElementById('finalScore').textContent = score.toLocaleString();
    document.getElementById('finalKills').textContent = kills;
    document.getElementById('maxCombo').textContent = `x${maxCombo}`;
    document.getElementById('bestScore').textContent = bestScore.toLocaleString();
    document.getElementById('bestWave').textContent = bestWave;
    document.getElementById('gameOverScreen').classList.remove('hidden');
    updateEventAlert();
  }

  // ============================================
  // MAIN GAME LOOP
  // ============================================
  function gameLoop(timestamp) {
    deltaTime = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (gameState === 'playing') {
      // Update combo timer
      if (comboTimer > 0) {
        comboTimer -= deltaTime * 1000;
        if (comboTimer <= 0) {
          combo = 1;
          updateComboDisplay();
        }
      }

      if (frenzyActive) {
        frenzyTimer -= deltaTime * 1000;
        if (frenzyTimer <= 0) {
          frenzyActive = false;
          frenzyTimer = 0;
          updateStatusText();
        }
      }

      // Wave timer
      waveTimer += deltaTime * 1000;
      if (waveTimer >= CONFIG.WAVE_DURATION && !boss) {
        waveTimer = 0;
        wave++;
        updateWaveDisplay();
        spawnWave();
      }

      // Update entities
      players.forEach(p => p.update(deltaTime));
      bullets = bullets.filter(b => b.update(deltaTime));
      asteroids = asteroids.filter(a => a.update(deltaTime));
      drones = drones.filter(d => d.update(deltaTime));
      powerups = powerups.filter(p => p.update(deltaTime));
      particles = particles.filter(p => p.update(deltaTime));
      if (particles.length > CONFIG.PARTICLE_MAX) {
        particles = particles.slice(-CONFIG.PARTICLE_MAX);
      }

      updateEventSystem(deltaTime);

      if (boss) {
        boss.update(deltaTime);
      }

      if (!boss && asteroids.length + drones.length === 0) {
        wave++;
        waveTimer = 0;
        updateWaveDisplay();
        spawnWave();
      }

      // Update effects
      updateScreenShake();
      checkCollisions();
      checkGameOver();

      // Update UI
      updateStatusText();
      updateComboDisplay();
      updateVitalsDisplay();
      if (players[0]) {
        updateWeaponDisplay(players[0]);
      }
    }

    // Render
    drawBackground(deltaTime);

    if (gameState === 'playing' || gameState === 'gameover') {
      // Draw entities
      powerups.forEach(p => p.draw());
      asteroids.forEach(a => a.draw());
      drones.forEach(d => d.draw());
      if (boss) boss.draw();
      bullets.forEach(b => b.draw());
      players.forEach(p => p.draw());
      particles.forEach(p => p.draw());
    }

    requestAnimationFrame(gameLoop);
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    try {
      bestScore = Number(localStorage.getItem('voidRunnerBestScore') || '0');
      bestWave = Number(localStorage.getItem('voidRunnerBestWave') || '1');
      if (!Number.isFinite(bestScore) || bestScore < 0) bestScore = 0;
      if (!Number.isFinite(bestWave) || bestWave < 1) bestWave = 1;
    } catch (e) {
      bestScore = 0;
      bestWave = 1;
    }
    const bestScoreEl = document.getElementById('bestScore');
    const bestWaveEl = document.getElementById('bestWave');
    if (bestScoreEl) bestScoreEl.textContent = bestScore.toLocaleString();
    if (bestWaveEl) bestWaveEl.textContent = bestWave;
    updateHyperDisplay();

    // Set canvas size
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      CONFIG.CANVAS_WIDTH = canvas.width;
      CONFIG.CANVAS_HEIGHT = canvas.height;
      initBackground();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Input handling
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      keysPressed[e.code] = true;

      // Prevent scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      // Mode switching
      if (gameState === 'start' || gameState === 'gameover') {
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
          gameMode = 1;
          updateModeButtons();
        } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
          gameMode = 2;
          updateModeButtons();
        } else if (e.code === 'Enter') {
          if (gameState === 'gameover') {
            startGame(gameMode);
          }
        }
      }

      // Sound toggle
      if (e.code === 'KeyM') {
        audioEnabled = !audioEnabled;
        const btn = document.getElementById('audioToggle');
        if (btn) {
          btn.textContent = `SOUND: ${audioEnabled ? 'ON' : 'OFF'}`;
          btn.setAttribute('aria-pressed', audioEnabled);
        }
      }

      // Start game from menu
      if (gameState === 'start' && e.code === 'Enter') {
        startGame(gameMode);
      }
    });

    window.addEventListener('keyup', e => {
      keys[e.code] = false;
    });

    // Button handlers
    document.getElementById('deployButton').addEventListener('click', () => {
      startGame(gameMode);
    });

    document.getElementById('mode1Btn').addEventListener('click', () => {
      gameMode = 1;
      updateModeButtons();
    });

    document.getElementById('mode2Btn').addEventListener('click', () => {
      gameMode = 2;
      updateModeButtons();
    });

    document.getElementById('audioToggle').addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      const btn = document.getElementById('audioToggle');
      btn.textContent = `SOUND: ${audioEnabled ? 'ON' : 'OFF'}`;
      btn.setAttribute('aria-pressed', audioEnabled);
    });

    function updateModeButtons() {
      document.getElementById('mode1Btn').classList.toggle('active', gameMode === 1);
      document.getElementById('mode2Btn').classList.toggle('active', gameMode === 2);
      document.body.classList.toggle('single-player', gameMode === 1);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
