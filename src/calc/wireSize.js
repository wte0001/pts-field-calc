// Wire sizing per NEC Table 310.16 with optional ambient correction
// (Table 310.15(B)(1)(1)) and conductor-count adjustment (Table 310.15(C)(1)).
// Pure functions only. NEC 2023.

import table31016 from '../data/nec_310_16.json'
import ambientTable from '../data/nec_310_15_b1.json'
import adjustTable from '../data/nec_310_15_c1.json'

/**
 * Look up the ambient temperature correction factor.
 * @returns {{factor:number|null, label:string}|null} null if ambient out of table
 */
export function ambientCorrectionFactor(ambientC, tempRating) {
  if (!Number.isFinite(ambientC)) return null
  const row = ambientTable.ranges.find(r => ambientC >= r.minC && ambientC <= r.maxC)
  if (!row) return null
  return { factor: row[String(tempRating)], label: row.label }
}

/**
 * Look up the conductor-count adjustment factor.
 * Returns factor 1.0 for 3 or fewer current-carrying conductors.
 */
export function conductorCountAdjustment(count) {
  if (!Number.isFinite(count) || count <= 3) return { factor: 1.0, label: '3 or fewer (no adjustment)' }
  const row = adjustTable.ranges.find(r => count >= r.min && count <= r.max)
  if (!row) return null
  return { factor: row.factor, label: row.label }
}

/**
 * Select minimum conductor size from Table 310.16.
 * @param {number} amps - load current
 * @param {'copper'|'aluminum'} material
 * @param {60|75|90} tempRating
 * @param {{ambientC?:number, numConductors?:number}} [advanced]
 * @returns result object or {error}
 */
export function selectWireSize(amps, material, tempRating, advanced = {}) {
  if (!Number.isFinite(amps) || amps <= 0) {
    return { error: 'Enter a load current greater than 0 A.' }
  }
  const col = table31016[material]
  if (!col) return { error: 'Unknown conductor material.' }

  // Resolve derating factors
  let ambient = { factor: 1.0, label: null }
  let adjust = { factor: 1.0, label: null }
  const usingAdvanced =
    (advanced.ambientC !== undefined && advanced.ambientC !== null && advanced.ambientC !== 30) ||
    (advanced.numConductors !== undefined && advanced.numConductors !== null && advanced.numConductors > 3)

  if (advanced.ambientC !== undefined && advanced.ambientC !== null) {
    const a = ambientCorrectionFactor(advanced.ambientC, tempRating)
    if (!a) return { error: 'Ambient temperature is outside Table 310.15(B)(1)(1).' }
    if (a.factor === null) {
      return { error: `Ambient of ${advanced.ambientC}°C is not permitted for ${tempRating}°C insulation (no factor in table).` }
    }
    ambient = a
  }
  if (advanced.numConductors !== undefined && advanced.numConductors !== null) {
    const adj = conductorCountAdjustment(advanced.numConductors)
    if (!adj) return { error: 'Invalid conductor count.' }
    adjust = adj
  }

  const totalFactor = ambient.factor * adjust.factor
  if (totalFactor <= 0) return { error: 'Combined derating factor is zero.' }

  // Walk sizes smallest to largest; pick first whose DERATED ampacity >= amps.
  const candidates = []
  for (const size of table31016.sizes) {
    const entry = col[size]
    if (!entry) continue // size not listed for this material (e.g. 14 AWG aluminum)
    const base = entry[String(tempRating)]
    if (base === null || base === undefined) {
      candidates.push({ size, base: null, derated: null, unverified: true })
      continue
    }
    candidates.push({ size, base, derated: base * totalFactor, unverified: false })
  }

  const idx = candidates.findIndex(c => c.derated !== null && c.derated >= amps)
  if (idx === -1) {
    return {
      error: 'No single conductor in Table 310.16 is adequate for this current with the applied factors. Parallel conductors or engineering review required.',
      factors: { ambient, adjust, totalFactor, usingAdvanced }
    }
  }

  const sel = candidates[idx]
  const next = candidates.slice(idx + 1).find(c => c.derated !== null) || null
  const skippedUnverified = candidates.slice(0, idx).some(c => c.unverified)

  return {
    table: 'NEC 2023 Table 310.16',
    material,
    tempRating,
    amps,
    size: sel.size,
    baseAmpacity: sel.base,
    deratedAmpacity: round1(sel.derated),
    nextSize: next ? { size: next.size, baseAmpacity: next.base, deratedAmpacity: round1(next.derated) } : null,
    factors: {
      ambient: { factor: ambient.factor, label: ambient.label },
      adjust: { factor: adjust.factor, label: adjust.label },
      totalFactor: round3(totalFactor),
      usingAdvanced
    },
    warnings: skippedUnverified
      ? ['One or more smaller sizes were skipped because their table value is unverified (null) in this app. Verify against the printed NEC.']
      : []
  }
}

function round1(x) { return x === null ? null : Math.round(x * 10) / 10 }
function round3(x) { return Math.round(x * 1000) / 1000 }
