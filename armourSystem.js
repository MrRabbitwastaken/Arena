// Armour zones. `plate` is plate thickness in mm (0 = mail and padding only).
// Joints, the backs of limbs and the neck are covered by mail, not plate.
export const ZONES = {
  head:      { label: 'Helmet', plate: 2.2, vital: 'head' },
  neck:      { label: 'Neck', plate: 0, vital: 'neck' },
  shoulderL: { label: 'Left shoulder', plate: 1.6, limb: 'armL' },
  shoulderR: { label: 'Right shoulder', plate: 1.6, limb: 'armR' },
  chest:     { label: 'Chest', plate: 2.4, vital: 'torso' },
  abdomen:   { label: 'Abdomen', plate: 1.6, vital: 'torso' },
  upperArmL: { label: 'Left upper arm', plate: 1.2, limb: 'armL' },
  upperArmR: { label: 'Right upper arm', plate: 1.2, limb: 'armR' },
  forearmL:  { label: 'Left forearm', plate: 1.2, limb: 'armL' },
  forearmR:  { label: 'Right forearm', plate: 1.2, limb: 'armR' },
  handL:     { label: 'Left hand', plate: 1.0, limb: 'armL' },
  handR:     { label: 'Right hand', plate: 1.0, limb: 'armR' },
  thighL:    { label: 'Left thigh', plate: 1.4, limb: 'legL' },
  thighR:    { label: 'Right thigh', plate: 1.4, limb: 'legR' },
  kneeL:     { label: 'Left knee', plate: 1.6, limb: 'legL' },
  kneeR:     { label: 'Right knee', plate: 1.6, limb: 'legR' },
  lowerLegL: { label: 'Left lower leg', plate: 1.2, limb: 'legL' },
  lowerLegR: { label: 'Right lower leg', plate: 1.2, limb: 'legR' },
  footL:     { label: 'Left foot', plate: 1.2, limb: 'legL' },
  footR:     { label: 'Right foot', plate: 1.2, limb: 'legR' },
};
export const ZONE_IDS = Object.keys(ZONES);

// Map a contact on a body capsule to an armour zone.
// t: position along the capsule (0 at its first joint), nLocal: contact normal in the
// target knight's local frame (+X = their left, +Z = forward).
// Returns [zoneId, isGap, isJoint].
export function zoneForHit(cap, t, nLocal) {
  const side = cap.slice(-1); // 'L' | 'R'
  const inward = side === 'L' ? nLocal.x < -0.45 : nLocal.x > 0.45;
  switch (cap) {
    case 'head': return ['head', false, false];
    case 'neck': return ['neck', true, false];
    case 'chest': return ['chest', false, false];
    case 'abdomen': return ['abdomen', false, false];
    case 'upperArmL': case 'upperArmR':
      if (t < 0.3) return inward ? ['shoulder' + side, true, false] : ['shoulder' + side, false, false];
      if (t > 0.82) return ['upperArm' + side, true, true];            // inside of the elbow
      return inward ? ['upperArm' + side, true, false] : ['upperArm' + side, false, false];
    case 'forearmL': case 'forearmR':
      if (t < 0.15) return ['forearm' + side, true, true];
      return ['forearm' + side, false, false];
    case 'handL': case 'handR':
      return ['hand' + side, nLocal.y < -0.55, false];                 // palm side is leather
    case 'thighL': case 'thighR':
      if (t > 0.85) return ['knee' + side, nLocal.z < -0.3, true];
      return ['thigh' + side, nLocal.z < -0.35, false];                 // back of the thigh: mail
    case 'shinL': case 'shinR':
      if (t < 0.13) return ['knee' + side, nLocal.z < -0.3, true];
      return ['lowerLeg' + side, false, false];
    case 'footL': case 'footR': return ['foot' + side, false, false];
  }
  return ['chest', false, false];
}

// Average plate damage (0..1) across plated zones.
export function armourDamage(injury) {
  let sum = 0, n = 0;
  for (const id of ZONE_IDS) if (ZONES[id].plate > 0) { sum += 1 - injury.zones[id].integrity; n++; }
  return n ? sum / n : 0;
}
