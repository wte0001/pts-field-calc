// Conduit fill per NEC Chapter 9, Tables 1, 4, and 5. NEC 2023.
// Pure functions only.

import table4 from '../data/nec_ch9_table4.json'
import table5 from '../data/nec_ch9_table5.json'
import { conductorCountAdjustment, baseAmpacity } from './wireSize.js'

export const CONDUIT_TYPES = Object.keys(table4.types)
export const INSULATION_TYPES = Object.keys(table5.insulations)
export const CONDUCTOR_SIZES = table5.sizes

/** Fill limit per Chapter 9 Table 1. */
export function fillLimit(conductorCount) {
  if (conductorCount === 1) return 0.53
  if (conductorCount === 2) return 0.31
  return 0.40
}

/**
 * @param {string} conduitType - key in Table 4 (EMT, RMC, PVC40, PVC80, LFMC)
 * @param {Array<{insulation:string, size:string, qty:number}>} rows
 */
export function conduitFill(conduitType, rows) {
  const type = table4.types[conduitType]
  if (!type) return { error: 'Unknown conduit type.' }

  const clean = (rows || []).filter(r => r && r.qty > 0 && Number.isInteger(r.qty))
  if (clean.length === 0) return { error: 'Add at least one conductor.' }

  let totalArea = 0
  let totalCount = 0
  const detail = []
  for (const r of clean) {
    const ins = table5.insulations[r.insulation]
    if (!ins) return { error: `Unknown insulation type: ${r.insulation}` }
    const area = ins.areas[r.size]
    if (area === undefined) return { error: `${r.size} is not listed for ${r.insulation} in Chapter 9 Table 5.` }
    if (area === null) {
      return {
        error: `The Chapter 9 Table 5 area for ${r.size} ${r.insulation} is not loaded in this app (unverified). See VERIFICATION.md.`,
        unverified: true
      }
    }
    totalArea += area * r.qty
    totalCount += r.qty
    detail.push({ ...r, unitArea: area, rowArea: round4(area * r.qty) })
  }

  const limit = fillLimit(totalCount)

  // Iterate trade sizes smallest to largest using Table 4 ordering.
  const sized = table4.tradeSizes
    .filter(ts => type.areas[ts] !== undefined)
    .map(ts => ({ tradeSize: ts, internalArea: type.areas[ts] }))

  const usable = sized.filter(s => s.internalArea !== null)
  const skippedNull = sized.some(s => s.internalArea === null)

  const idx = usable.findIndex(s => totalArea <= s.internalArea * limit)
  if (idx === -1) {
    return {
      error: `No ${conduitType} trade size in Chapter 9 Table 4 is adequate (total conductor area ${round4(totalArea)} sq in exceeds the largest size at ${Math.round(limit * 100)}% fill).`,
      totalArea: round4(totalArea),
      totalCount,
      limit
    }
  }

  const make = s => ({
    tradeSize: s.tradeSize,
    internalArea: s.internalArea,
    allowableArea: round4(s.internalArea * limit),
    percentFill: Math.round((totalArea / s.internalArea) * 1000) / 10
  })

  return {
    tables: 'NEC 2023 Chapter 9, Tables 1, 4, and 5',
    conduitType,
    conduitLabel: type.label,
    totalCount,
    totalArea: round4(totalArea),
    limit,
    limitPercent: Math.round(limit * 100),
    detail,
    minimum: make(usable[idx]),
    nextUp: usable[idx + 1] ? make(usable[idx + 1]) : null,
    warnings: skippedNull
      ? ['Some trade sizes for this conduit type have unverified (null) areas in this app and were skipped. See VERIFICATION.md.']
      : []
  }
}

// A conductor's job, which decides whether it counts toward the 310.15(C)(1)
// current-carrying count. Every role counts toward conduit FILL - fill counts
// physical conductors, always.
export const ROLES = [
  { id: 'phase', label: 'Phase' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'ground', label: 'Ground / EGC' }
]

export const MAX_SETS = 12
const roleOf = r => (r && r.role) || 'phase'

/**
 * Current-carrying conductor count. An EGC is never current-carrying. A neutral
 * counts only where it carries harmonic current from nonlinear loads - 310.15(E).
 */
