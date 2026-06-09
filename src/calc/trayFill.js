// Cable tray fill per NEC 392.22(A)(1), multiconductor cables rated 2000V or
// less in ladder tray. NEC 2023. Pure functions only.
//
// Classification is by CONDUCTOR size ("4/0 AWG or larger" vs "smaller than
// 4/0 AWG"), never by cable OD. A circuit row with N parallel runs contributes
// N physical cables to every sum.

import trayTable from '../data/nec_392_22a.json'
import cableData from '../data/tc_cable_dimensions.json'

export const STANDARD_WIDTHS = trayTable.standardWidthsIn
export const COLUMN1 = trayTable.column1AreaSqIn
export const CABLE_SIZES = cableData.sizes
export const CABLE_DATA = cableData.cables

// Conductor size order, smallest to largest. Index >= index of '4/0' means
// "4/0 or larger" for case classification.
const SIZE_ORDER = ['18', '16', '14', '12', '10', '8', '6', '4', '3', '2', '1',
  '1/0', '2/0', '3/0', '4/0', '250', '300', '350', '400', '500', '600', '700', '750',
  '800', '900', '1000']
const IDX_4_0 = SIZE_ORDER.indexOf('4/0')

/** True if conductor size is 4/0 AWG or larger (kcmil sizes included). */
export function isLargeConductor(size) {
  const i = SIZE_ORDER.indexOf(String(size))
  if (i === -1) throw new Error(`Unknown conductor size: ${size}`)
  return i >= IDX_4_0
}

/** Default catalog OD for a size, or null if absent (manual entry required). */
export function defaultOd(size) {
  const c = CABLE_DATA[String(size)]
  return c ? c.odIn : null
}

/** Cable area from OD: (pi/4) * OD^2 */
export function cableArea(odIn) {
  return (Math.PI / 4) * odIn * odIn
}

/**
 * Compute minimum standard tray width per 392.22(A)(1).
 * @param {Array<{tag:string, size:string, runs:number, odIn:number}>} rows
 *   odIn must already be resolved (catalog value or manual override).
 * @returns result object or {error}
 */
export function trayFill(rows) {
  const clean = (rows || []).filter(r => r && r.size)
  if (clean.length === 0) return { error: 'Add at least one circuit.' }

  // Validate and expand: a row with N parallel runs is N physical cables.
  const cables = []
  const rowWarnings = []
  for (const r of clean) {
    const runs = Number(r.runs)
    if (!Number.isInteger(runs) || runs < 1) {
      return { error: `"${r.tag || r.size}": parallel runs must be a whole number of 1 or more.` }
    }
    const od = Number(r.odIn)
    if (!Number.isFinite(od) || od <= 0) {
      return { error: `"${r.tag || r.size}": cable OD is missing. ${defaultOd(r.size) === null ? 'This size requires manual OD entry (not in the Southwire standard line).' : 'Enter a valid OD in inches.'}` }
    }
    let large
    try { large = isLargeConductor(r.size) } catch (e) { return { error: e.message } }
    const manualOd = defaultOd(r.size) === null || Math.abs(od - defaultOd(r.size)) > 1e-9
    if (manualOd) rowWarnings.push(`"${r.tag || r.size}" uses a manual/overridden OD (${od} in).`)
    for (let i = 0; i < runs; i++) {
      cables.push({ tag: r.tag, size: r.size, odIn: od, areaSqIn: cableArea(od), large })
    }
  }

  const largeCables = cables.filter(c => c.large)
  const smallCables = cables.filter(c => !c.large)

  // Governing sums. Sd = sum of ODs of all 4/0-and-larger cables.
  const Sd = largeCables.reduce((s, c) => s + c.odIn, 0)
  const Asmall = smallCables.reduce((s, c) => s + c.areaSqIn, 0)
  const sumAllOd = cables.reduce((s, c) => s + c.odIn, 0)

  let caseId, caseRule
  if (smallCables.length === 0) {
    caseId = 'A'
    caseRule = 'All cables 4/0 AWG or larger: sum of cable ODs must not exceed the tray width (single layer). 392.22(A)(1)(a).'
  } else if (largeCables.length === 0) {
    caseId = 'B'
    caseRule = 'All cables smaller than 4/0 AWG: sum of cable areas must not exceed the Column 1 allowable fill area. 392.22(A)(1)(b).'
  } else {
    caseId = 'C'
    caseRule = 'Mixed sizes: smaller-cable area must not exceed Column 1 minus 1.2 x Sd (Column 2). 392.22(A)(1)(c).'
  }

  // Evaluate each standard width.
  const widths = STANDARD_WIDTHS.map(w => {
    const col1 = COLUMN1[String(w)]
    let ok, allowable, used
    if (caseId === 'A') {
      allowable = w           // inches of width
      used = sumAllOd         // inches
      ok = sumAllOd <= w + 1e-9
    } else if (caseId === 'B') {
      allowable = col1        // sq in
      used = Asmall
      ok = Asmall <= col1 + 1e-9
    } else {
      allowable = col1 - 1.2 * Sd  // sq in available for small cables
      used = Asmall
      ok = allowable > 0 && Asmall <= allowable + 1e-9
    }
    return {
      width: w,
      column1: col1,
      allowable: round3(allowable),
      used: round3(used),
      ok,
      utilizationPct: allowable > 0 ? Math.round((used / allowable) * 1000) / 10 : null
    }
  })

  const minIdx = widths.findIndex(x => x.ok)
  const adequate = minIdx !== -1

  return {
    rule: 'NEC 2023 392.22(A)(1), Table 392.22(A)',
    caseId,
    caseRule,
    cableCount: cables.length,
    largeCount: largeCables.length,
    smallCount: smallCables.length,
    Sd: round3(Sd),
    Asmall: round3(Asmall),
    sumAllOd: round3(sumAllOd),
    widths,
    adequate,
    minWidth: adequate ? widths[minIdx].width : null,
    selected: adequate ? widths[minIdx] : null,
    nextUp: adequate && widths[minIdx + 1] ? widths[minIdx + 1] : null,
    inadequateMessage: adequate ? null
      : `No standard tray width (up to ${STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1]} in.) is adequate for this cable list. Split into multiple trays or review the design.`,
    warnings: rowWarnings
  }
}

