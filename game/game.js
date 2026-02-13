(function () {
    // --- ENGINE CONSTANTS ---
    const CONFIG = {
        dtMax: 1 / 60,
        renderScale: 1.0,
        bloomStrength: 2.0,
        audioVolume: 0.7
    };

    // --- SETUP CANVAS ---
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
        audioBtn: document.getElementById('audioToggle')
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
        lastShot: 0
    };

    const input = {
        p1: {
            x: 0, y: 0,
            left: false, right: false, up: false, down: false,
            fire: false,
            mouse: { x: 0, y: 0, down: false, active: false }
        },
        p2: {
            x: 0, y: 0,
            left: false, right: false, up: false, down: false,
            fire: false
        }
    };

    // --- WEAPON DEFINITIONS ---
    const WEAPONS = {
        BLASTER: { 
            name: 'BLASTER MK-II', 
            icon: '⚡', 
            delay: 0.08, 
            heat: 6,
            color: '#00f3ff'
        },
        SCATTER: { 
            name: 'SCATTER CANNON', 
            icon: '✸', 
            delay: 0.15, 
            heat: 10,
            color: '#ffee00'
        },
        PLASMA: { 
            name: 'PLASMA DESTROYER', 
            icon: '◆', 
            delay: 0.4, 
            heat: 22,
            color: '#00ff88'
        },
        LASER: { 
            name: 'PULSE LASER', 
            icon: '═', 
            delay: 0.05, 
            heat: 4,
            color: '#ff2e97'
        },
        MISSILES: { 
            name: 'HOMING MISSILES', 
            icon: '⟿', 
            delay: 0.25, 
            heat: 15,
            color: '#ff8c00'
        },
        RAILGUN: { 
            name: 'RAILGUN SNIPER', 
            icon: '║', 
            delay: 0.6, 
            heat: 35,
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
        enabled: true,
        init() {
            const AC = window.AudioContext || window.webkitAudioContext;
            if(!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = CONFIG.audioVolume;
            this.master.connect(this.ctx.destination);
            
            this.delay = this.ctx.createDelay();
            this.delay.delayTime.value = 0.15;
            this.delayGain = this.ctx.createGain();
            this.delayGain.gain.value = 0.25;
            this.delay.connect(this.delayGain);
            this.delayGain.connect(this.master);
        },
        playTone(freq, type, dur, vol, slideTo = null) {
            if(!this.enabled || !this.ctx) return;
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
            if(!this.enabled || !this.ctx) return;
            const t = this.ctx.currentTime;
            const bufSize = this.ctx.sampleRate * dur;
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for(let i=0; i<bufSize; i++) data[i] = Math.random()*2-1;
            
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
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
        },
        sfx: {
            shoot: () => Audio.playTone(450, 'sawtooth', 0.08, 0.12, 120),
            shootLaser: () => Audio.playTone(600, 'sine', 0.05, 0.08, 300),
            shootMissile: () => Audio.playTone(300, 'square', 0.15, 0.12, 500),
            shootRailgun: () => {
                Audio.playTone(200, 'sawtooth', 0.15, 0.15, 800);
                setTimeout(() => Audio.playTone(900, 'sine', 0.3, 0.1, 400), 50);
            },
            plasma: () => Audio.playTone(150, 'square', 0.25, 0.18, 700),
            hit: () => Audio.playTone(220, 'triangle', 0.06, 0.12, 60),
            explode: () => Audio.playNoise(0.5, 0.45, 900),
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
                Audio.playNoise(0.28, 0.25, 1200);
                Audio.playTone(320, 'triangle', 0.14, 0.1, 110);
            },
            shieldAbsorb: () => Audio.playTone(720, 'triangle', 0.11, 0.13, 420),
            utilityPickup: () => {
                Audio.playTone(700, 'sine', 0.1, 0.11);
                setTimeout(() => Audio.playTone(1050, 'triangle', 0.12, 0.1), 70);
            },
            overdriveStart: () => {
                Audio.playTone(300, 'sawtooth', 0.16, 0.14, 700);
                setTimeout(() => Audio.playTone(600, 'sine', 0.2, 0.11), 90);
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
            super(x, y);
            this.vx = (Math.random()-0.5) * (def.speed||100);
            this.vy = (Math.random()-0.5) * (def.speed||100);
            this.life = def.life || 1;
            this.maxLife = this.life;
            this.color = def.color || '#fff';
            this.size = def.size || 2;
            this.drag = def.drag || 0.95;
            this.mode = def.mode || 'normal';
            this.glow = def.glow || false;
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
            if(this.mode === 'add') ctx.globalCompositeOperation = 'lighter';
            
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.glow ? 15 : 0;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            if(this.mode === 'add' && this.glow) {
                ctx.globalAlpha = alpha * 0.5;
                ctx.drawImage(Assets.glow, this.x - this.size*6, this.y - this.size*6, this.size*12, this.size*12);
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
            this.hp = 100;
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
                    this.vx = 0;
                    this.vy = 0;
                    this.x = state.width * (this.index === 0 ? 0.36 : 0.64);
                    this.y = state.height - 120;
                }
                return;
            }

            const speed = state.overdriveTimer > 0 ? 540 : 450;
            let tx = 0, ty = 0;
            const ctrl = this.index === 0 ? input.p1 : input.p2;
            
            if(ctrl.x) tx = ctrl.x * speed;
            else if(this.index === 0 && input.p1.mouse.active) {
                const dx = input.p1.mouse.x - this.x;
                if(Math.abs(dx) > 8) tx = Math.sign(dx) * speed;
            }
            
            if(ctrl.y) ty = ctrl.y * speed;
            else if(this.index === 0 && input.p1.mouse.active) {
                const dy = input.p1.mouse.y - this.y;
                if(Math.abs(dy) > 8) ty = Math.sign(dy) * speed;
            }

            this.vx += (tx - this.vx) * 10 * dt;
            this.vy += (ty - this.vy) * 10 * dt;
            
            super.update(dt);
            
            this.x = Math.max(30, Math.min(state.width-30, this.x));
            this.y = Math.max(30, Math.min(state.height-30, this.y));
            
            this.tilt = this.vx / speed * 0.3;

            // Heat management
            this.heat = Math.max(0, this.heat - (state.overdriveTimer > 0 ? 55 : 35)*dt);
            if(this.heat < 60) this.overheated = false;
            this.invuln = Math.max(0, this.invuln - dt);

            // Shooting
            if((ctrl.fire || (this.index === 0 && input.p1.mouse.down)) && !this.overheated) {
                const wep = WEAPONS[this.weapon];
                const fireDelay = state.overdriveTimer > 0 ? wep.delay * 0.55 : wep.delay;
                if(state.t - this.lastShot > fireDelay) {
                    this.shoot();
                }
            }
            
            // Thruster particles
            const thrustChance = Math.abs(this.vy) > 10 ? 0.7 : 0.4;
            if(Math.random() < thrustChance) {
                const xOff = (Math.random() - 0.5) * 35;
                Entities.particles.push(new Particle(this.x + xOff, this.y + 35, {
                    color: Math.random() > 0.5 ? this.engineColorA : this.engineColorB,
                    speed: 40,
                    size: Math.random()*4 + 1,
                    life: 0.4,
                    mode: 'add',
                    drag: 0.88,
                    glow: true
                }));
            }
        }
        shoot() {
            this.lastShot = state.t;
            const wep = WEAPONS[this.weapon];
            this.heat += wep.heat * (state.overdriveTimer > 0 ? 0.62 : 1);
            state.shake += this.weapon === 'RAILGUN' ? 8 : (this.weapon === 'PLASMA' ? 6 : 3);
            
            if(this.heat >= 100) {
                this.overheated = true;
                Audio.sfx.overheat();
            }
            
            const muzzle = { x: this.x, y: this.y - 30 };
            
            // Muzzle flash
            const flashCount = state.overdriveTimer > 0 ? 9 : 5;
            for(let i=0; i<flashCount; i++) {
                Entities.particles.push(new Particle(muzzle.x, muzzle.y, {
                    color: wep.color,
                    speed: 120,
                    size: Math.random()*3 + 1,
                    life: 0.2,
                    mode: 'add',
                    glow: true
                }));
            }
            
            switch(this.weapon) {
                case 'BLASTER':
                    Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, 0, -1100, 1, wep.color, 4));
                    if(state.overdriveTimer > 0) {
                        Entities.bullets.push(new Bullet(muzzle.x - 10, muzzle.y, -120, -1200, 0.8, wep.color, 3));
                        Entities.bullets.push(new Bullet(muzzle.x + 10, muzzle.y, 120, -1200, 0.8, wep.color, 3));
                    }
                    Audio.sfx.shoot();
                    break;
                    
                case 'SCATTER':
                    for(let i=-2; i<=2; i++) {
                        const angle = i * 0.15;
                        const vx = Math.sin(angle) * 1000;
                        const vy = -Math.cos(angle) * 1000;
                        Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, vx, vy, 0.8, wep.color, 3.5));
                    }
                    Audio.sfx.shoot();
                    break;
                    
                case 'PLASMA':
                    Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, 0, -750, 12, wep.color, 10, true));
                    Audio.sfx.plasma();
                    break;
                    
                case 'LASER':
                    Entities.bullets.push(new Bullet(muzzle.x - 8, muzzle.y, 0, -1400, 0.6, wep.color, 2.5));
                    Entities.bullets.push(new Bullet(muzzle.x + 8, muzzle.y, 0, -1400, 0.6, wep.color, 2.5));
                    Audio.sfx.shootLaser();
                    break;
                    
                case 'MISSILES':
                    Entities.bullets.push(new Missile(muzzle.x - 12, muzzle.y, wep.color));
                    Entities.bullets.push(new Missile(muzzle.x + 12, muzzle.y, wep.color));
                    Audio.sfx.shootMissile();
                    break;
                    
                case 'RAILGUN':
                    Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, 0, -2000, 25, wep.color, 6, true, true));
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
        }
    }

    class Bullet extends Entity {
        constructor(x, y, vx, vy, dmg, color, size=4, piercing=false, railgun=false) {
            super(x, y);
            this.vx = vx;
            this.vy = vy;
            this.damage = dmg;
            this.color = color;
            this.size = size;
            this.piercing = piercing;
            this.railgun = railgun;
            this.life = 2;
        }
        update(dt) {
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y < -50 || this.x < -50 || this.x > state.width+50) this.dead = true;
            
            // Enhanced trail
            if(Math.random() < 0.5) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    size: this.size * 0.6,
                    color: this.color,
                    life: 0.3,
                    speed: 20,
                    mode: 'add',
                    glow: true
                }));
            }
            
            // Railgun trail is extra thick
            if(this.railgun && Math.random() < 0.8) {
                Entities.particles.push(new Particle(this.x + (Math.random()-0.5)*15, this.y, {
                    size: this.size * 0.8,
                    color: this.color,
                    life: 0.4,
                    speed: 10,
                    mode: 'add',
                    glow: true
                }));
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Glow
            ctx.globalAlpha = 0.6;
            ctx.drawImage(Assets.glow, this.x-this.size*8, this.y-this.size*8, this.size*16, this.size*16);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class Missile extends Entity {
        constructor(x, y, color) {
            super(x, y);
            this.vx = (Math.random()-0.5) * 100;
            this.vy = -600;
            this.damage = 3;
            this.color = color;
            this.size = 4;
            this.target = null;
            this.life = 3;
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
                if(speed > 800) {
                    this.vx = (this.vx / speed) * 800;
                    this.vy = (this.vy / speed) * 800;
                }
            }
            
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y < -50 || this.x < -50 || this.x > state.width+50) this.dead = true;
            
            // Smoke trail
            if(Math.random() < 0.6) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    size: 3,
                    color: this.color,
                    life: 0.5,
                    speed: 30,
                    mode: 'add',
                    glow: true
                }));
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 12;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI/2);
            ctx.fillRect(-2, -6, 4, 12);
            ctx.restore();
            ctx.shadowBlur = 0;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class EnemyBolt extends Entity {
        constructor(x, y, tx, ty) {
            super(x, y);
            const dx = tx - x;
            const dy = ty - y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const speed = 220 + Math.min(220, state.wave * 20);
            this.vx = (dx / len) * speed;
            this.vy = (dy / len) * speed;
            this.r = 5;
            this.life = 4;
            this.color = '#ff6077';
        }
        update(dt) {
            super.update(dt);
            this.life -= dt;
            if(this.life <= 0 || this.y > state.height + 80 || this.x < -80 || this.x > state.width + 80) {
                this.dead = true;
            }
            if(Math.random() < 0.45) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    size: 2.4,
                    color: '#ff6d88',
                    life: 0.22,
                    speed: 18,
                    mode: 'add',
                    glow: true
                }));
            }
        }
        draw(ctx) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class Drone extends Entity {
        constructor(x, y) {
            super(x, y);
            this.r = 22;
            this.w = 48;
            this.h = 26;
            this.hp = 5 + Math.floor(state.wave * 0.45);
            this.maxHp = this.hp;
            this.vx = (Math.random() > 0.5 ? 1 : -1) * (70 + Math.random() * 60);
            this.vy = 28 + Math.random() * 24;
            this.sway = Math.random() * Math.PI * 2;
            this.fireCd = 1.6 + Math.random() * 1.2;
            this.flash = 0;
        }
        update(dt) {
            this.sway += dt * 2.4;
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
                    Entities.enemyBullets.push(new EnemyBolt(this.x, this.y + 10, p.x, p.y));
                    Audio.sfx.enemyShot();
                }
                this.fireCd = Math.max(1.05, 1.9 - state.wave * 0.03) + Math.random() * 1.0;
            }

            this.flash = Math.max(0, this.flash - dt * 4);
            if(this.y > state.height + 100) this.dead = true;
        }
        takeDamage(amt) {
            this.hp -= amt;
            this.flash = 1;
            if(this.hp <= 0) {
                this.dead = true;
                state.comboTimer = 3.2;
                state.combo = Math.min(state.combo + 0.35, 12);
                state.maxCombo = Math.max(state.maxCombo, Math.floor(state.combo));
                state.kills++;
                state.score += 240 * state.combo;
                state.shake += 8;
                Audio.sfx.droneExplode();

                if(Math.random() < 0.38) {
                    const utility = Math.random();
                    const utilType = utility < 0.34 ? 'SHIELD' : utility < 0.68 ? 'COOLANT' : 'OVERDRIVE';
                    Entities.spawns.push(new Powerup(this.x, this.y, utilType, true));
                }

                for(let i=0; i<24; i++) {
                    Entities.particles.push(new Particle(this.x, this.y, {
                        color: i % 2 ? '#ff7488' : '#9acaff',
                        size: Math.random() * 4 + 2,
                        speed: 260,
                        life: 0.9,
                        drag: 0.9,
                        mode: 'add',
                        glow: true
                    }));
                }
            } else {
                Audio.sfx.hit();
                for(let i=0; i<6; i++) {
                    Entities.particles.push(new Particle(this.x, this.y, {
                        color: '#8fb7de',
                        size: 2.5,
                        speed: 120,
                        life: 0.45
                    }));
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
            super(x, y);
            this.sizeClass = sizeClass;
            this.type = type;
            this.r = sizeClass === 1 ? 15 : (sizeClass === 2 ? 32 : 55);
            this.hp = sizeClass * (type === 'metal' ? 4 : 2);
            this.maxHp = this.hp;
            this.vx = (Math.random()-0.5) * 60;
            this.vy = Math.random() * 70 + 45 + (state.score * 0.045);
            this.rotSpeed = (Math.random()-0.5) * 2.5;
            
            // Select appropriate sprite
            const sizePrefix = sizeClass === 1 ? 'asteroidSmall' : (sizeClass === 2 ? 'asteroidMed' : 'asteroidLarge');
            const typeSuffix = type === 'crystal' ? 'Crystal' : (type === 'metal' ? 'Metal' : '');
            this.img = Assets[sizePrefix + typeSuffix];
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
                state.combo = Math.min(state.combo + 0.2, 10);
                state.maxCombo = Math.max(state.maxCombo, Math.floor(state.combo));
                
                const points = this.sizeClass * 100 * state.combo;
                state.score += points;
                state.kills++;
                state.shake += this.sizeClass * 3;
                state.hitStop = this.sizeClass + 1;
                
                Audio.sfx.combo(state.combo);
                
                // Spawn powerup chance
                const chance = this.type === 'crystal' ? 0.2 : (this.type === 'metal' ? 0.16 : 0.09);
                if(Math.random() < chance) {
                    const forceUtility = Math.random() < (this.type === 'metal' ? 0.5 : 0.25);
                    Entities.spawns.push(new Powerup(this.x, this.y, null, forceUtility));
                }
            } else {
                Audio.sfx.hit();
                // Hit particles
                const color = this.type === 'crystal' ? '#9db4cc' : (this.type === 'metal' ? '#8a8680' : '#8a7a6a');
                for(let i=0; i<4; i++) {
                    Entities.particles.push(new Particle(this.x, this.y, {
                        color: color,
                        size: 3,
                        speed: 80,
                        life: 0.6
                    }));
                }
            }
        }
        explode() {
            Audio.sfx.explode();
            const count = this.sizeClass * 12;
            const colors = this.type === 'crystal' ? ['#9db4cc', '#7fa3cc', '#00f3ff'] :
                          this.type === 'metal' ? ['#8a8680', '#aaa', '#fff'] :
                          ['#ff8c00', '#ffaa00', '#888'];
            
            for(let i=0; i<count; i++) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    color: colors[Math.floor(Math.random()*colors.length)],
                    size: Math.random()*5 + 2,
                    speed: 250,
                    life: 1,
                    drag: 0.9,
                    mode: 'add',
                    glow: true
                }));
            }
            
            // Shockwave particles
            for(let i=0; i<8; i++) {
                const angle = (i/8) * Math.PI * 2;
                Entities.particles.push(new Particle(this.x, this.y, {
                    color: '#fff',
                    size: 4,
                    speed: 300,
                    life: 0.5,
                    drag: 0.85,
                    mode: 'add',
                    glow: true
                }));
            }
            
            // Flash overlay
            Entities.overlays.push({t:0.12, color:'rgba(255,200,100,0.15)'});
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
            super(x, y);
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
            if(Math.random() < 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 25;
                Entities.particles.push(new Particle(
                    this.x + Math.cos(angle) * dist,
                    this.y + Math.sin(angle) * dist + bob,
                    {
                        color: this.color,
                        size: 2,
                        speed: 20,
                        life: 0.5,
                        mode: 'add',
                        glow: true
                    }
                ));
            }
        }
    }

    // --- STARFIELD ---
    class Starfield {
        constructor() {
            this.stars = [];
            for(let i=0; i<150; i++) {
                this.stars.push({
                    x: Math.random() * state.width,
                    y: Math.random() * state.height,
                    z: Math.random() * 3,
                    size: Math.random() * 2 + 0.5,
                    hue: Math.random() * 360
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
                const hue = (star.hue + state.t * (8 + star.z * 10)) % 360;
                ctx.fillStyle = `hsla(${hue.toFixed(1)}, 90%, 78%, 1)`;
                
                if(star.z > 2) {
                    // Bright stars get a glow
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = `hsla(${hue.toFixed(1)}, 95%, 80%, 1)`;
                }
                
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI*2);
                ctx.fill();
                
                ctx.globalCompositeOperation = 'source-over';
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1;
        }
    }

    // --- GAME MANAGER ---
    const Entities = {
        players: [],
        bullets: [],
        enemyBullets: [],
        enemies: [],
        particles: [],
        spawns: [],
        overlays: [],
        starfield: null,
        
        clear() {
            this.players = [new Player(0), new Player(1)];
            this.bullets = [];
            this.enemyBullets = [];
            this.enemies = [];
            this.particles = [];
            this.spawns = [];
            this.overlays = [];
            this.starfield = new Starfield();
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

        eliminatePlayer(player, hitX, hitY) {
            if(!player || !player.alive || player.invuln > 0) return;
            if(state.shield > 0) {
                state.shield--;
                state.shake += 8;
                Audio.sfx.shieldAbsorb();
                for(let i=0; i<18; i++) {
                    this.particles.push(new Particle(hitX, hitY, {
                        color: player.index === 0 ? '#6ad8ff' : '#ff82ef',
                        size: Math.random()*3 + 2,
                        speed: 230,
                        life: 0.48,
                        mode: 'add',
                        glow: true
                    }));
                }
                player.invuln = 1.2;
                return;
            }

            state.teamLives = Math.max(0, state.teamLives - 1);
            player.alive = false;
            player.respawnTimer = 2.8;
            state.shake += 12;
            Audio.sfx.explode();

            for(let i=0; i<36; i++) {
                this.particles.push(new Particle(hitX, hitY, {
                    color: player.index === 0 ? '#00f3ff' : '#ff63ec',
                    size: Math.random()*5 + 2,
                    speed: 270,
                    life: 1.0,
                    drag: 0.9,
                    mode: 'add',
                    glow: true
                }));
            }

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
                        this.eliminatePlayer(p, p.x, p.y);
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
                        this.eliminatePlayer(p, eb.x, eb.y);
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
                            this.particles.push(new Particle(pup.x, pup.y, {
                                color: pickupColor,
                                size: 3,
                                speed: 150,
                                life: 0.8,
                                mode: 'add',
                                glow: true
                            }));
                        }
                    }
                }
            }

            // Cleanup
            this.bullets = this.bullets.filter(e => !e.dead);
            this.enemyBullets = this.enemyBullets.filter(e => !e.dead);
            this.enemies = this.enemies.filter(e => !e.dead);
            this.particles = this.particles.filter(e => !e.dead);
            this.spawns = this.spawns.filter(e => !e.dead);
        },

        draw(ctx) {
            this.starfield.draw(ctx);
            this.spawns.forEach(e => e.draw(ctx));
            this.enemies.forEach(e => e.draw(ctx));
            this.enemyBullets.forEach(e => e.draw(ctx));
            this.players.forEach(p => p.draw(ctx));
            this.bullets.forEach(e => e.draw(ctx));
            this.particles.forEach(e => e.draw(ctx));
        }
    };

    // --- MAIN LOOP ---
    let lastTime = 0;
    let spawnTimer = 0;
    let droneSpawnTimer = 0;

    function loop(now) {
        requestAnimationFrame(loop);
        const dtMs = now - lastTime;
        lastTime = now;
        let dt = dtMs / 1000;
        if(dt > 0.1) dt = 0.1;

        state.t += dt;

        // Hit Stop
        if(state.hitStop > 0) {
            state.hitStop--;
            return;
        }

        if(state.running && !state.gameOver) {
            state.wave = 1 + Math.floor(state.score / 3000);
            if(state.overdriveTimer > 0) {
                state.overdriveTimer = Math.max(0, state.overdriveTimer - dt);
            }

            // Enemy spawning
            spawnTimer += dt;
            const spawnRate = Math.max(0.42, 1.55 - state.score/9000 - state.wave * 0.015);
            if(spawnTimer > spawnRate) {
                spawnTimer = 0;
                
                // Size distribution
                const r = Math.random();
                const size = r < 0.55 ? 1 : (r < 0.88 ? 2 : 3);
                
                // Type distribution
                const tr = Math.random();
                const eliteChance = Math.min(0.14, state.wave * 0.01);
                const type = tr < (0.6 - eliteChance) ? 'normal' : (tr < (0.8 - eliteChance * 0.4) ? 'crystal' : 'metal');
                
                Entities.enemies.push(new Asteroid(Math.random()*state.width, -80, size, type));
            }

            droneSpawnTimer += dt;
            const droneRate = Math.max(4.8, 9.5 - state.wave * 0.12);
            if(droneSpawnTimer > droneRate && state.score > 2800) {
                droneSpawnTimer = 0;
                if(Entities.enemies.filter(e => e instanceof Drone).length < 2) {
                    const side = Math.random() < 0.5 ? -40 : state.width + 40;
                    const y = 90 + Math.random() * (state.height * 0.3);
                    Entities.enemies.push(new Drone(side, y));
                }
            }

            Entities.update(dt);
            
            // Update UI
            ui.score.innerText = Math.floor(state.score);
            ui.kills.innerText = state.kills;
            ui.wave.innerText = state.wave;
            ui.combo.innerText = 'x' + state.combo.toFixed(1);
            ui.comboChip.classList.toggle('hot', state.combo >= 4);
            ui.shield.innerText = state.shield + ' | L' + state.teamLives;
            ui.shield.classList.toggle('active', state.shield > 0);
            
            const p1 = Entities.players[0];
            const p2 = Entities.players[1];
            const heat1 = p1 ? Math.floor(p1.heat) : 0;
            const heat2 = p2 ? Math.floor(p2.heat) : 0;
            const heatPercent = Math.floor((heat1 + heat2) / 2);
            ui.heat.innerText = `P1 ${heat1}% | P2 ${heat2}%`;
            ui.heatBar.style.width = heatPercent + '%';

            const alivePlayers = Entities.alivePlayers();
            if(alivePlayers.length > 0) {
                ui.weapon.innerText = `P1 ${WEAPONS[p1.weapon].icon} · P2 ${WEAPONS[p2.weapon].icon}`;
                ui.weaponIcon.innerText = alivePlayers.length === 2 ? '⚔' : '⚡';
                ui.weaponIcon.style.filter = alivePlayers.length === 2
                    ? 'drop-shadow(0 0 10px #9bffe4)'
                    : 'drop-shadow(0 0 8px #ff7ee9)';
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
            if(Entities.alivePlayers().length <= 1 && state.teamLives <= 2) {
                ui.status.innerText = "CRITICAL: LAST CHANCE";
                ui.status.classList.add('alert');
            } else if((p1 && p1.overheated) || (p2 && p2.overheated)) {
                ui.status.innerText = "WEAPON OVERHEATED";
                ui.status.classList.add('alert');
            } else if(state.overdriveTimer > 0) {
                ui.status.innerText = "OVERDRIVE " + state.overdriveTimer.toFixed(1) + "s";
                ui.status.classList.add('overdrive');
            } else {
                ui.status.innerText = "WAVE " + state.wave + " CLEARANCE";
            }
        }

        render(dt);
    }

    // --- RENDERER ---
    function render(dt) {
        // Clear
        const hue = (state.t * 18) % 360;
        const rainbowBg = ctx.createLinearGradient(0, 0, state.width, state.height);
        rainbowBg.addColorStop(0, `hsla(${hue.toFixed(1)}, 75%, 10%, 1)`);
        rainbowBg.addColorStop(0.33, `hsla(${((hue + 90) % 360).toFixed(1)}, 72%, 10%, 1)`);
        rainbowBg.addColorStop(0.66, `hsla(${((hue + 180) % 360).toFixed(1)}, 70%, 9%, 1)`);
        rainbowBg.addColorStop(1, `hsla(${((hue + 270) % 360).toFixed(1)}, 72%, 10%, 1)`);
        ctx.fillStyle = rainbowBg;
        ctx.fillRect(0, 0, state.width, state.height);

        const nebula = ctx.createRadialGradient(
            state.width * 0.2 + Math.sin(state.t * 0.5) * 80,
            state.height * 0.3,
            20,
            state.width * 0.2,
            state.height * 0.3,
            state.width * 0.65
        );
        nebula.addColorStop(0, `hsla(${((hue + 35) % 360).toFixed(1)}, 90%, 55%, 0.14)`);
        nebula.addColorStop(0.5, `hsla(${((hue + 165) % 360).toFixed(1)}, 88%, 52%, 0.09)`);
        nebula.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, state.width, state.height);

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
        for(let i=Entities.overlays.length-1; i>=0; i--) {
            const o = Entities.overlays[i];
            ctx.fillStyle = o.color;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillRect(-20, -20, state.width+40, state.height+40);
            ctx.globalCompositeOperation = 'source-over';
            o.t -= dt;
            if(o.t <= 0) Entities.overlays.splice(i, 1);
        }
        
        // Vignette
        const grad = ctx.createRadialGradient(
            state.width/2, state.height/2, state.height*0.35,
            state.width/2, state.height/2, state.height*0.75
        );
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = grad;
        ctx.fillRect(-20, -20, state.width+40, state.height+40);

        ctx.restore();
    }

    // --- INIT ---
    function resize() {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = state.width;
        canvas.height = state.height;
        if(Entities.starfield) {
            Entities.starfield = new Starfield();
        }
    }

    function startGame() {
        if(state.running) return;
        Audio.init();
        Entities.clear();
        state.running = true;
        state.gameOver = false;
        state.score = 0;
        state.kills = 0;
        state.combo = 1;
        state.maxCombo = 1;
        state.comboTimer = 0;
        state.wave = 1;
        state.shield = 4;
        state.teamLives = 6;
        state.overdriveTimer = 0;
        lastTime = performance.now();
        spawnTimer = 0;
        droneSpawnTimer = 0;
        
        ui.start.classList.add('hidden');
        ui.over.classList.add('hidden');
        ui.score.classList.remove('hidden');
        ui.status.innerText = "SYSTEMS ONLINE";
        ui.status.classList.remove('overdrive', 'alert');
        ui.kills.innerText = '0';
        ui.wave.innerText = '1';
        ui.combo.innerText = 'x1.0';
        ui.shield.innerText = '4 | L6';
        ui.shield.classList.add('active');
        ui.comboChip.classList.remove('hot');
        
        ui.weapon.innerText = 'P1 ⚡ · P2 ═';
        ui.weaponIcon.innerText = '⚔';
        ui.weaponIcon.style.filter = 'drop-shadow(0 0 10px #9bffe4)';
    }

    // Input
    window.addEventListener('resize', resize);

    function refreshAxes() {
        input.p1.x = (input.p1.right ? 1 : 0) - (input.p1.left ? 1 : 0);
        input.p1.y = (input.p1.down ? 1 : 0) - (input.p1.up ? 1 : 0);
        input.p2.x = (input.p2.right ? 1 : 0) - (input.p2.left ? 1 : 0);
        input.p2.y = (input.p2.down ? 1 : 0) - (input.p2.up ? 1 : 0);
    }
    
    window.addEventListener('keydown', e => {
        if(e.code === 'KeyW') input.p1.up = true;
        if(e.code === 'KeyS') input.p1.down = true;
        if(e.code === 'KeyA') input.p1.left = true;
        if(e.code === 'KeyD') input.p1.right = true;
        if(e.code === 'Space') { input.p1.fire = true; e.preventDefault(); }

        if(e.code === 'ArrowUp') input.p2.up = true;
        if(e.code === 'ArrowDown') input.p2.down = true;
        if(e.code === 'ArrowLeft') input.p2.left = true;
        if(e.code === 'ArrowRight') input.p2.right = true;
        if(e.code === 'Enter' || e.code === 'Numpad0' || e.code === 'Slash') input.p2.fire = true;

        refreshAxes();
        if(!state.running) startGame();
    });
    
    window.addEventListener('keyup', e => {
        if(e.code === 'KeyW') input.p1.up = false;
        if(e.code === 'KeyS') input.p1.down = false;
        if(e.code === 'KeyA') input.p1.left = false;
        if(e.code === 'KeyD') input.p1.right = false;
        if(e.code === 'Space') input.p1.fire = false;

        if(e.code === 'ArrowUp') input.p2.up = false;
        if(e.code === 'ArrowDown') input.p2.down = false;
        if(e.code === 'ArrowLeft') input.p2.left = false;
        if(e.code === 'ArrowRight') input.p2.right = false;
        if(e.code === 'Enter' || e.code === 'Numpad0' || e.code === 'Slash') input.p2.fire = false;

        refreshAxes();
    });
    
    const updatePointer = (e) => {
        input.p1.mouse.x = e.clientX;
        input.p1.mouse.y = e.clientY;
        input.p1.mouse.active = true;
    };
    
    canvas.addEventListener('pointerdown', e => {
        updatePointer(e);
        input.p1.mouse.down = true;
        if(!state.running) startGame();
    });
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerup', () => input.p1.mouse.down = false);
    canvas.addEventListener('pointerleave', () => {
        input.p1.mouse.active = false;
        input.p1.mouse.down = false;
    });

    ui.audioBtn.addEventListener('click', () => {
        Audio.enabled = !Audio.enabled;
        ui.audioBtn.querySelector('span').innerText = Audio.enabled ? "SOUND: ON" : "SOUND: OFF";
        ui.audioBtn.setAttribute('aria-pressed', Audio.enabled);
    });

    // Boot
    Assets.init();
    resize();
    requestAnimationFrame(loop);

})();
