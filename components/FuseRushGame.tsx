"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BLAZE_ATLAS, NYX_ATLAS } from "./sprite-data/atlases";

type Skin = "blonde" | "dark";
type VisualStyle = "phase1" | "classic";
type FighterChoice = "blaze" | "nyx" | "classic-blaze" | "classic-nyx";
type RunState = "menu" | "playing" | "result";
type AttackType = "punch" | "kick" | null;
type WeaponType = "bat" | "hammer" | "blade" | null;
type WeaponPickup = {
  id: number;
  type: Exclude<WeaponType, null>;
  x: number;
  active: boolean;
  respawnAt: number;
};

type Fighter = {
  id: number;
  name: string;
  human: boolean;
  skin: Skin;
  visualStyle: VisualStyle;
  color: string;
  x: number;
  vx: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  facing: 1 | -1;
  attackType: AttackType;
  attackStartedAt: number;
  attackUntil: number;
  punchCooldownUntil: number;
  kickCooldownUntil: number;
  dashUntil: number;
  dashCooldownUntil: number;
  stunUntil: number;
  invulnUntil: number;
  thinkAt: number;
  targetId: number | null;
  blocking: boolean;
  blockUntil: number;
  energy: number;
  comboCount: number;
  comboUntil: number;
  koUntil: number;
  weapon: WeaponType;
  weaponDurability: number;
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

type Hud = {
  hp: number;
  enemies: { name: string; hp: number; alive: boolean }[];
  score: number;
  kos: number;
  time: number;
  energy: number;
  combo: number;
  round: number;
  playerRounds: number;
  enemyRounds: number;
  roundBanner: string;
  timeLeft: number;
  specialName: string;
  weapon: string;
  weaponDurability: number;
};

type Result = {
  won: boolean;
  score: number;
  kos: number;
  coins: number;
  xp: number;
  time: number;
  playerRounds: number;
  enemyRounds: number;
};

const BOT_NAMES = ["Nova", "Rex"];
const BOT_COLORS = ["#ff5c86", "#53dfb0"];

const FIGHTER_ROSTER: Array<{
  id: FighterChoice;
  name: string;
  skin: Skin;
  visualStyle: VisualStyle;
  subtitle: string;
  badge: string;
}> = [
  {
    id: "blaze",
    name: "Blaze",
    skin: "blonde",
    visualStyle: "phase1",
    subtitle: "Rushdown • full combat animation",
    badge: "NEW",
  },
  {
    id: "nyx",
    name: "Nyx",
    skin: "dark",
    visualStyle: "phase1",
    subtitle: "Power Guard • full combat animation",
    badge: "NEW",
  },
  {
    id: "classic-blaze",
    name: "Classic Blaze",
    skin: "blonde",
    visualStyle: "classic",
    subtitle: "Original game fighter",
    badge: "CLASSIC",
  },
  {
    id: "classic-nyx",
    name: "Classic Nyx",
    skin: "dark",
    visualStyle: "classic",
    subtitle: "Original game fighter",
    badge: "CLASSIC",
  },
];

const FRAME_INDEX = {
  idle: 0,
  walk1: 1,
  walk2: 2,
  walk3: 3,
  "punch-windup": 4,
  "punch-hit": 5,
  "punch-recover": 6,
  "kick-windup": 7,
  "kick-hit": 8,
  "kick-recover": 9,
  block: 10,
  hurt: 11,
  knockdown: 12,
  getup: 13,
  "weapon-idle": 14,
  "weapon-walk1": 15,
  "weapon-walk2": 16,
  "weapon-attack": 17,
  victory: 18,
} as const;

type SpriteFrame = keyof typeof FRAME_INDEX;

const ATLAS_CELL_W = 128;
const ATLAS_CELL_H = 85;
const ATLAS_COLS = 5;

function drawAtlasFrame(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement,
  frame: SpriteFrame,
  width: number,
  height: number
) {
  const index = FRAME_INDEX[frame];
  const sx = (index % ATLAS_COLS) * ATLAS_CELL_W;
  const sy = Math.floor(index / ATLAS_COLS) * ATLAS_CELL_H;

  ctx.drawImage(
    atlas,
    sx,
    sy,
    ATLAS_CELL_W,
    ATLAS_CELL_H,
    -width / 2,
    -height,
    width,
    height
  );
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const attackProgressSafe = (t: number, fighter: Fighter, duration: number) =>
  clamp((t - fighter.attackStartedAt) / duration, 0, 1);

const fighterTuning = (skin: Skin) =>
  skin === "blonde"
    ? {
        name: "Blaze",
        style: "Rushdown",
        speed: 1.12,
        punchDamage: 1.15,
        kickDamage: 0.96,
        punchCooldown: 0.82,
        kickCooldown: 1,
        guardFactor: 0.32,
        specialName: "BLAZE RUSH",
      }
    : {
        name: "Nyx",
        style: "Power Guard",
        speed: 0.98,
        punchDamage: 0.96,
        kickDamage: 1.2,
        punchCooldown: 1,
        kickCooldown: 0.82,
        guardFactor: 0.2,
        specialName: "NYX BREAKER",
      };

const weaponTuning = (type: Exclude<WeaponType, null>) => {
  if (type === "bat") {
    return {
      name: "BAT",
      damageBonus: 7,
      rangeBonus: 28,
      knockbackBonus: 135,
      cooldownMul: 1,
      durability: 5,
      color: "#9c673b",
    };
  }

  if (type === "hammer") {
    return {
      name: "HAMMER",
      damageBonus: 13,
      rangeBonus: 20,
      knockbackBonus: 250,
      cooldownMul: 1.22,
      durability: 4,
      color: "#9aa8b9",
    };
  }

  return {
    name: "ENERGY BLADE",
    damageBonus: 10,
    rangeBonus: 42,
    knockbackBonus: 165,
    cooldownMul: 0.9,
    durability: 6,
    color: "#74f6ff",
  };
};

function drawWeaponShape(
  ctx: CanvasRenderingContext2D,
  type: Exclude<WeaponType, null>,
  scale = 1,
  swing = 0
) {
  ctx.save();
  ctx.scale(scale, scale);

  if (type === "bat") {
    ctx.rotate(-0.38 + swing * 0.7);
    ctx.strokeStyle = "#6f4529";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(26, -14);
    ctx.stroke();
    ctx.strokeStyle = "#bd8650";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(18, -8);
    ctx.lineTo(35, -22);
    ctx.stroke();
  } else if (type === "hammer") {
    ctx.rotate(-0.55 + swing * 0.8);
    ctx.strokeStyle = "#6d4b30";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(24, -15);
    ctx.stroke();
    ctx.fillStyle = "#aab5c4";
    ctx.fillRect(17, -26, 24, 14);
    ctx.strokeStyle = "#4b5666";
    ctx.lineWidth = 2;
    ctx.strokeRect(17, -26, 24, 14);
  } else {
    ctx.rotate(-0.3 + swing * 0.75);
    ctx.strokeStyle = "#243347";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3, 10);
    ctx.lineTo(10, -1);
    ctx.stroke();

    ctx.shadowBlur = 14;
    ctx.shadowColor = "#74f6ff";
    ctx.strokeStyle = "#9cffff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(10, -1);
    ctx.lineTo(42, -30);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function burst(g: any, x: number, y: number, color: string, count = 12, speed = 190) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
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
  const atlasRef = useRef<Record<Skin, HTMLImageElement | null>>({
    blonde: null,
    dark: null,
  });
  const stageRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef({
    keys: new Set<string>(),
    stickX: 0,
    pointerId: -1,
    originX: 0,
  });

  const [runState, setRunState] = useState<RunState>("menu");
  const [fighterChoice, setFighterChoice] = useState<FighterChoice>("blaze");
  const [skin, setSkin] = useState<Skin>("blonde");
  const [stickVisual, setStickVisual] = useState(0);
  const [punchReady, setPunchReady] = useState(true);
  const [kickReady, setKickReady] = useState(true);
  const [dashReady, setDashReady] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [specialReady, setSpecialReady] = useState(false);
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
    energy: 0,
    combo: 0,
    round: 1,
    playerRounds: 0,
    enemyRounds: 0,
    roundBanner: "ROUND 1",
    timeLeft: 60,
    specialName: fighterTuning("blonde").specialName,
    weapon: "PUNCH",
    weaponDurability: 0,
  });
  const [result, setResult] = useState<Result>({
    won: false,
    score: 0,
    kos: 0,
    coins: 0,
    xp: 0,
    time: 0,
    playerRounds: 0,
    enemyRounds: 0,
  });

  useEffect(() => {
    const stored = {
      coins: Number(localStorage.getItem("denuel_fight_coins") || 0),
      xp: Number(localStorage.getItem("denuel_fight_xp") || 0),
      best: Number(localStorage.getItem("denuel_fight_best") || 0),
    };
    setProfile(stored);

    const legacyStates = ["idle", "run1", "run2", "push"] as const;
    (["blonde", "dark"] as Skin[]).forEach((character) => {
      legacyStates.forEach((state) => {
        const img = new Image();
        img.src = `/sprites/${character}-${state}.webp`;
        imagesRef.current[`${character}-${state}`] = img;
      });
    });

    const blazeAtlas = new Image();
    blazeAtlas.src = BLAZE_ATLAS;
    atlasRef.current.blonde = blazeAtlas;

    const nyxAtlas = new Image();
    nyxAtlas.src = NYX_ATLAS;
    atlasRef.current.dark = nyxAtlas;

    const stage = new Image();
    stage.src = "/backgrounds/denuel-stage.svg";
    stageRef.current = stage;
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
    const width = rect.width || window.innerWidth;
    const now = performance.now();
    const selectedFighter =
      FIGHTER_ROSTER.find((fighter) => fighter.id === fighterChoice) ??
      FIGHTER_ROSTER[0];

    const fighters: Fighter[] = [
      {
        id: 0,
        name: "YOU",
        human: true,
        skin,
        visualStyle: selectedFighter.visualStyle,
        color: "#8c7cff",
        x: width * 0.24,
        vx: 0,
        hp: 100,
        maxHp: 100,
        alive: true,
        facing: 1,
        attackType: null,
        attackStartedAt: 0,
        attackUntil: 0,
        punchCooldownUntil: 0,
        kickCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: 1,
        blocking: false,
        blockUntil: 0,
        energy: 0,
        comboCount: 0,
        comboUntil: 0,
        koUntil: 0,
        weapon: null,
        weaponDurability: 0,
      },
      {
        id: 1,
        name: BOT_NAMES[0],
        human: false,
        skin: skin === "blonde" ? "dark" : "blonde",
        visualStyle: "phase1",
        color: BOT_COLORS[0],
        x: width * 0.57,
        vx: 0,
        hp: 100,
        maxHp: 100,
        alive: true,
        facing: -1,
        attackType: null,
        attackStartedAt: 0,
        attackUntil: 0,
        punchCooldownUntil: 0,
        kickCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: 0,
        blocking: false,
        blockUntil: 0,
        energy: 0,
        comboCount: 0,
        comboUntil: 0,
        koUntil: 0,
        weapon: null,
        weaponDurability: 0,
      },
      {
        id: 2,
        name: BOT_NAMES[1],
        human: false,
        skin,
        visualStyle: "phase1",
        color: BOT_COLORS[1],
        x: width * 0.80,
        vx: 0,
        hp: 100,
        maxHp: 100,
        alive: true,
        facing: -1,
        attackType: null,
        attackStartedAt: 0,
        attackUntil: 0,
        punchCooldownUntil: 0,
        kickCooldownUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: 0,
        stunUntil: 0,
        invulnUntil: 0,
        thinkAt: 0,
        targetId: 0,
        blocking: false,
        blockUntil: 0,
        energy: 0,
        comboCount: 0,
        comboUntil: 0,
        koUntil: 0,
        weapon: null,
        weaponDurability: 0,
      },
    ];

    gameRef.current = {
      fighters,
      width,
      height: rect.height,
      groundY: rect.height * 0.72,
      leftBound: 34,
      rightBound: width - 34,
      start: now,
      last: now,
      score: 0,
      kos: 0,
      ending: false,
      particles: [] as Particle[],
      floaters: [] as FloatText[],
      shake: 0,
      flash: 0,
      lastHudAt: 0,
      comboSequence: [] as string[],
      comboWindowUntil: 0,
      weapons: [
        { id: 1, type: "bat", x: width * 0.36, active: true, respawnAt: 0 },
        { id: 2, type: "hammer", x: width * 0.52, active: true, respawnAt: 0 },
        { id: 3, type: "blade", x: width * 0.69, active: true, respawnAt: 0 },
      ] as WeaponPickup[],
      weaponId: 4,
      round: 1,
      playerRounds: 0,
      enemyRounds: 0,
      roundDuration: 60000,
      roundStartedAt: now,
      roundActive: true,
      roundBanner: "ROUND 1",
      roundBannerUntil: now + 1300,
      nextRoundAt: 0,
      matchFinishAt: 0,
      matchWinner: false,
      roundWinnerId: null as number | null,
    };

    setHud({
      hp: 100,
      enemies: fighters.slice(1).map((f) => ({
        name: f.name,
        hp: f.hp,
        alive: f.alive,
      })),
      score: 0,
      kos: 0,
      time: 0,
      energy: 0,
      combo: 0,
      round: 1,
      playerRounds: 0,
      enemyRounds: 0,
      roundBanner: "ROUND 1",
      timeLeft: 60,
      specialName: fighterTuning(skin).specialName,
      weapon: "PUNCH",
      weaponDurability: 0,
    });

    setPunchReady(true);
    setKickReady(true);
    setDashReady(true);
    setBlocking(false);
    setSpecialReady(false);
    setRunState("playing");
    beep(520, 0.05, 0.04, "square");
  }, [beep, fighterChoice, skin]);

  const hitTarget = useCallback(
    (
      attacker: Fighter,
      target: Fighter,
      now: number,
      type: Exclude<AttackType, null>
    ) => {
      const g = gameRef.current;
      if (!g || !target.alive || now < target.invulnUntil) return false;

      const dx = target.x - attacker.x;
      const forward = dx * attacker.facing;
      const absDx = Math.abs(dx);

      const activeWeapon =
        type === "punch" && attacker.weapon ? weaponTuning(attacker.weapon) : null;
      const range = type === "punch" ? 78 + (activeWeapon?.rangeBonus || 0) : 112;
      if (forward < 4 || absDx > range) return false;

      const attackerTune = fighterTuning(attacker.skin);
      const targetTune = fighterTuning(target.skin);

      let damage =
        type === "punch"
          ? attacker.human
            ? Math.floor(rand(10, 15))
            : Math.floor(rand(8, 13))
          : attacker.human
            ? Math.floor(rand(18, 25))
            : Math.floor(rand(14, 21));

      damage = Math.max(
        1,
        Math.floor(
          damage * (type === "punch" ? attackerTune.punchDamage : attackerTune.kickDamage)
        )
      );

      if (activeWeapon) {
        damage += activeWeapon.damageBonus;
      }

      let knockback =
        type === "punch"
          ? 240 * (attacker.skin === "blonde" ? 1.08 : 1)
          : 410 * (attacker.skin === "dark" ? 1.12 : 1);

      if (activeWeapon) {
        knockback += activeWeapon.knockbackBonus;
      }

      const isBlocking = target.blocking || now < target.blockUntil;

      if (isBlocking) {
        damage = Math.max(2, Math.floor(damage * targetTune.guardFactor));
        knockback *= 0.32;
        target.energy = clamp(target.energy + 7, 0, 100);
        g.floaters.push({
          x: target.x,
          y: g.groundY - 112,
          text: "BLOCK!",
          life: 0.75,
          color: "#8fe8ff",
          size: 15,
        });
      }

      target.hp = Math.max(0, target.hp - damage);
      target.vx += attacker.facing * knockback;
      target.stunUntil = now + (isBlocking ? 55 : type === "punch" ? 130 : 230);
      target.invulnUntil = now + (isBlocking ? 90 : type === "punch" ? 150 : 250);

      attacker.energy = clamp(attacker.energy + (isBlocking ? 4 : type === "punch" ? 10 : 16), 0, 100);

      if (attacker.human) {
        if (now > attacker.comboUntil) attacker.comboCount = 0;
        attacker.comboCount += 1;
        attacker.comboUntil = now + 1450;
        g.comboSequence.push(type);
        if (g.comboSequence.length > 3) g.comboSequence.shift();
        if (now > g.comboWindowUntil) {
          g.comboSequence = [type];
        }
        g.comboWindowUntil = now + 1450;

        const ppKick =
          g.comboSequence.length === 3 &&
          g.comboSequence[0] === "punch" &&
          g.comboSequence[1] === "punch" &&
          g.comboSequence[2] === "kick";

        if (ppKick && !isBlocking) {
          const bonus = 12;
          target.hp = Math.max(0, target.hp - bonus);
          target.vx += attacker.facing * 260;
          attacker.energy = clamp(attacker.energy + 22, 0, 100);
          g.score += 450;
          g.floaters.push({
            x: target.x,
            y: g.groundY - 140,
            text: "3-HIT COMBO!",
            life: 1.1,
            color: "#ffe66d",
            size: 20,
          });
          g.shake = Math.max(g.shake, 11);
          g.comboSequence = [];
        }

        g.score += damage * (type === "punch" ? 8 : 11) + attacker.comboCount * 12;
      }

      if (activeWeapon && attacker.weapon) {
        attacker.weaponDurability = Math.max(0, attacker.weaponDurability - 1);

        if (attacker.weaponDurability <= 0) {
          const brokenName = activeWeapon.name;
          attacker.weapon = null;
          attacker.weaponDurability = 0;
          g.floaters.push({
            x: attacker.x,
            y: g.groundY - 125,
            text: `${brokenName} BROKE!`,
            life: 1,
            color: "#ffffff",
            size: 14,
          });
          burst(g, attacker.x + attacker.facing * 30, g.groundY - 58, activeWeapon.color, 10, 150);
        }
      }

      const hitY = g.groundY - 66;
      burst(
        g,
        target.x,
        hitY,
        type === "punch" ? "#fff1a8" : "#ffb35c",
        type === "punch" ? 10 : 16,
        type === "punch" ? 180 : 250
      );

      g.floaters.push({
        x: target.x,
        y: hitY - 24,
        text: `${activeWeapon ? activeWeapon.name : type === "punch" ? "PUNCH" : "KICK"} -${damage}`,
        life: 0.9,
        color: type === "punch" ? "#fff3b5" : "#ffd08a",
        size: type === "punch" ? 14 : 16,
      });

      g.shake = Math.max(g.shake, type === "punch" ? 5 : 9);

      if (target.hp <= 0) {
        target.alive = false;
        target.koUntil = now + 850;
        target.vx = attacker.facing * 220;

        if (target.weapon) {
          g.weapons.push({
            id: g.weaponId++,
            type: target.weapon,
            x: clamp(target.x, g.leftBound + 35, g.rightBound - 35),
            active: true,
            respawnAt: 0,
          });
          target.weapon = null;
          target.weaponDurability = 0;
        }
        burst(g, target.x, hitY, "#ff5c86", 28, 300);
        g.floaters.push({
          x: target.x,
          y: hitY - 48,
          text: "K.O!",
          life: 1.4,
          color: "#ffd166",
          size: 24,
        });

        if (attacker.human) {
          g.kos += 1;
          g.score += 750;
        }
      }

      beep(type === "punch" ? 155 : 105, type === "punch" ? 0.055 : 0.085, 0.055, "square");
      if (attacker.human) vibrate(type === "punch" ? 18 : [25, 18, 38]);

      return true;
    },
    [beep]
  );

  const performAttack = useCallback(
    (fighter: Fighter, type: Exclude<AttackType, null>, now: number) => {
      const g = gameRef.current;
      if (!g || !fighter.alive || fighter.blocking || now < fighter.blockUntil || now < fighter.stunUntil) return false;

      if (type === "punch") {
        if (now < fighter.punchCooldownUntil) return false;
        const tune = fighterTuning(fighter.skin);
        const weaponTune = fighter.weapon ? weaponTuning(fighter.weapon) : null;
        fighter.punchCooldownUntil =
          now +
          (fighter.human ? 380 * tune.punchCooldown : rand(460, 680) * tune.punchCooldown) *
            (weaponTune?.cooldownMul || 1);
        fighter.attackUntil =
          now +
          (fighter.weapon === "hammer"
            ? 340
            : fighter.weapon === "bat"
              ? 285
              : fighter.weapon === "blade"
                ? 245
                : fighter.skin === "blonde"
                  ? 225
                  : 260);
      } else {
        if (now < fighter.kickCooldownUntil) return false;
        const tune = fighterTuning(fighter.skin);
        fighter.kickCooldownUntil =
          now + (fighter.human ? 780 * tune.kickCooldown : rand(850, 1180) * tune.kickCooldown);
        fighter.attackUntil = now + (fighter.skin === "dark" ? 350 : 405);
      }

      fighter.attackType = type;
      fighter.attackStartedAt = now;

      let bestTarget: Fighter | null = null;
      let bestDistance = Infinity;

      for (const candidate of g.fighters as Fighter[]) {
        if (!candidate.alive || candidate.id === fighter.id) continue;
        const d = Math.abs(candidate.x - fighter.x);
        if (d < bestDistance) {
          bestDistance = d;
          bestTarget = candidate;
        }
      }

      if (bestTarget) {
        fighter.facing = bestTarget.x >= fighter.x ? 1 : -1;
        const impactDelay =
          type === "punch"
            ? fighter.weapon === "hammer"
              ? 145
              : fighter.weapon === "bat"
                ? 105
                : fighter.weapon === "blade"
                  ? 78
                  : 82
            : 150;
        setTimeout(() => {
          const live = gameRef.current;
          if (!live || runState !== "playing" || !fighter.alive) return;
          hitTarget(fighter, bestTarget!, performance.now(), type);
        }, impactDelay);
      }

      return true;
    },
    [hitTarget, runState]
  );

  const punch = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing" || !g.roundActive) return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();

    if (!performAttack(player, "punch", now)) return;

    setPunchReady(false);
    setTimeout(
      () => setPunchReady(true),
      Math.max(120, player.punchCooldownUntil - now)
    );
  }, [performAttack, runState]);

  const kick = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing" || !g.roundActive) return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();

    if (!performAttack(player, "kick", now)) return;

    setKickReady(false);
    setTimeout(
      () => setKickReady(true),
      Math.max(220, player.kickCooldownUntil - now)
    );
  }, [performAttack, runState]);

  const setBlockState = useCallback((active: boolean) => {
    const g = gameRef.current;
    if (!g || runState !== "playing" || !g.roundActive) return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();

    if (!player.alive || now < player.stunUntil || now < player.attackUntil) {
      if (!active) {
        player.blocking = false;
        setBlocking(false);
      }
      return;
    }

    player.blocking = active;
    player.blockUntil = active ? now + 120 : 0;
    if (active) {
      player.vx *= 0.35;
      setBlocking(true);
    } else {
      setBlocking(false);
    }
  }, [runState]);

  const special = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing" || !g.roundActive) return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();

    if (!player.alive || player.energy < 100 || now < player.stunUntil) return;

    const tune = fighterTuning(player.skin);
    player.energy = 0;
    player.blocking = false;
    player.attackStartedAt = now;
    player.attackUntil = now + (player.skin === "blonde" ? 760 : 690);
    player.attackType = player.skin === "blonde" ? "punch" : "kick";
    setBlocking(false);
    setSpecialReady(false);

    const targets = (g.fighters as Fighter[])
      .filter((f) => f.alive && !f.human)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x));

    const target = targets[0];
    if (!target) return;

    player.facing = target.x >= player.x ? 1 : -1;

    g.floaters.push({
      x: player.x,
      y: g.groundY - 150,
      text: tune.specialName,
      life: 1.2,
      color: player.skin === "blonde" ? "#ffe66d" : "#9ffcff",
      size: 20,
    });

    if (player.skin === "blonde") {
      player.vx += player.facing * 520;

      [150, 300, 455].forEach((delay, index) => {
        setTimeout(() => {
          const live = gameRef.current;
          if (!live || runState !== "playing" || !live.roundActive || !target.alive) return;
          if (Math.abs(target.x - player.x) > 165) return;

          const damage = index === 2 ? 18 : 13;
          target.hp = Math.max(0, target.hp - damage);
          target.stunUntil = performance.now() + 170;
          target.invulnUntil = performance.now() + 125;
          target.vx += player.facing * (index === 2 ? 520 : 180);
          live.score += 260 + index * 80;
          burst(
            live,
            target.x,
            live.groundY - 68,
            index === 2 ? "#fff06b" : "#ffb85c",
            index === 2 ? 22 : 12,
            index === 2 ? 300 : 190
          );
          live.floaters.push({
            x: target.x,
            y: live.groundY - 118 - index * 10,
            text: index === 2 ? "FINISH!" : `RUSH ${index + 1}`,
            life: 0.8,
            color: "#ffe66d",
            size: index === 2 ? 18 : 13,
          });
          live.shake = Math.max(live.shake, index === 2 ? 12 : 6);

          if (target.hp <= 0 && target.alive) {
            target.alive = false;
            target.koUntil = performance.now() + 900;
            live.kos += 1;
            live.score += 750;
          }
        }, delay);
      });

      beep(125, 0.16, 0.075, "sawtooth");
      vibrate([20, 20, 20, 20, 45]);
    } else {
      player.vx += player.facing * 330;

      setTimeout(() => {
        const live = gameRef.current;
        if (!live || runState !== "playing" || !live.roundActive || !target.alive) return;
        if (Math.abs(target.x - player.x) > 175) return;

        const damage = 48;
        target.blocking = false;
        target.blockUntil = 0;
        target.hp = Math.max(0, target.hp - damage);
        target.vx += player.facing * 760;
        target.stunUntil = performance.now() + 480;
        target.invulnUntil = performance.now() + 350;
        live.score += 1050;
        burst(live, target.x, live.groundY - 62, "#9ffcff", 34, 360);
        live.floaters.push({
          x: target.x,
          y: live.groundY - 145,
          text: "GUARD BREAK! -48",
          life: 1.25,
          color: "#9ffcff",
          size: 20,
        });
        live.shake = 16;

        if (target.hp <= 0 && target.alive) {
          target.alive = false;
          target.koUntil = performance.now() + 950;
          live.kos += 1;
          live.score += 750;
        }
      }, 285);

      beep(72, 0.2, 0.09, "sawtooth");
      vibrate([40, 25, 65]);
    }
  }, [beep, runState]);

  const dash = useCallback(() => {
    const g = gameRef.current;
    if (!g || runState !== "playing" || !g.roundActive) return;
    const player: Fighter = g.fighters[0];
    const now = performance.now();

    if (!player.alive || player.blocking || now < player.dashCooldownUntil || now < player.stunUntil) return;

    let direction = inputRef.current.stickX;
    if (Math.abs(direction) < 0.1) {
      if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) direction = -1;
      if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) direction = 1;
    }
    if (Math.abs(direction) < 0.1) direction = player.facing;

    const dir = direction >= 0 ? 1 : -1;
    player.facing = dir;
    player.vx += dir * 720;
    player.dashUntil = now + 180;
    player.dashCooldownUntil = now + 1350;

    setDashReady(false);
    setTimeout(() => setDashReady(true), 1350);

    burst(g, player.x, g.groundY - 42, "#8c7cff", 10, 130);
    g.shake = Math.max(g.shake, 3);
    beep(190, 0.06, 0.04, "sawtooth");
    vibrate(14);
  }, [beep, runState]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      inputRef.current.keys.add(k);

      if (k === "j" || k === "f") {
        e.preventDefault();
        punch();
      }
      if (k === "k" || k === "e") {
        e.preventDefault();
        kick();
      }
      if (k === "l") {
        e.preventDefault();
        setBlockState(true);
      }
      if (k === "u" || k === "q") {
        e.preventDefault();
        special();
      }
      if (k === " " || k === "shift") {
        e.preventDefault();
        dash();
      }
    };

    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      inputRef.current.keys.delete(key);
      if (key === "l") setBlockState(false);
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [dash, kick, punch, setBlockState, special]);

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
        const oldWidth = g.width || rect.width;
        const ratio = oldWidth ? rect.width / oldWidth : 1;
        for (const fighter of g.fighters as Fighter[]) {
          fighter.x *= ratio;
        }
        g.width = rect.width;
        g.height = rect.height;
        g.groundY = rect.height * 0.72;
        g.leftBound = 32;
        g.rightBound = rect.width - 32;
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
      const next = {
        coins: profile.coins + coins,
        xp: profile.xp + xp,
        best,
      };

      setProfile(next);
      localStorage.setItem("denuel_fight_coins", String(next.coins));
      localStorage.setItem("denuel_fight_xp", String(next.xp));
      localStorage.setItem("denuel_fight_best", String(next.best));

      setResult({
        won,
        score: g.score,
        kos: g.kos,
        coins,
        xp,
        time,
        playerRounds: g.playerRounds,
        enemyRounds: g.enemyRounds,
      });

      setTimeout(() => setRunState("result"), 450);
    };

    const resetRound = (g: any, now: number) => {
      const positions = [g.width * 0.24, g.width * 0.57, g.width * 0.80];

      (g.fighters as Fighter[]).forEach((fighter, index) => {
        fighter.x = positions[index];
        fighter.vx = 0;
        fighter.hp = fighter.maxHp;
        fighter.alive = true;
        fighter.facing = index === 0 ? 1 : -1;
        fighter.attackType = null;
        fighter.attackStartedAt = 0;
        fighter.attackUntil = 0;
        fighter.punchCooldownUntil = 0;
        fighter.kickCooldownUntil = 0;
        fighter.dashUntil = 0;
        fighter.dashCooldownUntil = 0;
        fighter.stunUntil = 0;
        fighter.invulnUntil = 0;
        fighter.blocking = false;
        fighter.blockUntil = 0;
        fighter.energy = 0;
        fighter.comboCount = 0;
        fighter.comboUntil = 0;
        fighter.koUntil = 0;
        fighter.weapon = null;
        fighter.weaponDurability = 0;
        fighter.targetId = fighter.human ? 1 : 0;
        fighter.thinkAt = 0;
      });

      g.roundStartedAt = now;
      g.roundActive = true;
      g.nextRoundAt = 0;
      g.roundWinnerId = null;
      g.comboSequence = [];
      g.comboWindowUntil = 0;
      g.weapons = [
        { id: 1, type: "bat", x: g.width * 0.36, active: true, respawnAt: 0 },
        { id: 2, type: "hammer", x: g.width * 0.52, active: true, respawnAt: 0 },
        { id: 3, type: "blade", x: g.width * 0.69, active: true, respawnAt: 0 },
      ] as WeaponPickup[];
      g.roundBanner = g.round >= 3 ? "FINAL ROUND" : `ROUND ${g.round}`;
      g.roundBannerUntil = now + 1250;
      g.particles = [];
      g.floaters = [];

      setPunchReady(true);
      setKickReady(true);
      setDashReady(true);
      setBlocking(false);
      setSpecialReady(false);
      beep(g.round >= 3 ? 330 : 440, 0.09, 0.045, "square");
    };

    const endRound = (g: any, playerWon: boolean, now: number) => {
      if (!g.roundActive || g.ending) return;

      g.roundActive = false;
      const player: Fighter = g.fighters[0];
      player.blocking = false;
      setBlocking(false);

      if (playerWon) {
        g.roundWinnerId = 0;
        g.playerRounds += 1;
        g.score += 500;
        g.roundBanner = "ROUND WON";
        beep(660, 0.12, 0.055, "square");
      } else {
        const survivingEnemy = (g.fighters as Fighter[])
          .filter((fighter) => !fighter.human && fighter.alive)
          .sort((a, b) => b.hp - a.hp)[0];
        g.roundWinnerId = survivingEnemy?.id ?? 1;
        g.enemyRounds += 1;
        g.roundBanner = "ROUND LOST";
        beep(105, 0.16, 0.055, "sawtooth");
      }

      g.roundBannerUntil = now + 1500;

      if (g.playerRounds >= 2 || g.enemyRounds >= 2) {
        g.matchWinner = g.playerRounds >= 2;
        g.matchFinishAt = now + 1650;
      } else {
        g.round += 1;
        g.nextRoundAt = now + 1750;
      }
    };

    const updateBot = (g: any, bot: Fighter, now: number, dt: number) => {
      if (!bot.alive || now < bot.stunUntil) return;

      if (now > bot.thinkAt) {
        bot.thinkAt = now + rand(180, 380);

        const choices = (g.fighters as Fighter[])
          .filter((f) => f.alive && f.id !== bot.id)
          .sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x));

        bot.targetId = choices[0]?.id ?? null;
      }

      const target = (g.fighters as Fighter[]).find(
        (f) => f.id === bot.targetId && f.alive
      );
      if (!target) return;

      if (bot.blocking && now > bot.blockUntil) bot.blocking = false;
      const targetAttacking = now < target.attackUntil && target.attackType !== null;
      if (
        !bot.blocking &&
        targetAttacking &&
        Math.abs(target.x - bot.x) < 118 &&
        Math.random() < 0.34
      ) {
        bot.blocking = true;
        bot.blockUntil = now + rand(260, 520);
        bot.vx *= 0.25;
      }

      if (bot.blocking) {
        bot.vx *= 0.72;
        return;
      }

      const dx = target.x - bot.x;
      const distance = Math.abs(dx);
      const dir: 1 | -1 = dx >= 0 ? 1 : -1;
      bot.facing = dir;

      if (!bot.weapon && distance > 105) {
        const pickup = (g.weapons as WeaponPickup[])
          .filter((item) => item.active)
          .sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];

        if (pickup && Math.abs(pickup.x - bot.x) < 250) {
          const weaponDir: 1 | -1 = pickup.x >= bot.x ? 1 : -1;
          const tune = fighterTuning(bot.skin);
          bot.facing = weaponDir;
          bot.vx += weaponDir * 610 * tune.speed * dt;
          return;
        }
      }

      if (distance > 92) {
        const tune = fighterTuning(bot.skin);
        bot.vx += dir * (distance > 200 ? 700 : 520) * tune.speed * dt;
      } else if (distance < 48) {
        bot.vx -= dir * 180 * dt;
      }

      if (distance < 75 && now >= bot.punchCooldownUntil && Math.random() < 0.08) {
        performAttack(bot, "punch", now);
      } else if (
        distance < 108 &&
        now >= bot.kickCooldownUntil &&
        Math.random() < 0.035
      ) {
        performAttack(bot, "kick", now);
      }

      if (
        distance > 170 &&
        distance < 340 &&
        now >= bot.dashCooldownUntil &&
        Math.random() < 0.006
      ) {
        bot.vx += dir * 500;
        bot.dashUntil = now + 170;
        bot.dashCooldownUntil = now + rand(1700, 2500);
      }
    };

    const drawStage = (rect: DOMRect) => {
      const stage = stageRef.current;

      if (stage?.complete && stage.naturalWidth > 0) {
        const imageRatio = stage.naturalWidth / stage.naturalHeight;
        const canvasRatio = rect.width / rect.height;

        let sx = 0;
        let sy = 0;
        let sw = stage.naturalWidth;
        let sh = stage.naturalHeight;

        if (canvasRatio > imageRatio) {
          sh = stage.naturalWidth / canvasRatio;
          sy = (stage.naturalHeight - sh) / 2;
        } else {
          sw = stage.naturalHeight * canvasRatio;
          sx = (stage.naturalWidth - sw) / 2;
        }

        ctx.drawImage(stage, sx, sy, sw, sh, 0, 0, rect.width, rect.height);
      } else {
        const fallback = ctx.createLinearGradient(0, 0, 0, rect.height);
        fallback.addColorStop(0, "#39a4ea");
        fallback.addColorStop(0.72, "#81def1");
        fallback.addColorStop(0.721, "#8fce4c");
        fallback.addColorStop(1, "#c96e5e");
        ctx.fillStyle = fallback;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
    };

    const frame = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      drawStage(rect);

      const g = gameRef.current;

      if (g && runState === "playing") {
        const dt = Math.min(0.034, (t - g.last) / 1000 || 0.016);
        g.last = t;

        const player: Fighter = g.fighters[0];
        const alive = (g.fighters as Fighter[]).filter((f) => f.alive);

        if (g.matchFinishAt && t >= g.matchFinishAt) {
          finish(g, g.matchWinner, t);
        } else if (!g.roundActive && g.nextRoundAt && t >= g.nextRoundAt) {
          resetRound(g, t);
        }

        if (g.roundActive) {
          if (!player.alive) {
            endRound(g, false, t);
          } else if (alive.length === 1 && alive[0].human) {
            endRound(g, true, t);
          } else if (t - g.roundStartedAt >= g.roundDuration) {
            const playerPct = player.hp / player.maxHp;
            const enemies = (g.fighters as Fighter[]).filter((f) => !f.human);
            const enemyPct =
              enemies.reduce((sum, fighter) => sum + fighter.hp / fighter.maxHp, 0) /
              Math.max(1, enemies.length);
            endRound(g, playerPct >= enemyPct, t);
          }
        }

        if (g.roundActive && player.alive && !player.blocking && t >= player.stunUntil) {
          let dir = inputRef.current.stickX;

          if (inputRef.current.keys.has("a") || inputRef.current.keys.has("arrowleft")) {
            dir -= 1;
          }
          if (inputRef.current.keys.has("d") || inputRef.current.keys.has("arrowright")) {
            dir += 1;
          }

          if (Math.abs(dir) > 0.08) {
            const sign: 1 | -1 = dir >= 0 ? 1 : -1;
            player.facing = sign;
            const tune = fighterTuning(player.skin);
            player.vx += sign * 880 * tune.speed * dt;
          }
        }

        for (const fighter of g.fighters as Fighter[]) {
          if (!fighter.human && g.roundActive) updateBot(g, fighter, t, dt);
        }

        for (const fighter of g.fighters as Fighter[]) {
          if (!fighter.alive) continue;

          const drag = Math.pow(g.roundActive ? 0.0012 : 0.00001, dt);
          fighter.vx *= drag;

          const tune = fighterTuning(fighter.skin);
          const baseSpeed = fighter.human ? 310 : 290;
          const maxSpeed = t < fighter.dashUntil ? 610 * tune.speed : baseSpeed * tune.speed;
          fighter.vx = clamp(fighter.vx, -maxSpeed, maxSpeed);
          fighter.x += fighter.vx * dt;

          fighter.x = clamp(fighter.x, g.leftBound, g.rightBound);
        }

        for (const pickup of g.weapons as WeaponPickup[]) {
          if (!pickup.active && pickup.respawnAt > 0 && t >= pickup.respawnAt) {
            pickup.active = true;
            pickup.respawnAt = 0;
            pickup.x = rand(g.leftBound + 70, g.rightBound - 70);
          }
        }

        if (g.roundActive) {
          for (const fighter of g.fighters as Fighter[]) {
            if (!fighter.alive || fighter.weapon) continue;

            for (const pickup of g.weapons as WeaponPickup[]) {
              if (!pickup.active) continue;

              if (Math.abs(fighter.x - pickup.x) < 34) {
                const tune = weaponTuning(pickup.type);
                fighter.weapon = pickup.type;
                fighter.weaponDurability = tune.durability;
                pickup.active = false;
                pickup.respawnAt = t + rand(9000, 12500);

                g.floaters.push({
                  x: fighter.x,
                  y: g.groundY - 122,
                  text: `${tune.name} PICKED UP`,
                  life: 1,
                  color: tune.color,
                  size: 13,
                });

                burst(g, fighter.x, g.groundY - 48, tune.color, 9, 130);

                if (fighter.human) {
                  beep(520, 0.045, 0.035, "square");
                  vibrate(12);
                }

                break;
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
            const minimum = 42;

            if (Math.abs(dx) < minimum) {
              const push = (minimum - Math.abs(dx)) * 0.5;
              const sign = dx >= 0 ? 1 : -1;
              a.x -= sign * push;
              b.x += sign * push;
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
          f.y -= 30 * dt;

          if (f.life <= 0) g.floaters.splice(i, 1);
        }

        g.shake *= 0.86;

        if (t - g.lastHudAt > 80) {
          g.lastHudAt = t;

          setHud({
            hp: player.hp,
            enemies: (g.fighters as Fighter[]).slice(1).map((f) => ({
              name: f.name,
              hp: f.hp,
              alive: f.alive,
            })),
            score: g.score,
            kos: g.kos,
            time: Math.floor((t - g.start) / 1000),
            energy: player.energy,
            combo: t <= player.comboUntil ? player.comboCount : 0,
            round: g.round,
            playerRounds: g.playerRounds,
            enemyRounds: g.enemyRounds,
            roundBanner: t <= g.roundBannerUntil ? g.roundBanner : "",
            timeLeft: g.roundActive
              ? Math.max(0, Math.ceil((g.roundDuration - (t - g.roundStartedAt)) / 1000))
              : 0,
            specialName: fighterTuning(player.skin).specialName,
            weapon: player.weapon ? weaponTuning(player.weapon).name : "PUNCH",
            weaponDurability: player.weaponDurability,
          });
          setSpecialReady(g.roundActive && player.energy >= 100);
        }

        ctx.save();
        ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));

        // Weapon pickups remain active for gameplay but are no longer rendered as
        // floating tools in the arena. This keeps the fighting stage visually clean.
        for (const fighter of g.fighters as Fighter[]) {
          const knockedOut = !fighter.alive;
          if (knockedOut && t > fighter.koUntil) continue;

          const moving = !knockedOut && Math.abs(fighter.vx) > 35;
          const attacking = !knockedOut && t < fighter.attackUntil && fighter.attackType !== null;
          const dashing = !knockedOut && t < fighter.dashUntil;
          const hurt = !knockedOut && t < fighter.stunUntil;
          const guarding = !knockedOut && (fighter.blocking || t < fighter.blockUntil);

          const attackDuration = Math.max(
            1,
            fighter.attackUntil - fighter.attackStartedAt
          );
          const actionProgress = attacking
            ? clamp((t - fighter.attackStartedAt) / attackDuration, 0, 1)
            : 0;

          let spriteFrame: SpriteFrame = "idle";

          if (!g.roundActive && fighter.id === g.roundWinnerId && fighter.alive) {
            spriteFrame = "victory";
          } else if (knockedOut) {
            spriteFrame = "knockdown";
          } else if (hurt) {
            spriteFrame = "hurt";
          } else if (guarding) {
            spriteFrame = "block";
          } else if (fighter.weapon) {
            if (attacking && fighter.attackType === "punch") {
              spriteFrame = "weapon-attack";
            } else if (moving) {
              spriteFrame =
                Math.floor((t + fighter.id * 67) / 115) % 2 === 0
                  ? "weapon-walk1"
                  : "weapon-walk2";
            } else {
              spriteFrame = "weapon-idle";
            }
          } else if (attacking && fighter.attackType === "punch") {
            spriteFrame =
              actionProgress < 0.28
                ? "punch-windup"
                : actionProgress < 0.68
                  ? "punch-hit"
                  : "punch-recover";
          } else if (attacking && fighter.attackType === "kick") {
            spriteFrame =
              actionProgress < 0.3
                ? "kick-windup"
                : actionProgress < 0.7
                  ? "kick-hit"
                  : "kick-recover";
          } else if (moving) {
            const walkFrames: SpriteFrame[] = ["walk1", "walk2", "walk3", "walk2"];
            spriteFrame =
              walkFrames[
                Math.floor((t + fighter.id * 79) / 105) % walkFrames.length
              ];
          }

          const atlas = atlasRef.current[fighter.skin];
          const atlasReady =
            fighter.visualStyle === "phase1" &&
            !!(
            atlas?.complete &&
            atlas.naturalWidth >= ATLAS_CELL_W &&
            atlas.naturalHeight >= ATLAS_CELL_H
          );
          const fallbackImg =
            imagesRef.current[`${fighter.skin}-idle`] ||
            imagesRef.current["blonde-idle"];

          const spriteH = fighter.human ? 112 : 106;
          const spriteW = Math.round(spriteH * (ATLAS_CELL_W / ATLAS_CELL_H));
          const size = spriteH;
          const feetY = g.groundY;
          const phase = t * (moving ? 0.024 : 0.007) + fighter.id;
          const bob = moving ? -Math.abs(Math.sin(phase)) * 4 : Math.sin(phase) * 1.3;

          if (dashing && atlasReady && atlas) {
            for (let ghost = 3; ghost >= 1; ghost--) {
              ctx.save();
              ctx.globalAlpha = ghost * 0.07;
              ctx.translate(
                fighter.x - fighter.facing * ghost * 15,
                feetY + bob
              );
              if (fighter.facing < 0) ctx.scale(-1, 1);
              drawAtlasFrame(ctx, atlas, spriteFrame, spriteW, spriteH);
              ctx.restore();
            }
          }

          let attackProgress = 0;

          if (attacking) {
            const punchDuration =
              fighter.weapon === "hammer"
                ? 340
                : fighter.weapon === "bat"
                  ? 285
                  : fighter.weapon === "blade"
                    ? 245
                    : 250;
            const duration = fighter.attackType === "punch" ? punchDuration : 390;
            attackProgress = clamp((t - fighter.attackStartedAt) / duration, 0, 1);
          }

          const strikeCurve = Math.sin(Math.min(1, attackProgress) * Math.PI);
          const lunge =
            fighter.attackType === "punch"
              ? strikeCurve * 4
              : fighter.attackType === "kick"
                ? strikeCurve * 3
                : 0;

          ctx.save();
          ctx.translate(fighter.x + fighter.facing * lunge, feetY + bob);

          if (fighter.facing < 0) ctx.scale(-1, 1);

          if (hurt && !knockedOut) {
            ctx.rotate(Math.sin(t * 0.055) * 0.06);
          }

          if (fighter.human) {
            ctx.shadowBlur = 16;
            ctx.shadowColor = "rgba(140,124,255,.75)";
          }

          if (atlasReady && atlas) {
            drawAtlasFrame(ctx, atlas, spriteFrame, spriteW, spriteH);
          } else if (fallbackImg?.complete && fallbackImg.naturalWidth > 0) {
            ctx.drawImage(
              fallbackImg,
              -spriteH / 2,
              -spriteH,
              spriteH,
              spriteH
            );
          } else {
            ctx.fillStyle = fighter.color;
            ctx.beginPath();
            ctx.arc(0, -45, 20, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();

          if (attacking) {
            const activeWeapon =
              fighter.attackType === "punch" && fighter.weapon
                ? weaponTuning(fighter.weapon)
                : null;
            const reach =
              fighter.attackType === "punch"
                ? 48 + strikeCurve * 24 + (activeWeapon?.rangeBonus || 0) * 0.55
                : 58 + strikeCurve * 45;

            ctx.save();
            ctx.globalAlpha = 0.12 + strikeCurve * 0.22;
            ctx.strokeStyle =
              activeWeapon?.color ||
              (fighter.attackType === "punch" ? "#fff0a4" : "#ffb05a");
            ctx.lineWidth = fighter.attackType === "punch" ? 3 : 4;
            ctx.beginPath();
            ctx.arc(
              fighter.x + fighter.facing * reach,
              feetY - (fighter.attackType === "punch" ? 64 : 40),
              fighter.attackType === "punch" ? 22 : 28,
              fighter.facing > 0 ? -0.8 : Math.PI - 0.8,
              fighter.facing > 0 ? 0.8 : Math.PI + 0.8
            );
            ctx.stroke();
            ctx.restore();
          }

          const barW = fighter.human ? 68 : 60;
          const barY = feetY - size - 14;

          ctx.fillStyle = "rgba(0,0,0,.55)";
          ctx.fillRect(fighter.x - barW / 2, barY, barW, 7);

          ctx.fillStyle =
            fighter.hp > 55 ? "#57e39b" : fighter.hp > 25 ? "#ffd166" : "#ff5c86";

          ctx.fillRect(
            fighter.x - barW / 2,
            barY,
            barW * (fighter.hp / fighter.maxHp),
            7
          );

          ctx.fillStyle = "#ffffff";
          ctx.font = fighter.human ? "900 11px system-ui" : "800 10px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(fighter.name, fighter.x, feetY + 19);
        }

        for (const p of g.particles as Particle[]) {
          ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
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
    if (e.clientX > window.innerWidth * 0.52) return;

    inputRef.current.pointerId = e.pointerId;
    inputRef.current.originX = e.clientX;
    inputRef.current.stickX = 0;
    setStickVisual(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - inputRef.current.originX;
    const v = clamp(dx / 48, -1, 1);

    inputRef.current.stickX = v;
    setStickVisual(v * 28);
  };

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputRef.current.pointerId !== e.pointerId) return;

    inputRef.current.pointerId = -1;
    inputRef.current.stickX = 0;
    setStickVisual(0);
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

          <div className="round-scoreboard">
            <span className="round-side">YOU <b>{hud.playerRounds}</b></span>
            <span className="round-center">ROUND {hud.round} • {hud.timeLeft}s</span>
            <span className="round-side"><b>{hud.enemyRounds}</b> RIVALS</span>
          </div>

          {hud.roundBanner && <div className="round-banner">{hud.roundBanner}</div>}

          <div className="fight-callout">
            {fighterTuning(skin).name} • {fighterTuning(skin).style}
          </div>

          <div className="combat-meter">
            <div className="meter-row">
              <span>ENERGY</span>
              <b>{Math.floor(hud.energy)}%</b>
            </div>
            <div className="energy-track">
              <i style={{ width: `${hud.energy}%` }} />
            </div>
            {hud.combo > 1 && <div className="combo-badge">COMBO x{hud.combo}</div>}
            <div className={`weapon-status ${hud.weapon !== "PUNCH" ? "armed" : ""}`}>
              {hud.weapon === "PUNCH"
                ? "UNARMED"
                : `${hud.weapon} • ${hud.weaponDurability} HITS`}
            </div>
          </div>

          <div className="joystick-base horizontal-stick">
            <div
              className="joystick-knob"
              style={{ "--jx": `${stickVisual}px`, "--jy": "0px" } as React.CSSProperties}
            />
          </div>

          <div className="combat-actions">
            <button
              className={`action punch-btn ${punchReady ? "" : "cool"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                punch();
              }}
            >
              {hud.weapon === "PUNCH" ? "PUNCH" : hud.weapon === "ENERGY BLADE" ? "BLADE" : hud.weapon}
            </button>

            <button
              className={`action kick-btn ${kickReady ? "" : "cool"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                kick();
              }}
            >
              KICK
            </button>

            <button
              className={`action block-btn ${blocking ? "blocking" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setBlockState(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                setBlockState(false);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                setBlockState(false);
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setBlockState(false);
              }}
            >
              BLOCK
            </button>

            <button
              className={`action special-btn ${specialReady ? "ready" : "cool"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                special();
              }}
            >
              {hud.specialName === "BLAZE RUSH" ? "RUSH" : "BREAKER"}
            </button>

            <button
              className={`action dash small-dash ${dashReady ? "" : "cool"}`}
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
              Choose from the new fully animated fighters or the original classic fighters, then enter the stage and fight with punches, kicks, blocks, combos and weapons.
            </p>

            <div className="character-title">CHOOSE YOUR FIGHTER</div>

            <div className="fighter-roster">
              {FIGHTER_ROSTER.map((fighter) => {
                const selected = fighterChoice === fighter.id;
                const isPhaseOne = fighter.visualStyle === "phase1";
                const atlasSource =
                  fighter.skin === "blonde" ? BLAZE_ATLAS : NYX_ATLAS;

                return (
                  <button
                    key={fighter.id}
                    className={`fighter-card ${selected ? "selected" : ""} ${isPhaseOne ? "phase1" : "classic"}`}
                    onClick={() => {
                      setFighterChoice(fighter.id);
                      setSkin(fighter.skin);
                    }}
                  >
                    <span className={`fighter-badge ${isPhaseOne ? "new" : "old"}`}>
                      {fighter.badge}
                    </span>

                    {isPhaseOne ? (
                      <span
                        className="fighter-atlas-preview"
                        style={{
                          backgroundImage: `url(${atlasSource})`,
                        }}
                        aria-hidden="true"
                      />
                    ) : (
                      <img
                        src={`/sprites/${fighter.skin}-idle.webp`}
                        alt={fighter.name}
                      />
                    )}

                    <b>{fighter.name}</b>
                    <small>{fighter.subtitle}</small>
                  </button>
                );
              })}
            </div>

            <div className="selected-fighter-info">
              <strong>
                {(FIGHTER_ROSTER.find((fighter) => fighter.id === fighterChoice) ??
                  FIGHTER_ROSTER[0]).name}
              </strong>
              <span>
                {fighterTuning(skin).style} • {fighterTuning(skin).specialName}
              </span>
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
              Mobile: move left/right • walk over weapons to pick them up • PUNCH becomes the weapon attack • KICK • hold BLOCK • SPECIAL at 100% • DASH. Desktop: A/D or arrows • J/F attack • K/E kick • L block • U/Q special • Space/Shift dash.
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
                ? "You won the best-of-3 match."
                : "The rivals won the match. Change fighter or try again."}
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

            <div className="match-score-result">
              MATCH SCORE: {result.playerRounds} - {result.enemyRounds}
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
