(function () {
  "use strict";

  const canvas = document.getElementById("bgCanvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  function groundY() {
    return height * 0.88;
  }

  const towers = [
    { xf: 0.07, w: 22, h: 130, rings: 4 },
    { xf: 0.16, w: 34, h: 96, rings: 0, tank: true },
    { xf: 0.27, w: 26, h: 175, rings: 5, flare: true },
    { xf: 0.37, w: 16, h: 90, rings: 3 },
    { xf: 0.86, w: 20, h: 118, rings: 4 },
    { xf: 0.94, w: 30, h: 80, rings: 0, tank: true },
  ];

  function roundRectFill(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawFlame(x, top, time) {
    const t = time / 140;
    const flicker = Math.sin(t) * 3 + Math.sin(t * 2.3) * 2;
    const fx = x + flicker * 0.4;
    const fy = top - 14 - Math.abs(Math.sin(t * 1.7)) * 5;
    const grad = ctx.createRadialGradient(fx, fy + 6, 0, fx, fy, 18);
    grad.addColorStop(0, "rgba(255,240,200,0.85)");
    grad.addColorStop(0.4, "rgba(230,199,120,0.55)");
    grad.addColorStop(1, "rgba(230,199,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(
      fx,
      fy,
      8 + Math.sin(t * 3) * 1.5,
      17 + Math.sin(t * 2) * 2.5,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function drawTowers(time) {
    towers.forEach((t) => {
      const x = t.xf * width;
      const top = groundY() - t.h;
      const w = t.w;

      const grad = ctx.createLinearGradient(x - w / 2, top, x + w / 2, top);
      grad.addColorStop(0, "rgba(18,18,22,0.55)");
      grad.addColorStop(0.5, "rgba(32,31,36,0.55)");
      grad.addColorStop(1, "rgba(14,14,17,0.55)");
      ctx.fillStyle = grad;

      if (t.tank) {
        roundRectFill(x - w / 2, top, w, t.h, 8);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 4, top + 10);
        ctx.lineTo(x + w / 2 - 4, top + 10);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(x - w / 2, top, w, t.h);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        for (let i = 1; i < t.rings; i++) {
          const ry = top + (t.h / t.rings) * i;
          ctx.beginPath();
          ctx.moveTo(x - w / 2, ry);
          ctx.lineTo(x + w / 2, ry);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = "rgba(201,160,74,0.16)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, top);
      ctx.lineTo(x - w / 2, top + t.h);
      ctx.stroke();

      if (t.flare) {
        drawFlame(x, top, time);
      } else if (!t.tank) {
        const blink = 0.35 + 0.35 * Math.abs(Math.sin(time / 900 + x));
        ctx.fillStyle = `rgba(214,79,79,${blink})`;
        ctx.beginPath();
        ctx.arc(x, top - 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  let smokeParticles = [];
  function spawnSmoke() {
    towers.forEach((t) => {
      if (Math.random() < 0.05) {
        const x = t.xf * width + (Math.random() - 0.5) * 6;
        const y = groundY() - t.h;
        smokeParticles.push({
          x,
          y,
          r: 4 + Math.random() * 4,
          vx: (Math.random() - 0.5) * 0.15,
          vy: -0.22 - Math.random() * 0.22,
          life: 0,
          maxLife: 220 + Math.random() * 160,
          alpha: 0.08 + Math.random() * 0.06,
        });
      }
    });
    if (smokeParticles.length > 90) {
      smokeParticles.splice(0, smokeParticles.length - 90);
    }
  }

  function drawSmoke() {
    smokeParticles.forEach((p) => {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.r += 0.02;
      const lifeT = p.life / p.maxLife;
      const alpha = p.alpha * (1 - lifeT);
      if (alpha <= 0) return;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(180,170,155,${alpha})`);
      grad.addColorStop(1, "rgba(180,170,155,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    smokeParticles = smokeParticles.filter((p) => p.life < p.maxLife);
  }

  let flowT = 0;
  function drawPipeline() {
    const y = groundY() + 20;
    ctx.strokeStyle = "rgba(60,58,54,0.35)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    flowT += 0.55;
    const spacing = 46;
    for (let x = -spacing; x < width + spacing; x += spacing) {
      const px = ((x + flowT) % (width + spacing * 2)) - spacing;
      const glow = ctx.createRadialGradient(px, y, 0, px, y, 5);
      glow.addColorStop(0, "rgba(230,199,120,0.45)");
      glow.addColorStop(1, "rgba(230,199,120,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let waveT = 0;
  function drawLiquid() {
    const baseY = height - 24;
    waveT += 0.018;
    ctx.beginPath();
    ctx.moveTo(0, height);
    const step = 24;
    for (let x = 0; x <= width + step; x += step) {
      const y =
        baseY +
        Math.sin(x * 0.02 + waveT) * 4 +
        Math.sin(x * 0.008 - waveT * 1.4) * 3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, baseY - 10, 0, height);
    grad.addColorStop(0, "rgba(201,160,74,0.14)");
    grad.addColorStop(1, "rgba(74,47,16,0.2)");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  let bubbles = [];
  function spawnBubbles() {
    if (Math.random() < 0.18) {
      bubbles.push({
        x: Math.random() * width,
        y: height - 8,
        r: 1 + Math.random() * 2,
        vy: -0.3 - Math.random() * 0.4,
        life: 0,
        maxLife: 80 + Math.random() * 60,
      });
    }
    if (bubbles.length > 40) {
      bubbles.splice(0, bubbles.length - 40);
    }
  }

  function drawBubbles() {
    bubbles.forEach((b) => {
      b.life++;
      b.y += b.vy;
      const alpha = 0.3 * (1 - b.life / b.maxLife);
      if (alpha <= 0) return;
      ctx.strokeStyle = `rgba(230,199,120,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    });
    bubbles = bubbles.filter((b) => b.life < b.maxLife);
  }

  function frame(time) {
    ctx.clearRect(0, 0, width, height);
    drawLiquid();
    drawPipeline();
    drawTowers(time || 0);
    spawnSmoke();
    drawSmoke();
    spawnBubbles();
    drawBubbles();
  }

  let running = true;
  let rafId = null;

  function loop(time) {
    if (!running) return;
    frame(time);
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running && !prefersReducedMotion) {
      rafId = requestAnimationFrame(loop);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
    }
  });

  resize();

  if (prefersReducedMotion) {
    frame(0);
  } else {
    rafId = requestAnimationFrame(loop);
  }
})();
