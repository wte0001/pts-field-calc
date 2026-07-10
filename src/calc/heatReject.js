// Estimated heat rejection from electrical distribution equipment, for HVAC load
// estimating. Pure functions only.
//
// Models (all heat in watts):
//   Transformers:  heat = noLoadW + loadLossW x (load fraction)^2
//     No-load (core) loss is constant whenever energized; winding loss scales with
//     the square of load current. loadLossW is the winding loss at 100% load.
//   Switchboards / MCCs:  heat = sections x wattsPerSection x (load fraction)^2
//     Section watts are the dissipation at rated load (bus + breakers/starters),
//     scaled by I^2 like any conduction loss.
//   Unit substation:  transformer model + LV section model combined.
//   Custom:  manufacturer-stated watts, entered directly.
//
// These are ESTIMATES. Defaults come from src/data/heat_loss_defaults.json and are
// editable on every row - replace with manufacturer data for design.

import defaults from '../data/heat_loss_defaults.json'

export const W_TO_BTUH = 3.412142
export const BTUH_PER_TON = 12000

export const LV_XFMR_KVA_LIST = defaults.lvDryType.map(r => r.kva)
export const MV_XFMR_KVA_LIST = defaults.mvDryType.map(r => r.kva)
export const SECTION_WATTS = defaults.sectionWatts
export const DATA_CAVEAT = defaults._meta.caveat

export const EQUIPMENT_TYPES = [
  { id: 'xfmr', label: 'Dry-type transformer (LV)' },
  { id: 'unitsub', label: 'Unit substation (MV xfmr + LV sections)' },
  { id: 'swbd', label: 'Main switchboard / LV switchgear' },
  { id: 'mcc', label: 'Motor control center' },
  { id: 'custom', label: 'Manufacturer data (enter watts)' }
]

/**
 * Typical losses for a low-voltage dry-type transformer, derived from the DOE 2016
 * minimum efficiency (10 CFR 431.196, defined at 35% load, unity PF).
 * Split assumption: DOE-era designs peak efficiency near the 35% test load, and
 * peak efficiency occurs where core loss equals winding loss. So at 35% load the
 * total loss is split 50/50: noLoadW = TL35/2, and loadLossW (at 100% load)
 * = (TL35/2) / 0.35^2.
 * @returns {{noLoadW:number, loadLossW:number, effPct:number}|null}
 */
export function lvXfmrTypicalLosses(kva) {
  const row = defaults.lvDryType.find(r => r.kva === kva)
  if (!row) return null
  const eff = row.effPct / 100
  const tl35 = 0.35 * kva * 1000 * (1 / eff - 1)
  const noLoadW = tl35 / 2
  const loadLossW = noLoadW / (0.35 * 0.35)
  return { noLoadW: Math.round(noLoadW), loadLossW: Math.round(loadLossW), effPct: row.effPct }
}

/** Typical losses for an MV-primary dry-type unit substation transformer. */
export function mvXfmrTypicalLosses(kva) {
  const row = defaults.mvDryType.find(r => r.kva === kva)
  if (!row) return null
  return { noLoadW: row.noLoadW, loadLossW: row.loadLossW }
}

const bad = n => !Number.isFinite(n)

/**
 * Heat for one equipment item. All numeric fields must already be parsed.
 * @param {object} item
 *   { type:'xfmr'|'unitsub', noLoadW, loadLossW, loadPct, [sections, wPerSection] }
 *   { type:'swbd'|'mcc', sections, wPerSection, loadPct }
 *   { type:'custom', watts }
 * @returns {{watts:number, warnings:string[]}|{error:string}}
 */
