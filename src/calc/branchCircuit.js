// PTS branch-circuit sizing method. Pure functions only.
//
// wireSize.js walks Table 310.16 for a given current. That primitive alone gets
// small circuits WRONG, because two rules sit on top of the table:
//
//   240.4(D)  small-conductor caps. 14/12/10 AWG may not be protected above
//             15/20/30 A copper (15/25 A aluminum) no matter what the table
//             allows. These are the asterisked rows on the printed table, and
//             they are why a 40 A circuit cannot use 10 AWG even though the
//             75 C column shows 35 A.
//   110.14(C) termination temperature. Circuits of 100 A or less are sized from
//             the 60 C column, above 100 A from the 75 C column. The 90 C column
//             is never used for sizing - it is only ever a derating basis. This
//             is what the crossed-out column blocks on the PTS chart mean.
//
// So the conductor is sized to the OVERCURRENT DEVICE, not to the raw load, and
// half-size device ratings PTS does not stock are stepped past.

import table31016 from '../data/nec_310_16.json'
import ocpdData from '../data/pts_ocpd_sizes.json'
import {
  UNCOMMON_SIZES, ambientCorrectionFactor, conductorCountAdjustment, selectWireSize
} from './wireSize.js'

export const OCPD_RATINGS = ocpdData.ratings.map(r => r.a)
export const STOCKED_OCPD = ocpdData.ratings.filter(r => r.stocked).map(r => r.a)
export const SMALL_CONDUCTOR_CAP = ocpdData.smallConductorMaxOcpd
export const CONTINUOUS_FACTOR = 1.25
export const TERMINATION_BREAKPOINT_AMPS = 100

const isCommon = size => !UNCOMMON_SIZES.includes(size)
const round1 = x => Math.round(x * 10) / 10
const round3 = x => Math.round(x * 1000) / 1000

/** Smallest overcurrent rating PTS stocks at or above amps. */
export function nextStockedOcpd(amps) {
  if (!Number.isFinite(amps) || amps <= 0) return null
  return STOCKED_OCPD.find(a => a >= amps) ?? null
}

/**
 * Largest overcurrent device this conductor may be protected by under 240.4(D).
 * @returns {number|null} null where no small-conductor cap applies
 */
export function smallConductorCap(size, material) {
  const col = SMALL_CONDUCTOR_CAP[material]
  if (!col) return null
  const cap = col[String(size)]
  return cap === undefined ? null : cap
}

/**
 * Termination column per 110.14(C)(1): 60 C at 100 A or less, 75 C above that.
 * terminations75 forces the 75 C column, which 110.14(C)(1)(a) permits where the
 * equipment is listed and identified for 75 C terminations.
 */
export function terminationColumn(ocpdAmps, terminations75) {
  if (terminations75) return 75
  return ocpdAmps <= TERMINATION_BREAKPOINT_AMPS ? 60 : 75
}

/**
 * Size a branch circuit the way PTS sizes one.
 * @param {number} loadAmps
 * @param {'copper'|'aluminum'} material
 * @param {{continuous?:boolean, ocpdAmps?:number, terminations75?:boolean,
 *          ambientC?:number, numConductors?:number}} [opts]
 */
