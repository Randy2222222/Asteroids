window.onload = function() {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let w, h;

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const sounds = {};
  const soundFiles = {
    thrust: "thrust.mp3",
    fire: "fire.mp3",
    explode: "explode.mp3"
  };

  let soundsLoaded = 0;
  const totalSounds = Object.keys(soundFiles).length;

  for (let key in soundFiles) {
    fetch(soundFiles[key])
      .then(res => res.arrayBuffer())
      .then(data => audioCtx.decodeAudioData(data))
      .then(buffer => {
        sounds[key] = buffer;
        soundsLoaded++;
      })
      .catch(err => console.error("Sound load error:", err));
  }

  function playSound(name, volume = 1.0, loop = false) {
    if (!sounds[name]) return;
    const src = audioCtx.createBufferSource();
    src.buffer = sounds[name];
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(audioCtx.destination);
    src.loop = loop;
    src.start(0);
    return { src, gain };
  }

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  class Ship {
    constructor() {
      this.x = w / 2;
      this.y = h / 2;
      this.a = 0;
      this.r = 15;
      this.thrust = { x: 0, y: 0 };
      this.rot = 0;
      this.thrusting = false;
      this.lives = 3;
      this.thrustSound = null;
    }
    update() {
      if (this.thrusting) {
        this.thrust.x += 0.1 * Math.cos(this.a);
        this.thrust.y += 0.1 * Math.sin(this.a);
        if (!this.thrustSound) {
          this.thrustSound = playSound("thrust", 2.0, true);
        }
      } else if (this.thrustSound) {
        this.thrustSound.src.stop();
        this.thrustSound = null;
      }

      this.x += this.thrust.x;
      this.y += this.thrust.y;
      this.a += this.rot;
      this.thrust.x *= 0.99;
      this.thrust.y *= 0.99;

      this.x = (this.x + w) % w;
      this.y = (this.y + h) % h;
    }
    draw() {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + this.r * Math.cos(this.a), this.y + this.r * Math.sin(this.a));
      ctx.lineTo(this.x - this.r * (Math.cos(this.a) + Math.sin(this.a)), this.y - this.r * (Math.sin(this.a) - Math.cos(this.a)));
      ctx.lineTo(this.x - this.r * (Math.cos(this.a) - Math.sin(this.a)), this.y - this.r * (Math.sin(this.a) + Math.cos(this.a)));
      ctx.closePath();
      ctx.stroke();
    }
  }

  class Bullet {
    constructor(x, y, a) {
      this.x = x;
      this.y = y;
      this.dx = 6 * Math.cos(a);
      this.dy = 6 * Math.sin(a);
      this.life = 60;
    }
    update() {
      this.x = (this.x + this.dx + w) % w;
      this.y = (this.y + this.dy + h) % h;
      this.life--;
    }
    draw() {
      ctx.fillStyle = "white";
      ctx.fillRect(this.x - 1, this.y - 1, 2, 2);
    }
  }

  class Asteroid {
    constructor(x, y, r) {
      this.x = x;
      this.y = y;
      this.r = r;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;
      this.dx = Math.cos(angle) * speed;
      this.dy = Math.sin(angle) * speed;
    }
    update() {
      this.x = (this.x + this.dx + w) % w;
      this.y = (this.y + this.dy + h) % h;
    }
    draw() {
      ctx.strokeStyle = "white";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 / 8) * i;
        const rad = this.r + Math.random() * 5 - 2;
        ctx.lineTo(this.x + rad * Math.cos(ang), this.y + rad * Math.sin(ang));
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  let ship, bullets, asteroids, score, gameOver, animFrame, started = false;

  function resetGame() {
    ship = new Ship();
    bullets = [];
    asteroids = [];
    score = 0;
    gameOver = false;
    for (let i = 0; i < 5; i++) {
      asteroids.push(new Asteroid(Math.random() * w, Math.random() * h, 40));
    }
  }

  function update() {
    if (!started) {
      ctx.fillStyle = "white";
      ctx.font = "36px monospace";
      ctx.textAlign = "center";
      ctx.fillText("TAP TO START", w / 2, h / 2);
      requestAnimationFrame(update);
      return;
    }

    if (soundsLoaded < totalSounds) {
      ctx.fillStyle = "white";
      ctx.font = "24px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Loading sounds...", w / 2, h / 2);
      requestAnimationFrame(update);
      return;
    }

    ship.update();
    bullets.forEach(b => b.update());
    asteroids.forEach(a => a.update());

    // Bullet vs Asteroid
    for (let b of [...bullets]) {
      for (let a of [...asteroids]) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.hypot(dx, dy) < a.r) {
          playSound("explode", 3.0);
          bullets.splice(bullets.indexOf(b), 1);
          asteroids.splice(asteroids.indexOf(a), 1);
          score += 100;
          if (a.r > 20) {
            asteroids.push(new Asteroid(a.x, a.y, a.r / 2));
            asteroids.push(new Asteroid(a.x, a.y, a.r / 2));
          }
          break;
        }
      }
    }

    // Ship vs Asteroid
    for (let a of asteroids) {
      const dx = ship.x - a.x;
      const dy = ship.y - a.y;
      if (Math.hypot(dx, dy) < a.r + ship.r) {
        ship.lives--;
        playSound("explode", 3.0);
        ship.x = w / 2;
        ship.y = h / 2;
        ship.thrust = { x: 0, y: 0 };
        if (ship.thrustSound) {
          ship.thrustSound.src.stop();
          ship.thrustSound = null;
        }

        if (ship.lives <= 0) {
          gameOver = true;
          break;
        }
      }
    }

    if (asteroids.length === 0) {
      for (let i = 0; i < 5; i++) {
        asteroids.push(new Asteroid(Math.random() * w, Math.random() * h, 40));
      }
    }

    ctx.clearRect(0, 0, w, h);
    ship.draw();
    bullets.forEach(b => b.draw());
    asteroids.forEach(a => a.draw());
    ctx.fillStyle = "white";
    ctx.font = "20px monospace";
    ctx.fillText("Score: " + score, 20, 30);
    ctx.fillText("Lives: " + ship.lives, 20, 60);

    if (gameOver) {
      ctx.fillStyle = "red";
      ctx.font = "40px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", w / 2, h / 2);
      ctx.font = "24px monospace";
      ctx.fillStyle = "white";
      ctx.fillText("TAP TO RESTART", w / 2, h / 2 + 60);
    }

    animFrame = requestAnimationFrame(update);
  }

  update();

  // 👆 Tap-to-start handler
  canvas.addEventListener("touchstart", () => {
    if (!started || gameOver) {
      audioCtx.resume();
      resetGame();
      started = true;
      gameOver = false;
    }
  });

  // Touch controls
  const thrustBtn = document.getElementById("thrust");
  const fireBtn = document.getElementById("fire");
  const leftBtn = document.getElementById("left");
  const rightBtn = document.getElementById("right");

  thrustBtn.ontouchstart = () => {
    ship.thrusting = true;
    audioCtx.resume();
  };
  thrustBtn.ontouchend = () => ship.thrusting = false;

  let fireInterval = null;
  fireBtn.ontouchstart = () => {
    if (!fireInterval) {
      bullets.push(new Bullet(ship.x, ship.y, ship.a));
      playSound("fire", 0.1);
      fireInterval = setInterval(() => {
        bullets.push(new Bullet(ship.x, ship.y, ship.a));
        playSound("fire", 0.1);
      }, 200);
    }
  };
  fireBtn.ontouchend = () => {
    clearInterval(fireInterval);
    fireInterval = null;
  };

  leftBtn.ontouchstart = () => ship.rot = -0.1;
  leftBtn.ontouchend = () => ship.rot = 0;
  rightBtn.ontouchstart = () => ship.rot = 0.1;
  rightBtn.ontouchend = () => ship.rot = 0;
};
