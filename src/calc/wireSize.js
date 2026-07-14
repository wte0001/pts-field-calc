// Wire sizing per NEC Table 310.16 with optional ambient correction
// (Table 310.15(B)(1)(1)) and conductor-count adjustment (Table 310.15(C)(1)).
// Pure functions only. NEC 2023.

import table31016 from '../data/nec_310_16.json'
import ambientTable from '../data/nec_310_15_b1.json'
import adjustTable from '../data/nec_310_15_c1.json'

// PTS procurement preference, NOT a code rule: these sizes are hard to get and are
// skipped when recommending (they are still shown when they would satisfy the load).
export const UNCOMMON_SIZES = ['3', '300', '400', '700']

// Above this load, also suggest parallel-run options (600 kcmil Cu 75C = 420 A is
// the largest single conductor PTS considers practical to procure and pull).
export const PARALLEL_SUGGEST_AMPS = 420

// NEC 310.10(G): conductors may only be paralleled at 1/0 AWG and larger.
export const MIN_PARALLEL_SIZE = '1/0'

// PTS practice: parallel makeups use conductors no larger than 750 kcmil (bigger
// cable is impractical to pull and terminate). Single-conductor selection above
// still uses the full table.
export const MAX_PARALLEL_SIZE = '750'

// Upper bound on suggested sets per phase.
export const MAX_PARALLEL_RUNS = 16

const isCommon = size => !UNCOMMON_SIZES.includes(size)

/**
 * Parallel-run options: starting from the fewest sets that can carry the load,
 * the smallest common conductor (1/0 AWG to 750 kcmil per PTS practice and NEC
 * 310.10(G)) whose derated ampacity covers load/runs. Higher run counts are only
 * listed when they drop to a smaller conductor; options stop at the 1/0 floor or
 * MAX_PARALLEL_RUNS sets.
 * @returns array of {runs, size, baseAmpacity, deratedAmpacity, totalAmpacity} or null
 */
function parallelOptions(amps, candidates) {
  const startIdx = candidates.findIndex(c => c.size === MIN_PARALLEL_SIZE)
  if (startIdx === -1) return null
  const endIdx = candidates.findIndex(c => c.size === MAX_PARALLEL_SIZE)
  const pool = candidates
    .slice(startIdx, endIdx === -1 ? undefined : endIdx + 1)
    .filter(c => c.derated !== null && isCommon(c.size))
  if (pool.length === 0) return null

  const biggest = pool[pool.length - 1]
  const minRuns = Math.max(2, Math.ceil(amps / biggest.derated))
  if (minRuns > MAX_PARALLEL_RUNS) return null

  const options = []
  let lastPoolIdx = Infinity
  for (let runs = minRuns; runs <= MAX_PARALLEL_RUNS; runs++) {
    const perRun = amps / runs
    const poolIdx = pool.findIndex(c => c.derated >= perRun)
    if (poolIdx === -1) continue
    if (poolIdx >= lastPoolIdx) continue // same or bigger conductor than fewer runs - strictly worse
    lastPoolIdx = poolIdx
    const pick = pool[poolIdx]
    options.push({
      runs,
      size: pick.size,
      baseAmpacity: pick.base,
      deratedAmpacity: round1(pick.derated),
      totalAmpacity: round1(pick.derated * runs)
    })
    if (poolIdx === 0) break // at the 1/0 floor - more runs are pure waste
  }
  return options.length > 0 ? options : null
}

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

  // Parallel-run suggestions for large loads (also offered when no single conductor works)
  const parallel = amps > PARALLEL_SUGGEST_AMPS ? parallelOptions(amps, candidates) : null

  const rawIdx = candidates.findIndex(c => c.derated !== null && c.derated >= amps)
  if (rawIdx === -1) {
    return {
      error: 'No single conductor in Table 310.16 is adequate for this current with the applied factors. Parallel conductors or engineering review required.',
      amps,
      factors: { ambient, adjust, totalFactor, usingAdvanced },
      parallel
    }
  }

  // If the first adequate size is hard to get, recommend the next common size instead
  // (the hard-to-get size is still reported so the user sees it would have worked).
  let selIdx = rawIdx
  let hardToGetSkipped = null
  const warnings = []
  if (!isCommon(candidates[rawIdx].size)) {
    const commonIdx = candidates.findIndex(
      (c, i) => i > rawIdx && c.derated !== null && c.derated >= amps && isCommon(c.size)
    )
    if (commonIdx !== -1) {
      const raw = candidates[rawIdx]
      hardToGetSkipped = { size: raw.size, baseAmpacity: raw.base, deratedAmpacity: round1(raw.derated) }
      selIdx = commonIdx
    } else {
      warnings.push('The selected size is flagged hard-to-get, but no larger common size is available in the table.')
    }
  }

  const sel = candidates[selIdx]
  const next = candidates.slice(selIdx + 1).find(c => c.derated !== null && isCommon(c.size)) || null
  const skippedUnverified = candidates.slice(0, selIdx).some(c => c.unverified)
  if (skippedUnverified) {
    warnings.push('One or more smaller sizes were skipped because their table value is unverified (null) in this app. Verify against the printed NEC.')
  }

  return {
    table: 'NEC 2023 Table 310.16',
    material,
    tempRating,
    amps,
    size: sel.size,
    baseAmpacity: sel.base,
    deratedAmpacity: round1(sel.derated),
    hardToGetSkipped,
    nextSize: next ? { size: next.size, baseAmpacity: next.base, deratedAmpacity: round1(next.derated) } : null,
    parallel,
    factors: {
      ambient: { factor: ambient.factor, label: ambient.label },
      adjust: { factor: adjust.factor, label: adjust.label },
      totalFactor: round3(totalFactor),
      usingAdvanced
    },
    warnings
  }
}

function round1(x) { return x === null ? null : Math.round(x * 10) / 10 }
function round3(x) { return Math.round(x * 1000) / 1000 }
