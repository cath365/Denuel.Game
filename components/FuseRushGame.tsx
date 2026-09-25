"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Skin = "blonde" | "dark";
type RunState = "menu" | "playing" | "result";
type Vec = { x: number; y: number };

type Fighter = {
  id: number;
  name: string;
  human: boolean;
  skin: Skin;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  faceX: number;
  faceY: number;
  attackUntil: number;
  attackCooldownUntil: number;
  dashUntil: number;
  dashCooldownUntil: number;
  stunUntil: number;
  invulnUntil: number;
  thinkAt: number;
  targetId: number | null;
  lastHitBy: number | null;
  lastHitAt: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
};

type WorldBlock = {
  id: number;
  nx: number;
  ny: number;
  w: number;
  h: number;
};

type Hud = {
  hp: number;
  enemies: { name: string; hp: number; alive: boolean }[];
  score: number;
  kos: number;
  time: number;
};

type Result = {
  won: boolean;
  score: number;
  kos: number;
  coins: number;
  xp: number;
  time: number;
};

const TAU = Math.PI * 2;
const BOT_NAMES = ["Nova", "Rex"];
const BOT_COLORS = ["#ff5c86", "#53dfb0"];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const normalize = (x: number, y: number): Vec => {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function burst(g: any, x: number, y: number, color: string, count = 12, speed = 190) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(speed * 0.35, speed);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.22, 0.55),
      maxLife: 0.55,
      size: rand(2, 6),
      color,
    });
  }
}

