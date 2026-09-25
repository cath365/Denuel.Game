"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Skin = "blonde" | "dark";
type BotStyle = "hunter" | "coward" | "collector" | "bully" | "trickster";
type PowerType = "speed" | "shield" | "dash";
type EventType = "none" | "turbo" | "gravity" | "shockwave" | "powerRain" | "fuseFrenzy";
type RunState = "menu" | "playing" | "result";
type Vec = { x: number; y: number };
type Player = {
  id: number; x: number; y: number; vx: number; vy: number; r: number; alive: boolean; human: boolean;
  name: string; skin: Skin; color: string; bot: BotStyle; shield: boolean; speedUntil: number; dashUntil: number;
  dashCooldownUntil: number; pushCooldownUntil: number; stunnedUntil: number; faceX: number; faceY: number;
  lastHitBy: number | null; lastHitAt: number; thinkAt: number; targetId: number | null;
};
type Pickup = { id: number; x: number; y: number; type: PowerType; born: number };
type Hazard = { id: number; x: number; y: number; r: number; phase: number };
type Obstacle = { id: number; angle: number; orbit: number; speed: number; r: number; dir: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type FloatText = { x: number; y: number; text: string; color: string; life: number; size: number };

type Result = { won: boolean; score: number; coins: number; xp: number; survival: number; kos: number; best: number };
type Hud = { alive: number; score: number; fuse: number; carrier: string; combo: number; final3: boolean; kos: number; koStreak: number; survivalStreak: number; event: string; coins: number };

const TAU = Math.PI * 2;
const COLORS = ["#8c7cff", "#ff5c86", "#53dfb0", "#ffd166", "#55b8ff", "#ff9855", "#c96cff", "#7ee787"];
const BOT_NAMES = ["Nova", "Byte", "Kayo", "Zed", "Mika", "Rex", "Lumi"];
const BOT_STYLES: BotStyle[] = ["hunter", "coward", "collector", "bully", "trickster"];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const norm = (x: number, y: number): Vec => { const m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; };
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function makeBurst(g: any, x: number, y: number, color: string, count = 14, speed = 220) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU), s = rand(speed * 0.35, speed);
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.65), max: 0.65, size: rand(2, 7), color });
  }
}

