(function () {
    // --- ENGINE CONSTANTS ---
    const URL_PARAMS = new URLSearchParams(window.location.search);
    const DEBUG_BY_DEFAULT = URL_PARAMS.has('debug');
    const START_BLOOM = URL_PARAMS.get('bloom') !== '0';
    const START_PARTICLES = Number(URL_PARAMS.get('particles') || 1000);
    const START_VOLUME = Number(URL_PARAMS.get('volume'));
    const BLOOM_ALLOWED = START_BLOOM;
    const CONFIG = {
        baseWidth: 1600,
        baseHeight: 900,
        safeMargin: 10,
        dtMax: 0.05,
        fixedStep: 1 / 120,
        maxSubSteps: 5,
        renderScale: 1.0,
        adaptiveRenderScale: 0.86,
        bloomEnabled: START_BLOOM,
        audioVolume: Number.isFinite(START_VOLUME) ? Math.max(0, Math.min(1, START_VOLUME)) : 0.7,
        maxDpr: 2,
        maxParticles: Math.max(200, Math.min(3500, START_PARTICLES)),
        maxShockwaves: 80,
        maxOverlays: 32,
        maxBullets: 650,
        maxEnemyBullets: 320,
        maxEnemies: 220,
        debugPerf: DEBUG_BY_DEFAULT
    };

    // --- SETUP CANVAS ---
    const shell = document.getElementById('gameShell');
    const viewport = document.getElementById('gameViewport');
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    
    // UI Elements
    const ui = {
        score: document.getElementById('scoreDisplay'),
        kills: document.getElementById('killsDisplay'),
        wave: document.getElementById('waveDisplay'),
        weapon: document.getElementById('weaponDisplay'),
        weaponIcon: document.getElementById('weaponIcon'),
        heat: document.getElementById('heatDisplay'),
        heatBar: document.getElementById('heatBar'),
        combo: document.getElementById('comboDisplay'),
        comboChip: document.querySelector('.combo-chip'),
        shield: document.getElementById('shieldDisplay'),
        status: document.getElementById('statusText'),
        start: document.getElementById('startScreen'),
        over: document.getElementById('gameOverScreen'),
        finalScore: document.getElementById('finalScore'),
        finalKills: document.getElementById('finalKills'),
        maxCombo: document.getElementById('maxCombo'),
        audioBtn: document.getElementById('audioToggle'),
        volume: document.getElementById('volumeSlider'),
        volumeValue: document.getElementById('volumeValue'),
        deployBtn: document.getElementById('deployButton'),
        controlHint: document.getElementById('controlHint'),
        modeBtns: Array.from(document.querySelectorAll('.mode-btn')),
        perfDebug: document.getElementById('perfDebug')
    };

    // --- STATE ---
    const state = {
        running: false,
        gameOver: false,
        t: 0,
        score: 0,
        kills: 0,
        shake: 0,
        hitStop: 0,
        width: 0, height: 0,
        camera: { x: 0, y: 0, zoom: 1 },
        combo: 1,
        comboTimer: 0,
        maxCombo: 1,
        wave: 1,
        shield: 0,
        teamLives: 6,
        overdriveTimer: 0,
        lastShot: 0,
        playerMode: 1,
        difficulty: null,
        viewportScale: 1,
        displayWidth: CONFIG.baseWidth,
        displayHeight: CONFIG.baseHeight,
        dpr: 1,
        accumulator: 0,
        fps: 60,
        fpsSampleTime: 0,
        fpsSampleFrames: 0,
        lowQuality: false,
        debugPerf: CONFIG.debugPerf,
        debugTicker: 0
    };

    const input = {
        p1: {
            x: 0, y: 0,
            left: false, right: false, up: false, down: false,
            fire: false
        },
        p2: {
            x: 0, y: 0,
            left: false, right: false, up: false, down: false,
            fire: false
        }
    };

    const CONTROL_HINTS = {
        1: 'P1: ARROWS MOVE | P1 FIRE: SPACE | CLICK DEPLOY TO START',
        2: 'P1: ARROWS + SPACE | P2: WASD + F | CLICK MODE + DEPLOY'
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function createPool(factory, maxSize = 512) {
        const free = [];
        return {
            acquire() {
                return free.pop() || factory();
            },
            release(instance) {
                if(!instance || free.length >= maxSize) return;
                free.push(instance);
            },
            size() {
                return free.length;
            }
        };
    }

    function getDifficulty(level) {
        if(level <= 1) {
            return {
                level: 1,
                label: 'LEVEL 1: CALIBRATION',
                enemyHp: 0.85,
                enemySpeed: 0.82,
                enemyFireRate: 0.78,
                enemyBulletSpeed: 0.82,
                enemyDamage: 0.78,
                spawnInterval: 1.65,
                density: 1.0,
                droneCap: 1,
                droneInterval: 11.5,
                aiLead: 0.08
            };
        }

        if(level === 2) {
            return {
                level: 2,
                label: 'LEVEL 2: ESCALATION',
                enemyHp: 1.1,
                enemySpeed: 1.03,
                enemyFireRate: 1.08,
                enemyBulletSpeed: 1.05,
                enemyDamage: 1.0,
                spawnInterval: 1.2,
                density: 1.2,
                droneCap: 2,
                droneInterval: 8.4,
                aiLead: 0.2
            };
        }

        const scale = level - 2;
        return {
            level: level,
            label: 'LEVEL ' + level + ': ONSLAUGHT',
            enemyHp: 1.1 + scale * 0.22,
            enemySpeed: 1.03 + scale * 0.14,
            enemyFireRate: 1.08 + scale * 0.12,
            enemyBulletSpeed: 1.05 + scale * 0.15,
            enemyDamage: 1.0 + scale * 0.13,
            spawnInterval: Math.max(0.3, 1.2 - scale * 0.08),
            density: 1.2 + scale * 0.22,
            droneCap: Math.min(8, 2 + Math.floor(scale)),
            droneInterval: Math.max(3.2, 8.4 - scale * 0.55),
            aiLead: Math.min(0.95, 0.2 + scale * 0.11)
        };
    }

    state.difficulty = getDifficulty(1);

    // --- WEAPON DEFINITIONS ---
    const WEAPONS = {
        BLASTER: { 
            name: 'BLASTER MK-II', 
            icon: '⚡', 
            delay: 0.07, 
            heat: 7,
            color: '#00f3ff'
        },
        SCATTER: { 
            name: 'SCATTER CANNON', 
            icon: '✸', 
            delay: 0.14, 
            heat: 12,
            color: '#ffee00'
        },
        PLASMA: { 
            name: 'PLASMA DESTROYER', 
            icon: '◆', 
            delay: 0.34, 
            heat: 24,
            color: '#00ff88'
        },
        LASER: { 
            name: 'PULSE LASER', 
            icon: '═', 
            delay: 0.045, 
            heat: 6,
            color: '#ff2e97'
        },
        MISSILES: { 
            name: 'HOMING MISSILES', 
            icon: '⟿', 
            delay: 0.22, 
            heat: 16,
            color: '#ff8c00'
        },
        RAILGUN: { 
            name: 'RAILGUN SNIPER', 
            icon: '║', 
            delay: 0.52, 
            heat: 32,
            color: '#b537ff'
        }
    };

    const UTILITY_POWERUPS = {
        SHIELD: { icon: '🛡', color: '#6ad8ff', label: 'SHIELD CHARGE' },
        COOLANT: { icon: '❄', color: '#88ffd8', label: 'THERMAL VENT' },
        OVERDRIVE: { icon: '🔥', color: '#ffb25f', label: 'OVERDRIVE' }
    };

    // --- ASSET GENERATOR (Enhanced) ---
    const Assets = {
        cache: {},
        createCanvas(w, h) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            return { c, ctx: c.getContext('2d') };
        },
        genPlayer(theme = {}) {
            const { c, ctx } = this.createCanvas(160, 160);
            const cx = 80, cy = 80;
            const neon = theme.neon || '#00f3ff';
            const wingGlowColor = theme.wingGlow || 'rgba(77, 158, 255, 0.4)';
            const hull = theme.hull || '#0a1830';
            const wing = theme.wing || '#162845';
            const cockpit = theme.cockpit || '#ccffff';
            const engineCore = theme.engineCore || 'rgba(0, 255, 255, 1)';
            const engineMid = theme.engineMid || 'rgba(0, 200, 255, 0.6)';
            
            // Triple Engine Glow
            for(let i=0; i<3; i++) {
                const xOff = (i-1) * 25;
                const g = ctx.createRadialGradient(cx+xOff, cy+45, 3, cx+xOff, cy+45, 25);
                g.addColorStop(0, engineCore);
                g.addColorStop(0.5, engineMid);
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0,0,160,160);
            }

            // Wing Glows
            const wingGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 50);
            wingGlow.addColorStop(0, wingGlowColor);
            wingGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = wingGlow;
            ctx.fillRect(0,0,160,160);

            // Main Hull
            ctx.shadowBlur = 20;
            ctx.shadowColor = neon;
            ctx.fillStyle = hull;
            ctx.strokeStyle = neon;
            ctx.lineWidth = 3.5;
            
            ctx.beginPath();
            ctx.moveTo(cx, cy-45);
            ctx.lineTo(cx+30, cy+35);
            ctx.lineTo(cx+12, cy+25);
            ctx.lineTo(cx, cy+18);
            ctx.lineTo(cx-12, cy+25);
            ctx.lineTo(cx-30, cy+35);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Wings
            ctx.fillStyle = wing;
            ctx.beginPath();
            ctx.moveTo(cx-30, cy+10);
            ctx.lineTo(cx-50, cy+30);
            ctx.lineTo(cx-35, cy+32);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(cx+30, cy+10);
            ctx.lineTo(cx+50, cy+30);
            ctx.lineTo(cx+35, cy+32);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Cockpit with glow
            ctx.shadowBlur = 15;
            ctx.shadowColor = neon;
            ctx.fillStyle = cockpit;
            ctx.beginPath();
            ctx.ellipse(cx, cy-8, 8, 16, 0, 0, Math.PI*2);
            ctx.fill();
            
            // Detail Lines
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1.5;
            for(let i=-1; i<=1; i++) {
                ctx.beginPath();
                ctx.moveTo(cx+i*15, cy+5);
                ctx.lineTo(cx+i*22, cy+28);
                ctx.stroke();
            }

            // Engine Vents
            ctx.fillStyle = '#004466';
            for(let i=-1; i<=1; i++) {
                ctx.fillRect(cx+i*25-2, cy+38, 4, 8);
            }

            this.cache.player = c;
            return c;
        },
        genAsteroid(size, seed, type = 'normal') {
            const dim = size * 3;
            const { c, ctx } = this.createCanvas(dim, dim);
            const cx = dim/2, cy = dim/2;
            
            // Different asteroid types
            let grad;
            if(type === 'crystal') {
                grad = ctx.createRadialGradient(cx-size*0.3, cy-size*0.3, size*0.1, cx, cy, size);
                grad.addColorStop(0, '#9db4cc');
                grad.addColorStop(0.5, '#4d6a8a');
                grad.addColorStop(1, '#1a2530');
            } else if(type === 'metal') {
                grad = ctx.createRadialGradient(cx-size*0.3, cy-size*0.3, size*0.1, cx, cy, size);
                grad.addColorStop(0, '#8a8680');
                grad.addColorStop(0.5, '#4a4640');
                grad.addColorStop(1, '#1a1815');
            } else {
                grad = ctx.createRadialGradient(cx-size*0.3, cy-size*0.3, size*0.1, cx, cy, size);
                grad.addColorStop(0, '#8a7a6a');
                grad.addColorStop(0.5, '#4a3a2a');
                grad.addColorStop(1, '#1a1410');
            }

            ctx.fillStyle = grad;
            ctx.shadowBlur = 25;
            ctx.shadowColor = 'black';

            // Complex polygon
            ctx.beginPath();
            const vertices = 14 + (seed % 6);
            for(let i=0; i<=vertices; i++) {
                const angle = (i/vertices) * Math.PI*2;
                const variance = 0.75 + Math.sin(angle*seed + seed)*0.15 + Math.random()*0.15;
                const r = size * variance;
                const px = cx + Math.cos(angle)*r;
                const py = cy + Math.sin(angle)*r;
                if(i===0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            
            // Enhanced craters/details
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            const craters = Math.floor(size/15) + 2;
            for(let i=0; i<craters; i++) {
                ctx.beginPath();
                ctx.arc(
                    cx + (Math.random()-0.5)*size*1.2,
                    cy + (Math.random()-0.5)*size*1.2,
                    size*0.15 + Math.random()*size*0.1,
                    0, Math.PI*2
                );
                ctx.fill();
            }
            
            // Highlight rim
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = type === 'crystal' ? 'rgba(157,180,204,0.3)' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Crystal sparkles
            if(type === 'crystal') {
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                for(let i=0; i<5; i++) {
                    const px = cx + (Math.random()-0.5)*size*0.8;
                    const py = cy + (Math.random()-0.5)*size*0.8;
                    ctx.fillRect(px, py, 2, 2);
                }
            }

            return c;
        },
        init() {
            this.cache.player1 = this.genPlayer({
                neon: '#00f3ff',
                wingGlow: 'rgba(77, 158, 255, 0.45)',
                hull: '#0a1830',
                wing: '#162845',
                cockpit: '#ccffff',
                engineCore: 'rgba(0, 255, 255, 1)',
                engineMid: 'rgba(0, 200, 255, 0.6)'
            });
            this.cache.player2 = this.genPlayer({
                neon: '#ff5ef2',
                wingGlow: 'rgba(255, 110, 215, 0.42)',
                hull: '#301038',
                wing: '#4a1760',
                cockpit: '#ffe2ff',
                engineCore: 'rgba(255, 122, 240, 1)',
                engineMid: 'rgba(255, 82, 210, 0.62)'
            });
            
            // Generate variety of asteroids
            this.asteroidSmall = this.genAsteroid(15, 5, 'normal');
            this.asteroidSmallCrystal = this.genAsteroid(15, 7, 'crystal');
            this.asteroidSmallMetal = this.genAsteroid(15, 9, 'metal');
            
            this.asteroidMed = this.genAsteroid(32, 12, 'normal');
            this.asteroidMedCrystal = this.genAsteroid(32, 14, 'crystal');
            this.asteroidMedMetal = this.genAsteroid(32, 16, 'metal');
            
            this.asteroidLarge = this.genAsteroid(55, 99, 'normal');
            this.asteroidLargeCrystal = this.genAsteroid(55, 101, 'crystal');
            this.asteroidLargeMetal = this.genAsteroid(55, 103, 'metal');
            
            this.glow = this.genGlow();
            this.star = this.genStar();
        },
        genGlow() {
            const { c, ctx } = this.createCanvas(128, 128);
            const g = ctx.createRadialGradient(64,64,5,64,64,64);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0,0,128,128);
            return c;
        },
        genStar() {
            const { c, ctx } = this.createCanvas(8, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(3, 0, 2, 8);
            ctx.fillRect(0, 3, 8, 2);
            return c;
        }
    };

    // --- AUDIO ENGINE (Enhanced) ---
    const Audio = {
        ctx: null,
        master: null,
        delay: null,
        delayGain: null,
        noiseBuffer: null,
        initialized: false,
        enabled: true,
        muted: false,
        volume: CONFIG.audioVolume,
        init() {
            if(this.initialized) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if(!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : this.volume;
            this.master.connect(this.ctx.destination);

            this.delay = this.ctx.createDelay();
            this.delay.delayTime.value = 0.15;
            this.delayGain = this.ctx.createGain();
            this.delayGain.gain.value = 0.25;
            this.delay.connect(this.delayGain);
            this.delayGain.connect(this.master);
            this.noiseBuffer = this.createNoiseBuffer(1.2);
            this.initialized = true;
        },
        createNoiseBuffer(seconds = 1) {
            if(!this.ctx) return null;
            const bufferSize = Math.floor(this.ctx.sampleRate * seconds);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for(let i=0; i<bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            return buffer;
        },
        ensureRunning() {
            if(!this.ctx) return;
            if(this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        },
        setVolume(value) {
            this.volume = clamp(value, 0, 1);
            if(this.master) {
                this.master.gain.value = this.muted ? 0 : this.volume;
            }
        },
        setMuted(muted) {
            this.muted = !!muted;
            if(this.master) {
                this.master.gain.value = this.muted ? 0 : this.volume;
            }
        },
        playTone(freq, type, dur, vol, slideTo = null) {
            if(!this.enabled || this.muted || !this.ctx) return;
            this.ensureRunning();
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t+dur);
            
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t+dur);
            
            osc.connect(gain);
            gain.connect(this.master);
            gain.connect(this.delay);
            
            osc.start();
            osc.stop(t+dur+0.1);
        },
        playNoise(dur, vol, filterFreq = 800) {
            if(!this.enabled || this.muted || !this.ctx || !this.noiseBuffer) return;
            this.ensureRunning();
            const t = this.ctx.currentTime;
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            src.loop = true;
            const gain = this.ctx.createGain();

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, t);
            filter.frequency.linearRampToValueAtTime(100, t+dur);

            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t+dur);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.master);
            src.start();
            src.stop(t + dur + 0.02);
        },
        sfx: {
            shoot: () => Audio.playTone(420, 'sawtooth', 0.1, 0.16, 110),
            shootLaser: () => Audio.playTone(680, 'sine', 0.06, 0.12, 260),
            shootMissile: () => Audio.playTone(280, 'square', 0.18, 0.16, 520),
            shootRailgun: () => {
                Audio.playTone(180, 'sawtooth', 0.22, 0.22, 900);
                setTimeout(() => Audio.playTone(920, 'sine', 0.34, 0.16, 380), 40);
            },
            plasma: () => Audio.playTone(140, 'square', 0.28, 0.22, 720),
            hit: () => Audio.playTone(210, 'triangle', 0.08, 0.16, 55),
            playerHit: () => {
                Audio.playTone(180, 'square', 0.14, 0.16, 80);
                setTimeout(() => Audio.playTone(120, 'triangle', 0.16, 0.11, 70), 30);
            },
            explode: () => Audio.playNoise(0.62, 0.55, 980),
            bigExplosion: (intensity = 1) => {
                const gain = Math.min(0.65, 0.36 + intensity * 0.09);
                const dur = 0.5 + intensity * 0.2;
                Audio.playNoise(dur, gain, 1200);
                Audio.playTone(220, 'sawtooth', 0.22 + intensity * 0.08, 0.14 + intensity * 0.05, 75);
                setTimeout(() => Audio.playTone(520, 'triangle', 0.26, 0.08 + intensity * 0.03, 180), 40);
            },
            powerup: () => {
                Audio.playTone(600, 'sine', 0.12, 0.12);
                setTimeout(() => Audio.playTone(900, 'sine', 0.15, 0.12), 80);
                setTimeout(() => Audio.playTone(1200, 'sine', 0.2, 0.12), 160);
            },
            overheat: () => {
                Audio.playTone(500, 'square', 0.1, 0.15, 200);
                setTimeout(() => Audio.playTone(400, 'square', 0.1, 0.15, 150), 100);
            },
            combo: (mult) => {
                const freq = 400 + (mult * 50);
                Audio.playTone(freq, 'sine', 0.1, 0.08);
            },
            enemyShot: () => Audio.playTone(240, 'square', 0.1, 0.1, 140),
            droneExplode: () => {
                Audio.playNoise(0.36, 0.34, 1320);
                Audio.playTone(280, 'triangle', 0.2, 0.14, 90);
            },
            shieldAbsorb: () => Audio.playTone(720, 'triangle', 0.11, 0.13, 420),
            utilityPickup: () => {
                Audio.playTone(700, 'sine', 0.1, 0.11);
                setTimeout(() => Audio.playTone(1050, 'triangle', 0.12, 0.1), 70);
            },
            overdriveStart: () => {
                Audio.playTone(300, 'sawtooth', 0.16, 0.14, 700);
                setTimeout(() => Audio.playTone(600, 'sine', 0.2, 0.11), 90);
            },
            uiClick: () => {
                Audio.playTone(640, 'triangle', 0.07, 0.11, 980);
                setTimeout(() => Audio.playTone(920, 'sine', 0.05, 0.08), 24);
            }
        }
    };

    // --- GAME OBJECTS ---
    class Entity {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.dead = false;
            this.scale = 1;
            this.alpha = 1;
            this.rot = 0;
        }
        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
        }
        draw(ctx) {}
    }

    class Particle extends Entity {
        constructor(x, y, def) {
            super(0, 0);
            this.reset(x, y, def);
        }
        reset(x, y, def = {}) {
            const speed = def.speed || 100;
            this.x = x;
            this.y = y;
            this.vx = (Math.random() - 0.5) * speed;
            this.vy = (Math.random() - 0.5) * speed;
            this.life = def.life || 1;
            this.maxLife = this.life;
            this.color = def.color || '#fff';
            this.size = def.size || 2;
            this.drag = def.drag || 0.95;
            this.mode = def.mode || 'normal';
            this.glow = !!def.glow;
            this.alpha = 1;
            this.dead = false;
            this.rot = 0;
            this.scale = 1;
        }
        update(dt) {
            super.update(dt);
            this.vx *= this.drag;
            this.vy *= this.drag;
            this.life -= dt;
            if(this.life <= 0) this.dead = true;
        }
        draw(ctx) {
            const alpha = (this.life / this.maxLife) * this.alpha;
            ctx.globalAlpha = alpha;
            const additive = this.mode === 'add';
            if(additive) ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();

            if(additive && this.glow && CONFIG.bloomEnabled && !state.lowQuality && this.size >= 2) {
                ctx.globalAlpha = alpha * 0.38;
                const gSize = this.size * 8;
                ctx.drawImage(Assets.glow, this.x - gSize / 2, this.y - gSize / 2, gSize, gSize);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    }

    class Player extends Entity {
        constructor(index) {
            const spawnX = state.width * (index === 0 ? 0.36 : 0.64);
            super(spawnX, state.height - 120);
            this.index = index;
            this.name = index === 0 ? 'P1' : 'P2';
            this.accent = index === 0 ? '#00f3ff' : '#ff5ef2';
            this.engineColorA = index === 0 ? '#00f3ff' : '#ff5ef2';
            this.engineColorB = index === 0 ? '#4d9eff' : '#ff9a66';
            this.sprite = index === 0 ? Assets.cache.player1 : Assets.cache.player2;
            this.w = 50;
            this.h = 50;
            this.weapon = index === 0 ? 'BLASTER' : 'LASER';
            this.heat = 0;
            this.overheated = false;
            this.tilt = 0;
            this.maxHp = 280;
            this.hp = this.maxHp;
            this.armor = 0.42;
            this.damageFlash = 0;
            this.alive = true;
            this.invuln = 1.6;
            this.respawnTimer = 0;
            this.lastShot = 0;
        }
        update(dt) {
            if(!this.alive) {
                this.respawnTimer -= dt;
                if(this.respawnTimer <= 0 && state.teamLives > 0) {
                    this.alive = true;
                    this.invuln = 2.2;
                    this.heat = 0;
                    this.overheated = false;
                    this.hp = this.maxHp;
                    this.damageFlash = 0;
                    this.vx = 0;
                    this.vy = 0;
                    this.x = state.width * (this.index === 0 ? 0.36 : 0.64);
                    this.y = state.height - 120;
                }
                return;
            }

            const speed = state.overdriveTimer > 0 ? 520 : 430;
            let tx = 0, ty = 0;
            const ctrl = this.index === 0 ? input.p1 : input.p2;
            
            if(ctrl.x) tx = ctrl.x * speed;
            if(ctrl.y) ty = ctrl.y * speed;

            this.vx += (tx - this.vx) * 10 * dt;
            this.vy += (ty - this.vy) * 10 * dt;
            
            super.update(dt);
            
            this.x = Math.max(30, Math.min(state.width-30, this.x));
            this.y = Math.max(30, Math.min(state.height-30, this.y));
            
            this.tilt = this.vx / speed * 0.3;

            // Heat management
            this.heat = Math.max(0, this.heat - (state.overdriveTimer > 0 ? 62 : 42) * dt);
            if(this.heat < 55) this.overheated = false;
            this.invuln = Math.max(0, this.invuln - dt);
            this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);

            // Shooting
            if(ctrl.fire && !this.overheated) {
                const wep = WEAPONS[this.weapon];
                const fireDelay = state.overdriveTimer > 0 ? wep.delay * 0.52 : wep.delay;
                if(state.t - this.lastShot > fireDelay) {
                    this.shoot();
                }
            }
            
            // Thruster particles
            const thrustChance = Math.abs(this.vy) > 10 ? 0.7 : 0.4;
            if(Math.random() < thrustChance) {
                const xOff = (Math.random() - 0.5) * 35;
                Entities.spawnParticle(this.x + xOff, this.y + 35, {
                    color: Math.random() > 0.5 ? this.engineColorA : this.engineColorB,
                    speed: 40,
                    size: Math.random()*4 + 1,
                    life: state.lowQuality ? 0.24 : 0.4,
                    mode: 'add',
                    drag: 0.88,
                    glow: !state.lowQuality
                });
            }
        }
        shoot() {
            this.lastShot = state.t;
            const wep = WEAPONS[this.weapon];
            this.heat += wep.heat * (state.overdriveTimer > 0 ? 0.58 : 1);
            state.shake += this.weapon === 'RAILGUN' ? 10 : (this.weapon === 'PLASMA' ? 8 : 4);
            
            if(this.heat >= 115) {
                this.overheated = true;
                Audio.sfx.overheat();
            }
            
            const muzzle = { x: this.x, y: this.y - 30 };
            
            // Muzzle flash
            const flashCount = Math.floor((state.lowQuality ? 0.55 : 1) * (state.overdriveTimer > 0 ? 16 : 10));
            for(let i=0; i<flashCount; i++) {
                Entities.spawnParticle(muzzle.x, muzzle.y, {
                    color: wep.color,
                    speed: 180,
                    size: Math.random() * 5 + 2,
                    life: state.lowQuality ? 0.14 : 0.24,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
            
            switch(this.weapon) {
                case 'BLASTER':
                    Entities.spawnBullet(muzzle.x - 7, muzzle.y, -80, -1320, 2.8, wep.color, 7);
                    Entities.spawnBullet(muzzle.x + 7, muzzle.y, 80, -1320, 2.8, wep.color, 7);
                    if(state.overdriveTimer > 0) {
                        Entities.spawnBullet(muzzle.x, muzzle.y - 5, 0, -1450, 3.4, wep.color, 8);
                    }
                    Audio.sfx.shoot();
                    break;
                    
                case 'SCATTER':
                    for(let i=-3; i<=3; i++) {
                        const angle = i * 0.12;
                        const vx = Math.sin(angle) * 1160;
                        const vy = -Math.cos(angle) * 1160;
                        Entities.spawnBullet(muzzle.x, muzzle.y, vx, vy, 1.8, wep.color, 5.4);
                    }
                    Audio.sfx.shoot();
                    break;
                    
                case 'PLASMA':
                    Entities.spawnBullet(muzzle.x, muzzle.y, 0, -860, 30, wep.color, 16, true);
                    Audio.sfx.plasma();
                    break;
                    
                case 'LASER':
                    Entities.spawnBullet(muzzle.x - 12, muzzle.y, 0, -1650, 1.9, wep.color, 4.6);
                    Entities.spawnBullet(muzzle.x + 12, muzzle.y, 0, -1650, 1.9, wep.color, 4.6);
                    if(state.overdriveTimer > 0) {
                        Entities.spawnBullet(muzzle.x, muzzle.y, 0, -1750, 2.6, wep.color, 5.6);
                    }
                    Audio.sfx.shootLaser();
                    break;
                    
                case 'MISSILES':
                    Entities.spawnMissile(muzzle.x - 14, muzzle.y, wep.color, 10);
                    Entities.spawnMissile(muzzle.x + 14, muzzle.y, wep.color, 10);
                    if(state.overdriveTimer > 0) {
                        Entities.spawnMissile(muzzle.x, muzzle.y - 6, wep.color, 12);
                    }
                    Audio.sfx.shootMissile();
                    break;
                    
                case 'RAILGUN':
                    Entities.spawnBullet(muzzle.x, muzzle.y, 0, -2200, 44, wep.color, 11, true, true);
                    // Recoil effect
                    this.vy += 100;
                    Audio.sfx.shootRailgun();
                    break;
            }
        }
        draw(ctx) {
            if(!this.alive) return;
            const flicker = this.invuln > 0 && Math.sin(state.t * 26) > 0.2;
            if(flicker) return;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.tilt);
            ctx.drawImage(this.sprite, -80, -80);

            if(this.damageFlash > 0) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = `rgba(255, 110, 130, ${Math.min(0.4, this.damageFlash * 0.35)})`;
                ctx.beginPath();
                ctx.arc(0, 0, 35, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();

            if(state.shield > 0 || this.invuln > 0) {
                const pulse = 0.55 + Math.sin(state.t * 8) * 0.22;
                ctx.globalCompositeOperation = 'lighter';
                const shieldAlpha = (state.shield > 0 ? 0.7 : 0.35) * pulse;
                const ringColor = this.index === 0 ? '106, 216, 255' : '255, 110, 231';
                ctx.strokeStyle = 'rgba(' + ringColor + ', ' + shieldAlpha.toFixed(3) + ')';
                ctx.lineWidth = 2.3;
                ctx.shadowBlur = 18;
                ctx.shadowColor = this.index === 0 ? '#6ad8ff' : '#ff68ea';
                ctx.beginPath();
                ctx.arc(this.x, this.y, 38 + Math.sin(state.t * 5) * 2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.globalCompositeOperation = 'source-over';
            }

            const hpPct = Math.max(0, this.hp / this.maxHp);
            const barW = 62;
            const barX = this.x - barW / 2;
            const barY = this.y + 44;
            ctx.fillStyle = 'rgba(7, 16, 34, 0.9)';
            ctx.fillRect(barX, barY, barW, 6);
            const hpColor = hpPct > 0.65 ? '#72ffb3' : hpPct > 0.35 ? '#ffd36a' : '#ff6868';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barW * hpPct, 6);
            ctx.strokeStyle = 'rgba(180, 240, 255, 0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, 6);
        }
    }

    class Bullet extends Entity {
        constructor(x, y, vx, vy, dmg, color, size=4, piercing=false, railgun=false) {
            super(0, 0);
            this.reset(x, y, vx, vy, dmg, color, size, piercing, railgun);
        }
        reset(x, y, vx, vy, dmg, color, size=4, piercing=false, railgun=false) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.damage = dmg;
            this.color = color;
            this.size = size;
            this.piercing = !!piercing;
            this.railgun = !!railgun;
            this.life = 2;
            this.dead = false;
            this.alpha = 1;
        }
        update(dt) {
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y < -50 || this.x < -50 || this.x > state.width+50) this.dead = true;
            
            // Enhanced trail
            const trailChance = state.lowQuality ? 0.32 : 0.58;
            if(Math.random() < trailChance) {
                Entities.spawnParticle(this.x, this.y, {
                    size: this.size * 0.72,
                    color: this.color,
                    life: state.lowQuality ? 0.18 : 0.28,
                    speed: 36,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
            
            // Railgun trail is extra thick
            if(this.railgun && Math.random() < (state.lowQuality ? 0.35 : 0.6)) {
                Entities.spawnParticle(this.x + (Math.random()-0.5)*15, this.y, {
                    size: this.size * 1.05,
                    color: this.color,
                    life: state.lowQuality ? 0.26 : 0.42,
                    speed: 10,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();

            const angle = Math.atan2(this.vy, this.vx);
            const trailLen = this.size * (this.railgun ? 10 : 7);
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size * 0.55;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - Math.cos(angle) * trailLen, this.y - Math.sin(angle) * trailLen);
            ctx.stroke();
            
            // Glow
            if(CONFIG.bloomEnabled && !state.lowQuality) {
                ctx.globalAlpha = 0.62;
                const gSize = this.size * 14;
                ctx.drawImage(Assets.glow, this.x - gSize / 2, this.y - gSize / 2, gSize, gSize);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class Missile extends Entity {
        constructor(x, y, color, damage = 10) {
            super(0, 0);
            this.reset(x, y, color, damage);
        }
        reset(x, y, color, damage = 10) {
            this.x = x;
            this.y = y;
            this.vx = (Math.random()-0.5) * 100;
            this.vy = -600;
            this.damage = damage;
            this.color = color;
            this.size = 6.5;
            this.target = null;
            this.life = 3;
            this.dead = false;
        }
        update(dt) {
            // Homing behavior
            if(!this.target || this.target.dead) {
                // Find nearest enemy
                let nearest = null;
                let minDist = 400;
                for(const e of Entities.enemies) {
                    if(e.dead) continue;
                    const dist = Math.hypot(e.x - this.x, e.y - this.y);
                    if(dist < minDist) {
                        minDist = dist;
                        nearest = e;
                    }
                }
                this.target = nearest;
            }
            
            if(this.target && !this.target.dead) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const angle = Math.atan2(dy, dx);
                const turnSpeed = 8;
                this.vx += Math.cos(angle) * turnSpeed * 100 * dt;
                this.vy += Math.sin(angle) * turnSpeed * 100 * dt;
                
                // Speed limit
                const speed = Math.hypot(this.vx, this.vy);
                if(speed > 920) {
                    this.vx = (this.vx / speed) * 920;
                    this.vy = (this.vy / speed) * 920;
                }
            }
            
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y < -50 || this.x < -50 || this.x > state.width+50) this.dead = true;
            
            // Smoke trail
            if(Math.random() < (state.lowQuality ? 0.35 : 0.55)) {
                Entities.spawnParticle(this.x, this.y, {
                    size: 4,
                    color: this.color,
                    life: state.lowQuality ? 0.34 : 0.62,
                    speed: 38,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.color;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI/2);
            ctx.fillRect(-3.2, -8.2, 6.4, 16.4);
            ctx.fillStyle = '#fff6b0';
            ctx.fillRect(-1.4, 8, 2.8, 6);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class EnemyBolt extends Entity {
        constructor(x, y, tx, ty, damage = 20, bulletScale = 1) {
            super(0, 0);
            this.reset(x, y, tx, ty, damage, bulletScale);
        }
        reset(x, y, tx, ty, damage = 20, bulletScale = 1) {
            this.x = x;
            this.y = y;
            const dx = tx - x;
            const dy = ty - y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const speed = (240 + Math.min(280, state.wave * 24)) * bulletScale;
            this.vx = (dx / len) * speed;
            this.vy = (dy / len) * speed;
            this.r = 5.2 + Math.min(3, (bulletScale - 1) * 3);
            this.damage = damage;
            this.life = 4;
            this.color = '#ff6077';
            this.dead = false;
        }
        update(dt) {
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y > state.height + 80 || this.x < -80 || this.x > state.width + 80) {
                this.dead = true;
            }
            if(Math.random() < (state.lowQuality ? 0.2 : 0.4)) {
                Entities.spawnParticle(this.x, this.y, {
                    size: 2.4,
                    color: '#ff6d88',
                    life: 0.22,
                    speed: 18,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class Drone extends Entity {
        constructor(x, y) {
            super(0, 0);
            this.reset(x, y);
        }
        reset(x, y) {
            this.x = x;
            this.y = y;
            const diff = state.difficulty || getDifficulty(state.wave);
            this.r = 22;
            this.w = 48;
            this.h = 26;
            this.hp = Math.max(8, Math.round((8 + Math.floor(state.wave * 0.7)) * diff.enemyHp));
            this.maxHp = this.hp;
            this.vx = (Math.random() > 0.5 ? 1 : -1) * (70 + Math.random() * 60) * diff.enemySpeed;
            this.vy = (30 + Math.random() * 28) * diff.enemySpeed;
            this.sway = Math.random() * Math.PI * 2;
            this.fireCd = (1.9 + Math.random() * 1.2) / diff.enemyFireRate;
            this.flash = 0;
            this.aiLead = diff.aiLead;
            this.shotDamage = 22 * diff.enemyDamage;
            this.bulletScale = diff.enemyBulletSpeed;
            this.dead = false;
        }
        update(dt) {
            this.sway += dt * 2.4;
            const target = Entities.closestAlivePlayer(this.x, this.y);
            if(target) {
                const leadTime = 0.18 + this.aiLead * 0.34;
                const projectedX = target.x + target.vx * leadTime;
                const steer = Math.max(-1, Math.min(1, (projectedX - this.x) / 200));
                this.vx += steer * (140 + state.wave * 6) * this.aiLead * dt;
                const maxStrafe = (160 + state.wave * 14) * (0.8 + this.aiLead);
                this.vx = Math.max(-maxStrafe, Math.min(maxStrafe, this.vx));
            }
            this.x += this.vx * dt;
            this.y += (this.vy + Math.sin(this.sway) * 30) * dt;

            if(this.x < this.r || this.x > state.width - this.r) {
                this.vx *= -1;
                this.x = Math.max(this.r, Math.min(state.width - this.r, this.x));
            }

            this.fireCd -= dt;
            if(this.fireCd <= 0 && !state.gameOver) {
                const p = Entities.closestAlivePlayer(this.x, this.y + 10);
                if(p) {
                    const leadTime = 0.2 + this.aiLead * 0.35;
                    const tx = p.x + p.vx * leadTime;
                    const ty = p.y + p.vy * leadTime;
                    Entities.spawnEnemyBolt(this.x, this.y + 10, tx, ty, this.shotDamage, this.bulletScale);
                    Audio.sfx.enemyShot();
                }
                const fireBase = Math.max(0.5, 1.8 - state.wave * 0.03) + Math.random() * 0.9;
                this.fireCd = fireBase / Math.max(0.8, (state.difficulty || getDifficulty(state.wave)).enemyFireRate);
            }

            this.flash = Math.max(0, this.flash - dt * 4);
            if(this.y > state.height + 100) this.dead = true;
        }
        takeDamage(amt) {
            this.hp -= amt;
            this.flash = 1;
            if(this.hp <= 0) {
                this.dead = true;
                state.comboTimer = 3.6;
                state.combo = Math.min(state.combo + 0.45, 14);
                state.maxCombo = Math.max(state.maxCombo, Math.floor(state.combo));
                state.kills++;
                state.score += 380 * state.combo;
                state.shake += 10;
                Audio.sfx.droneExplode();
                Entities.spawnExplosion(this.x, this.y, 1.45, ['#ff7f96', '#87d6ff', '#ffffff']);

                if(Math.random() < 0.38) {
                    const utility = Math.random();
                    const utilType = utility < 0.34 ? 'SHIELD' : utility < 0.68 ? 'COOLANT' : 'OVERDRIVE';
                    Entities.spawnPowerup(this.x, this.y, utilType, true);
                }
            } else {
                Audio.sfx.hit();
                state.shake += 0.8;
                for(let i=0; i<10; i++) {
                    Entities.spawnParticle(this.x, this.y, {
                        color: '#8fb7de',
                        size: 3.2,
                        speed: 160,
                        life: 0.5,
                        mode: 'add',
                        glow: !state.lowQuality
                    });
                }
            }
        }
        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);

            const glow = 0.35 + this.flash * 0.45;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(95, 205, 255, ${glow})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.w * 0.7, this.h * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.fillStyle = '#0d1d37';
            ctx.strokeStyle = '#7ecbff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-this.w * 0.56, 0);
            ctx.lineTo(-this.w * 0.16, -this.h * 0.5);
            ctx.lineTo(this.w * 0.16, -this.h * 0.5);
            ctx.lineTo(this.w * 0.56, 0);
            ctx.lineTo(this.w * 0.16, this.h * 0.5);
            ctx.lineTo(-this.w * 0.16, this.h * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#9fdfff';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();

            if(this.hp < this.maxHp) {
                const w = 36;
                const hpPct = Math.max(0, this.hp / this.maxHp);
                ctx.fillStyle = 'rgba(20, 35, 50, 0.8)';
                ctx.fillRect(-w / 2, -this.h - 10, w, 4);
                ctx.fillStyle = hpPct < 0.4 ? '#ff5d5d' : '#6fe8ff';
                ctx.fillRect(-w / 2, -this.h - 10, w * hpPct, 4);
            }

            ctx.restore();
        }
    }

    class Asteroid extends Entity {
        constructor(x, y, sizeClass, type = 'normal') {
            super(0, 0);
            this.reset(x, y, sizeClass, type);
        }
        reset(x, y, sizeClass, type = 'normal') {
            this.x = x;
            this.y = y;
            const diff = state.difficulty || getDifficulty(state.wave);
            this.sizeClass = sizeClass;
            this.type = type;
            this.r = sizeClass === 1 ? 15 : (sizeClass === 2 ? 32 : 55);
            const baseHp = sizeClass * (type === 'metal' ? 5 : (type === 'crystal' ? 3 : 2.6));
            this.hp = Math.max(2, Math.round(baseHp * diff.enemyHp));
            this.maxHp = this.hp;
            this.vx = ((Math.random()-0.5) * 60) * diff.enemySpeed;
            this.vy = (Math.random() * 70 + 45 + (state.wave * 16)) * diff.enemySpeed;
            this.rotSpeed = (Math.random()-0.5) * 2.5;
            const baseCollisionDamage = sizeClass === 1 ? 36 : (sizeClass === 2 ? 56 : 82);
            const typeBonus = type === 'metal' ? 1.24 : (type === 'crystal' ? 0.92 : 1);
            this.contactDamage = baseCollisionDamage * typeBonus * diff.enemyDamage;
            
            // Select appropriate sprite
            const sizePrefix = sizeClass === 1 ? 'asteroidSmall' : (sizeClass === 2 ? 'asteroidMed' : 'asteroidLarge');
            const typeSuffix = type === 'crystal' ? 'Crystal' : (type === 'metal' ? 'Metal' : '');
            this.img = Assets[sizePrefix + typeSuffix];
            this.dead = false;
        }
        update(dt) {
            super.update(dt);
            this.rot += this.rotSpeed * dt;
            if(this.y > state.height + 150) this.dead = true;
        }
        takeDamage(amt) {
            this.hp -= amt;
            
            if(this.hp <= 0) {
                this.dead = true;
                this.explode();
                
                // Combo system
                state.comboTimer = 3;
                state.combo = Math.min(state.combo + 0.25, 12);
                state.maxCombo = Math.max(state.maxCombo, Math.floor(state.combo));
                
                const points = this.sizeClass * 150 * state.combo;
                state.score += points;
                state.kills++;
                state.shake += this.sizeClass * 4;
                state.hitStop = this.sizeClass + 1;
                
                Audio.sfx.combo(state.combo);
                
                // Spawn powerup chance
                const chance = this.type === 'crystal' ? 0.2 : (this.type === 'metal' ? 0.16 : 0.09);
                if(Math.random() < chance) {
                    const forceUtility = Math.random() < (this.type === 'metal' ? 0.5 : 0.25);
                    Entities.spawnPowerup(this.x, this.y, null, forceUtility);
                }
            } else {
                Audio.sfx.hit();
                // Hit particles
                const color = this.type === 'crystal' ? '#9db4cc' : (this.type === 'metal' ? '#8a8680' : '#8a7a6a');
                for(let i=0; i<9; i++) {
                    Entities.spawnParticle(this.x, this.y, {
                        color: color,
                        size: 3.6,
                        speed: 130,
                        life: 0.62,
                        mode: 'add',
                        glow: !state.lowQuality
                    });
                }
            }
        }
        explode() {
            const colors = this.type === 'crystal' ? ['#9db4cc', '#7fa3cc', '#00f3ff', '#f2fdff'] :
                          this.type === 'metal' ? ['#8a8680', '#c3c0ba', '#fff4e0'] :
                          ['#ff8c00', '#ffaa00', '#ffd4a3'];
            const intensity = this.sizeClass === 1 ? 0.95 : (this.sizeClass === 2 ? 1.45 : 2.05);
            Entities.spawnExplosion(this.x, this.y, intensity, colors);
        }
        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            const offset = this.r * 3 / 2;
            
            // Damage indicator (red tint)
            if(this.hp < this.maxHp) {
                const dmgPercent = 1 - (this.hp / this.maxHp);
                ctx.globalAlpha = dmgPercent * 0.5;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(0, 0, this.r, 0, Math.PI*2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }
            
            ctx.drawImage(this.img, -offset, -offset);
            ctx.restore();
        }
    }

    class Powerup extends Entity {
        constructor(x, y, utilityType = null, forceUtility = false) {
            super(0, 0);
            this.reset(x, y, utilityType, forceUtility);
        }
        reset(x, y, utilityType = null, forceUtility = false) {
            this.x = x;
            this.y = y;
            this.vy = 80;
            this.r = 18;
            this.isUtility = false;

            const useUtility = forceUtility || Math.random() < 0.22;
            if(useUtility) {
                this.isUtility = true;
                const utilKeys = Object.keys(UTILITY_POWERUPS);
                this.type = utilityType || utilKeys[Math.floor(Math.random() * utilKeys.length)];
                this.color = UTILITY_POWERUPS[this.type].color;
                this.icon = UTILITY_POWERUPS[this.type].icon;
            } else {
                const weapons = Object.keys(WEAPONS);
                this.type = weapons[Math.floor(Math.random() * weapons.length)];
                this.color = WEAPONS[this.type].color;
                this.icon = WEAPONS[this.type].icon;
            }
            this.bobOffset = Math.random() * Math.PI * 2;
            this.dead = false;
        }
        update(dt) {
            super.update(dt);
            if(this.y > state.height + 50) this.dead = true;
        }
        draw(ctx) {
            const bob = Math.sin(state.t * 4 + this.bobOffset) * 3;
            
            ctx.save();
            ctx.translate(this.x, this.y + bob);
            ctx.rotate(state.t * 2);
            
            // Outer glow
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 25;
            ctx.shadowColor = this.color;
            
            // Box
            ctx.fillStyle = '#0a1020';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.rect(-14, -14, 28, 28);
            ctx.fill();
            ctx.stroke();
            
            // Icon
            ctx.shadowBlur = 0;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = this.color;
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.icon, 0, 1);
            
            ctx.restore();
            
            // Rotating particles
            if(Math.random() < (state.lowQuality ? 0.12 : 0.22)) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 25;
                Entities.spawnParticle(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist + bob,
                    {
                        color: this.color,
                        size: 2,
                        speed: 20,
                        life: 0.5,
                        mode: 'add',
                        glow: !state.lowQuality
                    }
                );
            }
        }
    }

    class Shockwave extends Entity {
        constructor(x, y, radius, life, color) {
            super(0, 0);
            this.reset(x, y, radius, life, color);
        }
        reset(x, y, radius, life, color) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.maxRadius = radius * 2.1;
            this.life = life;
            this.maxLife = life;
            this.color = color;
            this.dead = false;
        }
        update(dt) {
            this.life -= dt;
            const pct = Math.max(0, this.life / this.maxLife);
            this.radius += (this.maxRadius - this.radius) * (1 - pct) * dt * 7;
            if(this.life <= 0) this.dead = true;
        }
        draw(ctx) {
            const pct = Math.max(0, this.life / this.maxLife);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = pct * 0.85;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2 + (1 - pct) * 7;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = pct * 0.35;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class OverlayFlash {
        constructor(duration, color) {
            this.reset(duration, color);
        }
        reset(duration, color) {
            this.t = duration;
            this.color = color;
            this.dead = false;
        }
        update(dt) {
            this.t -= dt;
            if(this.t <= 0) this.dead = true;
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.color;
            ctx.fillRect(-20, -20, state.width + 40, state.height + 40);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // --- STARFIELD ---
    class Starfield {
        constructor() {
            this.stars = [];
            for(let i=0; i<100; i++) {
                this.stars.push({
                    x: Math.random() * state.width,
                    y: Math.random() * state.height,
                    z: Math.random() * 3,
                    size: Math.random() * 1.8 + 0.4
                });
            }
        }
        update(dt) {
            for(const star of this.stars) {
                star.y += (50 + star.z * 100) * dt;
                if(star.y > state.height) {
                    star.y = -10;
                    star.x = Math.random() * state.width;
                }
            }
        }
        draw(ctx) {
            for(const star of this.stars) {
                const alpha = 0.3 + (star.z / 3) * 0.6;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = star.z > 2 ? '#f4fbff' : '#b8e7ff';
                ctx.fillRect(star.x, star.y, star.size, star.size);
            }
            ctx.globalAlpha = 1;
        }
    }

    const RenderCache = {
        bg: null,
        vignette: null,
        build() {
            const w = state.width;
            const h = state.height;
            if(!w || !h) return;

            const bg = document.createElement('canvas');
            bg.width = w;
            bg.height = h;
            const bctx = bg.getContext('2d');

            const gradient = bctx.createLinearGradient(0, 0, w, h);
            gradient.addColorStop(0, '#040b1f');
            gradient.addColorStop(0.5, '#091633');
            gradient.addColorStop(1, '#040914');
            bctx.fillStyle = gradient;
            bctx.fillRect(0, 0, w, h);

            const nebulaA = bctx.createRadialGradient(w * 0.18, h * 0.28, 30, w * 0.18, h * 0.28, w * 0.6);
            nebulaA.addColorStop(0, 'rgba(255, 96, 190, 0.16)');
            nebulaA.addColorStop(0.7, 'rgba(81, 171, 255, 0.08)');
            nebulaA.addColorStop(1, 'rgba(0, 0, 0, 0)');
            bctx.fillStyle = nebulaA;
            bctx.fillRect(0, 0, w, h);

            const nebulaB = bctx.createRadialGradient(w * 0.78, h * 0.74, 20, w * 0.78, h * 0.74, w * 0.52);
            nebulaB.addColorStop(0, 'rgba(120, 254, 180, 0.11)');
            nebulaB.addColorStop(0.7, 'rgba(101, 106, 255, 0.08)');
            nebulaB.addColorStop(1, 'rgba(0, 0, 0, 0)');
            bctx.fillStyle = nebulaB;
            bctx.fillRect(0, 0, w, h);

            for(let i=0; i<160; i++) {
                const alpha = 0.08 + Math.random() * 0.25;
                const x = Math.random() * w;
                const y = Math.random() * h;
                const s = Math.random() * 1.8 + 0.3;
                bctx.fillStyle = `rgba(201, 233, 255, ${alpha.toFixed(3)})`;
                bctx.fillRect(x, y, s, s);
            }

            const vignette = document.createElement('canvas');
            vignette.width = w;
            vignette.height = h;
            const vctx = vignette.getContext('2d');
            const vg = vctx.createRadialGradient(w / 2, h / 2, h * 0.34, w / 2, h / 2, h * 0.75);
            vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vg.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
            vctx.fillStyle = vg;
            vctx.fillRect(0, 0, w, h);

            this.bg = bg;
            this.vignette = vignette;
        }
    };

    const Pools = {
        particle: createPool(() => new Particle(0, 0, {}), 2800),
        bullet: createPool(() => new Bullet(0, 0, 0, 0, 1, '#fff'), 1400),
        missile: createPool(() => new Missile(0, 0, '#fff', 1), 480),
        enemyBolt: createPool(() => new EnemyBolt(0, 0, 0, 0), 900),
        asteroid: createPool(() => new Asteroid(0, 0, 1, 'normal'), 520),
        drone: createPool(() => new Drone(0, 0), 140),
        powerup: createPool(() => new Powerup(0, 0), 180),
        shockwave: createPool(() => new Shockwave(0, 0, 10, 0.3, '#fff'), 180),
        overlay: createPool(() => new OverlayFlash(0.1, 'rgba(255,255,255,0.1)'), 64)
    };

    // --- GAME MANAGER ---
    const Entities = {
        players: [],
        bullets: [],
        enemyBullets: [],
        enemies: [],
        particles: [],
        spawns: [],
        overlays: [],
        shockwaves: [],
        starfield: null,

        releaseArray(list, pool) {
            for(const item of list) {
                pool.release(item);
            }
        },

        releaseBullets(list) {
            for(const bullet of list) {
                if(bullet instanceof Missile) {
                    Pools.missile.release(bullet);
                } else {
                    Pools.bullet.release(bullet);
                }
            }
        },
        
        clear(playerMode = state.playerMode) {
            this.releaseBullets(this.bullets);
            this.releaseArray(this.enemyBullets, Pools.enemyBolt);
            for(const enemy of this.enemies) {
                if(enemy instanceof Drone) {
                    Pools.drone.release(enemy);
                } else if(enemy instanceof Asteroid) {
                    Pools.asteroid.release(enemy);
                }
            }
            this.releaseArray(this.particles, Pools.particle);
            this.releaseArray(this.spawns, Pools.powerup);
            this.releaseArray(this.shockwaves, Pools.shockwave);
            this.releaseArray(this.overlays, Pools.overlay);

            this.players = [new Player(0)];
            if(playerMode === 2) {
                this.players.push(new Player(1));
            }
            this.bullets = [];
            this.enemyBullets = [];
            this.enemies = [];
            this.particles = [];
            this.spawns = [];
            this.overlays = [];
            this.shockwaves = [];
            this.starfield = new Starfield();
            RenderCache.build();
        },

        spawnParticle(x, y, def) {
            if(this.particles.length >= CONFIG.maxParticles) {
                return null;
            }
            const particle = Pools.particle.acquire();
            particle.reset(x, y, def);
            this.particles.push(particle);
            return particle;
        },

        spawnBullet(x, y, vx, vy, dmg, color, size=4, piercing=false, railgun=false) {
            if(this.bullets.length >= CONFIG.maxBullets) return null;
            const bullet = Pools.bullet.acquire();
            bullet.reset(x, y, vx, vy, dmg, color, size, piercing, railgun);
            this.bullets.push(bullet);
            return bullet;
        },

        spawnMissile(x, y, color, damage = 10) {
            if(this.bullets.length >= CONFIG.maxBullets) return null;
            const missile = Pools.missile.acquire();
            missile.reset(x, y, color, damage);
            this.bullets.push(missile);
            return missile;
        },

        spawnEnemyBolt(x, y, tx, ty, damage = 20, bulletScale = 1) {
            if(this.enemyBullets.length >= CONFIG.maxEnemyBullets) return null;
            const bolt = Pools.enemyBolt.acquire();
            bolt.reset(x, y, tx, ty, damage, bulletScale);
            this.enemyBullets.push(bolt);
            return bolt;
        },

        spawnAsteroid(x, y, sizeClass, type = 'normal') {
            if(this.enemies.length >= CONFIG.maxEnemies) return null;
            const asteroid = Pools.asteroid.acquire();
            asteroid.reset(x, y, sizeClass, type);
            this.enemies.push(asteroid);
            return asteroid;
        },

        spawnDrone(x, y) {
            if(this.enemies.length >= CONFIG.maxEnemies) return null;
            const drone = Pools.drone.acquire();
            drone.reset(x, y);
            this.enemies.push(drone);
            return drone;
        },

        spawnPowerup(x, y, utilityType = null, forceUtility = false) {
            const powerup = Pools.powerup.acquire();
            powerup.reset(x, y, utilityType, forceUtility);
            this.spawns.push(powerup);
            return powerup;
        },

        spawnShockwave(x, y, radius, life, color) {
            if(this.shockwaves.length >= CONFIG.maxShockwaves) return null;
            const shockwave = Pools.shockwave.acquire();
            shockwave.reset(x, y, radius, life, color);
            this.shockwaves.push(shockwave);
            return shockwave;
        },

        spawnOverlay(duration, color) {
            if(this.overlays.length >= CONFIG.maxOverlays) return null;
            const overlay = Pools.overlay.acquire();
            overlay.reset(duration, color);
            this.overlays.push(overlay);
            return overlay;
        },

        compact(list, pool) {
            let write = 0;
            for(let i=0; i<list.length; i++) {
                const item = list[i];
                if(item.dead) {
                    pool.release(item);
                } else {
                    list[write++] = item;
                }
            }
            list.length = write;
        },

        compactBullets() {
            let write = 0;
            for(let i=0; i<this.bullets.length; i++) {
                const bullet = this.bullets[i];
                if(bullet.dead) {
                    if(bullet instanceof Missile) {
                        Pools.missile.release(bullet);
                    } else {
                        Pools.bullet.release(bullet);
                    }
                } else {
                    this.bullets[write++] = bullet;
                }
            }
            this.bullets.length = write;
        },

        compactEnemies() {
            let write = 0;
            for(let i=0; i<this.enemies.length; i++) {
                const enemy = this.enemies[i];
                if(enemy.dead) {
                    if(enemy instanceof Drone) {
                        Pools.drone.release(enemy);
                    } else if(enemy instanceof Asteroid) {
                        Pools.asteroid.release(enemy);
                    }
                } else {
                    this.enemies[write++] = enemy;
                }
            }
            this.enemies.length = write;
        },

        alivePlayers() {
            return this.players.filter(p => p.alive);
        },

        closestAlivePlayer(x, y) {
            const alive = this.alivePlayers();
            if(alive.length === 0) return null;
            let best = alive[0];
            let bestDist = Infinity;
            for(const p of alive) {
                const d = Math.hypot(p.x - x, p.y - y);
                if(d < bestDist) {
                    bestDist = d;
                    best = p;
                }
            }
            return best;
        },

        spawnImpact(x, y, color = '#ffffff', scale = 1) {
            const count = Math.floor((state.lowQuality ? 0.55 : 1) * (8 + scale * 6));
            for(let i=0; i<count; i++) {
                this.spawnParticle(x, y, {
                    color: color,
                    size: Math.random() * 3.6 + 1.6 * scale,
                    speed: 110 + Math.random() * 140 * scale,
                    life: 0.28 + Math.random() * 0.25,
                    drag: 0.9,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
            if(scale > 1.1) {
                this.spawnShockwave(x, y, 12 * scale, 0.22 + scale * 0.05, 'rgba(255,255,255,0.9)');
            }
        },

        spawnExplosion(x, y, intensity = 1, palette = ['#ffd38a', '#ff8a52', '#ffffff']) {
            const quality = state.lowQuality ? 0.56 : 1;
            const burstCount = Math.floor((30 + intensity * 20) * quality);
            const debrisCount = Math.floor((18 + intensity * 18) * quality);
            for(let i=0; i<burstCount; i++) {
                this.spawnParticle(x, y, {
                    color: palette[Math.floor(Math.random() * palette.length)],
                    size: Math.random() * (4.2 + intensity * 2.8) + 2,
                    speed: 220 + Math.random() * (220 + intensity * 90),
                    life: 0.65 + Math.random() * 0.8 + intensity * 0.15,
                    drag: 0.9,
                    mode: 'add',
                    glow: !state.lowQuality
                });
            }
            for(let i=0; i<debrisCount; i++) {
                this.spawnParticle(x, y, {
                    color: palette[Math.floor(Math.random() * palette.length)],
                    size: Math.random() * 3.2 + 1.4,
                    speed: 160 + Math.random() * (180 + intensity * 80),
                    life: 0.75 + Math.random() * 0.9,
                    drag: 0.94
                });
            }
            this.spawnShockwave(x, y, 24 + intensity * 14, 0.35 + intensity * 0.11, 'rgba(255, 231, 180, 0.95)');
            this.spawnShockwave(x, y, 16 + intensity * 10, 0.25 + intensity * 0.08, 'rgba(140, 220, 255, 0.75)');
            this.spawnOverlay(0.1 + intensity * 0.07, `rgba(255, 190, 120, ${Math.min(0.26, 0.1 + intensity * 0.05).toFixed(3)})`);
            state.shake += 6 + intensity * 7;
            Audio.sfx.bigExplosion(intensity);
        },

        damagePlayer(player, rawDamage, hitX, hitY) {
            if(!player || !player.alive || player.invuln > 0 || state.gameOver) return;

            let incoming = rawDamage;
            if(state.shield > 0) {
                state.shield--;
                incoming *= 0.45;
                state.shake += 7;
                Audio.sfx.shieldAbsorb();
                this.spawnImpact(hitX, hitY, player.index === 0 ? '#87e3ff' : '#ff9af3', 1.35);
                player.invuln = 0.16;
                if(incoming < 10) return;
            }

            const reduced = Math.max(5, incoming * (1 - player.armor));
            player.hp -= reduced;
            player.damageFlash = 1;
            player.invuln = 0.28;
            state.shake += Math.min(9, 1.5 + reduced * 0.12);
            Audio.sfx.playerHit();
            this.spawnImpact(hitX, hitY, player.index === 0 ? '#74d9ff' : '#ff7ae9', 1.15);

            if(player.hp <= 0) {
                this.eliminatePlayer(player, hitX, hitY);
                return;
            }

            if(player.hp / player.maxHp < 0.25) {
                ui.status.innerText = player.name + ' HULL CRITICAL';
                ui.status.classList.add('alert');
            }
        },

        eliminatePlayer(player, hitX, hitY) {
            if(!player || !player.alive) return;

            state.teamLives = Math.max(0, state.teamLives - 1);
            player.alive = false;
            player.hp = 0;
            player.respawnTimer = 2.8;
            state.shake += 12;
            this.spawnExplosion(hitX, hitY, 1.9, player.index === 0
                ? ['#00f3ff', '#4da9ff', '#ffffff']
                : ['#ff5ef2', '#ff9bdc', '#ffffff']);
            Audio.sfx.explode();

            if(state.teamLives <= 0 && this.alivePlayers().length === 0) {
                state.gameOver = true;
                ui.finalScore.innerText = Math.floor(state.score);
                ui.finalKills.innerText = state.kills;
                ui.maxCombo.innerText = 'x' + state.maxCombo;
                ui.start.classList.add('hidden');
                ui.score.classList.add('hidden');
                ui.over.classList.remove('hidden');
                state.running = false;
            }
        },
        
        update(dt) {
            this.starfield.update(dt);
            this.players.forEach(p => p.update(dt));
            this.bullets.forEach(e => e.update(dt));
            this.enemyBullets.forEach(e => e.update(dt));
            this.enemies.forEach(e => e.update(dt));
            this.particles.forEach(e => e.update(dt));
            this.spawns.forEach(e => e.update(dt));
            this.shockwaves.forEach(e => e.update(dt));
            this.overlays.forEach(e => e.update(dt));
            
            // Combo decay
            if(state.comboTimer > 0) {
                state.comboTimer -= dt;
                if(state.comboTimer <= 0) {
                    state.combo = Math.max(1, state.combo - 1);
                }
            }
            
            // Collision: Bullet vs Enemy
            for(const b of this.bullets) {
                if(b.dead) continue;
                for(const e of this.enemies) {
                    if(e.dead) continue;
                    const dx = b.x - e.x, dy = b.y - e.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if(dist < e.r + b.size) {
                        this.spawnImpact(b.x, b.y, b.color, Math.max(0.8, b.size / 6));
                        if(b.damage >= 8) {
                            const splashRadius = b.size * 3.2;
                            for(const other of this.enemies) {
                                if(other.dead || other === e) continue;
                                const od = Math.hypot(other.x - b.x, other.y - b.y);
                                if(od < splashRadius + other.r) {
                                    other.takeDamage(b.damage * 0.28);
                                }
                            }
                            this.spawnShockwave(b.x, b.y, 10 + b.size * 0.8, 0.2, 'rgba(255, 236, 160, 0.9)');
                        }
                        e.takeDamage(b.damage);
                        if(!b.piercing) b.dead = true;
                        break;
                    }
                }
            }
            
            // Collision: Player vs Enemy
            for(const e of this.enemies) {
                if(e.dead) continue;
                for(const p of this.players) {
                    if(!p.alive) continue;
                    const dist = Math.hypot(p.x - e.x, p.y - e.y);
                    if(dist < 35 + e.r) {
                        e.dead = true;
                        this.damagePlayer(p, e.contactDamage || (32 + e.r * 0.72), p.x, p.y);
                        if(state.gameOver) return;
                        break;
                    }
                }
            }

            // Collision: Player vs Enemy Bullets
            for(const eb of this.enemyBullets) {
                if(eb.dead) continue;
                for(const p of this.players) {
                    if(!p.alive) continue;
                    if(Math.hypot(p.x - eb.x, p.y - eb.y) < 34 + eb.r) {
                        eb.dead = true;
                        this.damagePlayer(p, eb.damage || 22, eb.x, eb.y);
                        if(state.gameOver) return;
                        break;
                    }
                }
            }
            
            // Collision: Player vs Powerup
            for(const pup of this.spawns) {
                if(pup.dead) continue;
                for(const p of this.players) {
                    if(!p.alive) continue;
                    if(pup.dead) break;
                    if(Math.hypot(p.x - pup.x, p.y - pup.y) < 35) {
                        if(pup.isUtility) {
                            if(pup.type === 'SHIELD') {
                                state.shield = Math.min(8, state.shield + 2);
                                ui.status.innerText = "SHIELD BOOST +" + 2;
                            } else if(pup.type === 'COOLANT') {
                                for(const ally of this.players) {
                                    ally.heat = Math.max(0, ally.heat - 40);
                                }
                                ui.status.innerText = "TEAM COOLANT ACTIVE";
                            } else if(pup.type === 'OVERDRIVE') {
                                state.overdriveTimer = 12;
                                for(const ally of this.players) {
                                    ally.heat = Math.max(0, ally.heat - 20);
                                }
                                ui.status.innerText = "OVERDRIVE ONLINE";
                                Audio.sfx.overdriveStart();
                            }
                            Audio.sfx.utilityPickup();
                        } else {
                            p.weapon = pup.type;
                            const wep = WEAPONS[pup.type];
                            ui.weapon.innerText = wep.name;
                            ui.weaponIcon.innerText = wep.icon;
                            ui.weaponIcon.style.filter = `drop-shadow(0 0 8px ${wep.color})`;
                            Audio.sfx.powerup();
                            ui.status.innerText = p.name + " WEAPON: " + wep.name;
                        }

                        pup.dead = true;
                        setTimeout(() => ui.status.innerText = "READY", 2000);
                        const pickupColor = pup.color || '#ffffff';
                        for(let i=0; i<20; i++) {
                            this.spawnParticle(pup.x, pup.y, {
                                color: pickupColor,
                                size: 3,
                                speed: 150,
                                life: 0.8,
                                mode: 'add',
                                glow: !state.lowQuality
                            });
                        }
                    }
                }
            }

            // Cleanup
            this.compactBullets();
            this.compact(this.enemyBullets, Pools.enemyBolt);
            this.compactEnemies();
            this.compact(this.particles, Pools.particle);
            this.compact(this.spawns, Pools.powerup);
            this.compact(this.shockwaves, Pools.shockwave);
            this.compact(this.overlays, Pools.overlay);
        },

        draw(ctx) {
            if(this.starfield) {
                this.starfield.draw(ctx);
            }
            this.spawns.forEach(e => e.draw(ctx));
            this.enemies.forEach(e => e.draw(ctx));
            this.enemyBullets.forEach(e => e.draw(ctx));
            this.shockwaves.forEach(e => e.draw(ctx));
            this.players.forEach(p => p.draw(ctx));
            this.bullets.forEach(e => e.draw(ctx));
            this.particles.forEach(e => e.draw(ctx));
        }
    };

    // --- MAIN LOOP ---
    let lastTime = 0;
    let spawnTimer = 0;
    let droneSpawnTimer = 0;
    function updateHud() {
        ui.score.innerText = Math.floor(state.score);
        ui.kills.innerText = state.kills;
        ui.wave.innerText = state.wave;
        ui.combo.innerText = 'x' + state.combo.toFixed(1);
        ui.comboChip.classList.toggle('hot', state.combo >= 4);
        ui.shield.classList.toggle('active', state.shield > 0);

        const p1 = Entities.players[0];
        const p2 = Entities.players[1];
        const hull1 = p1 ? Math.floor((p1.hp / p1.maxHp) * 100) : 0;
        const hull2 = p2 ? Math.floor((p2.hp / p2.maxHp) * 100) : 0;
        ui.shield.innerText = state.playerMode === 2
            ? `S${state.shield} | L${state.teamLives} | H${hull1}%/${hull2}%`
            : `S${state.shield} | L${state.teamLives} | H${hull1}%`;

        const heat1 = p1 ? Math.floor(p1.heat) : 0;
        const heat2 = p2 ? Math.floor(p2.heat) : 0;
        const heatPercent = state.playerMode === 2 ? Math.floor((heat1 + heat2) / 2) : heat1;
        ui.heat.innerText = state.playerMode === 2
            ? `P1 ${heat1}% | P2 ${heat2}%`
            : `P1 ${heat1}%`;
        ui.heatBar.style.width = heatPercent + '%';

        const alivePlayers = Entities.alivePlayers();
        if(alivePlayers.length > 0) {
            if(state.playerMode === 2 && p1 && p2) {
                ui.weapon.innerText = `P1 ${WEAPONS[p1.weapon].icon} · P2 ${WEAPONS[p2.weapon].icon}`;
                ui.weaponIcon.innerText = alivePlayers.length === 2 ? '⚔' : '⚡';
                ui.weaponIcon.style.filter = alivePlayers.length === 2
                    ? 'drop-shadow(0 0 10px #9bffe4)'
                    : 'drop-shadow(0 0 8px #ff7ee9)';
            } else if(p1) {
                const wep = WEAPONS[p1.weapon];
                ui.weapon.innerText = wep.name;
                ui.weaponIcon.innerText = wep.icon;
                ui.weaponIcon.style.filter = `drop-shadow(0 0 8px ${wep.color})`;
            }
        }

        if((p1 && p1.overheated) || (p2 && p2.overheated)) {
            ui.heat.className = 'value critical';
            ui.heatBar.className = 'heat-bar critical';
        } else if(heatPercent > 70) {
            ui.heat.className = 'value warning';
            ui.heatBar.className = 'heat-bar warning';
        } else {
            ui.heat.className = 'value';
            ui.heatBar.className = 'heat-bar';
        }

        ui.status.classList.remove('overdrive', 'alert');
        const criticalHull = hull1 < 26 || (state.playerMode === 2 && hull2 < 26);
        if((Entities.alivePlayers().length <= 1 && state.teamLives <= 2) || criticalHull) {
            ui.status.innerText = "CRITICAL: LAST CHANCE";
            ui.status.classList.add('alert');
        } else if((p1 && p1.overheated) || (p2 && p2.overheated)) {
            ui.status.innerText = "WEAPON OVERHEATED";
            ui.status.classList.add('alert');
        } else if(state.overdriveTimer > 0) {
            ui.status.innerText = "OVERDRIVE " + state.overdriveTimer.toFixed(1) + "s";
            ui.status.classList.add('overdrive');
        } else {
            ui.status.innerText = state.difficulty ? state.difficulty.label : ("LEVEL " + state.wave + " ACTIVE");
        }
    }

    function updatePerf(dt) {
        state.fpsSampleTime += dt;
        state.fpsSampleFrames++;
        if(state.fpsSampleTime >= 0.5) {
            state.fps = state.fpsSampleFrames / state.fpsSampleTime;
            state.fpsSampleTime = 0;
            state.fpsSampleFrames = 0;

            if(!state.lowQuality && state.fps < 50) {
                state.lowQuality = true;
                CONFIG.bloomEnabled = false;
                CONFIG.renderScale = CONFIG.adaptiveRenderScale;
                resize();
            } else if(state.lowQuality && state.fps > 57) {
                state.lowQuality = false;
                CONFIG.bloomEnabled = BLOOM_ALLOWED;
                CONFIG.renderScale = 1.0;
                resize();
            }
        }
    }

    function updateDebugOverlay(dt) {
        if(!state.debugPerf || !ui.perfDebug) return;
        state.debugTicker += dt;
        if(state.debugTicker < 0.25) return;
        state.debugTicker = 0;
        ui.perfDebug.classList.remove('hidden');
        const enemies = Entities.enemies.length;
        const bullets = Entities.bullets.length;
        const enemyBullets = Entities.enemyBullets.length;
        const particles = Entities.particles.length;
        ui.perfDebug.innerText =
            `FPS ${state.fps.toFixed(1)}\\n` +
            `Q ${state.lowQuality ? 'LOW' : 'HIGH'}\\n` +
            `EN ${enemies}  BL ${bullets}\\n` +
            `EB ${enemyBullets}  PT ${particles}`;
    }

    function updateGame(dt) {
        state.t += dt;

        if(state.hitStop > 0) {
            state.hitStop--;
            return;
        }

        if(state.running && !state.gameOver) {
            state.wave = 1 + Math.floor(state.score / 2600);
            state.difficulty = getDifficulty(state.wave);
            const difficulty = state.difficulty;

            if(state.overdriveTimer > 0) {
                state.overdriveTimer = Math.max(0, state.overdriveTimer - dt);
            }

            spawnTimer += dt;
            const spawnRate = Math.max(0.28, difficulty.spawnInterval - state.score / 22000);
            if(spawnTimer > spawnRate) {
                spawnTimer = 0;

                const burstBase = 1 + Math.floor(Math.max(0, difficulty.density - 1) * 1.35);
                const extraChance = Math.max(0, difficulty.density - burstBase);
                const spawnCount = burstBase + (Math.random() < extraChance ? 1 : 0);

                for(let i=0; i<spawnCount; i++) {
                    const sizeRoll = Math.random();
                    const largeBias = Math.min(0.26, Math.max(0, state.wave - 2) * 0.03);
                    const mediumBias = Math.min(0.18, state.wave * 0.02);
                    const smallThreshold = Math.max(0.28, 0.58 - mediumBias - largeBias * 0.6);
                    const mediumThreshold = Math.max(smallThreshold + 0.12, 0.9 - largeBias);
                    const size = sizeRoll < smallThreshold ? 1 : (sizeRoll < mediumThreshold ? 2 : 3);

                    const typeRoll = Math.random();
                    const metalBoost = Math.min(0.22, Math.max(0, state.wave - 2) * 0.025);
                    const crystalBoost = Math.min(0.16, state.wave * 0.015);
                    let type = 'normal';
                    if(typeRoll > (0.78 - metalBoost)) {
                        type = 'metal';
                    } else if(typeRoll > (0.54 - crystalBoost)) {
                        type = 'crystal';
                    }
                    Entities.spawnAsteroid(Math.random() * state.width, -80 - Math.random() * 50, size, type);
                }
            }

            droneSpawnTimer += dt;
            const droneRate = Math.max(2.9, difficulty.droneInterval);
            if(droneSpawnTimer > droneRate && state.wave >= 2) {
                droneSpawnTimer = 0;
                if(Entities.enemies.filter(e => e instanceof Drone).length < difficulty.droneCap) {
                    const side = Math.random() < 0.5 ? -40 : state.width + 40;
                    const y = 90 + Math.random() * (state.height * 0.3);
                    Entities.spawnDrone(side, y);
                }
            }

            Entities.update(dt);
            updateHud();
        }
    }

    function loop(now) {
        requestAnimationFrame(loop);
        if(!lastTime) {
            lastTime = now;
            return;
        }

        const dt = Math.min(CONFIG.dtMax, (now - lastTime) / 1000);
        lastTime = now;

        state.accumulator += dt;
        let steps = 0;
        while(state.accumulator >= CONFIG.fixedStep && steps < CONFIG.maxSubSteps) {
            updateGame(CONFIG.fixedStep);
            state.accumulator -= CONFIG.fixedStep;
            steps++;
        }
        if(steps >= CONFIG.maxSubSteps) {
            state.accumulator = 0;
        }

        updatePerf(dt);
        updateDebugOverlay(dt);
        const liveDpr = Math.min(CONFIG.maxDpr, window.devicePixelRatio || 1);
        if(Math.abs(liveDpr - state.dpr) > 0.01) {
            resize();
        }
        render(dt);
    }

    // --- RENDERER ---
    function render(dt) {
        const scaleX = canvas.width / state.width;
        const scaleY = canvas.height / state.height;
        ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if(RenderCache.bg) {
            ctx.drawImage(RenderCache.bg, 0, 0, state.width, state.height);
        } else {
            ctx.fillStyle = '#050a16';
            ctx.fillRect(0, 0, state.width, state.height);
        }

        // Screen Shake
        ctx.save();
        if(state.shake > 0) {
            const s = state.shake;
            const dx = (Math.random()-0.5) * s;
            const dy = (Math.random()-0.5) * s;
            ctx.translate(dx, dy);
            state.shake = Math.max(0, state.shake - dt * 40);
        }

        Entities.draw(ctx);

        if(state.overdriveTimer > 0) {
            const p = 0.12 + Math.sin(state.t * 14) * 0.04;
            const og = ctx.createRadialGradient(
                state.width * 0.5, state.height * 0.72, 40,
                state.width * 0.5, state.height * 0.72, state.width * 0.65
            );
            og.addColorStop(0, `rgba(255, 164, 74, ${p.toFixed(3)})`);
            og.addColorStop(1, 'rgba(255, 164, 74, 0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = og;
            ctx.fillRect(0, 0, state.width, state.height);
            ctx.globalCompositeOperation = 'source-over';
        }

        if(state.combo >= 5) {
            const cAlpha = Math.min(0.06, (state.combo - 4) * 0.012);
            ctx.fillStyle = `rgba(255, 187, 73, ${cAlpha.toFixed(3)})`;
            ctx.fillRect(0, 0, state.width, state.height);
        }
        
        // Fullscreen flash overlays
        for(let i=0; i<Entities.overlays.length; i++) {
            Entities.overlays[i].draw(ctx);
        }
        
        if(RenderCache.vignette) {
            ctx.drawImage(RenderCache.vignette, 0, 0, state.width, state.height);
        }

        ctx.restore();
    }

    // --- INIT ---
    function postFrameHeight() {
        if(window.parent && window.parent !== window) {
            const frameHeight = Math.ceil(state.displayHeight + CONFIG.safeMargin * 2 + 8);
            window.parent.postMessage({ type: 'streamlit:setFrameHeight', height: frameHeight }, '*');
            window.parent.postMessage({ type: 'void-runner:set-frame-height', height: frameHeight }, '*');
        }
    }

    function resize() {
        state.width = CONFIG.baseWidth;
        state.height = CONFIG.baseHeight;

        const shellRect = shell.getBoundingClientRect();
        const availableWidth = Math.max(320, shellRect.width - CONFIG.safeMargin * 2);
        const availableHeight = Math.max(240, shellRect.height - CONFIG.safeMargin * 2);
        const scale = Math.min(availableWidth / state.width, availableHeight / state.height);

        state.viewportScale = Math.max(0.2, scale);
        state.displayWidth = Math.max(1, Math.floor(state.width * state.viewportScale));
        state.displayHeight = Math.max(1, Math.floor(state.height * state.viewportScale));

        viewport.style.width = state.displayWidth + 'px';
        viewport.style.height = state.displayHeight + 'px';

        state.dpr = Math.min(CONFIG.maxDpr, window.devicePixelRatio || 1);
        const backingScale = state.dpr * CONFIG.renderScale;
        canvas.width = Math.max(1, Math.round(state.width * backingScale));
        canvas.height = Math.max(1, Math.round(state.height * backingScale));
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        RenderCache.build();
        if(Entities.starfield) {
            Entities.starfield = new Starfield();
        }
        postFrameHeight();
    }

    function setPlayerMode(mode) {
        state.playerMode = mode === 2 ? 2 : 1;
        document.body.classList.toggle('single-player', state.playerMode === 1);
        if(ui.controlHint) {
            ui.controlHint.innerText = CONTROL_HINTS[state.playerMode];
        }
        ui.modeBtns.forEach(btn => {
            const buttonMode = Number(btn.dataset.mode || 1);
            btn.classList.toggle('active', buttonMode === state.playerMode);
        });
        refreshAxes();
    }

    function resetInput() {
        input.p1.left = false;
        input.p1.right = false;
        input.p1.up = false;
        input.p1.down = false;
        input.p1.fire = false;
        input.p1.x = 0;
        input.p1.y = 0;

        input.p2.left = false;
        input.p2.right = false;
        input.p2.up = false;
        input.p2.down = false;
        input.p2.fire = false;
        input.p2.x = 0;
        input.p2.y = 0;
    }

    function refreshAxes() {
        input.p1.x = (input.p1.right ? 1 : 0) - (input.p1.left ? 1 : 0);
        input.p1.y = (input.p1.down ? 1 : 0) - (input.p1.up ? 1 : 0);
        if(state.playerMode === 2) {
            input.p2.x = (input.p2.right ? 1 : 0) - (input.p2.left ? 1 : 0);
            input.p2.y = (input.p2.down ? 1 : 0) - (input.p2.up ? 1 : 0);
        } else {
            input.p2.x = 0;
            input.p2.y = 0;
            input.p2.fire = false;
        }
    }

    function setVolumeFromSlider() {
        const sliderVal = ui.volume ? Number(ui.volume.value) : Math.round(CONFIG.audioVolume * 100);
        const safeVal = clamp(sliderVal, 0, 100);
        Audio.setVolume(safeVal / 100);
        if(ui.volumeValue) {
            ui.volumeValue.innerText = safeVal + '%';
        }
    }

    function toggleAudio() {
        Audio.setMuted(!Audio.muted);
        const on = !Audio.muted;
        ui.audioBtn.querySelector('span').innerText = on ? "SOUND: ON" : "SOUND: OFF";
        ui.audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function startGame(mode = state.playerMode) {
        if(state.running && !state.gameOver) return;
        setPlayerMode(mode);
        Audio.init();
        Audio.ensureRunning();
        setVolumeFromSlider();
        Entities.clear(state.playerMode);
        resetInput();

        state.running = true;
        state.gameOver = false;
        state.score = 0;
        state.kills = 0;
        state.combo = 1;
        state.maxCombo = 1;
        state.comboTimer = 0;
        state.wave = 1;
        state.difficulty = getDifficulty(1);
        state.shield = state.playerMode === 2 ? 6 : 7;
        state.teamLives = state.playerMode === 2 ? 7 : 9;
        state.overdriveTimer = 0;
        state.accumulator = 0;
        lastTime = performance.now();
        spawnTimer = 0;
        droneSpawnTimer = 0;

        ui.start.classList.add('hidden');
        ui.over.classList.add('hidden');
        ui.score.classList.remove('hidden');
        ui.status.innerText = state.difficulty.label;
        ui.status.classList.remove('overdrive', 'alert');
        ui.kills.innerText = '0';
        ui.wave.innerText = '1';
        ui.combo.innerText = 'x1.0';
        ui.shield.innerText = state.playerMode === 2
            ? 'S' + state.shield + ' | L' + state.teamLives + ' | H100%/100%'
            : 'S' + state.shield + ' | L' + state.teamLives + ' | H100%';
        ui.shield.classList.add('active');
        ui.comboChip.classList.remove('hot');

        if(state.playerMode === 2) {
            ui.weapon.innerText = 'P1 ⚡ · P2 ═';
            ui.weaponIcon.innerText = '⚔';
            ui.weaponIcon.style.filter = 'drop-shadow(0 0 10px #9bffe4)';
            ui.heat.innerText = 'P1 0% | P2 0%';
        } else {
            ui.weapon.innerText = WEAPONS.BLASTER.name;
            ui.weaponIcon.innerText = WEAPONS.BLASTER.icon;
            ui.weaponIcon.style.filter = 'drop-shadow(0 0 8px #00f3ff)';
            ui.heat.innerText = 'P1 0%';
        }
        ui.heatBar.style.width = '0%';
    }

    function handleDeployAction() {
        startGame(state.playerMode);
    }

    const GAME_KEYS = new Set([
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'KeyW', 'KeyA', 'KeyS', 'KeyD',
        'Space', 'KeyF', 'Enter', 'Digit1', 'Digit2', 'Numpad1', 'Numpad2', 'KeyM', 'F3'
    ]);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('blur', resetInput);

    ui.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = Number(btn.dataset.mode || 1);
            setPlayerMode(mode);
            Audio.init();
            Audio.sfx.uiClick();
        });
    });

    if(ui.deployBtn) {
        ui.deployBtn.addEventListener('click', () => {
            Audio.init();
            Audio.sfx.uiClick();
            handleDeployAction();
        });
    }

    if(ui.audioBtn) {
        ui.audioBtn.addEventListener('click', () => {
            Audio.init();
            Audio.sfx.uiClick();
            toggleAudio();
        });
    }

    if(ui.volume) {
        ui.volume.addEventListener('input', () => {
            Audio.init();
            setVolumeFromSlider();
        });
    }

    window.addEventListener('keydown', e => {
        if(GAME_KEYS.has(e.code)) {
            e.preventDefault();
        }

        if(e.code === 'KeyM') {
            toggleAudio();
            return;
        }

        if(e.code === 'F3') {
            state.debugPerf = !state.debugPerf;
            if(!state.debugPerf) {
                ui.perfDebug.classList.add('hidden');
            }
            return;
        }

        if(!state.running) {
            if(e.code === 'Digit1' || e.code === 'Numpad1') {
                setPlayerMode(1);
            } else if(e.code === 'Digit2' || e.code === 'Numpad2') {
                setPlayerMode(2);
            } else if(e.code === 'Enter') {
                handleDeployAction();
            }
            return;
        }

        if(e.code === 'ArrowUp') input.p1.up = true;
        if(e.code === 'ArrowDown') input.p1.down = true;
        if(e.code === 'ArrowLeft') input.p1.left = true;
        if(e.code === 'ArrowRight') input.p1.right = true;
        if(e.code === 'Space') input.p1.fire = true;

        if(state.playerMode === 2) {
            if(e.code === 'KeyW') input.p2.up = true;
            if(e.code === 'KeyS') input.p2.down = true;
            if(e.code === 'KeyA') input.p2.left = true;
            if(e.code === 'KeyD') input.p2.right = true;
            if(e.code === 'KeyF') input.p2.fire = true;
        }

        refreshAxes();
    });

    window.addEventListener('keyup', e => {
        if(GAME_KEYS.has(e.code)) {
            e.preventDefault();
        }
        if(!state.running) return;

        if(e.code === 'ArrowUp') input.p1.up = false;
        if(e.code === 'ArrowDown') input.p1.down = false;
        if(e.code === 'ArrowLeft') input.p1.left = false;
        if(e.code === 'ArrowRight') input.p1.right = false;
        if(e.code === 'Space') input.p1.fire = false;

        if(state.playerMode === 2) {
            if(e.code === 'KeyW') input.p2.up = false;
            if(e.code === 'KeyS') input.p2.down = false;
            if(e.code === 'KeyA') input.p2.left = false;
            if(e.code === 'KeyD') input.p2.right = false;
            if(e.code === 'KeyF') input.p2.fire = false;
        }

        refreshAxes();
    });

    // Boot
    Assets.init();
    if(ui.volume) ui.volume.value = String(Math.round(CONFIG.audioVolume * 100));
    setVolumeFromSlider();
    setPlayerMode(1);
    Entities.clear(1);
    state.running = false;
    ui.score.classList.add('hidden');
    resize();
    requestAnimationFrame(loop);

})();