export default function FuseRushGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const inputRef = useRef({
    keys: new Set<string>(),
    stick: { x: 0, y: 0 },
    pointerId: -1,
    origin: { x: 0, y: 0 },
  });

  const [runState, setRunState] = useState<RunState>("menu");
  const [skin, setSkin] = useState<Skin>("blonde");
  const [stickVisual, setStickVisual] = useState<Vec>({ x: 0, y: 0 });
  const [attackReady, setAttackReady] = useState(true);
  const [dashReady, setDashReady] = useState(true);
  const [profile, setProfile] = useState({ coins: 0, xp: 0, best: 0 });
  const [hud, setHud] = useState<Hud>({
    hp: 100,
    enemies: [
      { name: "Nova", hp: 100, alive: true },
      { name: "Rex", hp: 100, alive: true },
    ],
    score: 0,
    kos: 0,
    time: 0,
  });
  const [result, setResult] = useState<Result>({
    won: false,
    score: 0,
    kos: 0,
    coins: 0,
    xp: 0,
    time: 0,
  });

  useEffect(() => {
    const stored = {
      coins: Number(localStorage.getItem("denuel_fight_coins") || 0),
      xp: Number(localStorage.getItem("denuel_fight_xp") || 0),
      best: Number(localStorage.getItem("denuel_fight_best") || 0),
    };
    setProfile(stored);

    (["blonde", "dark"] as Skin[]).forEach((character) => {
      (["idle", "run1", "run2", "push"] as const).forEach((state) => {
        const img = new Image();
        img.src = `/sprites/${character}-${state}.webp`;
        imagesRef.current[`${character}-${state}`] = img;
      });
    });
  }, []);

  const beep = useCallback(
    (freq = 440, duration = 0.05, volume = 0.035, type: OscillatorType = "sine") => {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = audioRef.current || new AC();
        audioRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch {}
    },
    []
  );

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  };

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    const center = { x: w / 2, y: h / 2 };
    const arenaRadius = Math.max(170, Math.min(w, h) * 0.42);
    const now = performance.now();

    const fighters: Fighter[] = [
      {
        id: 0,
        name: "YOU",
        human: true,
        skin,
        color: "#8c7cff",
        x: center.x,
        y: center.y + arenaRadius * 0.42,
        vx: 0,
        vy: 0,
        r: 21,
        hp: 100,
        maxHp: 100,
        alive: true,
        faceX: 0,
        faceY: -1,
        attackUntil: 0,
        attackCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: null,
        lastHitBy: null,
        lastHitAt: 0,
      },
      {
        id: 1,
        name: BOT_NAMES[0],
        human: false,
        skin: skin === "blonde" ? "dark" : "blonde",
        color: BOT_COLORS[0],
        x: center.x - arenaRadius * 0.44,
        y: center.y - arenaRadius * 0.22,
        vx: 0,
        vy: 0,
        r: 20,
        hp: 100,
        maxHp: 100,
        alive: true,
        faceX: 1,
        faceY: 0,
        attackUntil: 0,
        attackCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: 0,
        lastHitBy: null,
        lastHitAt: 0,
      },
      {
        id: 2,
        name: BOT_NAMES[1],
        human: false,
        skin,
        color: BOT_COLORS[1],
        x: center.x + arenaRadius * 0.44,
        y: center.y - arenaRadius * 0.22,
        vx: 0,
        vy: 0,
        r: 20,
        hp: 100,
        maxHp: 100,
        alive: true,
        faceX: -1,
        faceY: 0,
        attackUntil: 0,
        attackCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: 0,
        lastHitBy: null,
        lastHitAt: 0,
      },
    ];

    gameRef.current = {
      fighters,
      center,
      baseArenaRadius: arenaRadius,
      arenaRadius,
      start: now,
      last: now,
      score: 0,
      kos: 0,
      ending: false,
      particles: [] as Particle[],
      floaters: [] as FloatText[],
      blocks: [
        { id: 0, nx: -0.28, ny: -0.08, w: 58, h: 34 },
        { id: 1, nx: 0.30, ny: 0.12, w: 62, h: 36 },
        { id: 2, nx: 0.02, ny: -0.33, w: 52, h: 32 },
      ] as WorldBlock[],
      shake: 0,
      flash: 0,
      lastHudAt: 0,
      shrinkAt: now + 28000,
    };

    setHud({
      hp: 100,
      enemies: fighters.slice(1).map((f) => ({ name: f.name, hp: f.hp, alive: f.alive })),
      score: 0,
      kos: 0,
      time: 0,
    });
    setAttackReady(true);
    setDashReady(true);
    setRunState("playing");
    beep(520, 0.05, 0.04, "square");
  }, [beep, skin]);

  const performAttack = useCallback(
    (attacker: Fighter, now: number, isHuman: boolean) => {
      const g = gameRef.current;
      if (!g || !attacker.alive || now < attacker.attackCooldownUntil || now < attacker.stunUntil) return 0;

      attacker.attackUntil = now + 250;
      attacker.attackCooldownUntil = now + (isHuman ? 560 : rand(620, 880));

      let hits = 0;
      for (const target of g.fighters as Fighter[]) {
        if (!target.alive || target.id === attacker.id || now < target.invulnUntil) continue;

        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 88) continue;

        const n = { x: dx / d, y: dy / d };
        const facing = n.x * attacker.faceX + n.y * attacker.faceY;
        if (facing < -0.25) continue;

        const damage = isHuman ? Math.floor(rand(15, 22)) : Math.floor(rand(11, 18));
        target.hp = Math.max(0, target.hp - damage);
        target.vx += n.x * (isHuman ? 430 : 370);
        target.vy += n.y * (isHuman ? 430 : 370);
        target.stunUntil = now + 170;
        target.invulnUntil = now + 210;
        target.lastHitBy = attacker.id;
        target.lastHitAt = now;
        hits++;

        if (isHuman) g.score += damage * 8;
        burst(g, target.x, target.y, isHuman ? "#ffe17d" : attacker.color, 12, 210);
        g.floaters.push({
          x: target.x,
          y: target.y - 44,
          text: `-${damage}`,
          life: 0.9,
          color: "#ffffff",
          size: 17,
        });
        g.shake = Math.max(g.shake, isHuman ? 8 : 5);

        if (target.hp <= 0) {
          target.alive = false;
          target.vx = 0;
          target.vy = 0;
          burst(g, target.x, target.y, "#ff5c86", 28, 320);
          g.floaters.push({
            x: target.x,
            y: target.y - 52,
            text: "K.O!",
            life: 1.4,
            color: "#ffd166",
            size: 23,
          });

          if (attacker.human) {
            g.kos += 1;
            g.score += 750;
          }
        }
      }

      if (hits > 0) {
        beep(isHuman ? 145 : 170, 0.075, 0.05, "square");
        if (isHuman) vibrate(24);
      } else if (isHuman) {
        beep(260, 0.025, 0.018, "square");
      }

      return hits;
    },
    [beep]
  );

  const attack = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing") return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();
    if (!player.alive || now < player.attackCooldownUntil || now < player.stunUntil) return;

    performAttack(player, now, true);
    setAttackReady(false);
    const wait = Math.max(0, player.attackCooldownUntil - now);
    setTimeout(() => setAttackReady(true), wait);
  }, [performAttack, runState]);

  const dash = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing") return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();
    if (!player.alive || now < player.dashCooldownUntil || now < player.stunUntil) return;

    let dx = inputRef.current.stick.x;
    let dy = inputRef.current.stick.y;
    if (Math.hypot(dx, dy) < 0.15) {
      if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) dx -= 1;
      if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) dx += 1;
      if (inputRef.current.keys.has("w") || inputRef.current.keys.has("arrowup")) dy -= 1;
      if (inputRef.current.keys.has("s") || inputRef.current.keys.has("arrowdown")) dy += 1;
    }

    const n = normalize(dx || player.faceX || 1, dy || player.faceY || 0);
    player.faceX = n.x;
    player.faceY = n.y;
    player.vx += n.x * 650;
    player.vy += n.y * 650;
    player.dashUntil = now + 190;
    player.dashCooldownUntil = now + 1450;

    setDashReady(false);
    setTimeout(() => setDashReady(true), 1450);
    burst(g, player.x, player.y, "#8c7cff", 10, 140);
    g.shake = Math.max(g.shake, 3);
    beep(190, 0.07, 0.05, "sawtooth");
    vibrate(18);
  }, [beep, runState]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      inputRef.current.keys.add(k);
      if (k === " " || k === "shift") {
        e.preventDefault();
        dash();
      }
      if (k === "f" || k === "e") {
        e.preventDefault();
        attack();
      }
    };
    const up = (e: KeyboardEvent) => inputRef.current.keys.delete(e.key.toLowerCase());

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [attack, dash]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = gameRef.current;
      if (g) {
        g.center = { x: rect.width / 2, y: rect.height / 2 };
        g.baseArenaRadius = Math.max(170, Math.min(rect.width, rect.height) * 0.42);
        g.arenaRadius = Math.min(g.arenaRadius, g.baseArenaRadius);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const finish = (g: any, won: boolean, now: number) => {
      if (g.ending) return;
      g.ending = true;

      const time = Math.max(1, Math.floor((now - g.start) / 1000));
      const coins = Math.max(6, g.kos * 25 + Math.floor(g.score / 180) + (won ? 70 : 0));
      const xp = Math.max(10, g.kos * 45 + Math.floor(g.score / 90) + time + (won ? 120 : 0));
      const best = Math.max(profile.best, g.score);
      const next = { coins: profile.coins + coins, xp: profile.xp + xp, best };

      setProfile(next);
      localStorage.setItem("denuel_fight_coins", String(next.coins));
      localStorage.setItem("denuel_fight_xp", String(next.xp));
      localStorage.setItem("denuel_fight_best", String(next.best));

      setResult({ won, score: g.score, kos: g.kos, coins, xp, time });
      setTimeout(() => setRunState("result"), 450);
    };

    const updateBot = (g: any, bot: Fighter, now: number, dt: number) => {
      if (!bot.alive || now < bot.stunUntil) return;

      if (now > bot.thinkAt) {
        bot.thinkAt = now + rand(220, 420);
        const choices = (g.fighters as Fighter[])
          .filter((f) => f.alive && f.id !== bot.id)
          .sort((a, b) => dist(bot, a) - dist(bot, b));
        bot.targetId = choices[0]?.id ?? null;
      }

      const target = (g.fighters as Fighter[]).find((f) => f.id === bot.targetId && f.alive);
      if (!target) return;

      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const d = Math.hypot(dx, dy) || 1;
      const n = { x: dx / d, y: dy / d };
      bot.faceX = n.x;
      bot.faceY = n.y;

      if (d > 68) {
        const accel = d > 180 ? 760 : 580;
        bot.vx += n.x * accel * dt;
        bot.vy += n.y * accel * dt;
      } else if (d < 48) {
        bot.vx -= n.x * 240 * dt;
        bot.vy -= n.y * 240 * dt;
      }

      if (d < 86 && now >= bot.attackCooldownUntil) {
        performAttack(bot, now, false);
      }

      if (d > 170 && d < 300 && now >= bot.dashCooldownUntil && Math.random() < 0.008) {
        bot.vx += n.x * 520;
        bot.vy += n.y * 520;
        bot.dashUntil = now + 180;
        bot.dashCooldownUntil = now + rand(1700, 2500);
        burst(g, bot.x, bot.y, bot.color, 7, 120);
      }
    };

    const frame = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const g = gameRef.current;
      if (g && runState === "playing") {
        const dt = Math.min(0.034, (t - g.last) / 1000 || 0.016);
        g.last = t;

        const player: Fighter = g.fighters[0];
        const alive = (g.fighters as Fighter[]).filter((f) => f.alive);

        if (!player.alive) finish(g, false, t);
        else if (alive.length === 1 && alive[0].human) finish(g, true, t);

        if (t > g.shrinkAt) {
          g.arenaRadius = Math.max(145, g.arenaRadius - 5 * dt);
        }

        if (player.alive && t >= player.stunUntil) {
          let dx = inputRef.current.stick.x;
          let dy = inputRef.current.stick.y;
          if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) dx -= 1;
          if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) dx += 1;
          if (inputRef.current.keys.has("w") || inputRef.current.keys.has("arrowup")) dy -= 1;
          if (inputRef.current.keys.has("s") || inputRef.current.keys.has("arrowdown")) dy += 1;

          if (Math.hypot(dx, dy) > 0.08) {
            const n = normalize(dx, dy);
            player.faceX = n.x;
            player.faceY = n.y;
            player.vx += n.x * 780 * dt;
            player.vy += n.y * 780 * dt;
          }
        }

        for (const fighter of g.fighters as Fighter[]) {
          if (!fighter.human) updateBot(g, fighter, t, dt);
        }

        for (const fighter of g.fighters as Fighter[]) {
          if (!fighter.alive) continue;

          const drag = Math.pow(0.001, dt);
          fighter.vx *= drag;
          fighter.vy *= drag;

          const maxSpeed = t < fighter.dashUntil ? 540 : fighter.human ? 280 : 265;
          const sp = Math.hypot(fighter.vx, fighter.vy);
          if (sp > maxSpeed) {
            fighter.vx = (fighter.vx / sp) * maxSpeed;
            fighter.vy = (fighter.vy / sp) * maxSpeed;
          }

          fighter.x += fighter.vx * dt;
          fighter.y += fighter.vy * dt;

          const dx = fighter.x - g.center.x;
          const dy = fighter.y - g.center.y;
          const d = Math.hypot(dx, dy) || 1;
          const limit = g.arenaRadius - fighter.r;
          if (d > limit) {
            const n = { x: dx / d, y: dy / d };
            fighter.x = g.center.x + n.x * limit;
            fighter.y = g.center.y + n.y * limit;
            fighter.vx -= n.x * 190;
            fighter.vy -= n.y * 190;
          }

          for (const block of g.blocks as WorldBlock[]) {
            const bx = g.center.x + block.nx * g.arenaRadius;
            const by = g.center.y + block.ny * g.arenaRadius;
            const left = bx - block.w / 2 - fighter.r;
            const right = bx + block.w / 2 + fighter.r;
            const top = by - block.h / 2 - fighter.r;
            const bottom = by + block.h / 2 + fighter.r;

            if (fighter.x > left && fighter.x < right && fighter.y > top && fighter.y < bottom) {
              const dl = Math.abs(fighter.x - left);
              const dr = Math.abs(right - fighter.x);
              const dtb = Math.abs(fighter.y - top);
              const db = Math.abs(bottom - fighter.y);
              const minPen = Math.min(dl, dr, dtb, db);

              if (minPen === dl) {
                fighter.x = left;
                fighter.vx = Math.min(0, fighter.vx) * -0.28;
              } else if (minPen === dr) {
                fighter.x = right;
                fighter.vx = Math.max(0, fighter.vx) * -0.28;
              } else if (minPen === dtb) {
                fighter.y = top;
                fighter.vy = Math.min(0, fighter.vy) * -0.28;
              } else {
                fighter.y = bottom;
                fighter.vy = Math.max(0, fighter.vy) * -0.28;
              }
            }
          }
        }

        for (let i = 0; i < g.fighters.length; i++) {
          for (let j = i + 1; j < g.fighters.length; j++) {
            const a: Fighter = g.fighters[i];
            const b: Fighter = g.fighters[j];
            if (!a.alive || !b.alive) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            const minD = a.r + b.r;
            if (d < minD) {
              const n = { x: dx / d, y: dy / d };
              const overlap = minD - d;
              a.x -= n.x * overlap * 0.5;
              a.y -= n.y * overlap * 0.5;
              b.x += n.x * overlap * 0.5;
              b.y += n.y * overlap * 0.5;
            }
          }
        }

        for (let i = g.particles.length - 1; i >= 0; i--) {
          const p: Particle = g.particles[i];
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.95;
          p.vy *= 0.95;
          if (p.life <= 0) g.particles.splice(i, 1);
        }

        for (let i = g.floaters.length - 1; i >= 0; i--) {
          const f: FloatText = g.floaters[i];
          f.life -= dt;
          f.y -= 32 * dt;
          if (f.life <= 0) g.floaters.splice(i, 1);
        }

        g.shake *= 0.88;
        g.flash *= 0.9;

        if (t - g.lastHudAt > 85) {
          g.lastHudAt = t;
          setHud({
            hp: player.hp,
            enemies: (g.fighters as Fighter[])
              .slice(1)
              .map((f) => ({ name: f.name, hp: f.hp, alive: f.alive })),
            score: g.score,
            kos: g.kos,
            time: Math.floor((t - g.start) / 1000),
          });
        }

        ctx.save();
        ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));

        const water = ctx.createLinearGradient(0, 0, 0, rect.height);
        water.addColorStop(0, "#0b2d49");
        water.addColorStop(0.46, "#0d4e68");
        water.addColorStop(1, "#071c35");
        ctx.fillStyle = water;
        ctx.fillRect(-30, -30, rect.width + 60, rect.height + 60);

        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = "#77d8e8";
        ctx.lineWidth = 1.5;
        for (let y = 30; y < rect.height; y += 26) {
          ctx.beginPath();
          for (let x = -30; x <= rect.width + 30; x += 18) {
            const waveY = y + Math.sin(x * 0.035 + t * 0.0022 + y * 0.02) * 3.5;
            if (x === -30) ctx.moveTo(x, waveY);
            else ctx.lineTo(x, waveY);
          }
          ctx.stroke();
        }
        ctx.restore();

        const skylineY = Math.max(82, g.center.y - g.arenaRadius - 46);
        const buildingData = [
          { x: rect.width * 0.05, w: 48, h: 74 },
          { x: rect.width * 0.14, w: 62, h: 105 },
          { x: rect.width * 0.27, w: 46, h: 86 },
          { x: rect.width * 0.70, w: 54, h: 95 },
          { x: rect.width * 0.82, w: 70, h: 118 },
          { x: rect.width * 0.94, w: 44, h: 78 },
        ];
        for (let bi = 0; bi < buildingData.length; bi++) {
          const b = buildingData[bi];
          const bx = b.x - b.w / 2;
          const by = skylineY - b.h;
          ctx.fillStyle = bi % 2 === 0 ? "#172239" : "#1d2942";
          ctx.fillRect(bx, by, b.w, b.h);
          ctx.fillStyle = "rgba(255,218,127,.32)";
          for (let wy = by + 13; wy < skylineY - 8; wy += 16) {
            for (let wx = bx + 9; wx < bx + b.w - 7; wx += 15) {
              if ((Math.floor(wx + wy + bi) % 3) !== 0) ctx.fillRect(wx, wy, 6, 7);
            }
          }
          ctx.fillStyle = "#111a2d";
          ctx.fillRect(bx + b.w * 0.34, by - 8, b.w * 0.32, 8);
        }

        ctx.save();
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(0,0,0,.35)";
        const shore = ctx.createRadialGradient(
          g.center.x - g.arenaRadius * 0.18,
          g.center.y - g.arenaRadius * 0.2,
          g.arenaRadius * 0.05,
          g.center.x,
          g.center.y,
          g.arenaRadius
        );
        shore.addColorStop(0, "#66a84d");
        shore.addColorStop(0.58, "#4f8f45");
        shore.addColorStop(0.88, "#8d7446");
        shore.addColorStop(1, "#c4a66d");
        ctx.fillStyle = shore;
        ctx.beginPath();
        ctx.arc(g.center.x, g.center.y, g.arenaRadius + 9, 0, TAU);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = "rgba(229,208,155,.72)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(g.center.x, g.center.y, g.arenaRadius + 4, 0, TAU);
        ctx.stroke();

        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#d6c18e";
        ctx.translate(g.center.x, g.center.y);
        ctx.rotate(-0.18);
        ctx.fillRect(-g.arenaRadius * 0.76, -18, g.arenaRadius * 1.52, 36);
        ctx.restore();

        ctx.globalAlpha = 0.11;
        ctx.strokeStyle = "#d9e8b5";
        ctx.lineWidth = 1;
        for (let r = 70; r < g.arenaRadius; r += 70) {
          ctx.beginPath();
          ctx.arc(g.center.x, g.center.y, r, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        for (const block of g.blocks as WorldBlock[]) {
          const bx = g.center.x + block.nx * g.arenaRadius;
          const by = g.center.y + block.ny * g.arenaRadius;
          ctx.save();
          ctx.shadowBlur = 14;
          ctx.shadowColor = "rgba(0,0,0,.38)";
          ctx.fillStyle = "#353d49";
          ctx.fillRect(bx - block.w / 2, by - block.h / 2, block.w, block.h);
          ctx.fillStyle = "#596474";
          ctx.fillRect(bx - block.w / 2 + 4, by - block.h / 2 + 4, block.w - 8, 8);
          ctx.strokeStyle = "rgba(255,255,255,.16)";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx - block.w / 2, by - block.h / 2, block.w, block.h);
          ctx.restore();
        }

        ctx.strokeStyle = "rgba(140,124,255,.72)";
        ctx.lineWidth = 4;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "#7662ff";
        ctx.beginPath();
        ctx.arc(g.center.x, g.center.y, g.arenaRadius - 2, 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (const fighter of g.fighters as Fighter[]) {
          if (!fighter.alive) continue;

          const speed = Math.hypot(fighter.vx, fighter.vy);
          const moving = speed > 40;
          const attacking = t < fighter.attackUntil;
          const dashing = t < fighter.dashUntil;
          const hurt = t < fighter.stunUntil;

          const runFrame =
            Math.floor((t + fighter.id * 91) / 105) % 2 === 0 ? "run1" : "run2";
          const state = attacking ? "push" : moving ? runFrame : "idle";
          const img =
            imagesRef.current[`${fighter.skin}-${state}`] ||
            imagesRef.current[`${fighter.skin}-idle`];

          if (dashing && img?.complete) {
            for (let ghost = 3; ghost >= 1; ghost--) {
              ctx.save();
              ctx.globalAlpha = 0.08 * ghost;
              ctx.translate(
                fighter.x - fighter.faceX * ghost * 13,
                fighter.y - fighter.faceY * ghost * 13
              );
              if (fighter.faceX < -0.08) ctx.scale(-1, 1);
              ctx.drawImage(img, -36, -36, 72, 72);
              ctx.restore();
            }
          }

          const phase = t * (moving ? 0.024 : 0.006) + fighter.id;
          const bob = moving ? -Math.abs(Math.sin(phase)) * 4 : Math.sin(phase) * 1.4;
          const lean = hurt
            ? Math.sin(t * 0.04) * 0.24
            : moving
              ? clamp(fighter.vx / 280, -1, 1) * 0.1
              : 0;

          if (attacking) {
            const a = Math.atan2(fighter.faceY, fighter.faceX);
            ctx.save();
            ctx.strokeStyle = fighter.human
              ? "rgba(255,225,125,.9)"
              : "rgba(255,255,255,.38)";
            ctx.lineWidth = 5;
            ctx.shadowBlur = 14;
            ctx.shadowColor = fighter.human ? "#ffd166" : fighter.color;
            ctx.beginPath();
            ctx.arc(
              fighter.x + fighter.faceX * 27,
              fighter.y + fighter.faceY * 27,
              32,
              a - 0.8,
              a + 0.8
            );
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          const lunge = attacking ? 10 : 0;
          ctx.translate(
            fighter.x + fighter.faceX * lunge,
            fighter.y + 4 + bob + fighter.faceY * lunge
          );
          if (fighter.faceX < -0.08) ctx.scale(-1, 1);
          ctx.rotate(lean);

          if (fighter.human) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = "rgba(140,124,255,.9)";
          }

          if (img?.complete && img.naturalWidth > 0) {
            const size = fighter.human ? 84 : 78;
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
          } else {
            ctx.fillStyle = fighter.color;
            ctx.beginPath();
            ctx.arc(0, 0, fighter.r, 0, TAU);
            ctx.fill();
          }
          ctx.restore();

          const barW = fighter.human ? 58 : 52;
          const barY = fighter.y - 50;
          ctx.fillStyle = "rgba(0,0,0,.58)";
          ctx.fillRect(fighter.x - barW / 2, barY, barW, 6);
          ctx.fillStyle =
            fighter.hp > 55 ? "#57e39b" : fighter.hp > 25 ? "#ffd166" : "#ff5c86";
          ctx.fillRect(
            fighter.x - barW / 2,
            barY,
            barW * (fighter.hp / fighter.maxHp),
            6
          );

          ctx.fillStyle = "#fff";
          ctx.font = fighter.human ? "900 11px system-ui" : "800 10px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(fighter.name, fighter.x, fighter.y + 46);
        }

        for (const p of g.particles as Particle[]) {
          ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (const f of g.floaters as FloatText[]) {
          ctx.globalAlpha = clamp(f.life, 0, 1);
          ctx.fillStyle = f.color;
          ctx.font = `900 ${f.size}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore();
      } else {
        const bg = ctx.createRadialGradient(
          rect.width / 2,
          rect.height * 0.38,
          0,
          rect.width / 2,
          rect.height * 0.38,
          Math.max(rect.width, rect.height) * 0.75
        );
        bg.addColorStop(0, "#171b45");
        bg.addColorStop(1, "#070815");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [beep, performAttack, profile, runState]);

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (runState !== "playing") return;
    if (e.clientX > window.innerWidth * 0.56) return;

    inputRef.current.pointerId = e.pointerId;
    inputRef.current.origin = { x: e.clientX, y: e.clientY };
    inputRef.current.stick = { x: 0, y: 0 };
    setStickVisual({ x: 0, y: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - inputRef.current.origin.x;
    const dy = e.clientY - inputRef.current.origin.y;
    const n = normalize(dx, dy);
    const mag = Math.min(1, Math.hypot(dx, dy) / 48);
    const v = { x: n.x * mag, y: n.y * mag };

    inputRef.current.stick = v;
    setStickVisual({ x: v.x * 28, y: v.y * 28 });
  };

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputRef.current.pointerId !== e.pointerId) return;
    inputRef.current.pointerId = -1;
    inputRef.current.stick = { x: 0, y: 0 };
    setStickVisual({ x: 0, y: 0 });
  };

  return (
    <main className="shell">
      <canvas
        ref={canvasRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />

      {runState === "playing" && (
        <div className="hud">
          <div className="topbar">
            <div className="pill good">❤️ {Math.ceil(hud.hp)} HP</div>
            <div className="pill">🥊 {hud.kos} KO</div>
            <div className="pill">🏆 {hud.score}</div>
          </div>

          <div className="enemy-status">
            {hud.enemies.map((enemy) => (
              <div className={`enemy-card ${enemy.alive ? "" : "ko"}`} key={enemy.name}>
                <div className="enemy-row">
                  <b>{enemy.name}</b>
                  <span>{enemy.alive ? `${Math.ceil(enemy.hp)} HP` : "K.O."}</span>
                </div>
                <div className="enemy-bar">
                  <i style={{ width: `${enemy.alive ? enemy.hp : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="fight-callout">3-FIGHTER ARENA • LAST ONE STANDING</div>

          <div className="joystick-base">
            <div
              className="joystick-knob"
              style={
                {
                  "--jx": `${stickVisual.x}px`,
                  "--jy": `${stickVisual.y}px`,
                } as React.CSSProperties
              }
            />
          </div>

          <div className="action-stack">
            <button
              className={`action push ${attackReady ? "" : "cool"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                attack();
              }}
            >
              ATTACK
            </button>
            <button
              className={`action dash ${dashReady ? "" : "cool"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                dash();
              }}
            >
              DASH
            </button>
          </div>
        </div>
      )}

      {runState === "menu" && (
        <section className="overlay">
          <div className="card">
            <div className="brand">
              DENUEL<span>FIGHT</span>
            </div>
            <p className="tagline">
              Three fighters enter the arena. You choose your character, fight two opponents,
              and win by being the last one standing.
            </p>

            <div className="character-title">CHOOSE YOUR FIGHTER</div>
            <div className="character-picker">
              <button
                className={`character ${skin === "blonde" ? "selected" : ""}`}
                onClick={() => setSkin("blonde")}
              >
                <img src="/sprites/blonde-idle.webp" alt="Blaze" />
                <b>Blaze</b>
                <small>Fast • aggressive</small>
              </button>

              <button
                className={`character ${skin === "dark" ? "selected" : ""}`}
                onClick={() => setSkin("dark")}
              >
                <img src="/sprites/dark-idle.webp" alt="Nyx" />
                <b>Nyx</b>
                <small>Quick • tactical</small>
              </button>
            </div>

            <div className="stats">
              <div className="stat">
                <b>{profile.coins}</b>
                <small>Coins</small>
              </div>
              <div className="stat">
                <b>{profile.xp}</b>
                <small>XP</small>
              </div>
              <div className="stat">
                <b>{profile.best}</b>
                <small>Best</small>
              </div>
            </div>

            <button className="play" onClick={startGame}>
              START FIGHT
            </button>

            <div className="help">
              Mobile: left thumb moves • ATTACK punches • DASH escapes. Desktop: WASD/arrows
              • F/E attack • Space/Shift dash.
            </div>
          </div>
        </section>
      )}

      {runState === "result" && (
        <section className="overlay">
          <div className="card">
            <h1 className="result-title">{result.won ? "🏆 YOU WIN" : "🥊 K.O."}</h1>
            <p className="tagline">
              {result.won
                ? "You defeated both opponents."
                : "You were knocked out. Try another fighter or go again."}
            </p>

            <div className="stats">
              <div className="stat">
                <b>{result.score}</b>
                <small>Score</small>
              </div>
              <div className="stat">
                <b>{result.kos}</b>
                <small>KOs</small>
              </div>
              <div className="stat">
                <b>{result.time}s</b>
                <small>Fight Time</small>
              </div>
            </div>

            <div className="reward">
              +{result.coins} coins • +{result.xp} XP
            </div>

            <button className="play" onClick={startGame}>
              FIGHT AGAIN
            </button>

            <div
              className="help"
              onClick={() => setRunState("menu")}
              style={{ cursor: "pointer" }}
            >
              Change character
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