function cccCount(contents, neutralCounts) {
  return contents.reduce((n, r) => {
    const role = roleOf(r)
    if (role === 'ground') return n
    if (role === 'neutral' && !neutralCounts) return n
    return n + r.qty
  }, 0)
}

/**
 * What one conduit holds under a given arrangement.
 * 'perSet' - one conduit per set, so each holds one set's worth.
 * 'single' - every set shares one conduit. Phase and neutral conductors multiply by
 *            the set count; grounds do NOT, because 250.122(F) permits a single EGC
 *            for the group where the parallel conductors share one raceway.
 */
function contentsFor(rows, sets, arrangement) {
  return rows.map(r => ({
    ...r,
    role: roleOf(r),
    qty: arrangement === 'single' && roleOf(r) !== 'ground' ? r.qty * sets : r.qty
  }))
}

function arrangementResult(conduitType, rows, sets, arrangement, neutralCounts) {
  const contents = contentsFor(rows, sets, arrangement)
  const ccc = cccCount(contents, neutralCounts)
  const adjust = conductorCountAdjustment(ccc) || { factor: 1, label: 'unknown' }
  return {
    arrangement,
    conduits: arrangement === 'single' ? 1 : sets,
    contents,
    ccc,
    adjust,
    fill: conduitFill(conduitType, contents)
  }
}

/**
 * Compare running parallel sets in one conduit against one conduit per set.
 *
 * The fill answer alone favours one big conduit; the ampacity answer usually does
 * not, because piling every set into one raceway pushes the current-carrying count
 * past three and triggers the Table 310.15(C)(1) adjustment. Both are computed so
 * the trade-off is visible instead of implied.
 *
 * @param {string} conduitType
 * @param {Array<{insulation:string, size:string, qty:number, role?:string}>} rows
 *   qty is PER SET.
 * @param {{sets?:number, neutralCounts?:boolean, material?:string, tempRating?:number}} [opts]
 */
export function conduitFillSets(conduitType, rows, opts = {}) {
  const sets = Number.isInteger(opts.sets) && opts.sets >= 1 ? Math.min(opts.sets, MAX_SETS) : 1
  const neutralCounts = !!opts.neutralCounts
  const clean = (rows || []).filter(r => r && r.qty > 0 && Number.isInteger(r.qty))
  if (clean.length === 0) return { error: 'Add at least one conductor.' }

  const perSet = arrangementResult(conduitType, clean, sets, 'perSet', neutralCounts)
  const single = arrangementResult(conduitType, clean, sets, 'single', neutralCounts)

  // Ampacity comparison, only when every phase conductor is one size - with mixed
  // phase sizes there is no single honest number to quote.
  let ampacity = null
  const phaseSizes = [...new Set(clean.filter(r => roleOf(r) === 'phase').map(r => r.size))]
  const material = opts.material || 'copper'
  const tempRating = opts.tempRating || 75
  if (phaseSizes.length === 1) {
    const base = baseAmpacity(phaseSizes[0], material, tempRating)
    if (base !== null) {
      const r1 = x => Math.round(x * 10) / 10
      ampacity = {
        size: phaseSizes[0], material, tempRating, base,
        perSet: {
          derated: r1(base * perSet.adjust.factor),
          perPhase: r1(base * perSet.adjust.factor * sets)
        },
        single: {
          derated: r1(base * single.adjust.factor),
          perPhase: r1(base * single.adjust.factor * sets)
        }
      }
    }
  }

  // Fewer conduits is cheaper, so only prefer splitting when it actually buys
  // ampacity back.
  const recommended = sets > 1 && perSet.adjust.factor > single.adjust.factor ? 'perSet' : 'single'
  const capacityLossPct = perSet.adjust.factor > 0
    ? Math.round((1 - single.adjust.factor / perSet.adjust.factor) * 1000) / 10
    : 0

  return {
    sets, neutralCounts,
    arrangements: { perSet, single },
    recommended, capacityLossPct, ampacity
  }
}

function round4(x) { return Math.round(x * 10000) / 10000 }