export default function FuseRushGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const inputRef = useRef({ keys: new Set<string>(), stick: { x: 0, y: 0 }, pointerId: -1, origin: { x: 0, y: 0 } });
  const imagesRef = useRef<Record<Skin, HTMLImageElement | null>>({ blonde: null, dark: null });
  const audioRef = useRef<AudioContext | null>(null);
  const [runState, setRunState] = useState<RunState>("menu");
  const [skin, setSkin] = useState<Skin>("blonde");
  const [stick, setStick] = useState<Vec>({ x: 0, y: 0 });
  const [dashReady, setDashReady] = useState(true);
  const [pushReady, setPushReady] = useState(true);
  const [profile, setProfile] = useState({ coins: 0, xp: 0, best: 0 });
  const [result, setResult] = useState<Result>({ won: false, score: 0, coins: 0, xp: 0, survival: 0, kos: 0, best: 0 });
  const [hud, setHud] = useState<Hud>({ alive: 8, score: 0, fuse: 8, carrier: "", combo: 0, final3: false, kos: 0, koStreak: 0, survivalStreak: 0, event: "", coins: 0 });

  useEffect(() => {
    const p = {
      coins: Number(localStorage.getItem("fuserush_coins") || 0),
      xp: Number(localStorage.getItem("fuserush_xp") || 0),
      best: Number(localStorage.getItem("fuserush_best") || 0),
    };
    setProfile(p);
    (Object.keys(imagesRef.current) as Skin[]).forEach((s) => {
      const img = new Image();
      img.src = `/sprites/${s === "blonde" ? "blonde" : "dark"}-idle.webp`;
      imagesRef.current[s] = img;
    });
  }, []);

  const beep = useCallback((freq = 440, duration = 0.05, volume = 0.035, type: OscillatorType = "sine") => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioRef.current || new AC();
      audioRef.current = ctx;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  const vibrate = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch {} };

  const startGame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || window.innerWidth, h = rect.height || window.innerHeight;
    const center = { x: w / 2, y: h / 2 };
    const baseRadius = Math.max(165, Math.min(w, h) * 0.42);
    const now = performance.now();
    const players: Player[] = Array.from({ length: 8 }, (_, i) => ({
      id: i, x: 0, y: 0, vx: 0, vy: 0, r: i === 0 ? 20 : 18, alive: true, human: i === 0,
      name: i === 0 ? "YOU" : BOT_NAMES[i - 1], skin: i === 0 ? skin : (i % 2 ? "dark" : "blonde"), color: COLORS[i],
      bot: i === 0 ? "hunter" : BOT_STYLES[(i - 1) % BOT_STYLES.length], shield: false, speedUntil: 0, dashUntil: 0,
      dashCooldownUntil: 0, pushCooldownUntil: 0, stunnedUntil: 0, faceX: 1, faceY: 0, lastHitBy: null, lastHitAt: 0,
      thinkAt: 0, targetId: null,
    }));
    players.forEach((p, i) => { const a = i / players.length * TAU + rand(-0.15, 0.15), r = baseRadius * rand(0.25, 0.7); p.x = center.x + Math.cos(a) * r; p.y = center.y + Math.sin(a) * r; });
    const hazards: Hazard[] = Array.from({ length: 3 }, (_, i) => { const a = i / 3 * TAU + 0.55, r = baseRadius * 0.5; return { id: i, x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, r: 48, phase: i * 1700 }; });
    const obstacles: Obstacle[] = [
      { id: 0, angle: 0, orbit: baseRadius * 0.34, speed: 0.00044, r: 19, dir: 1 },
      { id: 1, angle: Math.PI, orbit: baseRadius * 0.34, speed: 0.00044, r: 19, dir: 1 },
      { id: 2, angle: Math.PI / 2, orbit: baseRadius * 0.62, speed: 0.00031, r: 17, dir: -1 },
    ];
    gameRef.current = {
      players, hazards, obstacles, particles: [] as Particle[], floaters: [] as FloatText[], pickups: [] as Pickup[], pickupId: 0,
      start: now, last: now, center, baseRadius, arenaRadius: baseRadius, nextShrinkAt: now + 14500,
      carrierId: Math.floor(rand(0, 8)), fuseStartedAt: now, fuseDuration: 8000, transferLockUntil: now + 700,
      nextPickupAt: now + 2600, nextEventAt: now + rand(9000, 12000), eventType: "none" as EventType, eventUntil: 0,
      eventBanner: "", eventBannerUntil: 0, score: 0, combo: 0, lastTransferAt: 0, final3: false, ending: false,
      shake: 0, flash: 0, lastHud: 0, dangerTickAt: 0, humanKOs: 0, koStreak: 0, maxKoStreak: 0,
      survivalStreak: 0, bestSurvivalStreak: 0, lastHumanPassAt: 0, lastHumanBombTarget: null as number | null, eliminationCount: 0,
    };
    setDashReady(true); setPushReady(true); setRunState("playing");
    setHud({ alive: 8, score: 0, fuse: 8, carrier: players[gameRef.current.carrierId].name, combo: 0, final3: false, kos: 0, koStreak: 0, survivalStreak: 0, event: "", coins: profile.coins });
    beep(560, 0.04, 0.03, "square");
  }, [beep, profile.coins, skin]);

  const dash = useCallback(() => {
    const g = gameRef.current; if (!g || runState !== "playing") return;
    const p: Player = g.players[0], now = performance.now();
    if (!p.alive || now < p.dashCooldownUntil || now < p.stunnedUntil) return;
    let dx = inputRef.current.stick.x, dy = inputRef.current.stick.y;
    if (Math.hypot(dx, dy) < 0.15) { if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) dx--; if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) dx++; if (inputRef.current.keys.has("w") || inputRef.current.keys.has("arrowup")) dy--; if (inputRef.current.keys.has("s") || inputRef.current.keys.has("arrowdown")) dy++; }
    const n = norm(dx || p.faceX || 1, dy || p.faceY || 0); p.faceX = n.x; p.faceY = n.y; p.vx += n.x * 620; p.vy += n.y * 620;
    p.dashUntil = now + 190; p.dashCooldownUntil = now + 1650; setDashReady(false); setTimeout(() => setDashReady(true), 1650);
    makeBurst(g, p.x, p.y, "#8c7cff", 10, 140); g.shake = Math.max(g.shake, 3); beep(190, 0.07, 0.05, "sawtooth"); vibrate(18);
  }, [beep, runState]);

  const push = useCallback(() => {
    const g = gameRef.current; if (!g || runState !== "playing") return;
    const p: Player = g.players[0], now = performance.now(); if (!p.alive || now < p.pushCooldownUntil || now < p.stunnedUntil) return;
    p.pushCooldownUntil = now + 900; setPushReady(false); setTimeout(() => setPushReady(true), 900); let hits = 0;
    for (const t of g.players as Player[]) {
      if (!t.alive || t.id === p.id) continue; const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1; if (d > 94) continue;
      const n = { x: dx / d, y: dy / d }, facing = n.x * p.faceX + n.y * p.faceY; if (facing < -0.2) continue;
      const force = 590 * (1.12 - d / 190); t.vx += n.x * force; t.vy += n.y * force; t.stunnedUntil = now + 175; t.lastHitBy = p.id; t.lastHitAt = now; hits++;
      makeBurst(g, t.x, t.y, "#ffe17d", 10, 190); g.floaters.push({ x: t.x, y: t.y - 40, text: "PUSH!", color: "#fff2a8", life: 1, size: 14 });
    }
    if (hits) { g.score += hits * 45; g.shake = Math.max(g.shake, 7); beep(150, 0.08, 0.05, "square"); vibrate(22); } else beep(250, 0.03, 0.018, "square");
  }, [beep, runState]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); inputRef.current.keys.add(k); if (k === " " || k === "shift") { e.preventDefault(); dash(); } if (k === "f" || k === "e") { e.preventDefault(); push(); } };
    const up = (e: KeyboardEvent) => inputRef.current.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down, { passive: false }); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [dash, push]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2), rect = canvas.getBoundingClientRect(); canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (gameRef.current) { gameRef.current.center = { x: rect.width / 2, y: rect.height / 2 }; gameRef.current.baseRadius = Math.max(165, Math.min(rect.width, rect.height) * 0.42); gameRef.current.arenaRadius = Math.min(gameRef.current.arenaRadius, gameRef.current.baseRadius); } };
    resize(); window.addEventListener("resize", resize);

    const finish = (g: any, won: boolean, now: number) => {
      if (g.ending) return; g.ending = true; const survival = Math.floor((now - g.start) / 1000);
      const coins = Math.max(4, Math.floor(g.score / 90) + survival + g.humanKOs * 8 + (won ? 50 : 0));
      const xp = Math.max(8, Math.floor(g.score / 45) + survival * 2 + g.humanKOs * 20 + (won ? 100 : 0));
      const next = { coins: profile.coins + coins, xp: profile.xp + xp, best: Math.max(profile.best, g.score) }; setProfile(next);
      localStorage.setItem("fuserush_coins", String(next.coins)); localStorage.setItem("fuserush_xp", String(next.xp)); localStorage.setItem("fuserush_best", String(next.best));
      setResult({ won, score: g.score, coins, xp, survival, kos: g.humanKOs, best: next.best }); setTimeout(() => setRunState("result"), 450);
    };

    const spawnPickup = (g: any, now: number) => {
      const a = rand(0, TAU), r = rand(30, Math.max(60, g.arenaRadius - 45)), roll = Math.random();
      g.pickups.push({ id: g.pickupId++, x: g.center.x + Math.cos(a) * r, y: g.center.y + Math.sin(a) * r, type: roll < 0.42 ? "speed" : roll < 0.73 ? "shield" : "dash", born: now });
    };

    const randomEvent = (g: any, now: number) => {
      const opts: EventType[] = ["turbo", "gravity", "shockwave", "powerRain", "fuseFrenzy"]; const type = opts[Math.floor(Math.random() * opts.length)];
      g.eventType = type; g.eventUntil = now + (type === "gravity" ? 5200 : 4200); g.eventBannerUntil = now + 1800; g.flash = 0.35; g.shake = Math.max(g.shake, 6);
      if (type === "turbo") { g.eventBanner = "⚡ TURBO RUSH"; for (const p of g.players as Player[]) if (p.alive) p.speedUntil = Math.max(p.speedUntil, now + 5200); }
      if (type === "gravity") g.eventBanner = "🌀 GRAVITY WELL";
      if (type === "shockwave") { g.eventBanner = "💥 SHOCKWAVE"; for (const p of g.players as Player[]) if (p.alive) { const n = norm(p.x - g.center.x, p.y - g.center.y); p.vx += n.x * 430; p.vy += n.y * 430; p.stunnedUntil = now + 130; } }
      if (type === "powerRain") { g.eventBanner = "🎁 POWER-UP RAIN"; for (let i = 0; i < 6; i++) spawnPickup(g, now); }
      if (type === "fuseFrenzy") { g.eventBanner = "🔥 FUSE FRENZY"; const elapsed = now - g.fuseStartedAt, left = Math.max(1300, g.fuseDuration - elapsed); g.fuseDuration = elapsed + left * 0.72; }
      makeBurst(g, g.center.x, g.center.y, "#ffd166", 28, 260); beep(type === "fuseFrenzy" ? 120 : 520, 0.13, 0.05, "sawtooth"); vibrate([20, 35, 20]);
      g.nextEventAt = now + rand(g.final3 ? 8500 : 11500, g.final3 ? 11000 : 15500);
    };

    const eliminate = (g: any, p: Player, now: number, reason: "bomb" | "zone") => {
      if (!p.alive) return; if (p.shield) { p.shield = false; p.stunnedUntil = now + 280; p.vx *= -1; p.vy *= -1; g.floaters.push({ x: p.x, y: p.y - 45, text: "SHIELD!", color: "#8fffd2", life: 1, size: 14 }); makeBurst(g, p.x, p.y, "#53dfb0", 18, 220); return; }
      p.alive = false; p.vx = p.vy = 0; g.shake = Math.max(g.shake, 14); g.flash = 0.8; makeBurst(g, p.x, p.y, reason === "bomb" ? "#ff5c86" : "#ff9855", 34, 360); beep(80, 0.18, 0.08, "sawtooth"); vibrate([50, 35, 80]);
      if (p.human) { finish(g, false, now); return; }
      g.survivalStreak++; g.bestSurvivalStreak = Math.max(g.bestSurvivalStreak, g.survivalStreak); g.score += 80 + g.survivalStreak * 15;
      const creditedHuman = p.lastHitBy === 0 && now - p.lastHitAt < 2600;
      if (creditedHuman) { g.humanKOs++; g.koStreak++; g.maxKoStreak = Math.max(g.maxKoStreak, g.koStreak); g.score += 120 + g.koStreak * 55; g.floaters.push({ x: p.x, y: p.y - 58, text: `KO x${g.koStreak}!`, color: "#ffe17d", life: 1.25, size: 18 }); } else if (reason === "bomb" && g.lastHumanBombTarget === p.id && now - g.lastHumanPassAt < 6000) { g.humanKOs++; g.koStreak++; g.score += 150 + g.koStreak * 45; }
    };

    const frame = (t: number) => {
      const g = gameRef.current; const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height);
      if (g && runState === "playing") {
        const rawDt = Math.min(0.034, (t - g.last) / 1000 || 0.016); g.last = t;
        const fuseLeftMs = Math.max(0, g.fuseDuration - (t - g.fuseStartedAt)); const slowMo = fuseLeftMs < 900 && fuseLeftMs > 80 ? 0.62 : 1;
        const dt = rawDt * slowMo; const alive = (g.players as Player[]).filter(p => p.alive); const human: Player = g.players[0];
        if (alive.length <= 3 && !g.final3) { g.final3 = true; g.arenaRadius = Math.max(140, g.arenaRadius * 0.8); g.eventBanner = "⚠ FINAL 3"; g.eventBannerUntil = t + 2100; g.shake = 9; beep(115, 0.2, 0.06, "sawtooth"); }
        if (alive.length === 1 && human.alive) finish(g, true, t);
        if (t > g.nextShrinkAt) { g.arenaRadius = Math.max(125, g.arenaRadius - (g.final3 ? 32 : 22)); g.nextShrinkAt = t + (g.final3 ? 9000 : 14500); g.eventBanner = "ARENA SHRINKING"; g.eventBannerUntil = t + 1200; }
        if (t > g.nextEventAt) randomEvent(g, t); if (g.eventType !== "none" && t > g.eventUntil) g.eventType = "none";
        if (t > g.nextPickupAt) { spawnPickup(g, t); g.nextPickupAt = t + rand(3600, 5400); }
        if (g.pickups.length > 12) g.pickups.splice(0, g.pickups.length - 12);

        if (human.alive && t >= human.stunnedUntil) {
          let dx = inputRef.current.stick.x, dy = inputRef.current.stick.y;
          if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) dx -= 1; if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) dx += 1;
          if (inputRef.current.keys.has("w") || inputRef.current.keys.has("arrowup")) dy -= 1; if (inputRef.current.keys.has("s") || inputRef.current.keys.has("arrowdown")) dy += 1;
          if (Math.hypot(dx, dy) > 0.08) { const n = norm(dx, dy); human.faceX = n.x; human.faceY = n.y; const accel = t < human.speedUntil ? 980 : 760; human.vx += n.x * accel * dt; human.vy += n.y * accel * dt; }
        }

        for (const p of g.players as Player[]) {
          if (p.human || !p.alive || t < p.stunnedUntil) continue;
          const carrier: Player = g.players[g.carrierId];
          if (t > p.thinkAt) {
            p.thinkAt = t + rand(180, 420); let target: Player | null = null;
            if (p.bot === "hunter" || (g.carrierId === p.id && p.bot !== "coward")) target = (g.players as Player[]).filter(q => q.alive && q.id !== p.id).sort((a, b) => distance(p, a) - distance(p, b))[0] || null;
            if (p.bot === "bully") target = human.alive ? human : carrier;
            if (p.bot === "trickster") target = Math.random() < 0.55 ? carrier : human;
            if (p.bot === "coward" && g.carrierId !== p.id) target = carrier;
            if (target) p.targetId = target.id;
          }
          let dx = 0, dy = 0; const carrierP: Player = g.players[g.carrierId];
          if (p.bot === "coward" && g.carrierId !== p.id) { dx = p.x - carrierP.x; dy = p.y - carrierP.y; }
          else if (p.bot === "collector" && g.pickups.length) { const pick = [...g.pickups].sort((a: Pickup, b: Pickup) => distance(p, a) - distance(p, b))[0]; dx = pick.x - p.x; dy = pick.y - p.y; }
          else { const target = (g.players as Player[]).find(q => q.id === p.targetId && q.alive) || human; dx = target.x - p.x; dy = target.y - p.y; }
          if (Math.hypot(dx, dy) < 1) { dx = Math.cos(p.id + t * 0.002); dy = Math.sin(p.id * 1.7 + t * 0.002); }
          const n = norm(dx, dy); p.faceX = n.x; p.faceY = n.y; const aggro = g.final3 ? 1.18 : 1; const accel = (p.bot === "bully" ? 800 : p.bot === "trickster" ? 760 : 710) * aggro * (t < p.speedUntil ? 1.28 : 1); p.vx += n.x * accel * dt; p.vy += n.y * accel * dt;
          if ((p.bot === "bully" || p.bot === "hunter") && t > p.pushCooldownUntil) { const close = (g.players as Player[]).some(q => q.alive && q.id !== p.id && distance(p, q) < 84); if (close) { p.pushCooldownUntil = t + rand(1100, 1800); for (const q of g.players as Player[]) if (q.alive && q.id !== p.id && distance(p, q) < 86) { const k = norm(q.x - p.x, q.y - p.y); q.vx += k.x * 430; q.vy += k.y * 430; q.stunnedUntil = t + 120; q.lastHitBy = p.id; q.lastHitAt = t; } } }
        }

        if (g.eventType === "gravity") for (const p of g.players as Player[]) if (p.alive) { const n = norm(g.center.x - p.x, g.center.y - p.y); p.vx += n.x * 420 * dt; p.vy += n.y * 420 * dt; }

        for (const p of g.players as Player[]) {
          if (!p.alive) continue; const drag = Math.pow(0.00075, dt); p.vx *= drag; p.vy *= drag; const maxSpeed = (t < p.speedUntil ? 330 : 260) * (g.final3 ? 1.08 : 1); const sp = Math.hypot(p.vx, p.vy); if (sp > maxSpeed) { p.vx = p.vx / sp * maxSpeed; p.vy = p.vy / sp * maxSpeed; }
          p.x += p.vx * dt; p.y += p.vy * dt; const fromC = { x: p.x - g.center.x, y: p.y - g.center.y }, d = Math.hypot(fromC.x, fromC.y) || 1;
          if (d > g.arenaRadius - p.r) { const n = { x: fromC.x / d, y: fromC.y / d }; p.x = g.center.x + n.x * (g.arenaRadius - p.r); p.y = g.center.y + n.y * (g.arenaRadius - p.r); p.vx -= n.x * 180; p.vy -= n.y * 180; p.stunnedUntil = Math.max(p.stunnedUntil, t + 60); }
          for (let i = g.pickups.length - 1; i >= 0; i--) { const item: Pickup = g.pickups[i]; if (distance(p, item) < p.r + 18) { if (item.type === "shield") p.shield = true; if (item.type === "speed") p.speedUntil = t + 4700; if (item.type === "dash") p.dashCooldownUntil = 0; if (p.human) { g.score += 70; if (item.type === "dash") setDashReady(true); } makeBurst(g, item.x, item.y, item.type === "shield" ? "#53dfb0" : item.type === "speed" ? "#ffd166" : "#8c7cff", 12, 160); g.pickups.splice(i, 1); } }
        }

        for (const o of g.obstacles as Obstacle[]) {
          o.angle += o.speed * o.dir * rawDt * 1000 * (g.final3 ? 1.35 : 1); const ox = g.center.x + Math.cos(o.angle) * Math.min(o.orbit, g.arenaRadius * 0.7), oy = g.center.y + Math.sin(o.angle) * Math.min(o.orbit, g.arenaRadius * 0.7);
          for (const p of g.players as Player[]) if (p.alive && distance(p, { x: ox, y: oy }) < p.r + o.r && t > ((p as any).obstacleHitAt || 0) + 350) { const n = norm(p.x - ox, p.y - oy); p.vx += n.x * 480; p.vy += n.y * 480; p.stunnedUntil = t + 145; (p as any).obstacleHitAt = t; makeBurst(g, p.x, p.y, "#67d5ff", 8, 170); g.shake = Math.max(g.shake, 4); }
        }

        for (const z of g.hazards as Hazard[]) {
          const cycle = (t + z.phase) % 4900, active = cycle > 1400 && cycle < 2600;
          if (active) for (const p of g.players as Player[]) if (p.alive && distance(p, z) < z.r + p.r * 0.4 && t > ((p as any).hazardHitAt || 0) + 850) { (p as any).hazardHitAt = t; const n = norm(p.x - z.x, p.y - z.y); p.vx += n.x * 530; p.vy += n.y * 530; p.stunnedUntil = t + 230; p.lastHitBy = null; p.lastHitAt = t; makeBurst(g, p.x, p.y, "#ff6f55", 12, 210); }
        }

        for (let i = 0; i < g.players.length; i++) for (let j = i + 1; j < g.players.length; j++) {
          const a: Player = g.players[i], b: Player = g.players[j]; if (!a.alive || !b.alive) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, minD = a.r + b.r;
          if (d < minD) { const n = { x: dx / d, y: dy / d }, overlap = minD - d; a.x -= n.x * overlap * 0.5; a.y -= n.y * overlap * 0.5; b.x += n.x * overlap * 0.5; b.y += n.y * overlap * 0.5; a.vx -= n.x * 55; a.vy -= n.y * 55; b.vx += n.x * 55; b.vy += n.y * 55;
            if (t > g.transferLockUntil && (g.carrierId === a.id || g.carrierId === b.id)) { const from: Player = g.players[g.carrierId], to = from.id === a.id ? b : a; g.carrierId = to.id; g.transferLockUntil = t + 520; const remaining = Math.max(1400, g.fuseDuration - (t - g.fuseStartedAt)); g.fuseStartedAt = t; g.fuseDuration = Math.max(1700, remaining * 0.94); makeBurst(g, to.x, to.y, "#ff5c86", 12, 190); beep(420, 0.045, 0.03, "square");
              if (from.human) { g.combo = t - g.lastTransferAt < 3500 ? g.combo + 1 : 1; g.lastTransferAt = t; g.lastHumanPassAt = t; g.lastHumanBombTarget = to.id; const clutch = remaining < 2200; g.score += 70 + g.combo * 18 + (clutch ? 140 : 0); g.floaters.push({ x: from.x, y: from.y - 52, text: clutch ? "CLUTCH PASS!" : `PASS x${g.combo}`, color: clutch ? "#ffe17d" : "#ffffff", life: 1.1, size: clutch ? 17 : 14 }); }
            }
          }
        }

        if (fuseLeftMs <= 0) {
          const victim: Player = g.players[g.carrierId]; eliminate(g, victim, t, "bomb"); const survivors = (g.players as Player[]).filter(p => p.alive);
          if (survivors.length) { const next = survivors[Math.floor(Math.random() * survivors.length)]; g.carrierId = next.id; g.fuseStartedAt = t; g.fuseDuration = Math.max(g.final3 ? 3200 : 4400, 7600 - g.eliminationCount * 650); g.transferLockUntil = t + 850; g.eliminationCount++; }
        }

        for (let i = g.particles.length - 1; i >= 0; i--) { const q: Particle = g.particles[i]; q.life -= rawDt; q.x += q.vx * rawDt; q.y += q.vy * rawDt; q.vx *= 0.96; q.vy *= 0.96; if (q.life <= 0) g.particles.splice(i, 1); }
        for (let i = g.floaters.length - 1; i >= 0; i--) { const f: FloatText = g.floaters[i]; f.life -= rawDt; f.y -= 28 * rawDt; if (f.life <= 0) g.floaters.splice(i, 1); }
        g.shake *= 0.88; g.flash *= 0.9;

        const dangerSec = Math.ceil(fuseLeftMs / 1000); if (dangerSec <= 3 && t > g.dangerTickAt) { g.dangerTickAt = t + Math.max(170, dangerSec * 180); beep(850 + (3 - dangerSec) * 160, 0.035, 0.028, "square"); }
        if (t - g.lastHud > 90) { g.lastHud = t; setHud({ alive: alive.length, score: g.score, fuse: fuseLeftMs / 1000, carrier: g.players[g.carrierId]?.name || "", combo: g.combo, final3: g.final3, kos: g.humanKOs, koStreak: g.koStreak, survivalStreak: g.survivalStreak, event: t < g.eventBannerUntil ? g.eventBanner : "", coins: profile.coins }); }

        ctx.save(); ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
        const grad = ctx.createRadialGradient(g.center.x, g.center.y, 0, g.center.x, g.center.y, g.arenaRadius * 1.15); grad.addColorStop(0, "#171c42"); grad.addColorStop(0.75, "#0d1028"); grad.addColorStop(1, "#070815"); ctx.fillStyle = grad; ctx.fillRect(-20, -20, rect.width + 40, rect.height + 40);
        ctx.strokeStyle = g.final3 ? "rgba(255,75,105,.9)" : "rgba(140,124,255,.65)"; ctx.lineWidth = g.final3 ? 7 : 5; ctx.shadowBlur = 30; ctx.shadowColor = g.final3 ? "#ff4f6f" : "#7662ff"; ctx.beginPath(); ctx.arc(g.center.x, g.center.y, g.arenaRadius, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.12; ctx.strokeStyle = "#8c7cff"; ctx.lineWidth = 1; for (let r = 70; r < g.arenaRadius; r += 70) { ctx.beginPath(); ctx.arc(g.center.x, g.center.y, r, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1;
        for (const z of g.hazards as Hazard[]) { const cycle = (t + z.phase) % 4900, active = cycle > 1400 && cycle < 2600, warn = cycle <= 1400; ctx.globalAlpha = active ? 0.28 + Math.sin(t * 0.012) * 0.08 : warn ? 0.12 + cycle / 1400 * 0.12 : 0.04; ctx.fillStyle = active ? "#ff5a4f" : "#ffb657"; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = active ? "#ff6f55" : "rgba(255,190,85,.4)"; ctx.lineWidth = active ? 4 : 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); }
        for (const o of g.obstacles as Obstacle[]) { const ox = g.center.x + Math.cos(o.angle) * Math.min(o.orbit, g.arenaRadius * 0.7), oy = g.center.y + Math.sin(o.angle) * Math.min(o.orbit, g.arenaRadius * 0.7); ctx.shadowBlur = 18; ctx.shadowColor = "#55c8ff"; ctx.fillStyle = "#122f55"; ctx.strokeStyle = "#67d5ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; }
        for (const item of g.pickups as Pickup[]) { const pulse = 1 + Math.sin(t * 0.006 + item.id) * 0.12; const color = item.type === "shield" ? "#53dfb0" : item.type === "speed" ? "#ffd166" : "#8c7cff"; ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(item.x, item.y, 10 * pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#07101a"; ctx.font = "900 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(item.type === "shield" ? "S" : item.type === "speed" ? "⚡" : "D", item.x, item.y + 0.5); }
        for (const p of g.players as Player[]) {
          if (!p.alive) continue; const carrier = p.id === g.carrierId; if (carrier) { const pulse = 27 + Math.sin(t * 0.015) * 4; ctx.strokeStyle = fuseLeftMs < 1800 ? "#ff315f" : "#ff7d9b"; ctx.lineWidth = 4; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = "#ff2e55"; ctx.font = "900 15px system-ui"; ctx.textAlign = "center"; ctx.fillText("💣", p.x, p.y - 43); }
          if (p.shield) { ctx.strokeStyle = "#53dfb0"; ctx.lineWidth = 3; ctx.globalAlpha = 0.72; ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
          const img = imagesRef.current[p.skin]; const size = p.human ? 78 : 70, moving = Math.hypot(p.vx, p.vy) > 45, bob = moving ? Math.sin(t * 0.018 + p.id) * 3 : Math.sin(t * 0.006 + p.id) * 1.5; const stretch = t < p.dashUntil ? 1.18 : 1;
          ctx.save(); ctx.translate(p.x, p.y + 4 + bob); if (p.faceX < -0.08) ctx.scale(-1, 1); ctx.scale(stretch, 1 / Math.sqrt(stretch)); if (p.human) { ctx.shadowBlur = 18; ctx.shadowColor = "rgba(140,124,255,.9)"; } if (img?.complete && img.naturalWidth > 0) ctx.drawImage(img, -size / 2, -size / 2, size, size); else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); } ctx.restore();
          ctx.fillStyle = p.human ? "#fff" : "rgba(255,255,255,.82)"; ctx.font = p.human ? "900 11px system-ui" : "800 10px system-ui"; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y + 42);
        }
        for (const q of g.particles as Particle[]) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
        for (const f of g.floaters as FloatText[]) { ctx.globalAlpha = clamp(f.life, 0, 1); ctx.fillStyle = f.color; ctx.font = `900 ${f.size}px system-ui`; ctx.textAlign = "center"; ctx.fillText(f.text, f.x, f.y); } ctx.globalAlpha = 1;
        if (g.flash > 0.03) { ctx.globalAlpha = g.flash * 0.18; ctx.fillStyle = g.final3 ? "#ff315f" : "#ffffff"; ctx.fillRect(0, 0, rect.width, rect.height); ctx.globalAlpha = 1; }
        if (fuseLeftMs < 1200) { const a = (1 - fuseLeftMs / 1200) * 0.19; const vg = ctx.createRadialGradient(rect.width / 2, rect.height / 2, Math.min(rect.width, rect.height) * 0.18, rect.width / 2, rect.height / 2, Math.max(rect.width, rect.height) * 0.7); vg.addColorStop(0, "rgba(255,20,60,0)"); vg.addColorStop(1, `rgba(255,20,60,${a})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, rect.width, rect.height); }
        ctx.restore();
      } else {
        const grad = ctx.createRadialGradient(rect.width / 2, rect.height * 0.38, 0, rect.width / 2, rect.height * 0.38, Math.max(rect.width, rect.height) * 0.75); grad.addColorStop(0, "#171b45"); grad.addColorStop(1, "#070815"); ctx.fillStyle = grad; ctx.fillRect(0, 0, rect.width, rect.height);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { window.removeEventListener("resize", resize); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [beep, profile, runState]);

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (runState !== "playing") return; if (e.clientX > window.innerWidth * 0.56) return;
    inputRef.current.pointerId = e.pointerId; inputRef.current.origin = { x: e.clientX, y: e.clientY }; inputRef.current.stick = { x: 0, y: 0 }; setStick({ x: 0, y: 0 }); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputRef.current.pointerId !== e.pointerId) return; const dx = e.clientX - inputRef.current.origin.x, dy = e.clientY - inputRef.current.origin.y, n = norm(dx, dy), mag = Math.min(1, Math.hypot(dx, dy) / 48); const v = { x: n.x * mag, y: n.y * mag }; inputRef.current.stick = v; setStick({ x: v.x * 28, y: v.y * 28 });
  };
  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => { if (inputRef.current.pointerId !== e.pointerId) return; inputRef.current.pointerId = -1; inputRef.current.stick = { x: 0, y: 0 }; setStick({ x: 0, y: 0 }); };

  return (
    <main className={`shell ${hud.final3 ? "final-three" : ""}`}>
      <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />

      {runState === "playing" && <div className="hud">
        <div className="topbar"><div className="pill">🏆 {hud.score}</div><div className={`pill ${hud.fuse < 2 ? "hot" : ""}`}>👥 {hud.alive} LEFT</div><div className="pill good">🪙 {profile.coins}</div></div>
        <div className="streaks"><span className="mini-pill">KO {hud.kos}</span>{hud.koStreak > 1 && <span className="mini-pill hot-mini">🔥 KO x{hud.koStreak}</span>}{hud.survivalStreak > 1 && <span className="mini-pill">⚡ SURVIVE x{hud.survivalStreak}</span>}{hud.combo > 1 && <span className="mini-pill">PASS x{hud.combo}</span>}</div>
        {hud.event && <div className="event-banner">{hud.event}</div>}{hud.final3 && <div className="final3-badge">FINAL 3 • NO MERCY</div>}
        <div className="center-callout"><div className="bomb-time">{hud.fuse.toFixed(hud.fuse < 2 ? 1 : 0)}</div><div className="bomb-label">💣 {hud.carrier === "YOU" ? "YOU HAVE THE BOMB" : `${hud.carrier} HAS IT`}</div></div>
        <div className="joystick-base"><div className="joystick-knob" style={{ "--jx": `${stick.x}px`, "--jy": `${stick.y}px` } as React.CSSProperties} /></div>
        <div className="action-stack"><button className={`action push ${pushReady ? "" : "cool"}`} onPointerDown={(e) => { e.stopPropagation(); push(); }}>PUSH</button><button className={`action dash ${dashReady ? "" : "cool"}`} onPointerDown={(e) => { e.stopPropagation(); dash(); }}>DASH</button></div>
      </div>}

      {runState === "menu" && <section className="overlay"><div className="card">
        <div className="brand">FUSE<span>RUSH</span></div><p className="tagline">Pass the bomb. Knock rivals into danger. Survive the shrinking arena. Every round gets faster.</p>
        <div className="character-title">CHOOSE YOUR RUNNER</div>
        <div className="character-picker">
          <button className={`character ${skin === "blonde" ? "selected" : ""}`} onClick={() => setSkin("blonde")}><img src="/sprites/blonde-idle.webp" alt="Blaze" /><b>Blaze</b><small>Fast • fearless</small></button>
          <button className={`character ${skin === "dark" ? "selected" : ""}`} onClick={() => setSkin("dark")}><img src="/sprites/dark-idle.webp" alt="Nyx" /><b>Nyx</b><small>Cool • tactical</small></button>
        </div>
        <div className="stats"><div className="stat"><b>{profile.coins}</b><small>Coins</small></div><div className="stat"><b>{profile.xp}</b><small>XP</small></div><div className="stat"><b>{profile.best}</b><small>Best</small></div></div>
        <button className="play" onClick={startGame}>PLAY NOW</button><div className="help">Mobile: left thumb moves • PUSH knocks rivals • DASH escapes. Desktop: WASD/arrows • F/E push • Space/Shift dash.</div>
      </div></section>}

      {runState === "result" && <section className="overlay"><div className="card">
        <h1 className="result-title">{result.won ? "🏆 YOU WON" : "💥 ELIMINATED"}</h1><p className="tagline">{result.won ? "You owned the arena." : "That was close. One more run?"}</p>
        <div className="stats"><div className="stat"><b>{result.score}</b><small>Score</small></div><div className="stat"><b>{result.kos}</b><small>KOs</small></div><div className="stat"><b>{result.survival}s</b><small>Survived</small></div></div>
        <div className="reward">+{result.coins} coins • +{result.xp} XP</div><div className="result-note">Best score: {result.best}</div><div className="progress"><i style={{ width: `${Math.min(100, (profile.xp % 500) / 5)}%` }} /></div>
        <button className="play" onClick={startGame}>PLAY AGAIN</button><div className="help" onClick={() => setRunState("menu")} style={{ cursor: "pointer" }}>Change character</div>
      </div></section>}
    </main>
  );
}
