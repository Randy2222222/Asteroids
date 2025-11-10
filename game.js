// game.js
// Asteroids build — no invulnerability version
// - Tap-to-Start / Tap-to-Restart
// - Fullscreen responsive canvas
// - Modern visuals and particle explosions
// - Saucer sound fixed
// - Asteroids respawn after cleared
// - Hardcore mode: ship has NO invulnerability after death

window.onload = () => {
  (async function init() {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const cssH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = cssW;
      h = cssH;
    }

    let w = window.innerWidth;
    let h = window.innerHeight;
    window.addEventListener("resize", resizeCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    document.addEventListener("touchstart", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

    // ---------------- AUDIO ----------------
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const soundFiles = {
      thrust: "thrust.mp3",
      fire: "fire.mp3",
      explode: "explode.mp3",
      saucer: "saucer.mp3"
    };
    const V = { thrustGain: 2, fireGain: 0.1, explodeGain: 2, saucerGain: 1 };
    const buffers = {};

    async function loadBuffer(url) {
      try {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        return await audioCtx.decodeAudioData(ab);
      } catch {
        return null;
      }
    }

    for (let key of Object.keys(soundFiles)) buffers[key] = await loadBuffer(soundFiles[key]);

    function playBuffer(name, volume = 1, loop = false) {
      if (!buffers[name]) return null;
      const src = audioCtx.createBufferSource();
      src.buffer = buffers[name];
      src.loop = loop;
      const gain = audioCtx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(audioCtx.destination);
      src.start(0);
      return { src, gain };
    }

    let activeThrust = { src: null, gain: null };
    function startThrust() {
      if (activeThrust.src) return;
      const node = playBuffer("thrust", 0, true);
      if (!node) return;
      activeThrust = node;
      activeThrust.gain.gain.linearRampToValueAtTime(V.thrustGain, audioCtx.currentTime + 0.1);
    }
    function stopThrust() {
      if (!activeThrust.src) return;
      const t = audioCtx.currentTime;
      activeThrust.gain.gain.linearRampToValueAtTime(0, t + 0.25);
      const src = activeThrust.src;
      setTimeout(() => { try { src.stop(); } catch {} }, 300);
      activeThrust = { src: null, gain: null };
    }

    let activeSaucerSound = null;
    function stopSaucerSound() {
      if (activeSaucerSound) {
        try { activeSaucerSound.src.stop(); } catch {}
        activeSaucerSound = null;
      }
    }

    // --------------- GAME CONSTANTS ---------------
    const SHIP_RADIUS = 15;
    const BULLET_SPEED = 6;
    const SAUCER_SCORE = 1000;
    const SAUCER_SPAWN_MIN = 15000;
    const SAUCER_SPAWN_MAX = 45000;
    function randRange(min, max) { return Math.random() * (max - min) + min; }
    function wrapX(x) { return (x + w) % w; }
    function wrapY(y) { return (y + h) % h; }
    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

    // --------------- CLASSES ---------------
    class Particle {
      constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = randRange(-1.6, 1.6);
        this.vy = randRange(-1.6, 1.6);
        this.life = randRange(18, 42);
        this.size = randRange(1, 3);
      }
      update() { this.x += this.vx; this.y += this.vy; this.life--; }
      draw() {
        ctx.globalAlpha = Math.max(0, this.life / 40);
        ctx.fillStyle = "rgba(255,210,100,1)";
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
      }
    }

    class Ship {
      constructor() {
        this.x = w / 2;
        this.y = h / 2;
        this.a = -Math.PI / 2;
        this.r = SHIP_RADIUS;
        this.rot = 0;
        this.vx = 0;
        this.vy = 0;
        this.thrusting = false;
        this.lives = 3;
      }
      update() {
        this.a += this.rot;
        if (this.thrusting) {
          this.vx += 0.08 * Math.cos(this.a);
          this.vy += 0.08 * Math.sin(this.a);
          startThrust();
        } else stopThrust();
        this.vx *= 0.995; this.vy *= 0.995;
        this.x = wrapX(this.x + this.vx);
        this.y = wrapY(this.y + this.vy);
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.a);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.r, 0);
        ctx.lineTo(-this.r * 0.6, -this.r * 0.6);
        ctx.lineTo(-this.r * 0.6, this.r * 0.6);
        ctx.closePath();
        ctx.stroke();
        if (this.thrusting) {
          ctx.fillStyle = "orange";
          ctx.beginPath();
          ctx.moveTo(-this.r * 0.65, -this.r * 0.25);
          ctx.lineTo(-this.r - 6, 0);
          ctx.lineTo(-this.r * 0.65, this.r * 0.25);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    class Bullet {
      constructor(x, y, a) {
        this.x = x; this.y = y;
        this.dx = BULLET_SPEED * Math.cos(a);
        this.dy = BULLET_SPEED * Math.sin(a);
        this.dist = 0;
        this.maxDist = Math.max(w, h) * 1.5;
      }
      update() {
        this.x = wrapX(this.x + this.dx);
        this.y = wrapY(this.y + this.dy);
        this.dist += Math.hypot(this.dx, this.dy);
      }
      get alive() { return this.dist < this.maxDist; }
      draw() { ctx.fillStyle = "white"; ctx.fillRect(this.x - 1.3, this.y - 1.3, 2.6, 2.6); }
    }

    class Asteroid {
      constructor(x, y, r) {
        this.x = x; this.y = y; this.r = r;
        const ang = Math.random() * Math.PI * 2;
        const spd = Math.random() * 1.6 + 0.2;
        this.dx = Math.cos(ang) * spd;
        this.dy = Math.sin(ang) * spd;
      }
      update() { this.x = wrapX(this.x + this.dx); this.y = wrapY(this.y + this.dy); }
      draw() {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const theta = (i / 10) * Math.PI * 2;
          const px = this.x + this.r * Math.cos(theta);
          const py = this.y + this.r * Math.sin(theta);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    class Saucer {
      constructor() {
        this.side = Math.random() < 0.5 ? -1 : 1;
        this.x = this.side < 0 ? -60 : w + 60;
        this.y = randRange(40, h - 40);
        this.speed = this.side < 0 ? randRange(1.2, 2) : -randRange(1.2, 2);
        this.r = 18;
        this.fireTimer = randRange(600, 1400);
        this.alive = true;
      }
      update(dt) {
        this.x += this.speed * (dt / (1000 / 60));
        if (this.side < 0 && this.x > w + 80) this.alive = false;
        if (this.side > 0 && this.x < -80) this.alive = false;
        if (!this.alive) stopSaucerSound();

        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = randRange(600, 1400);
          if (ship) {
            const dx = ship.x - this.x, dy = ship.y - this.y;
            const base = Math.atan2(dy, dx);
            const inacc = randRange(-0.25, 0.25);
            saucerBullets.push(new SaucerBullet(this.x, this.y, base + inacc));
            stopSaucerSound();
            if (buffers.saucer) activeSaucerSound = playBuffer("saucer", V.saucerGain, false);
          }
        }
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.r + 8, this.r + 3.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    class SaucerBullet {
      constructor(x, y, a) {
        this.x = x; this.y = y;
        this.dx = 5.5 * Math.cos(a);
        this.dy = 5.5 * Math.sin(a);
        this.dist = 0;
        this.maxDist = Math.max(w, h) * 1.5;
      }
      update() { this.x = wrapX(this.x + this.dx); this.y = wrapY(this.y + this.dy); this.dist += Math.hypot(this.dx, this.dy); }
      get alive() { return this.dist < this.maxDist; }
      draw() { ctx.fillStyle = "red"; ctx.fillRect(this.x - 1.5, this.y - 1.5, 3, 3); }
    }

    // --------------- GAME STATE ---------------
    let ship = new Ship();
    let bullets = [];
    let asteroids = [];
    let particles = [];
    let saucers = [];
    let saucerBullets = [];
    let score = 0;
    let started = false;
    let gameOver = false;
    let lastTime = performance.now();
    let saucerNextSpawn = performance.now() + randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);

    function resetAsteroids() {
      asteroids = [];
      for (let i = 0; i < 5; i++) asteroids.push(new Asteroid(randRange(0, w), randRange(0, h), randRange(26, 44)));
    }
    resetAsteroids();

    // --------------- CONTROLS ---------------
    const thrustBtn = document.getElementById("thrust");
    const fireBtn = document.getElementById("fire");
    const leftBtn = document.getElementById("left");
    const rightBtn = document.getElementById("right");

    function shoot() {
      if (!started || gameOver) return;
      const bx = ship.x + Math.cos(ship.a) * ship.r;
      const by = ship.y + Math.sin(ship.a) * ship.r;
      bullets.push(new Bullet(bx, by, ship.a));
      if (buffers.fire) playBuffer("fire", V.fireGain);
    }

    if (thrustBtn) {
      thrustBtn.addEventListener("touchstart", e => { e.preventDefault(); ship.thrusting = true; audioCtx.resume(); }, { passive: false });
      thrustBtn.addEventListener("touchend", e => { e.preventDefault(); ship.thrusting = false; }, { passive: false });
      fireBtn.addEventListener("touchstart", e => { e.preventDefault(); shoot(); }, { passive: false });
      leftBtn.addEventListener("touchstart", e => { e.preventDefault(); ship.rot = -0.08; }, { passive: false });
      leftBtn.addEventListener("touchend", e => { e.preventDefault(); ship.rot = 0; }, { passive: false });
      rightBtn.addEventListener("touchstart", e => { e.preventDefault(); ship.rot = 0.08; }, { passive: false });
      rightBtn.addEventListener("touchend", e => { e.preventDefault(); ship.rot = 0; }, { passive: false });
    }

    function explodeAt(x, y, amount = 10) {
      for (let i = 0; i < amount; i++) particles.push(new Particle(x, y));
      if (buffers.explode) playBuffer("explode", V.explodeGain);
    }

    function maybeSpawnSaucer(now) {
      if (now >= saucerNextSpawn) {
        saucers.push(new Saucer());
        saucerNextSpawn = now + randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);
      }
    }

    // --------------- MAIN LOOP ---------------
    function loop(now) {
      const dt = now - lastTime; lastTime = now;
      ctx.clearRect(0, 0, w, h);

      if (!started) {
        ctx.fillStyle = "white";
        ctx.font = "28px monospace";
        ctx.textAlign = "center";
        ctx.fillText("ASTEROIDS — TAP TO START", w / 2, h / 2);
        requestAnimationFrame(loop); return;
      }

      ship.update();
      bullets.forEach(b => b.update());
      asteroids.forEach(a => a.update());
      saucers.forEach(s => s.update(dt));
      saucerBullets.forEach(sb => sb.update());
      saucerBullets = saucerBullets.filter(sb => sb.alive);

      // --- collisions ---
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (let j = asteroids.length - 1; j >= 0; j--) {
          const a = asteroids[j];
          if (dist(b.x, b.y, a.x, a.y) < a.r) {
            explodeAt(a.x, a.y, 10);
            score += 100;
            bullets.splice(i, 1);
            asteroids.splice(j, 1);
            if (a.r > 20) {
              asteroids.push(new Asteroid(a.x + 4, a.y + 4, a.r / 2));
              asteroids.push(new Asteroid(a.x - 4, a.y - 4, a.r / 2));
            }
            break;
          }
        }
      }

      // saucer bullets hit ship
      for (let sb of saucerBullets) {
        if (dist(sb.x, sb.y, ship.x, ship.y) < ship.r) {
          explodeAt(ship.x, ship.y, 16);
          ship.lives--;
          if (ship.lives <= 0) gameOver = true;
          ship.x = w / 2; ship.y = h / 2; ship.vx = 0; ship.vy = 0;
        }
      }

      // asteroids hit ship
      for (let a of asteroids) {
        if (dist(ship.x, ship.y, a.x, a.y) < ship.r + a.r) {
          explodeAt(ship.x, ship.y, 20);
          ship.lives--;
          if (ship.lives <= 0) gameOver = true;
          ship.x = w / 2; ship.y = h / 2; ship.vx = 0; ship.vy = 0;
        }
      }

      // saucer hit by bullet
      for (let i = saucers.length - 1; i >= 0; i--) {
        const s = saucers[i];
        for (let b of bullets) {
          if (dist(b.x, b.y, s.x, s.y) < s.r) {
            explodeAt(s.x, s.y, 16);
            score += SAUCER_SCORE;
            saucers.splice(i, 1);
            stopSaucerSound();
            break;
          }
        }
      }

      saucers = saucers.filter(s => s.alive);
      maybeSpawnSaucer(performance.now());

      particles.forEach(p => p.update());
      particles = particles.filter(p => p.life > 0);

      asteroids.forEach(a => a.draw());
      saucers.forEach(s => s.draw());
      ship.draw();
      bullets.forEach(b => b.draw());
      saucerBullets.forEach(sb =>
