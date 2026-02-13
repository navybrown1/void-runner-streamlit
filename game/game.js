(function () {
    // --- ENGINE CONSTANTS ---
    const CONFIG = {
        dtMax: 1 / 60,
        renderScale: 1.0, // Set to 2.0 for Retina crispness if performance allows
        bloomStrength: 1.5,
        audioVolume: 0.6
    };

    // --- SETUP CANVAS ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    
    // UI Elements
    const ui = {
        score: document.getElementById('scoreDisplay'),
        weapon: document.getElementById('weaponDisplay'),
        heat: document.getElementById('heatDisplay'),
        status: document.getElementById('statusText'),
        start: document.getElementById('startScreen'),
        over: document.getElementById('gameOverScreen'),
        finalScore: document.getElementById('finalScore'),
        finalKills: document.getElementById('finalKills'),
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
        camera: { x: 0, y: 0, zoom: 1 }
    };

    const input = { x: 0, y: 0, fire: false, mouse: { x: 0, y: 0 } };

    // --- ASSET GENERATOR (Procedural Graphics) ---
    const Assets = {
        cache: {},
        createCanvas(w, h) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            return { c, ctx: c.getContext('2d') };
        },
        genPlayer() {
            const { c, ctx } = this.createCanvas(128, 128);
            const cx = 64, cy = 64;
            
            // Engine Glow
            const g = ctx.createRadialGradient(cx, cy+40, 5, cx, cy+40, 30);
            g.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g; ctx.fillRect(0,0,128,128);

            // Hull
            ctx.shadowBlur = 15; ctx.shadowColor = '#00ccff';
            ctx.fillStyle = '#0a1525'; ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx, cy-40);
            ctx.lineTo(cx+25, cy+30);
            ctx.lineTo(cx, cy+15);
            ctx.lineTo(cx-25, cy+30);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Cockpit
            ctx.fillStyle = '#ccffff'; ctx.shadowBlur = 5;
            ctx.beginPath(); ctx.ellipse(cx, cy-5, 6, 12, 0, 0, Math.PI*2); ctx.fill();
            
            // Details
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx-10, cy+10); ctx.lineTo(cx-20, cy+25); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx+10, cy+10); ctx.lineTo(cx+20, cy+25); ctx.stroke();

            this.cache.player = c;
        },
        genAsteroid(size, seed) {
            const dim = size * 2.5;
            const { c, ctx } = this.createCanvas(dim, dim);
            const cx = dim/2, cy = dim/2;
            
            // Rock texture gradient
            const grad = ctx.createRadialGradient(cx-size*0.3, cy-size*0.3, size*0.1, cx, cy, size);
            grad.addColorStop(0, '#756c66');
            grad.addColorStop(0.5, '#3d3632');
            grad.addColorStop(1, '#1a1614');

            ctx.fillStyle = grad;
            ctx.shadowBlur = 20; ctx.shadowColor = 'black'; // heavy shadow for depth

            // Procedural polygon
            ctx.beginPath();
            const vertices = 12;
            for(let i=0; i<=vertices; i++) {
                const angle = (i/vertices) * Math.PI*2;
                const r = size * (0.8 + Math.sin(angle*seed + seed)*0.2 + Math.random()*0.1);
                const px = cx + Math.cos(angle)*r;
                const py = cy + Math.sin(angle)*r;
                if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            
            // Cracks/Craters
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            for(let i=0; i<3; i++) {
                ctx.beginPath();
                ctx.arc(cx + (Math.random()-0.5)*size, cy + (Math.random()-0.5)*size, size*0.2, 0, Math.PI*2);
                ctx.fill();
            }
            // Highlight Rim
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
            ctx.stroke();

            return c;
        },
        init() {
            this.genPlayer();
            this.asteroidSmall = this.genAsteroid(15, 5);
            this.asteroidMed = this.genAsteroid(30, 12);
            this.asteroidLarge = this.genAsteroid(50, 99);
            this.glow = this.genGlow();
        },
        genGlow() {
            const { c, ctx } = this.createCanvas(64, 64);
            const g = ctx.createRadialGradient(32,32,2,32,32,32);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
            return c;
        }
    };

    // --- AUDIO ENGINE (Synthesizer) ---
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
            
            // Reverb Convolver (Simulated)
            this.reverb = this.ctx.createConvolver();
            // In a real app we'd load an impulse response, here we skip or generate noise
            // Skipping complex reverb for inline code size, using delay instead
            this.delay = this.ctx.createDelay();
            this.delay.delayTime.value = 0.2;
            this.delayGain = this.ctx.createGain();
            this.delayGain.gain.value = 0.3;
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
            gain.connect(this.delay); // Echo
            
            osc.start(); osc.stop(t+dur+0.1);
        },
        playNoise(dur, vol) {
            if(!this.enabled || !this.ctx) return;
            const t = this.ctx.currentTime;
            const bufSize = this.ctx.sampleRate * dur;
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for(let i=0; i<bufSize; i++) data[i] = Math.random()*2-1;
            
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const gain = this.ctx.createGain();
            
            // Lowpass filter for explosion "thud"
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(800, t);
            filter.frequency.linearRampToValueAtTime(100, t+dur);
            
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t+dur);
            
            src.connect(filter); filter.connect(gain); gain.connect(this.master);
            src.start();
        },
        sfx: {
            shoot: () => Audio.playTone(400, 'sawtooth', 0.1, 0.1, 100),
            plasma: () => Audio.playTone(150, 'square', 0.2, 0.15, 600),
            hit: () => Audio.playTone(200, 'triangle', 0.05, 0.1, 50),
            explode: () => Audio.playNoise(0.4, 0.4),
            powerup: () => {
                Audio.playTone(600, 'sine', 0.1, 0.1); 
                setTimeout(() => Audio.playTone(900, 'sine', 0.2, 0.1), 100);
            }
        }
    };

    // --- GAME OBJECTS ---
    class Entity {
        constructor(x, y) {
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
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
            this.mode = def.mode || 'normal'; // 'add' for glow
        }
        update(dt) {
            super.update(dt);
            this.vx *= this.drag; this.vy *= this.drag;
            this.life -= dt;
            if(this.life <= 0) this.dead = true;
        }
        draw(ctx) {
            ctx.globalAlpha = (this.life / this.maxLife) * this.alpha;
            if(this.mode === 'add') ctx.globalCompositeOperation = 'lighter';
            
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
            ctx.fill();
            
            // Bloom
            if(this.mode === 'add') {
                ctx.drawImage(Assets.glow, this.x - this.size*4, this.y - this.size*4, this.size*8, this.size*8);
            }
            
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    }

    class Player extends Entity {
        constructor() {
            super(state.width/2, state.height - 100);
            this.w = 40; this.h = 40;
            this.weapon = 'BLASTER';
            this.heat = 0;
            this.overheated = false;
            this.tilt = 0;
            this.hp = 100;
        }
        update(dt) {
            // Physics
            const speed = 400;
            let tx = 0, ty = 0;
            
            if(input.x) tx = input.x * speed;
            else if(input.mouse.active) {
                const dx = input.mouse.x - this.x;
                if(Math.abs(dx) > 5) tx = Math.sign(dx) * speed;
            }
            
            if(input.y) ty = input.y * speed;
            else if(input.mouse.active) {
                const dy = input.mouse.y - this.y;
                if(Math.abs(dy) > 5) ty = Math.sign(dy) * speed;
            }

            this.vx += (tx - this.vx) * 8 * dt;
            this.vy += (ty - this.vy) * 8 * dt;
            
            super.update(dt);
            
            // Boundary
            this.x = Math.max(20, Math.min(state.width-20, this.x));
            this.y = Math.max(20, Math.min(state.height-20, this.y));
            
            // Tilt
            this.tilt = this.vx / speed * 0.4;

            // Weapons
            this.heat = Math.max(0, this.heat - 30*dt);
            if(this.heat < 50) this.overheated = false;

            if((input.fire || input.mouse.down) && !this.overheated) {
                if(state.t - state.lastShot > this.getWeaponDelay()) {
                    this.shoot();
                }
            }
            
            // Thruster Particles
            if(Math.random() < 0.5) {
                Entities.particles.push(new Particle(this.x + (Math.random()-0.5)*10, this.y + 25, {
                    color: '#00ffff', speed: 50, size: Math.random()*3, life: 0.3, mode: 'add', drag: 0.9
                }));
            }
        }
        getWeaponDelay() {
            return this.weapon === 'SCATTER' ? 0.15 : (this.weapon === 'PLASMA' ? 0.4 : 0.08);
        }
        shoot() {
            state.lastShot = state.t;
            this.heat += this.weapon === 'PLASMA' ? 25 : 8;
            state.shake += this.weapon === 'PLASMA' ? 5 : 2;
            
            if(this.heat >= 100) { this.overheated = true; Audio.sfx.powerup(); } // Reuse sound for alert
            
            const muzzle = { x: this.x, y: this.y - 20 };
            
            if(this.weapon === 'BLASTER') {
                Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, 0, -1000, 1, '#00ffff'));
                Audio.sfx.shoot();
            } else if(this.weapon === 'SCATTER') {
                for(let i=-2; i<=2; i++) {
                    Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, i*150 + this.vx*0.2, -900, 0.8, '#ffff00'));
                }
                Audio.sfx.shoot();
            } else if(this.weapon === 'PLASMA') {
                Entities.bullets.push(new Bullet(muzzle.x, muzzle.y, 0, -700, 10, '#00ff00', 8));
                Audio.sfx.plasma();
            }
        }
        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.tilt);
            // Draw Player Sprite
            ctx.drawImage(Assets.cache.player, -64, -64);
            ctx.restore();
        }
    }

    class Bullet extends Entity {
        constructor(x, y, vx, vy, dmg, color, size=3) {
            super(x, y);
            this.vx = vx; this.vy = vy;
            this.damage = dmg;
            this.color = color;
            this.size = size;
        }
        update(dt) {
            super.update(dt);
            if(this.y < -50 || this.x < -50 || this.x > state.width+50) this.dead = true;
            
            // Trail
            if(Math.random() < 0.3) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    size: this.size/2, color: this.color, life: 0.2, speed: 10, mode: 'add'
                }));
            }
        }
        draw(ctx) {
            ctx.shadowBlur = 10; ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            
            // Glow sprite
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(Assets.glow, this.x-this.size*6, this.y-this.size*6, this.size*12, this.size*12);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    class Asteroid extends Entity {
        constructor(x, y, sizeClass) {
            super(x, y);
            this.sizeClass = sizeClass; // 1=small, 2=med, 3=large
            this.r = sizeClass === 1 ? 15 : (sizeClass === 2 ? 30 : 50);
            this.hp = sizeClass * 3;
            this.maxHp = this.hp;
            this.vx = (Math.random()-0.5) * 50;
            this.vy = Math.random() * 100 + 50 + (state.score*0.05);
            this.rotSpeed = (Math.random()-0.5) * 2;
            
            this.img = sizeClass === 1 ? Assets.asteroidSmall : (sizeClass === 2 ? Assets.asteroidMed : Assets.asteroidLarge);
        }
        update(dt) {
            super.update(dt);
            this.rot += this.rotSpeed * dt;
            if(this.y > state.height + 100) this.dead = true;
        }
        takeDamage(amt) {
            this.hp -= amt;
            if(this.hp <= 0) {
                this.dead = true;
                this.explode();
                state.score += this.sizeClass * 100;
                state.kills++;
                state.shake += this.sizeClass * 2;
                state.hitStop = 3; // Freeze frame
                if(Math.random() < 0.1) Entities.spawns.push(new Powerup(this.x, this.y));
            } else {
                Audio.sfx.hit();
                // Debris
                for(let i=0; i<3; i++) Entities.particles.push(new Particle(this.x, this.y, { color: '#aaa', size: 2, speed: 50, life: 0.5 }));
            }
        }
        explode() {
            Audio.sfx.explode();
            const count = this.sizeClass * 8;
            for(let i=0; i<count; i++) {
                Entities.particles.push(new Particle(this.x, this.y, {
                    color: Math.random()>0.5 ? '#ffaa00' : '#888',
                    size: Math.random()*4 + 2,
                    speed: 200,
                    life: 0.8,
                    drag: 0.92,
                    mode: 'add'
                }));
            }
            // Flash
            Entities.overlays.push({t:0.1, color:'rgba(255,200,100,0.1)'});
        }
        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rot);
            const offset = this.r * 2.5 / 2;
            ctx.drawImage(this.img, -offset, -offset);
            ctx.restore();
        }
    }

    class Powerup extends Entity {
        constructor(x, y) {
            super(x, y);
            this.vy = 50;
            this.r = 15;
            const r = Math.random();
            this.type = r < 0.33 ? 'BLASTER' : (r < 0.66 ? 'SCATTER' : 'PLASMA');
            this.color = this.type === 'BLASTER' ? '#00ffff' : (this.type === 'SCATTER' ? '#ffff00' : '#00ff00');
        }
        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(state.t * 3);
            ctx.shadowBlur = 15; ctx.shadowColor = this.color;
            ctx.fillStyle = '#111'; ctx.strokeStyle = this.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.rect(-10, -10, 20, 20); ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = this.color; ctx.font = 'bold 12px Arial'; 
            ctx.textAlign = 'center'; ctx.textBaseline='middle';
            ctx.fillText(this.type[0], 0, 1);
            ctx.restore();
        }
    }

    // --- GAME MANAGER ---
    const Entities = {
        player: null,
        bullets: [],
        enemies: [],
        particles: [],
        spawns: [],
        overlays: [],
        
        clear() {
            this.player = new Player();
            this.bullets = [];
            this.enemies = [];
            this.particles = [];
            this.spawns = [];
            this.overlays = [];
        },
        
        update(dt) {
            this.player.update(dt);
            this.bullets.forEach(e => e.update(dt));
            this.enemies.forEach(e => e.update(dt));
            this.particles.forEach(e => e.update(dt));
            this.spawns.forEach(e => e.update(dt));
            
            // Collision: Bullet vs Enemy
            for(const b of this.bullets) {
                if(b.dead) continue;
                for(const e of this.enemies) {
                    if(e.dead) continue;
                    const dx = b.x - e.x, dy = b.y - e.y;
                    if(dx*dx + dy*dy < (e.r + b.size)*(e.r+b.size)) {
                        e.takeDamage(b.damage);
                        if(b.size < 5) b.dead = true; // Plasma pierces
                        break;
                    }
                }
            }
            
            // Collision: Player vs Enemy
            const p = this.player;
            for(const e of this.enemies) {
                if(e.dead) continue;
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if(dist < 30 + e.r) {
                    state.gameOver = true;
                    Audio.sfx.explode();
                    ui.finalScore.innerText = Math.floor(state.score);
                    ui.finalKills.innerText = state.kills;
                    ui.start.classList.add('hidden');
                    ui.score.classList.add('hidden');
                    ui.over.classList.remove('hidden');
                    state.running = false;
                }
            }
            
            // Collision: Player vs Powerup
            for(const pup of this.spawns) {
                if(pup.dead) continue;
                if(Math.hypot(p.x - pup.x, p.y - pup.y) < 30) {
                    p.weapon = pup.type;
                    Audio.sfx.powerup();
                    pup.dead = true;
                    ui.status.innerText = "WEAPON: " + pup.type;
                    setTimeout(() => ui.status.innerText = "READY", 2000);
                }
            }

            // Cleanup
            this.bullets = this.bullets.filter(e => !e.dead);
            this.enemies = this.enemies.filter(e => !e.dead);
            this.particles = this.particles.filter(e => !e.dead);
            this.spawns = this.spawns.filter(e => !e.dead);
        },

        draw(ctx) {
            this.spawns.forEach(e => e.draw(ctx));
            this.enemies.forEach(e => e.draw(ctx));
            this.player.draw(ctx);
            this.bullets.forEach(e => e.draw(ctx));
            this.particles.forEach(e => e.draw(ctx));
        }
    };

    // --- MAIN LOOP ---
    let lastTime = 0;
    let spawnTimer = 0;

    function loop(now) {
        requestAnimationFrame(loop);
        const dtMs = now - lastTime;
        lastTime = now;
        let dt = dtMs / 1000;
        if(dt > 0.1) dt = 0.1; // cap lag

        state.t += dt;

        // Hit Stop Logic
        if(state.hitStop > 0) {
            state.hitStop--;
            return; 
        }

        if(state.running && !state.gameOver) {
            // Spawning
            spawnTimer += dt;
            const spawnRate = Math.max(0.5, 1.5 - state.score/5000);
            if(spawnTimer > spawnRate) {
                spawnTimer = 0;
                const size = Math.random() < 0.6 ? 1 : (Math.random() < 0.8 ? 2 : 3);
                Entities.enemies.push(new Asteroid(Math.random()*state.width, -60, size));
            }

            Entities.update(dt);
            
            // Update UI
            ui.score.innerText = Math.floor(state.score);
            ui.weapon.innerText = Entities.player.weapon;
            ui.heat.innerText = Math.floor(Entities.player.heat) + "%";
            ui.heat.className = Entities.player.overheated ? 'critical' : '';
        }

        render(dt);
    }

    // --- RENDERER ---
    function render(dt) {
        // Clear Background
        ctx.fillStyle = '#050a10';
        ctx.fillRect(0,0, state.width, state.height);

        // Screen Shake Setup
        ctx.save();
        if(state.shake > 0) {
            const s = state.shake;
            const dx = (Math.random()-0.5)*s;
            const dy = (Math.random()-0.5)*s;
            ctx.translate(dx, dy);
            state.shake = Math.max(0, state.shake - dt * 30);
        }

        // Starfield (Simple)
        ctx.fillStyle = '#ffffff';
        for(let i=0; i<80; i++) {
            const x = (i * 137.5) % state.width;
            const y = (state.t * (20 + (i%5)*10) + i*50) % state.height;
            const alpha = 0.2 + (i%10)/20;
            ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.arc(x, y, (i%3)/2 + 0.5, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        Entities.draw(ctx);
        
        // Fullscreen Overlays (Flash)
        Entities.overlays.forEach((o, i) => {
            ctx.fillStyle = o.color;
            ctx.globalCompositeOperation = 'add';
            ctx.fillRect(-10, -10, state.width+20, state.height+20);
            o.t -= dt;
            if(o.t <= 0) Entities.overlays.splice(i, 1);
        });
        
        // Vignette
        const grad = ctx.createRadialGradient(state.width/2, state.height/2, state.height*0.4, state.width/2, state.height/2, state.height*0.8);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = grad;
        ctx.fillRect(-10,-10, state.width+20, state.height+20);

        ctx.restore();
    }

    // --- INIT ---
    function resize() {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = state.width;
        canvas.height = state.height;
    }

    function startGame() {
        if(state.running) return;
        Audio.init();
        Entities.clear();
        state.running = true;
        state.gameOver = false;
        state.score = 0;
        state.kills = 0;
        lastTime = performance.now();
        
        ui.start.classList.add('hidden');
        ui.over.classList.add('hidden');
        ui.score.classList.remove('hidden');
        ui.status.innerText = "SYSTEM ENGAGED";
    }

    // Input Listeners
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', e => {
        if(e.code === 'KeyW' || e.code === 'ArrowUp') input.y = -1;
        if(e.code === 'KeyS' || e.code === 'ArrowDown') input.y = 1;
        if(e.code === 'KeyA' || e.code === 'ArrowLeft') input.x = -1;
        if(e.code === 'KeyD' || e.code === 'ArrowRight') input.x = 1;
        if(e.code === 'Space') input.fire = true;
        if(!state.running) startGame();
    });
    window.addEventListener('keyup', e => {
        if((e.code === 'KeyW' || e.code === 'ArrowUp') && input.y < 0) input.y = 0;
        if((e.code === 'KeyS' || e.code === 'ArrowDown') && input.y > 0) input.y = 0;
        if((e.code === 'KeyA' || e.code === 'ArrowLeft') && input.x < 0) input.x = 0;
        if((e.code === 'KeyD' || e.code === 'ArrowRight') && input.x > 0) input.x = 0;
        if(e.code === 'Space') input.fire = false;
    });
    
    // Mouse/Touch
    const updatePointer = (e) => {
        input.mouse.x = e.clientX;
        input.mouse.y = e.clientY;
        input.mouse.active = true;
    };
    canvas.addEventListener('pointerdown', e => { updatePointer(e); input.mouse.down = true; if(!state.running) startGame(); });
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerup', () => input.mouse.down = false);

    ui.audioBtn.addEventListener('click', () => {
        Audio.enabled = !Audio.enabled;
        ui.audioBtn.innerText = Audio.enabled ? "SOUND: ON" : "SOUND: OFF";
    });

    // Boot
    Assets.init();
    resize();
    requestAnimationFrame(loop);

})();
