// Cable tray fill per NEC 392.22(A)(1), multiconductor cables rated 2000V or
// less in ladder tray. NEC 2023. Pure functions only.
//
// Classification is by CONDUCTOR size ("4/0 AWG or larger" vs "smaller than
// 4/0 AWG"), never by cable OD. A circuit row with N parallel runs contributes
// N physical cables to every sum.

import trayTable from '../data/nec_392_22a.json'
import cableData from '../data/tc_cable_dimensions.json'
import table5 from '../data/nec_ch9_table5.json'

export const STANDARD_WIDTHS = trayTable.standardWidthsIn
export const COLUMN1 = trayTable.column1AreaSqIn
export const CABLE_SIZES = cableData.sizes
export const CABLE_DATA = cableData.cables

// A standalone equipment grounding conductor run in the tray per 250.122(F) is a
// single insulated conductor, so its size comes from Chapter 9 Table 5 rather than
// the multiconductor cable catalog.
// Sizes supplied as control-cable construction (3/C, no ground) in the Southwire
// line this app carries. Shared with the UI and the cross-section drawing so the
// two never disagree about what a row represents.
export const CONTROL_SIZES = ['14', '12', '10']

export const EGC_SIZES = table5.sizes
export const EGC_INSULATIONS = Object.keys(table5.insulations).map(id => ({
  id, label: table5.insulations[id].label
}))

/**
 * Diameter of a single insulated conductor, derived from its Table 5 approximate
 * area: area = (pi/4) x OD^2, so OD = sqrt(4 x area / pi). Derived rather than
 * read from the table's diameter column so it stays exactly consistent with the
 * cableArea() convention used for every other item in the tray.
 * @returns {number|null} null when the Table 5 area is unverified in this app
 */
export function egcOdFromTable5(size, insulation) {
  const ins = table5.insulations[insulation]
  if (!ins) return null
  const area = ins.areas[String(size)]
  if (area === null || area === undefined) return null
  return Math.round(Math.sqrt((4 * area) / Math.PI) * 1000) / 1000
}

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
 * @param {{size:string, odIn:number}} [egc] optional standalone EGC run in the same
 *   tray per 250.122(F). It physically occupies tray space, so it is counted.
 * @returns result object or {error}
 */
export function trayFill(rows, egc) {
  const clean = (rows || []).filter(r => r && r.size)
  if (clean.length === 0) return { error: 'Add at least one circuit.' }

  // Validate and expand: a row with N parallel runs is N physical cables.
  const cables = []
  const rowWarnings = []
  let rowIndex = 0
  for (const r of clean) {
    rowIndex++
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
      cables.push({
        tag: r.tag, size: r.size, odIn: od, areaSqIn: cableArea(od), large,
        rowIndex, runOf: runs, isEgc: false,
        control: CONTROL_SIZES.includes(String(r.size))
      })
    }
  }

  // Standalone EGC per 250.122(F): one conductor, counted like any other item.
  let egcInfo = null
  if (egc && egc.size) {
    const od = Number(egc.odIn)
    if (!Number.isFinite(od) || od <= 0) {
      return { error: 'Standalone EGC: conductor OD is missing. Enter a valid OD in inches (Table 5 value is unverified for this size/insulation in this app).' }
    }
    let large
    try { large = isLargeConductor(egc.size) } catch (e) { return { error: `Standalone EGC: ${e.message}` } }
    cables.push({
      tag: 'EGC (standalone)', size: egc.size, odIn: od, areaSqIn: cableArea(od), large,
      rowIndex: null, runOf: 1, isEgc: true, control: false
    })
    egcInfo = { size: egc.size, odIn: od, areaSqIn: round4(cableArea(od)), large }
    rowWarnings.push(
      'Standalone tray EGC is included in this fill. Note the code basis: 392.22(A) covers ' +
      'multiconductor cables while single conductors fall under 392.22(B), and the NEC gives no ' +
      'single tabulated case for mixing them in one tray. This app counts the EGC under the same ' +
      '4/0 classification as the cables, which occupies real tray space rather than ignoring it — ' +
      'confirm the treatment with the engineer of record.'
    )
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
      // Whether every cable would physically fit side by side in ONE layer at this
      // width. Case A is governed by exactly this; Case B is area-governed and does
      // not itself require a single layer, so the two can disagree - see below.
      singleLayerFits: sumAllOd <= w + 1e-9,
      utilizationPct: allowable > 0 ? Math.round((used / allowable) * 1000) / 10 : null
    }
  })

  const minIdx = widths.findIndex(x => x.ok)
  const adequate = minIdx !== -1
  const slIdx = widths.findIndex(x => x.singleLayerFits)
  const minWidthSingleLayer = slIdx !== -1 ? widths[slIdx].width : null

  // Surface the case where the area rule passes on a tray the cables cannot
  // actually be laid into in one layer. Stacking is not depicted by this app: it
  // traps heat and changes the ampacity basis for cables in tray (392.80(A)).
  if (adequate && !widths[minIdx].singleLayerFits) {
    rowWarnings.push(
      `At ${widths[minIdx].width} in. the ${caseId === 'B' ? 'area' : 'Column 2'} rule passes, but the cables ` +
      `total ${round3(sumAllOd)} in. of width and will not fit side by side in a single layer. ` +
      '392.22(A)(1)(c) requires 4/0-and-larger cables in a single layer; for smaller cables the fill rule ' +
      'is area-based and does not itself mandate one layer. This app depicts and checks a single layer only ' +
      '- stacking traps heat and changes the tray ampacity basis (392.80(A)). ' +
      (minWidthSingleLayer ? `A single layer needs ${minWidthSingleLayer} in.` : 'No standard width fits one layer.')
    )
  }

  return {
    rule: 'NEC 2023 392.22(A)(1), Table 392.22(A)',
    caseId,
    caseRule,
    cableCount: cables.length,
    largeCount: largeCables.length,
    smallCount: smallCables.length,
    egc: egcInfo,
    Sd: round3(Sd),
    Asmall: round3(Asmall),
    sumAllOd: round3(sumAllOd),
    cables,
    widths,
    adequate,
    minWidth: adequate ? widths[minIdx].width : null,
    minWidthSingleLayer,
    selected: adequate ? widths[minIdx] : null,
    nextUp: adequate && widths[minIdx + 1] ? widths[minIdx + 1] : null,
    inadequateMessage: adequate ? null
      : `No standard tray width (up to ${STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1]} in.) is adequate for this cable list. Split into multiple trays or review the design.`,
    warnings: rowWarnings
  }
}