export function sizeBranchCircuit(loadAmps, material, opts = {}) {
  if (!Number.isFinite(loadAmps) || loadAmps <= 0) {
    return { error: 'Enter a load current greater than 0 A.' }
  }
  const col = table31016[material]
  if (!col) return { error: 'Unknown conductor material.' }

  const continuous = opts.continuous !== false
  const designAmps = continuous ? loadAmps * CONTINUOUS_FACTOR : loadAmps

  const ocpdDerived = opts.ocpdAmps === undefined || opts.ocpdAmps === null
  const ocpd = ocpdDerived ? nextStockedOcpd(designAmps) : opts.ocpdAmps
  if (!Number.isFinite(ocpd) || ocpd <= 0) {
    return { error: `No stocked overcurrent rating covers ${round1(designAmps)} A. Enter one manually.` }
  }

  const tempRating = terminationColumn(ocpd, opts.terminations75)

  // Derating works from the same column - PTS does not size from the 90 C column.
  let ambient = { factor: 1.0, label: null }
  let adjust = { factor: 1.0, label: null }
  if (opts.ambientC !== undefined && opts.ambientC !== null) {
    const a = ambientCorrectionFactor(opts.ambientC, tempRating)
    if (!a) return { error: 'Ambient temperature is outside Table 310.15(B)(1)(1).' }
    if (a.factor === null) {
      return { error: `Ambient of ${opts.ambientC}°C is not permitted for ${tempRating}°C insulation.` }
    }
    ambient = a
  }
  if (opts.numConductors !== undefined && opts.numConductors !== null) {
    const adj = conductorCountAdjustment(opts.numConductors)
    if (!adj) return { error: 'Invalid conductor count.' }
    adjust = adj
  }
  const totalFactor = ambient.factor * adjust.factor
  const usingAdvanced = totalFactor !== 1

  // A size qualifies only if BOTH hold: the device is allowed to protect it
  // (240.4(D) cap and ampacity), and its derated ampacity carries the design load.
  const candidates = []
  for (const size of table31016.sizes) {
    const entry = col[size]
    if (!entry) continue
    const base = entry[String(tempRating)]
    if (base === null || base === undefined) {
      candidates.push({ size, base: null, cap: null, unverified: true, ok: false })
      continue
    }
    const cap = smallConductorCap(size, material)
    const protectedAt = cap === null ? base : Math.min(base, cap)
    candidates.push({
      size,
      base,
      cap,
      protectedAt,
      derated: base * totalFactor,
      ok: protectedAt >= ocpd && base * totalFactor >= designAmps - 1e-9,
      unverified: false
    })
  }

  const advForParallel = usingAdvanced
    ? { ambientC: opts.ambientC, numConductors: opts.numConductors }
    : {}
  const parallel = selectWireSize(designAmps, material, tempRating, advForParallel).parallel || null

  const rawIdx = candidates.findIndex(c => c.ok)
  if (rawIdx === -1) {
    return {
      error: `No single conductor works for a ${ocpd} A device at ${tempRating}°C with the applied factors. Use parallel conductors or review the design.`,
      loadAmps, designAmps: round1(designAmps), ocpd, ocpdDerived, tempRating, parallel
    }
  }

  // Step past hard-to-get sizes, but still report the one that would have worked.
  let selIdx = rawIdx
  let hardToGetSkipped = null
  const warnings = []
  if (!isCommon(candidates[rawIdx].size)) {
    const commonIdx = candidates.findIndex((c, i) => i > rawIdx && c.ok && isCommon(c.size))
    if (commonIdx !== -1) {
      const raw = candidates[rawIdx]
      hardToGetSkipped = { size: raw.size, baseAmpacity: raw.base, protectedAt: raw.protectedAt }
      selIdx = commonIdx
    } else {
      warnings.push('The selected size is flagged hard-to-get, but no larger common size is available in the table.')
    }
  }

  const sel = candidates[selIdx]
  const next = candidates.slice(selIdx + 1).find(c => c.base !== null && isCommon(c.size)) || null

  // Explain the nearest smaller size that 240.4(D) rules out. Only the closest one
  // is reported - listing every capped size below the answer is noise.
  const capped = candidates.slice(0, selIdx)
    .filter(c => c.base !== null && c.cap !== null && c.cap < ocpd)
  if (capped.length > 0) {
    const c = capped[capped.length - 1]
    warnings.push(
      `${c.size} AWG cannot be used: 240.4(D) limits it to a ${c.cap} A device` +
      `${c.base < ocpd ? ` and it carries only ${c.base} A at ${tempRating}°C` : ` even though it carries ${c.base} A at ${tempRating}°C`}, ` +
      `so it cannot be protected at ${ocpd} A.`
    )
  }
  if (candidates.slice(0, selIdx).some(c => c.unverified)) {
    warnings.push('A smaller size was skipped because its table value is unverified (null) in this app. Verify against the printed NEC.')
  }

  return {
    table: 'NEC 2023 Table 310.16',
    material,
    loadAmps,
    continuous,
    designAmps: round1(designAmps),
    ocpd,
    ocpdDerived,
    tempRating,
    terminationRule: opts.terminations75
      ? 'Equipment listed and identified for 75°C terminations — 110.14(C)(1)(a)'
      : ocpd <= TERMINATION_BREAKPOINT_AMPS
        ? `${ocpd} A device is 100 A or less → 60°C column per 110.14(C)(1)(a)`
        : `${ocpd} A device is over 100 A → 75°C column per 110.14(C)(1)(b)`,
    size: sel.size,
    baseAmpacity: sel.base,
    smallConductorCap: sel.cap,
    protectedAt: sel.protectedAt,
    deratedAmpacity: round1(sel.derated),
    hardToGetSkipped,
    nextSize: next ? { size: next.size, baseAmpacity: next.base } : null,
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
