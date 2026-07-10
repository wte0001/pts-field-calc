// kVA / amps / kW conversion for single- and three-phase AC systems.
// Pure functions only. Standard relationships, no code-table data:
//   three-phase: kVA = sqrt(3) x V(L-L) x I / 1000
//   single-phase: kVA = V x I / 1000
//   kW = kVA x PF
// Power factor affects only the kW <-> kVA relationship; kVA <-> A is independent of PF.

const SQRT3 = Math.sqrt(3)

export const KNOWN_KINDS = ['kva', 'amps', 'kw']

/**
 * @param {'kva'|'amps'|'kw'} known - which quantity the value is
 * @param {number} value - the known quantity, > 0
 * @param {number} voltage - line-to-line volts for three-phase, circuit volts for single-phase
 * @param {1|3} phase
 * @param {number} pf - power factor, 0 < pf <= 1 (only used for kW)
 */
export function powerConvert(known, value, voltage, phase, pf) {
  if (!KNOWN_KINDS.includes(known)) return { error: 'Unknown input quantity.' }
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a value greater than zero.' }
  if (!Number.isFinite(voltage) || voltage <= 0) return { error: 'Enter a voltage greater than zero.' }
  if (phase !== 1 && phase !== 3) return { error: 'Phase must be 1 or 3.' }
  if (!Number.isFinite(pf) || pf <= 0 || pf > 1) {
    return { error: 'Power factor must be greater than 0 and no more than 1.00.' }
  }

  // kVA = kFactor x I / 1000 in both systems
  const kFactor = phase === 3 ? SQRT3 * voltage : voltage

  let kva, amps, kw
  if (known === 'kva') {
    kva = value
    amps = (kva * 1000) / kFactor
    kw = kva * pf
  } else if (known === 'amps') {
    amps = value
    kva = (kFactor * amps) / 1000
    kw = kva * pf
  } else {
    kw = value
    kva = kw / pf
    amps = (kva * 1000) / kFactor
  }

  return { known, kva, amps, kw, voltage, phase, pf }
}
