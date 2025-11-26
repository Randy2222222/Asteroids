// ==========================================================
// ASTEROIDS — CLEAN REWRITE (Part 1 of 3)
// Virtual World Engine: 1200 x 1200
// All variable names preserved — gameplay identical
// ==========================================================

window.onload = () => {
  (async function init() {

    // -------------------------
    // Canvas + Rendering Setup
    // -------------------------
    const canvas = document.getElementById("game");
    if (!canvas) {
      console.error("Missing canvas #game");
      return;
    }
    const ctx = canvas.getContext("2d");

    // REAL screen drawing size
    let w = 0;
    let h = 0;

    // VIRTUAL WORLD (square, removes distortion)
    const VW = 1200;
    const VH = 1200;
    let SCALE = 1;
    let OFFSET_X = 0;
    let OFFSET_Y = 0;

    // Resize → maintain perfect square world
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const cssH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";

      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);

      w = cssW;
      h = cssH;

      SCALE = Math.min(w, h) / VW;
      OFFSET_X = (w - VW * SCALE) / 2;
      OFFSET_Y = (h - VH * SCALE) / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeCanvas);

    resizeCanvas();

    // Prevent pinch zoom / double tap zoom
    document.addEventListener(
      "touchstart",
      e => { if (e.touches.length > 1) e.preventDefault(); },
      { passive: false }
    );
    let lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      e => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) e.preventDefault();
        lastTouchEnd = now;
      },
      { passive: false }
    );

    // -------------------------
    // Audio Setup + Buffers
    // -------------------------
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const soundFiles = {
      thrust: "thrust.mp3",
      fire: "fire.mp3",
      explode: "explode.mp3",
      saucer: "saucer.mp3"
    };

    const V = {
      thrustGain: 2.0,
      fireGain: 0.1,
      explodeGain: 2.0,
      saucerGain: 1.0
    };

    const buffers = {};
    async function loadBuffer(url) {
      try {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        return await audioCtx.decodeAudioData(ab);
      } catch (err) {
        console.warn("Audio load failed:", url, err);
        return null;
      }
    }
    for (let k of Object.keys(soundFiles)) {
      buffers[k] = await loadBuffer(soundFiles[k]);
    }

    function playBuffer(name, volume = 1.0, loop = false) {
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
      if (!buffers.thrust) return;
      if (activeThrust.src) return;
      const node = playBuffer("thrust", 0, true);
      if (!node) return;
      activeThrust.src = node.src;
      activeThrust.gain = node.gain;
      activeThrust.gain.gain.setValueAtTime(0, audioCtx.currentTime);
      activeThrust.gain.gain.linearRampToValueAtTime(V.thrustGain, audioCtx.currentTime + 0.1);
    }
    function stopThrust() {
      if (!activeThrust.src) return;
      const t = audioCtx.currentTime;
      activeThrust.gain.gain.cancelScheduledValues(t);
      activeThrust.gain.gain.setValueAtTime(activeThrust.gain.gain.value, t);
      activeThrust.gain.gain.linearRampToValueAtTime(0, t + 0.25);
      const srcRef = activeThrust.src;
      setTimeout(() => {
        try { srcRef.stop(); } catch (e) {}
      }, 300);
      activeThrust.src = null;
      activeThrust.gain = null;
    }

    let activeSaucerSound = null;
    function stopActiveSaucerSound() {
      if (activeSaucerSound) {
        try { activeSaucerSound.src.stop(); } catch (e) {}
        activeSaucerSound = null;
      }
    }

    function stopSaucerLoop(saucer) {
      if (!saucer || !saucer.sound) return;
      try { saucer.sound.src.stop(); } catch (e) {}
      saucer.sound = null;
    }

    function stopAllSaucerSounds() {
      saucers.forEach(s => stopSaucerLoop(s));
      stopActiveSaucerSound();
    }

    // -------------------------
    // Constants
    // -------------------------
    const FRAME_RATE = 60;
    const SHIP_R = 15;
    const BULLET_SPEED = 6;
    const BULLET_MAX_SCREEN_TRAVEL = 1;
    const BULLET_X_SCREEN_TRAVEL = 0.8;
    const BULLET_Y_SCREEN_TRAVEL = 0.6;
    const SAUCER_SCORE = 1000;
    const SAUCER_SPAWN_MIN = 40000;
    const SAUCER_SPAWN_MAX = 120000;

    function randRange(min, max) { return Math.random() * (max - min) + min; }

    function wrapX(x) { return (x + VW) % VW; }
    function wrapY(y) { return (y + VH) % VH; }

    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

    // -------------------------
    // Particles (visual pop)
    // -------------------------
    class Particle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = randRange(-1.5, 1.5);
        this.vy = randRange(-1.5, 1.5);
        this.life = Math.floor(randRange(20, 40));
        this.size = randRange(1, 3);
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
      }
      draw() {
        ctx.globalAlpha = Math.max(0, this.life / 40);
        ctx.fillStyle = "rgba(255,210,100,1)";
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
      }
    }

    // -------------------------
    // SHIP
    // -------------------------
    class Ship {
      constructor() {
        this.x = VW / 2;
        this.y = VH / 2;
        this.a = -Math.PI / 2;
        this.r = SHIP_R;
        this.rot = 0;
        this.vx = 0;
        this.vy = 0;
        this.thrusting = false;
        this.lives = 3;
        this.invuln = 0;
      }
      update() {
        this.a += this.rot;

        if (this.thrusting) {
          this.vx += 0.08 * Math.cos(this.a);
          this.vy += 0.08 * Math.sin(this.a);
          startThrust();
        } else {
          stopThrust();
        }

        this.vx *= 0.995;
        this.vy *= 0.995;

        this.x = wrapX(this.x + this.vx);
        this.y = wrapY(this.y + this.vy);

        if (this.invuln > 0) this.invuln--;
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.a);
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(60,160,255,0.5)";
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
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // -------------------------
    // BULLET (Ship)
    // -------------------------
    class Bullet {
      constructor(x, y, a) {
        this.x = x;
        this.y = y;
        this.dx = BULLET_SPEED * Math.cos(a);
        this.dy = BULLET_SPEED * Math.sin(a);

        this.distX = 0;
        this.distY = 0;

        this.maxX = VW * BULLET_X_SCREEN_TRAVEL;
        this.maxY = VH * BULLET_Y_SCREEN_TRAVEL;
      }

      update() {
        this.x = wrapX(this.x + this.dx);
        this.y = wrapY(this.y + this.dy);

        this.distX += Math.abs(this.dx);
        this.distY += Math.abs(this.dy);
      }

      get alive() {
        return this.distX < this.maxX && this.distY < this.maxY;
      }

      draw() {
        ctx.fillStyle = "white";
        ctx.fillRect(this.x - 1.2, this.y - 1.2, 2.4, 2.4);
      }
    }
        // -------------------------
    // ASTEROID
    // -------------------------
    class Asteroid {
      constructor(x, y, r) {
        this.x = x;
        this.y = y;
        this.r = r;

        const ang = Math.random() * Math.PI * 2;
        const spd = Math.random() * 1.6 + 0.2;

        this.dx = Math.cos(ang) * spd;
        this.dy = Math.sin(ang) * spd;

        this.noise = Math.random() * 1000;
      }

      update() {
        this.x = wrapX(this.x + this.dx);
        this.y = wrapY(this.y + this.dy);
      }

      draw() {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const steps = 10;
        for (let i = 0; i < steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const variance =
            Math.sin(this.noise + theta * 4) * 0.3 +
            (Math.random() - 0.5) * 0.2;

          const rad = this.r * (1 + variance * 0.15);
          const px = this.x + rad * Math.cos(theta);
          const py = this.y + rad * Math.sin(theta);

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }

        ctx.closePath();
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(255,255,255,0.03)";
        ctx.stroke();
        ctx.restore();
      }
    }

    // -------------------------
    // SAUCER
    //--------------------------
    class Saucer {
      constructor() {
        this.side = Math.random() < 0.5 ? -1 : 1;
        this.x = this.side < 0 ? -60 : VW + 60;
        this.y = randRange(40, VH - 40);

        this.speed =
          this.side < 0 ? randRange(1.2, 2.0) : -randRange(1.2, 2.0);

        this.r = 18;
        this.fireTimer = randRange(600, 1400);
        this.alive = true;
        this.sound = null;

        if (buffers.saucer) {
          this.sound = playBuffer("saucer", V.saucerGain, true);
        }
      }

      update(dt) {
        this.x += this.speed * (dt / (1000 / FRAME_RATE));

        if (this.side < 0 && this.x > VW + 80) {
          this.alive = false;
          stopSaucerLoop(this);
        }
        if (this.side > 0 && this.x < -80) {
          this.alive = false;
          stopSaucerLoop(this);
        }

        if (!this.alive) return;

        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = randRange(600, 1400);

          if (ship) {
            const dx = ship.x - this.x;
            const dy = ship.y - this.y;
            const base = Math.atan2(dy, dx);
            const inacc = randRange(-0.25, 0.25);

            saucerBullets.push(
              new SaucerBullet(this.x, this.y, base + inacc)
            );

            stopActiveSaucerSound();
            if (buffers.saucer) {
              activeSaucerSound = playBuffer(
                "saucer",
                V.saucerGain,
                false
              );
            }
          }
        }
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = "rgba(200,200,255,0.08)";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.ellipse(0, 0, this.r + 8, this.r + 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(0, -4, this.r - 2, this.r / 2.7, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    // -------------------------
    // SAUCER BULLET
    //--------------------------
    class SaucerBullet {
      constructor(x, y, a) {
        this.x = x;
        this.y = y;

        this.dx = 5.5 * Math.cos(a);
        this.dy = 5.5 * Math.sin(a);

        this.dist = 0;
        this.maxDist = Math.max(VW, VH) * BULLET_MAX_SCREEN_TRAVEL;
      }

      update() {
        this.x = wrapX(this.x + this.dx);
        this.y = wrapY(this.y + this.dy);

        this.dist += Math.hypot(this.dx, this.dy);
      }

      get alive() {
        return this.dist < this.maxDist;
      }

      draw() {
        ctx.fillStyle = "rgba(255,100,100,1)";
        ctx.fillRect(this.x - 1.5, this.y - 1.5, 3, 3);
      }
    }

    // -------------------------
    // GAME STATE
    //--------------------------
    let ship = new Ship();
    let bullets = [];
    let asteroids = [];
    let particles = [];
    let saucers = [];
    let saucerBullets = [];
    let score = 0;
    let wave = 1;
    let started = false;
    let gameOver = false;

    let lastTime = performance.now();
    let saucerNextSpawn =
      performance.now() + randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);

    function resetAsteroids() {
      asteroids = [];
      const initial = 5 + (wave - 1);
      for (let i = 0; i < initial; i++) {
        asteroids.push(
          new Asteroid(
            randRange(0, VW),
            randRange(0, VH),
            randRange(26, 44)
          )
        );
      }
    }
    resetAsteroids();

    // -------------------------
    // CONTROLS (touch + keyboard fallback)
    // -------------------------
    const thrustBtn = document.getElementById("thrust");
    const fireBtn = document.getElementById("fire");
    const leftBtn = document.getElementById("left");
    const rightBtn = document.getElementById("right");

    if (!thrustBtn || !fireBtn || !leftBtn || !rightBtn) {
      console.warn("Touch buttons missing; keyboard enabled.");

      window.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft") ship.rot = -0.08;
        if (e.key === "ArrowRight") ship.rot = 0.08;
        if (e.key === " ") {
          ship.thrusting = true;
          audioCtx.resume();
        }
        if (e.key.toLowerCase() === "z") shoot();
      });

      window.addEventListener("keyup", e => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") ship.rot = 0;
        if (e.key === " ") ship.thrusting = false;
      });

    } else {
      thrustBtn.addEventListener(
        "touchstart",
        e => {
          e.preventDefault();
          ship.thrusting = true;
          audioCtx.resume();
        },
        { passive: false }
      );
      thrustBtn.addEventListener(
        "touchend",
        e => {
          e.preventDefault();
          ship.thrusting = false;
        },
        { passive: false }
      );

      let firingInterval = null;
      function startAutoFire() {
        if (firingInterval) return;
        shoot();
        firingInterval = setInterval(shoot, 200);
      }
      function stopAutoFire() {
        clearInterval(firingInterval);
        firingInterval = null;
      }

      fireBtn.addEventListener(
        "touchstart",
        e => {
          e.preventDefault();
          startAutoFire();
        },
        { passive: false }
      );
      fireBtn.addEventListener(
        "touchend",
        e => {
          e.preventDefault();
          stopAutoFire();
        },
        { passive: false }
      );

      leftBtn.addEventListener(
        "touchstart",
        e => {
          e.preventDefault();
          ship.rot = -0.08;
        },
        { passive: false }
      );
      leftBtn.addEventListener(
        "touchend",
        e => {
          e.preventDefault();
          ship.rot = 0;
        },
        { passive: false }
      );

      rightBtn.addEventListener(
        "touchstart",
        e => {
          e.preventDefault();
          ship.rot = 0.08;
        },
        { passive: false }
      );
      rightBtn.addEventListener(
        "touchend",
        e => {
          e.preventDefault();
          ship.rot = 0;
        },
        { passive: false }
      );
    }

    // -------------------------
    // SHOOTING / EXPLOSIONS
    //-------------------------
    function shoot() {
      if (!started || gameOver) return;

      const bx = ship.x + Math.cos(ship.a) * ship.r;
      const by = ship.y + Math.sin(ship.a) * ship.r;

      bullets.push(new Bullet(bx, by, ship.a));

      if (buffers.fire) playBuffer("fire", V.fireGain, false);
    }

    function explodeAt(x, y, amount = 10) {
      for (let i = 0; i < amount; i++) {
        particles.push(new Particle(x, y));
      }
      if (buffers.explode) playBuffer("explode", V.explodeGain, false);
    }

    function explodeShip(shipObj) {
      const pieces = 12;
      const angleStep = (Math.PI * 2) / pieces;

      for (let i = 0; i < pieces; i++) {
        const angle = angleStep * i;

        particles.push({
          x: shipObj.x,
          y: shipObj.y,
          vx: Math.cos(angle) * randRange(1.5, 3.2),
          vy: Math.sin(angle) * randRange(1.5, 3.2),
          life: randRange(25, 45),
          size: randRange(2, 4),

          update() {
            this.x += this.vx;
            this.y += this.vy;
            this.life--;
          },
          draw() {
            ctx.globalAlpha = Math.max(0, this.life / 45);
            ctx.fillStyle = "white";
            ctx.fillRect(this.x, this.y, this.size, this.size);
            ctx.globalAlpha = 1;
          }
        });
      }
    }

    function maybeSpawnSaucer(now) {
      if (now >= saucerNextSpawn) {
        saucers.push(new Saucer());
        saucerNextSpawn =
          now + randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);
      }
    }

       // -------------------------
    // MAIN LOOP
    // -------------------------
    function loop(now) {
      const dt = now - lastTime;
      lastTime = now;

      // Apply virtual world transform
      ctx.setTransform(SCALE, 0, 0, SCALE, OFFSET_X, OFFSET_Y);

      // Background clear
      ctx.clearRect(0, 0, VW, VH);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, VW, VH);

      // Tap-to-start overlay
      if (!started) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, VW, VH);

        ctx.fillStyle = "white";
        ctx.font = "bold 28px monospace";
        ctx.textAlign = "center";
        ctx.fillText("ASTEROIDS — TAP TO START", VW / 2, VH / 2 - 10);

        ctx.font = "14px monospace";
        ctx.fillText("Tap screen or use on-screen controls", VW / 2, VH / 2 + 18);

        requestAnimationFrame(loop);
        return;
      }

      // --- UPDATE ENTITIES ---
      ship.update();
      bullets.forEach(b => b.update());
      bullets = bullets.filter(b => b.alive);

      asteroids.forEach(a => a.update());

      saucers.forEach(s => s.update(dt));
      saucerBullets.forEach(sb => sb.update());
      saucerBullets = saucerBullets.filter(sb => sb.alive);

      // -------------------------
      // COLLISION: bullets → asteroids / saucers
      // -------------------------
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        let removed = false;

        // BULLET → ASTEROID
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

            removed = true;
            break;
          }
        }
        if (removed) continue;

        // BULLET → SAUCER
        for (let s = saucers.length - 1; s >= 0; s--) {
          const saucer = saucers[s];
          if (dist(b.x, b.y, saucer.x, saucer.y) < saucer.r) {
            explodeAt(saucer.x, saucer.y, 16);

            score += SAUCER_SCORE;

            bullets.splice(i, 1);

            stopSaucerLoop(saucer);
            stopActiveSaucerSound();

            saucers.splice(s, 1);

            if (buffers.explode) {
              playBuffer("explode", V.explodeGain, false);
            }

            removed = true;
            break;
          }
        }
      }

      // -------------------------
      // COLLISION: saucer bullets → ship
      // -------------------------
      if (ship.invuln <= 0) {
        for (let i = saucerBullets.length - 1; i >= 0; i--) {
          const sb = saucerBullets[i];

          if (dist(sb.x, sb.y, ship.x, ship.y) < ship.r) {
            explodeShip(ship);

            ship.lives--;
            ship.x = VW / 2;
            ship.y = VH / 2;
            ship.vx = 0;
            ship.vy = 0;
            ship.invuln = 240;

            saucerBullets.splice(i, 1);

            if (ship.lives <= 0) {
              gameOver = true;
              stopAllSaucerSounds();
            }
            break;
          }
        }
      }

      // -------------------------
      // COLLISION: ship → asteroids
      // -------------------------
      if (ship.invuln <= 0) {
        for (let i = asteroids.length - 1; i >= 0; i--) {
          const a = asteroids[i];

          if (dist(ship.x, ship.y, a.x, a.y) < ship.r + a.r) {
            explodeShip(ship);

            ship.lives--;
            ship.x = VW / 2;
            ship.y = VH / 2;
            ship.vx = 0;
            ship.vy = 0;
            ship.invuln = 90;

            if (buffers.explode) {
              playBuffer("explode", V.explodeGain, false);
            }

            if (ship.lives <= 0) {
              gameOver = true;
              stopAllSaucerSounds();
            }
            break;
          }
        }
      }

      // -------------------------
      // Saucer cleanup / spawn
      // -------------------------
      saucers = saucers.filter(s => s.alive);

      if (saucers.length === 0) {
        stopAllSaucerSounds();
      }

      maybeSpawnSaucer(performance.now());

      // -------------------------
      // PARTICLES
      // -------------------------
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
      }

      // -------------------------
      // DRAW ENTITIES
      // -------------------------
      asteroids.forEach(a => a.draw());
      saucers.forEach(s => s.draw());
      ship.draw();
      bullets.forEach(b => b.draw());
      saucerBullets.forEach(sb => sb.draw());
      particles.forEach(p => p.draw());

      // -------------------------
      // UI
      // -------------------------
      ctx.fillStyle = "white";
      ctx.font = "16px monospace";
      ctx.textAlign = "left";
      ctx.fillText("Score: " + score, 12, 22);
      ctx.fillText("Lives: " + ship.lives, 12, 44);

      // -------------------------
      // WAVE RESET
      // -------------------------
      if (asteroids.length === 0) {
        setTimeout(() => {
          if (asteroids.length === 0) {
            wave++;
            resetAsteroids();
          }
        }, 600);
      }

      // -------------------------
      // GAME OVER
      // -------------------------
      if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, VW, VH);

        ctx.fillStyle = "red";
        ctx.font = "40px monospace";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", VW / 2, VH / 2 - 10);

        ctx.fillStyle = "white";
        ctx.font = "18px monospace";
        ctx.fillText("TAP TO RESTART", VW / 2, VH / 2 + 26);

        ship.thrusting = false;
        stopThrust();
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // -------------------------
    // TAP-TO-START & RESTART
    // -------------------------
    canvas.addEventListener(
      "touchstart",
      e => {
        e.preventDefault();
        audioCtx.resume().catch(() => {});

        if (!started) {
          stopAllSaucerSounds();
          started = true;
          gameOver = false;
          score = 0;

          ship = new Ship();
          bullets = [];
          asteroids = [];
          saucers = [];
          saucerBullets = [];
          particles = [];
          wave = 1;

          resetAsteroids();
          saucerNextSpawn =
            performance.now() +
            randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);

        } else if (gameOver) {
          stopAllSaucerSounds();
          gameOver = false;
          score = 0;

          ship = new Ship();
          bullets = [];
          asteroids = [];
          saucers = [];
          saucerBullets = [];
          particles = [];
          wave = 1;

          resetAsteroids();
          saucerNextSpawn =
            performance.now() +
            randRange(SAUCER_SPAWN_MIN, SAUCER_SPAWN_MAX);
        }
      },
      { passive: false }
    );

    // Debug helper
    window.spawnSaucerNow = function () {
      saucers.push(new Saucer());
    };

  })(); // end async init
}; // end onload
