// Voltage drop feed schedule: a list of saved feeds, each optionally fed from
// another, with the drops added along each chain and checked against the 5%
// feeder-plus-branch guideline. Pure functions only - storage I/O lives in the
// tool component.
//
// schedule = { v, feeds: [feed], nextId }
// feed     = { id, tag, upId, forceXfmr, inputs }
// inputs   = the Voltage Drop tab's editor values, as strings straight from the
//            inputs (phase is a number), so a saved feed reloads exactly.
//
// The chain restarts at a transformer, because the transformer's own regulation
// drop is not in this calculation and adding percentages across it would
// understate the real drop. A transformer is inferred when the downstream
// voltage cannot be the same system as the upstream one (480 V feeding 208 V),
// and can be forced for an isolation transformer at the same voltage.

import {
  voltageDropTable9, voltageDropKFactor, VD_GUIDE_BRANCH_PCT, VD_GUIDE_TOTAL_PCT
} from './voltageDrop.js'
import { groundConductor } from './groundWire.js'

export const MAX_FEEDS = 50
export const MAX_TAG_LEN = 40
export const SCHEMA_VERSION = 1

export const DEFAULT_INPUTS = {
  method: 't9', amps: '', lengthFt: '', phase: 3, voltage: '480', size: '3/0',
  material: 'copper', raceway: 'steel', pf: '0.85', sets: '1',
  ocpd: '', minSize: '', egcMaterial: 'copper'
}

const r2 = x => Math.round(x * 100) / 100
const r3 = x => Math.round(x * 1000) / 1000

export function emptySchedule() {
  return { v: SCHEMA_VERSION, feeds: [], nextId: 1 }
}

export function isFull(s) {
  return s.feeds.length >= MAX_FEEDS
}

/** Lowest unused "Feed N" tag, so deleting and re-adding does not skip numbers. */
export function defaultTag(feeds) {
  const used = new Set((feeds || []).map(f => f.tag))
  for (let n = 1; n <= MAX_FEEDS + 1; n++) {
    if (!used.has(`Feed ${n}`)) return `Feed ${n}`
  }
  return `Feed ${(feeds || []).length + 1}`
}

function cleanTag(tag, fallback) {
  const t = String(tag ?? '').trim().slice(0, MAX_TAG_LEN)
  return t.length > 0 ? t : fallback
}

function cleanInputs(inputs) {
  const merged = { ...DEFAULT_INPUTS, ...(inputs && typeof inputs === 'object' ? inputs : {}) }
  merged.phase = Number(merged.phase) === 1 ? 1 : 3
  return merged
}

/** Add a feed. Returns { schedule, id }; at the cap the schedule is unchanged and id is null. */
export function addFeed(s, feed = {}) {
  if (isFull(s)) return { schedule: s, id: null }
  const id = s.nextId
  const upId = s.feeds.some(f => f.id === feed.upId) ? feed.upId : null
  const next = {
    id,
    tag: cleanTag(feed.tag, defaultTag(s.feeds)),
    upId,
    forceXfmr: !!feed.forceXfmr,
    inputs: cleanInputs(feed.inputs)
  }
  return { schedule: { ...s, feeds: [...s.feeds, next], nextId: id + 1 }, id }
}

/** Replace a feed's fields. An upstream link that would make a loop is refused. */
export function updateFeed(s, id, patch) {
  return {
    ...s,
    feeds: s.feeds.map(f => {
      if (f.id !== id) return f
      const out = { ...f }
      if ('tag' in patch) out.tag = cleanTag(patch.tag, f.tag)
      if ('forceXfmr' in patch) out.forceXfmr = !!patch.forceXfmr
      if ('inputs' in patch) out.inputs = cleanInputs(patch.inputs)
      if ('upId' in patch) {
        const ok = patch.upId === null ||
          (patch.upId !== id && s.feeds.some(x => x.id === patch.upId) &&
            !descendantIds(s, id).has(patch.upId))
        out.upId = ok ? patch.upId : f.upId
      }
      return out
    })
  }
}

/** Copy a feed (same source, same inputs) directly after it. Returns { schedule, id }. */
export function duplicateFeed(s, id) {
  const src = s.feeds.find(f => f.id === id)
  if (!src || isFull(s)) return { schedule: s, id: null }
  const newId = s.nextId
  const copy = {
    ...src,
    id: newId,
    tag: cleanTag(`${src.tag.slice(0, MAX_TAG_LEN - 5)} copy`, defaultTag(s.feeds)),
    inputs: { ...src.inputs }
  }
  const at = s.feeds.findIndex(f => f.id === id)
  const feeds = [...s.feeds.slice(0, at + 1), copy, ...s.feeds.slice(at + 1)]
  return { schedule: { ...s, feeds, nextId: newId + 1 }, id: newId }
}

/**
 * Delete a feed. Feeds it supplied become unlinked rather than re-parented to
 * its source: re-parenting would silently invent a connection that does not exist.
 */
export function deleteFeed(s, id) {
  if (!s.feeds.some(f => f.id === id)) return s
  return {
    ...s,
    feeds: s.feeds
      .filter(f => f.id !== id)
      .map(f => (f.upId === id ? { ...f, upId: null } : f))
  }
}

