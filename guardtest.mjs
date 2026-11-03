// For each attack, the defender holds the matching guard (and alternatively, no guard).
// Reports whether the blades met and what the strike hit.
import './three-shim.mjs';
const { Duel, FIXED_DT } = await import('../src/combat/duel.js');
const { ATTACK_IDS, GUARD_FOR } = await import('../src/combat/attacks.js');

const dist = +(process.argv[2] || 1.7);
for (const mode of ['guard', 'open']) {
  console.log(`--- defender ${mode}, distance ${dist}`);
  for (const id of ATTACK_IDS) {
    const duel = new Duel(); duel.reset(false);
    duel.enemyAI.update = () => {}; // scripted
    const A = duel.enemy, D = duel.player;
    A.reset(0, dist / 2, Math.PI); D.reset(0, -dist / 2, 0);
    const g = GUARD_FOR[id];
    D.intent.gx = g[0]; D.intent.gy = g[1];
    D.intent.blockHeld = mode === 'guard';
    let log = [], t = 0;
    while (t < 2.2) {
      if (t > 0.5 && t < 0.52) A.intent.attackPress = id;
      duel.step(FIXED_DT); t += FIXED_DT;
      for (const e of duel.events) {
        if (e.type === 'clash') log.push(`${e.kind}(J=${e.J.toFixed(1)})`);
        if (e.type === 'hit' && e.attacker === A) log.push(`HIT ${e.result.label}:${e.result.key} E=${e.result.E.toFixed(0)}`);
      }
      duel.events.length = 0;
    }
    console.log(id.padEnd(9), log.join(', ') || 'miss');
  }
}
