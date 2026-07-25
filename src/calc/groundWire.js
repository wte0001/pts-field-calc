// Equipment grounding conductor (EGC) sizing per NEC Table 250.122.
// Pure functions only.
//
// The EGC is sized on the RATING OF THE OVERCURRENT DEVICE ahead of the circuit,
// not on the ungrounded conductor size. Two companion rules are applied here:
//
//   250.122(B) - if the ungrounded conductors were increased above the minimum size
//                with sufficient ampacity, the EGC increases proportionally by
//                circular-mil area. This app upsizes for hard-to-get stock, which
//                triggers the rule, so it is computed rather than left to the user.
//   250.122(A) - the EGC never needs to exceed the circuit conductor size.
//
// 250.122(F) (full-size EGC in EACH parallel raceway) is surfaced as a note; this
// module does not attempt to encode all of its cases.

import egcTable from '../data/nec_250_122.json'
import table8 from '../data/nec_ch9_table8_cmil.json'

export const EGC_RULES = egcTable._meta.companionRules
export const CMIL = table8.cmil
export const CMIL_SIZES = table8.sizes

// NEC 240.6(A) standard ampere ratings for fuses and inverse-time breakers.
export const STANDARD_OCPD = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200,
  225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000,
  2500, 3000, 4000, 5000, 6000
]

/** Smallest standard OCPD rating at or above amps (240.6(A)); null if off the list. */
export function nextStandardOcpd(amps) {
  if (!Number.isFinite(amps) || amps <= 0) return null
  return STANDARD_OCPD.find(r => r >= amps) ?? null
}

const cmilOf = size => CMIL[size] ?? null

/** Smallest listed size whose circular-mil area is at least cmilNeeded. */
function sizeForCmil(cmilNeeded) {
  return CMIL_SIZES.find(s => CMIL[s] >= cmilNeeded) ?? null
}

/**
 * Raw Table 250.122 lookup: first row whose rating is at or above the device rating.
 * @param {number} ocpdAmps
 * @param {'copper'|'aluminum'} material
 */
export function egcFromTable(ocpdAmps, material) {
  if (!Number.isFinite(ocpdAmps) || ocpdAmps <= 0) {
    return { error: 'Enter an overcurrent device rating greater than 0 A.' }
  }
  if (material !== 'copper' && material !== 'aluminum') {
    return { error: 'EGC material must be copper or aluminum.' }
  }
  const row = egcTable.rows.find(r => r.ocpd >= ocpdAmps)
  if (!row) {
    return { error: `Overcurrent device ratings above ${egcTable.rows[egcTable.rows.length - 1].ocpd} A are beyond Table 250.122.` }
  }
  const size = row[material]
  if (size === null || size === undefined) {
    return {
      error: `The ${row.ocpd} A ${material} value is not loaded in this app (unverified). Check the printed Table 250.122.`,
      unverified: true
    }
  }
  return { size, tableRating: row.ocpd, cmil: cmilOf(size) }
}

/**
 * EGC size with the 250.122(B) proportional increase and 250.122(A) cap applied.
 * @param {object} p
 * @param {number} p.ocpdAmps - overcurrent device rating
 * @param {'copper'|'aluminum'} p.material - EGC material
 * @param {string} [p.circuitSize] - ungrounded conductor size actually used
 * @param {string} [p.minAmpacitySize] - smallest size with sufficient ampacity
 * @param {number} [p.sets] - parallel sets per phase (for the 250.122(F) note)
 */
export function groundConductor(p) {
  const base = egcFromTable(p.ocpdAmps, p.material)
  if (base.error) return base

  const notes = []
  let size = base.size
  let proportional = null

  // 250.122(B): upsized ungrounded conductors -> proportional EGC increase
  const usedCmil = cmilOf(p.circuitSize)
  const minCmil = cmilOf(p.minAmpacitySize)
  if (usedCmil && minCmil && usedCmil > minCmil && base.cmil) {
    const ratio = usedCmil / minCmil
    const needed = base.cmil * ratio
    const bumped = sizeForCmil(needed)
    proportional = {
      ratio: Math.round(ratio * 1000) / 1000,
      fromSize: p.minAmpacitySize,
      toSize: p.circuitSize,
      neededCmil: Math.round(needed),
      size: bumped
    }
    if (bumped && CMIL[bumped] > base.cmil) {
      size = bumped
      notes.push(
        `250.122(B): ungrounded conductors upsized ${p.minAmpacitySize} → ${p.circuitSize} ` +
        `(×${proportional.ratio}), so the EGC increases proportionally from ${base.size} to ${bumped}.`
      )
    }
  }

  // 250.122(A): the EGC need not be larger than the circuit conductors
  let capped = false
  if (usedCmil && cmilOf(size) > usedCmil) {
    size = p.circuitSize
    capped = true
    notes.push(`250.122(A): EGC reduced to ${p.circuitSize} — it need not be larger than the circuit conductors.`)
  }

  // 250.122(F): parallel sets. Three permitted arrangements, all using the SAME
  // full-size EGC from the table - the EGC is never divided among the runs.
  const parallelGuidance = []
  if (Number.isFinite(p.sets) && p.sets > 1) {
    parallelGuidance.push({
      arrangement: `Separate raceways or cables (${p.sets} runs)`,
      rule: '250.122(F)',
      text: `A full-size ${size} EGC is required in EACH of the ${p.sets} raceways or cables — ${p.sets} × ${size}. The EGC is not divided among parallel runs.`
    })
    parallelGuidance.push({
      arrangement: 'All runs in one raceway, gutter, or tray',
      rule: '250.122(F)',
      text: `A single ${size} EGC is permitted for the whole group.`
    })
    parallelGuidance.push({
      arrangement: 'Parallel multiconductor cables in a common cable tray',
      rule: '250.122(F) tray allowance',
      text: `One standalone ${size} EGC run in the tray is permitted for the group, bonded together with the EGCs inside the individual cables — so each parallel cable does not need its own full-size EGC. Confirm the subdivision in your code edition.`
    })
    parallelGuidance.push({
      arrangement: 'Metallic tray as the EGC',
      rule: '392.60',
      text: 'Separately, the metallic tray system itself may serve as the EGC where it meets 392.60 (minimum metal cross-section per Table 392.60(A), qualified-persons servicing, marking, bonded sections and fittings).'
    })
    notes.push(`250.122(F): the EGC is sized on the ${p.ocpdAmps} A device and is NOT divided among the ${p.sets} runs — see the arrangements below.`)
  }
  if (p.material === 'aluminum') {
    notes.push('250.120(B): aluminum EGCs are not permitted in direct contact with masonry or earth, in corrosive conditions, or within 18 in. of earth.')
  }

  return {
    table: 'NEC Table 250.122',
    material: p.material,
    ocpdAmps: p.ocpdAmps,
    tableRating: base.tableRating,
    baseSize: base.size,
    size,
    sets: Number.isFinite(p.sets) && p.sets > 1 ? p.sets : 1,
    proportional,
    capped,
    parallelGuidance,
    notes
  }
}