export function clearSchedule(s) {
  return { ...s, feeds: [] }
}

/** Every feed downstream of id, at any depth - the ones it may not be fed from. */
export function descendantIds(s, id) {
  const out = new Set()
  const walk = parent => {
    for (const f of s.feeds) {
      if (f.upId === parent && !out.has(f.id)) {
        out.add(f.id)
        walk(f.id)
      }
    }
  }
  walk(id)
  return out
}

/**
 * Can the downstream voltage be the same system as the upstream one? True for the
 * same voltage, for the line-to-neutral of a wye (208 -> 120, 480 -> 277), and for
 * 120 V off a 240 V split-phase or high-leg delta. Anything else implies a transformer.
 */
export function sameSystem(upVolts, downVolts) {
  if (!(upVolts > 0) || !(downVolts > 0)) return true
  const near = (a, b, tol) => Math.abs(a - b) / b <= tol
  if (near(downVolts, upVolts, 0.01)) return true
  if (near(downVolts, upVolts / Math.sqrt(3), 0.02)) return true
  if (near(upVolts, 240, 0.01) && near(downVolts, 120, 0.01)) return true
  return false
}

/** Run one feed's inputs through the calculator. null when the inputs are incomplete. */
export function evaluateInputs(inputs) {
  const i = cleanInputs(inputs)
  if (i.amps === '' || i.lengthFt === '') return null
  const p = {
    amps: parseFloat(i.amps),
    lengthFt: parseFloat(i.lengthFt),
    voltage: parseFloat(i.voltage),
    phase: i.phase,
    size: i.size,
    material: i.material,
    raceway: i.raceway,
    pf: parseFloat(i.pf),
    sets: parseInt(i.sets, 10)
  }
  return i.method === 'k' ? voltageDropKFactor(p) : voltageDropTable9(p)
}

/** EGC for a feed, only where a device rating was actually entered. */
function feedEgc(inputs) {
  const i = cleanInputs(inputs)
  const ocpd = parseFloat(i.ocpd)
  if (i.ocpd === '' || !Number.isFinite(ocpd)) return null
  const n = parseInt(i.sets, 10)
  return groundConductor({
    ocpdAmps: ocpd,
    material: i.egcMaterial,
    circuitSize: i.size,
    minAmpacitySize: i.minSize !== '' ? i.minSize : i.size,
    sets: Number.isFinite(n) && n > 0 ? n : 1
  })
}

/**
 * Evaluate every feed and the drop along its chain, in tree order: each source
 * followed by the feeds it supplies.
 * @returns array of { feed, result, depth, upTag, chainPct, chainNote, ownOk, chainOk, egc }
 */
export function evaluateSchedule(s) {
  const byId = new Map(s.feeds.map(f => [f.id, f]))
  const results = new Map(s.feeds.map(f => [f.id, evaluateInputs(f.inputs)]))
  const valid = r => r && !r.error

  const chainMemo = new Map()
  // Chain % for a feed: its own drop plus its source's chain, unless the link is
  // broken. Returns { pct, note }.
  const chain = (id, seen = new Set()) => {
    if (chainMemo.has(id)) return chainMemo.get(id)
    const f = byId.get(id)
    const own = results.get(id)
    let out
    if (!valid(own)) {
      out = { pct: null, note: 'incomplete' }
    } else if (f.upId === null || !byId.has(f.upId)) {
      out = { pct: own.vdPct, note: null }
    } else if (seen.has(id)) {
      out = { pct: own.vdPct, note: 'loop' }
    } else {
      const up = byId.get(f.upId)
      const upV = parseFloat(cleanInputs(up.inputs).voltage)
      const downV = parseFloat(cleanInputs(f.inputs).voltage)
      if (f.forceXfmr || !sameSystem(upV, downV)) {
        out = { pct: own.vdPct, note: 'transformer' }
      } else {
        const upChain = chain(f.upId, new Set([...seen, id]))
        out = upChain.pct === null
          ? { pct: null, note: 'upstream incomplete' }
          : { pct: upChain.pct + own.vdPct, note: null }
      }
    }
    chainMemo.set(id, out)
    return out
  }

  // Tree order: roots in list order, each followed by its children. Anything not
  // reached (a loop, which updateFeed refuses but storage could hold) goes last.
  const ordered = []
  const placed = new Set()
  const visit = (f, depth) => {
    if (placed.has(f.id)) return
    placed.add(f.id)
    ordered.push({ f, depth })
    s.feeds.filter(c => c.upId === f.id).forEach(c => visit(c, depth + 1))
  }
  s.feeds.filter(f => f.upId === null || !byId.has(f.upId)).forEach(f => visit(f, 0))
  s.feeds.forEach(f => visit(f, 0))

  return ordered.map(({ f, depth }) => {
    const result = results.get(f.id)
    const c = chain(f.id)
    const linked = f.upId !== null && byId.has(f.upId)
    return {
      feed: f,
      result,
      depth,
      upTag: linked ? byId.get(f.upId).tag : null,
      chainPct: c.pct === null ? null : r3(c.pct),
      chainNote: c.note,
      ownOk: valid(result) ? result.vdPct <= VD_GUIDE_BRANCH_PCT : null,
      chainOk: c.pct === null || !linked || c.note === 'transformer' ? null : c.pct <= VD_GUIDE_TOTAL_PCT,
      egc: feedEgc(f.inputs)
    }
  })
}

