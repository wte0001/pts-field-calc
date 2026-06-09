// Conduit fill per NEC Chapter 9, Tables 1, 4, and 5. NEC 2023.
// Pure functions only.

import table4 from '../data/nec_ch9_table4.json'
import table5 from '../data/nec_ch9_table5.json'

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

function round4(x) { return Math.round(x * 10000) / 10000 }
