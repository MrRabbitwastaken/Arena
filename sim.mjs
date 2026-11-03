// Headless AI-vs-AI duels: checks stability and that the combat produces sensible outcomes.
import './three-shim.mjs';
const { Duel, FIXED_DT } = await import('../src/combat/duel.js');

const N = +(process.argv[2] || 6), MAXT = +(process.argv[3] || 180);
const totals = { clash: {}, hit: {}, durations: [], causes: {}, nan: 0, maxTip: 0, maxW: 0, swings: 0 };
for (let d = 0; d < N; d++) {
  const duel = new Duel();
  duel.reset(true);
  let t = 0;
  const swings = [0, 0];
  duel.knights.forEach((k, i) => { k.onSwing = () => swings[i]++; });
  while (t < MAXT && !(duel.over && duel.endT > 2)) {
    duel.step(FIXED_DT); t += FIXED_DT;
    for (const k of duel.knights) {
      const s = k.sword;
      if (!isFinite(s.pos.x) || !isFinite(s.q.w) || !isFinite(k.pos.x)) { totals.nan++; console.log('NaN at', t.toFixed(2)); process.exit(1); }
      if (!s.free) { totals.maxTip = Math.max(totals.maxTip, s.tipSpeed); totals.maxW = Math.max(totals.maxW, s.w.length()); }
    }
    for (const e of duel.events) {
      if (e.type === 'clash') totals.clash[e.kind] = (totals.clash[e.kind] || 0) + 1;
      if (e.type === 'hit') { const key = e.result.key + (e.result.plate ? '/plate' : '/gap'); totals.hit[key] = (totals.hit[key] || 0) + 1;
        if (process.env.V) console.log(t.toFixed(2), e.attacker.name.slice(0, 6), '->', e.result.label, e.result.outcome, 'E=' + e.result.E.toFixed(1), e.part); }
      if (e.type === 'defeat') totals.causes[e.knight.defeatCause] = (totals.causes[e.knight.defeatCause] || 0) + 1;
    }
    duel.events.length = 0;
  }
  totals.swings += swings[0] + swings[1];
  totals.durations.push(duel.over ? +(duel.time - duel.endT).toFixed(1) : 'timeout');
  const p = duel.player, e = duel.enemy;
  console.log(`duel ${d}: ${duel.over ? duel.loser.name + ' lost (' + duel.loser.defeatCause + ')' : 'no result'} t=${t.toFixed(1)} swings=${swings} blood=${p.injury.blood.toFixed(2)}/${e.injury.blood.toFixed(2)} hits=${p.stats.hits}/${e.stats.hits} blocks=${p.stats.blocks}/${e.stats.blocks} parries=${p.stats.parries}/${e.stats.parries}`);
}
console.log(JSON.stringify(totals, null, 1));
