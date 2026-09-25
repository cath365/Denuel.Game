# Denuel.Game

FuseRush.io — Vercel-first browser game MVP.

A fast 2D/2.5D arena game built with Next.js + TypeScript and designed to deploy directly to Vercel.

## Current playable features

- Two selectable chibi heroes (Blaze and Nyx)
- 1 human + 7 bots
- Five bot personalities: hunter, coward, collector, bully, trickster
- Bomb/fuse tag with clutch-pass combo scoring
- Knockback PUSH attack with cooldown
- DASH movement ability
- Moving energy-bumper obstacles
- Timed dangerous hot zones
- Arena shrinking pressure
- FINAL 3 intensity mode
- Survival streaks, KO attribution and KO streak bonuses
- Near-explosion slow-motion, danger pulse, vibration and countdown audio
- Random events: Turbo Rush, Gravity Well, Shockwave, Power-up Rain, Fuse Frenzy
- Speed, shield and dash-reset pickups
- Screen shake, particles, hit text and synthesized sound feedback
- Touch controls plus WASD/arrow keyboard controls
- Persistent local XP, coins and best score
- Instant rematch loop

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Controls

### Mobile
- Left thumb: movement joystick
- PUSH: knock rivals away
- DASH: burst movement

### Desktop
- WASD / arrows: movement
- F or E: PUSH
- Space or Shift: DASH

## Deploy to Vercel

Import the project into Vercel or run:

```bash
npx vercel
```

This MVP is client-side, so it needs no database or always-on server yet. Real multiplayer can be added as the next backend milestone without changing the core game loop.