/** Build CSV text of the circuit list and result. */
export function trayFillCsv(rows, result) {
  const esc = v => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = []
  lines.push('PTS Field Calc - Cable Tray Fill per NEC 2023 392.22(A)(1)')
  lines.push('Reference tool only. Verify against the NEC and stamped calculations.')
  lines.push('')
  lines.push('Equipment Tag,Conductor Size,Parallel Runs,Cable OD (in),Single-Cable Area (sq in),Total OD Contribution (in),Total Area Contribution (sq in),Class')
  for (const r of rows) {
    const od = Number(r.odIn)
    const a = Number.isFinite(od) && od > 0 ? cableArea(od) : null
    lines.push([
      esc(r.tag), esc(r.size), r.runs, od || '',
      a !== null ? round4(a) : '',
      a !== null ? round4(od * r.runs) : '',
      a !== null ? round4(a * r.runs) : '',
      isLargeConductor(r.size) ? '4/0 or larger' : 'smaller than 4/0'
    ].join(','))
  }
  lines.push('')
  if (result && !result.error) {
    lines.push(`Case,${result.caseId}`)
    lines.push(`Total cables (parallel runs expanded),${result.cableCount}`)
    lines.push(`Sd - sum of ODs of cables 4/0 and larger (in),${result.Sd}`)
    lines.push(`Sum of areas of cables smaller than 4/0 (sq in),${result.Asmall}`)
    if (result.adequate) {
      lines.push(`Minimum standard tray width (in),${result.minWidth}`)
      lines.push(`Allowable at selected width,${result.selected.allowable}`)
      lines.push(`Used at selected width,${result.selected.used}`)
      lines.push(`Utilization at selected width (%),${result.selected.utilizationPct}`)
      if (result.nextUp) lines.push(`Utilization at next width up - ${result.nextUp.width} in (%),${result.nextUp.utilizationPct}`)
    } else {
      lines.push('RESULT,NO STANDARD WIDTH ADEQUATE - design review required')
    }
  }
  return lines.join('\r\n')
}

function round3(x) { return Math.round(x * 1000) / 1000 }
function round4(x) { return Math.round(x * 10000) / 10000 }