export function itemHeat(item) {
  const warnings = []

  if (item.type === 'custom') {
    if (bad(item.watts) || item.watts < 0) return { error: 'Enter the manufacturer heat loss in watts (0 or more).' }
    return { watts: item.watts, warnings }
  }

  const isXfmr = item.type === 'xfmr' || item.type === 'unitsub'
  const isSections = item.type === 'swbd' || item.type === 'mcc' || item.type === 'unitsub'
  if (!isXfmr && !isSections) return { error: 'Unknown equipment type.' }

  if (bad(item.loadPct) || item.loadPct < 0 || item.loadPct > 150) {
    return { error: 'Load must be between 0 and 150%.' }
  }
  const L = item.loadPct / 100
  if (item.loadPct > 100) warnings.push('Load above 100% of rating - check the entry.')

  let watts = 0
  if (isXfmr) {
    if (bad(item.noLoadW) || item.noLoadW < 0) return { error: 'Enter a no-load (core) loss of 0 W or more.' }
    if (bad(item.loadLossW) || item.loadLossW < 0) return { error: 'Enter a full-load winding loss of 0 W or more.' }
    watts += item.noLoadW + item.loadLossW * L * L
  }
  if (isSections) {
    if (bad(item.sections) || !Number.isInteger(item.sections) || item.sections < 1) {
      return { error: 'Enter a whole number of vertical sections (1 or more).' }
    }
    if (bad(item.wPerSection) || item.wPerSection < 0) return { error: 'Enter watts per section of 0 W or more.' }
    watts += item.sections * item.wPerSection * L * L
  }

  return { watts, warnings }
}

/**
 * Totals for a list of items. Any invalid item makes the whole result an error,
 * naming the first offending row (same pattern as trayFill).
 */
export function heatTotal(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one equipment item.' }
  }
  const results = []
  const warnings = []
  let totalW = 0
  for (let i = 0; i < items.length; i++) {
    const r = itemHeat(items[i])
    if (r.error) {
      const label = items[i].tag ? `"${items[i].tag}"` : `item ${i + 1}`
      return { error: `${label}: ${r.error}` }
    }
    totalW += r.watts
    r.warnings.forEach(w => {
      const label = items[i].tag ? `"${items[i].tag}"` : `item ${i + 1}`
      warnings.push(`${label}: ${w}`)
    })
    results.push({ watts: r.watts, btuh: r.watts * W_TO_BTUH })
  }
  return {
    totalW,
    totalKw: totalW / 1000,
    btuh: totalW * W_TO_BTUH,
    tons: (totalW * W_TO_BTUH) / BTUH_PER_TON,
    items: results,
    warnings
  }
}

/** CSV export of the item list and totals, for handoff to the HVAC engineer. */
export function heatRejectCsv(items, result) {
  const typeLabel = id => (EQUIPMENT_TYPES.find(t => t.id === id) || { label: id }).label
  const esc = s => {
    const v = String(s ?? '')
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const lines = ['Tag,Equipment type,Assumptions,Load %,Heat (W),Heat (BTU/hr)']
  items.forEach((it, i) => {
    const r = result.items[i]
    let assume = ''
    if (it.type === 'xfmr' || it.type === 'unitsub') {
      assume = `NL ${it.noLoadW} W + LL ${it.loadLossW} W x load^2`
      if (it.type === 'unitsub') assume += `; ${it.sections} LV section(s) @ ${it.wPerSection} W`
    } else if (it.type === 'swbd' || it.type === 'mcc') {
      assume = `${it.sections} section(s) @ ${it.wPerSection} W rated, x load^2`
    } else {
      assume = 'Manufacturer-stated watts'
    }
    const loadPct = it.type === 'custom' ? '' : it.loadPct
    lines.push([esc(it.tag), esc(typeLabel(it.type)), esc(assume), loadPct, r.watts.toFixed(0), r.btuh.toFixed(0)].join(','))
  })
  lines.push('')
  lines.push(`TOTAL,,,,${result.totalW.toFixed(0)},${result.btuh.toFixed(0)}`)
  lines.push(`,,,,kW: ${result.totalKw.toFixed(2)},Tons: ${result.tons.toFixed(2)}`)
  lines.push('')
  lines.push(`"${DATA_CAVEAT}"`)
  return lines.join('\n')
}
