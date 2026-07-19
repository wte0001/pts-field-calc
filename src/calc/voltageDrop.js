// Voltage drop, two methods. Pure functions only.
//
//   Table 9 method (NEC 2023 Chapter 9 Table 9, effective impedance):
//     Zeff = R x cos(theta) + XL x sin(theta)   [ohms per 1000 ft, lagging PF assumed]
//     VD   = mult x (I / sets) x (L / 1000) x Zeff
//   K-factor method (field estimating convention, not NEC data):
//     VD   = mult x K x (I / sets) x L / circular-mils
//   where mult = sqrt(3) for three-phase (L-L drop) and 2 for single-phase,
//   L = ONE-WAY circuit length in feet, sets = parallel runs per phase.
//
// Table 9 assumptions: 600V class, 60 Hz, 75C conductor temperature, three single
// conductors in one raceway. The K method ignores reactance - fine for small
// conductors near unity PF, increasingly wrong above ~4/0.

import t9 from '../data/nec_ch9_table9.json'

const SQRT3 = Math.sqrt(3)

export const VD_SIZES = t9.sizes
export const RACEWAY_TYPES = [
  { id: 'pvc', label: 'PVC' },
  { id: 'aluminum', label: 'Alum.' },
  { id: 'steel', label: 'Steel' }
]
export const K_FACTORS = { copper: t9._meta.kFactors.copper, aluminum: t9._meta.kFactors.aluminum }
export const VD_GUIDE_BRANCH_PCT = 3 // NEC 210.19(A) Informational Note (guidance, not a requirement)
export const VD_GUIDE_TOTAL_PCT = 5 // NEC 215.2(A) Informational Note (feeder + branch combined)

/**
 * Effective impedance per 1000 ft from Table 9 at an arbitrary lagging PF.
 * @returns {{r:number, x:number, zEff:number}} or {error}
 */
export function effectiveZ(size, material, raceway, pf) {
  const rCol = (t9.acResistance[material] || {})[raceway]
  if (!rCol) return { error: 'Unknown material or raceway type.' }
  if (!VD_SIZES.includes(size)) return { error: `${size} is not listed in Chapter 9 Table 9.` }
  const r = rCol[size]
  if (r === null || r === undefined) {
    return { error: `The Table 9 value for ${size} ${material} is not loaded in this app (unverified or not listed). Check the printed table.`, unverified: true }
  }
  const xCol = raceway === 'steel' ? t9.xl.steel : t9.xl.pvc // PVC column covers PVC and aluminum conduit
  const x = xCol[size]
  if (x === null || x === undefined) {
    return { error: `The Table 9 reactance for ${size} is not loaded in this app.`, unverified: true }
  }
  const sinTheta = Math.sqrt(1 - pf * pf)
  return { r, x, zEff: r * pf + x * sinTheta }
}

function checkCommon({ amps, lengthFt, voltage, phase, pf, sets }) {
  if (!Number.isFinite(amps) || amps <= 0) return 'Enter a load current greater than 0 A.'
  if (!Number.isFinite(lengthFt) || lengthFt <= 0) return 'Enter a one-way circuit length greater than 0 ft.'
  if (!Number.isFinite(voltage) || voltage <= 0) return 'Enter a voltage greater than zero.'
  if (phase !== 1 && phase !== 3) return 'Phase must be 1 or 3.'
  if (!Number.isFinite(pf) || pf <= 0 || pf > 1) return 'Power factor must be greater than 0 and no more than 1.00.'
  if (!Number.isFinite(sets) || !Number.isInteger(sets) || sets < 1) return 'Parallel sets must be a whole number, 1 or more.'
  return null
}

function buildResult({ amps, lengthFt, voltage, phase, sets, ohmsPerKft }) {
  const mult = phase === 3 ? SQRT3 : 2
  const vdVolts = (mult * (amps / sets) * lengthFt * ohmsPerKft) / 1000
  const vdPct = (vdVolts / voltage) * 100
  return {
    vdVolts,
    vdPct,
    loadVoltage: voltage - vdVolts,
    // One-way length at which drop reaches the 3% branch-circuit guideline:
    maxLenAt3Pct: (VD_GUIDE_BRANCH_PCT / 100) * voltage * 1000 * sets / (mult * amps * ohmsPerKft)
  }
}

/**
 * Voltage drop via Table 9 effective impedance.
 * @param {{amps:number, lengthFt:number, voltage:number, phase:1|3, size:string,
 *          material:'copper'|'aluminum', raceway:'pvc'|'aluminum'|'steel', pf:number, sets:number}} p
 */
export function voltageDropTable9(p) {
  const bad = checkCommon(p)
  if (bad) return { error: bad }
  const z = effectiveZ(p.size, p.material, p.raceway, p.pf)
  if (z.error) return z
  return {
    method: 'NEC 2023 Chapter 9 Table 9 (effective Z)',
    ...buildResult({ ...p, ohmsPerKft: z.zEff }),
    r: z.r,
    x: z.x,
    zEff: z.zEff
  }
}

/**
 * Voltage drop via the K-factor estimating method (PF is not used; kept in the
 * signature so both methods validate identically - pass 1 if not applicable).
 */
export function voltageDropKFactor(p) {
  const bad = checkCommon({ ...p, pf: 1 })
  if (bad) return { error: bad }
  const k = K_FACTORS[p.material]
  if (!k) return { error: 'Unknown conductor material.' }
  const cmil = t9.circularMils[p.size]
  if (!cmil) return { error: `${p.size} is not in the circular-mil table.` }
  if (p.material === 'aluminum' && p.size === '14') {
    return { error: '14 AWG aluminum is not listed.' }
  }
  // Express K/cmil as ohms per 1000 ft so both methods share the same core math
  const ohmsPerKft = (k * 1000) / cmil
  return {
    method: `K-factor estimate (K = ${k} ohm-cmil/ft)`,
    ...buildResult({ ...p, ohmsPerKft }),
    k,
    cmil
  }
}