const esc = v => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/** Build CSV text of one tray's circuit list and result. */
export function trayFillCsv(rows, result, trayName) {
  const lines = []
  lines.push('PTS Field Calc - Cable Tray Fill per NEC 2023 392.22(A)(1)')
  lines.push('Reference tool only. Verify against the NEC and stamped calculations.')
  if (trayName) lines.push(`Tray,${esc(trayName)}`)
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
  if (result && !result.error && result.egc) {
    lines.push([
      esc('EGC (standalone, 250.122(F))'), esc(result.egc.size), 1, result.egc.odIn,
      round4(result.egc.areaSqIn), round4(result.egc.odIn), round4(result.egc.areaSqIn),
      result.egc.large ? '4/0 or larger' : 'smaller than 4/0'
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

/**
 * One CSV for a whole room: a roll-up of every tray, then each tray's detail.
 * @param {Array<{name:string, rows:Array, result:object}>} entries
 */
export function traysCsv(entries) {
  const lines = []
  lines.push('PTS Field Calc - Cable Tray Fill per NEC 2023 392.22(A)(1)')
  lines.push('Reference tool only. Verify against the NEC and stamped calculations.')
  lines.push(`Trays,${entries.length}`)
  lines.push('')
  lines.push('SUMMARY')
  lines.push('Tray,Cables,Case,Min Width (in),Single-Layer Width (in),Status')
  for (const e of entries) {
    const r = e.result
    lines.push([
      esc(e.name),
      r.error ? '' : r.cableCount,
      r.error ? '' : r.caseId,
      r.error || !r.adequate ? '' : r.minWidth,
      r.error ? '' : (r.minWidthSingleLayer ?? ''),
      esc(r.error ? r.error : r.adequate ? 'OK' : 'NO STANDARD WIDTH ADEQUATE')
    ].join(','))
  }
  for (const e of entries) {
    lines.push('')
    lines.push(`DETAIL,${esc(e.name)}`)
    if (e.result.error) {
      lines.push(`,${esc(e.result.error)}`)
    } else {
      lines.push(trayFillCsv(e.rows, e.result).split('\r\n').slice(3).join('\r\n'))
    }
  }
  return lines.join('\r\n')
}

function round3(x) { return Math.round(x * 1000) / 1000 }
function round4(x) { return Math.round(x * 10000) / 10000 }
