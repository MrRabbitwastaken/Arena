# Medieval Arena — combat prototype (phases 1–2, with an early armour model)

Physics-driven third-person greatsword duel in the browser. Three.js r128 renders it;
the sword, collision and combat simulation are written for this project.

## Run it
- **Single file:** open `dist/medieval-arena.html` in a desktop browser (needs internet for Three.js and fonts).
- **From source:** serve the folder with any static server (ES modules don't load from `file://`),
  e.g. `python3 -m http.server` and open `http://localhost:8000/`.
- **Rebuild the single file:** `python3 tools/build.py` (no npm needed).
- **Headless test:** `node tools/sim.mjs 6 150` runs AI-vs-AI duels; `node tools/guardsearch.mjs` checks which guard stops each cut.

## How the sword works
The sword is a rigid body (2.6 kg, 1.68 m, balance 14 cm forward of the cross, 0.8 kg·m² about the grip).
Each frame the knight's combat controller sets a *target* grip position and blade orientation; a torque- and
force-limited PD controller (the arms) drives the real blade towards it, with gravity acting at the centre of mass.
Attacks are arcs the hands try to drive the blade along; the target never runs more than ~30° ahead of the real
steel, so a blade that is stopped stays stopped. Stamina and arm injuries scale the available torque.

Blades are capsules tested every 1/240 s against each other (closest-segment plus a swept crossing test) and
against body capsules (swept per sample point). Responses are impulses using each body's effective mass at the
contact point, with friction for scraping. Damage comes from the normal impact energy, edge alignment, point vs
edge vs flat vs pommel, armour thickness, plate integrity and whether the contact is on a gap (neck, armpit,
inside of the elbow, back of the knee, back of the thigh, palm).

## Layout
```
src/
  main.js, game.js            boot, render loop, input → intent, events → sound/sparks/HUD
  core/                       three.js handle, maths (segment tests, quaternion integration), input
  scene/                      arena, lighting, camera rig
  characters/                 knight entity, locomotion, procedural pose + arm IK, body capsules, visual model
  combat/                     weaponPhysics, attacks, blocking (guards + clash rules), combatController,
                              weaponCollision, armourSystem, damageSystem, stamina, combatAI, duel (fixed-step sim)
  effects/particles.js        sparks, blood, dust, fire, decals, swing trails
  audio/audioManager.js       Web Audio synthesis (steel, plate, mail, flesh, stone, grunts, swing wind)
  ui/                         HUD, menus, settings
tools/                        build.py bundler, node sim harnesses, three.js maths shim
```

## Not yet built (later phases)
Dismemberment and detached limbs, ragdoll knockdowns, detachable armour pieces, final art.