const esc = v => {
  const t = String(v ?? '')
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}
const sizeLabel = s => (/^\d+$/.test(String(s)) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

/** One CSV for the whole schedule. */
export function scheduleCsv(evaluated) {
  const lines = []
  lines.push('PTS Field Calc - Voltage Drop Feed Schedule')
  lines.push('Reference tool only. Verify against the NEC and stamped calculations.')
  lines.push(`Guidelines: ${VD_GUIDE_BRANCH_PCT}% per feeder or branch; ${VD_GUIDE_TOTAL_PCT}% feeder plus branch (210.19(A) / 215.2(A) Informational Notes - recommendations, not requirements)`)
  lines.push('Length is ONE-WAY. Chain % adds drops from the source; it restarts at a transformer, whose own regulation drop is not included.')
  lines.push('')
  lines.push([
    'Tag', 'Fed From', 'Chain Note', 'System (V)', 'Phase', 'Load (A)', 'One-Way Length (ft)',
    'Conductor', 'Sets', 'Material', 'Raceway', 'PF', 'Method',
    'R (ohm/1000 ft)', 'X (ohm/1000 ft)', 'Effective Z (ohm/1000 ft)',
    'VD (V)', 'VD (%)', 'Chain VD (%)', `Within ${VD_GUIDE_BRANCH_PCT}%`, `Chain Within ${VD_GUIDE_TOTAL_PCT}%`,
    'Device (A)', 'EGC'
  ].join(','))

  for (const e of evaluated) {
    const i = cleanInputs(e.feed.inputs)
    const r = e.result
    const ok = r && !r.error
    const isK = i.method === 'k'
    const zEff = ok ? (isK ? (r.k * 1000) / r.cmil : r.zEff) : null
    const note = e.chainNote === 'transformer' ? 'restarts - transformer'
      : e.chainNote === 'upstream incomplete' ? 'upstream incomplete'
        : e.chainNote === 'incomplete' ? 'inputs incomplete'
          : e.chainNote === 'loop' ? 'loop - check sources' : ''
    const egcText = e.egc && !e.egc.error
      ? `${e.egc.sets > 1 ? e.egc.sets + ' x ' : ''}${sizeLabel(e.egc.size)} ${e.egc.material}`
      : e.egc && e.egc.error ? e.egc.error : ''
    lines.push([
      esc(e.feed.tag),
      esc(e.upTag || ''),
      esc(note),
      i.voltage,
      i.phase === 3 ? '3' : '1',
      i.amps,
      i.lengthFt,
      esc(sizeLabel(i.size)),
      i.sets,
      i.material,
      i.raceway,
      isK ? '' : i.pf,
      isK ? 'K-factor' : 'NEC Table 9',
      ok && !isK ? r.r : '',
      ok && !isK ? r.x : '',
      ok ? r3(zEff) : '',
      ok ? r2(r.vdVolts) : '',
      ok ? r2(r.vdPct) : esc(r ? r.error : 'inputs incomplete'),
      e.chainPct === null ? '' : r2(e.chainPct),
      e.ownOk === null ? '' : e.ownOk ? 'YES' : 'NO',
      e.chainOk === null ? '' : e.chainOk ? 'YES' : 'NO',
      i.ocpd,
      esc(egcText)
    ].join(','))
  }
  return lines.join('\r\n')
}

export function serialize(s) {
  return JSON.stringify({ v: SCHEMA_VERSION, feeds: s.feeds, nextId: s.nextId })
}

/** Rebuild a schedule from stored text, repairing rather than throwing. null on junk. */
export function deserialize(raw) {
  let d
  try { d = JSON.parse(raw) } catch { return null }
  if (!d || !Array.isArray(d.feeds)) return null
  let maxId = 0
  const seenIds = new Set()
  const feeds = d.feeds.slice(0, MAX_FEEDS).map((f, i) => {
    let id = Number.isFinite(f?.id) && !seenIds.has(f.id) ? f.id : null
    if (id === null) id = 100000 + i
    seenIds.add(id)
    maxId = Math.max(maxId, id)
    return {
      id,
      tag: cleanTag(f?.tag, `Feed ${i + 1}`),
      upId: Number.isFinite(f?.upId) ? f.upId : null,
      forceXfmr: !!f?.forceXfmr,
      inputs: cleanInputs(f?.inputs)
    }
  })
  const ids = new Set(feeds.map(f => f.id))
  feeds.forEach(f => { if (f.upId !== null && (!ids.has(f.upId) || f.upId === f.id)) f.upId = null })
  return {
    v: SCHEMA_VERSION,
    feeds,
    nextId: Math.max(Number.isFinite(d.nextId) ? d.nextId : 0, maxId + 1)
  }
}
