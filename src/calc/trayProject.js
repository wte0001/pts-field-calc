// A project is a collection of independent cable tray designs ("tabs"), so one
// electrical room with several trays leaving it can be worked without losing any of
// them. Pure functions only - every operation takes a project and returns a new one.
// Storage I/O lives in the tool component; this module never touches localStorage.
//
// project = { v, trays: [tray], activeId, nextId }
// tray    = { id, name, rows: [row], egc }
// row     = { id, tag, size, runs, odIn }   - strings, straight from the inputs
// egc     = { on, size, insulation, odIn }
//
// Ids come from the project's own nextId counter, so behaviour is deterministic and
// testable (no Math.random, no Date.now).

import { defaultOd, egcOdFromTable5, EGC_INSULATIONS } from './trayFill.js'

export const MAX_TRAYS = 10
export const MAX_NAME_LEN = 24
export const SCHEMA_VERSION = 1

const DEFAULT_EGC_INS = EGC_INSULATIONS[0].id
const DEFAULT_SIZE = '4/0'

/** A blank circuit row. */
export function makeRow(id, size = DEFAULT_SIZE) {
  const od = defaultOd(size)
  return { id, tag: '', size, runs: '1', odIn: od !== null ? String(od) : '' }
}

/** A blank standalone-EGC setting (off by default). */
export function makeEgc(size = '1/0', insulation = DEFAULT_EGC_INS) {
  const od = egcOdFromTable5(size, insulation)
  return { on: false, size, insulation, odIn: od !== null ? String(od) : '' }
}

/** Lowest unused "Tray N" name, so deleting and re-adding does not skip numbers. */
export function defaultTrayName(trays) {
  const used = new Set((trays || []).map(t => t.name))
  for (let n = 1; n <= MAX_TRAYS + 1; n++) {
    if (!used.has(`Tray ${n}`)) return `Tray ${n}`
  }
  return `Tray ${(trays || []).length + 1}`
}

function cleanName(name, fallback) {
  const s = String(name ?? '').trim().slice(0, MAX_NAME_LEN)
  return s.length > 0 ? s : fallback
}

/** A project holding a single empty tray. */
export function emptyProject() {
  return {
    v: SCHEMA_VERSION,
    trays: [{ id: 1, name: 'Tray 1', rows: [makeRow(2)], egc: makeEgc() }],
    activeId: 1,
    nextId: 3
  }
}

export function activeTray(p) {
  return p.trays.find(t => t.id === p.activeId) || p.trays[0]
}

export function isFull(p) {
  return p.trays.length >= MAX_TRAYS
}

export function setActive(p, id) {
  return p.trays.some(t => t.id === id) ? { ...p, activeId: id } : p
}

/** Add an empty tray and make it active. No-op at the cap. */
export function addTray(p, name) {
  if (isFull(p)) return p
  const id = p.nextId
  const tray = {
    id,
    name: cleanName(name, defaultTrayName(p.trays)),
    rows: [makeRow(id + 1)],
    egc: makeEgc()
  }
  return { ...p, trays: [...p.trays, tray], activeId: id, nextId: id + 2 }
}

/** Copy a tray's circuit list and EGC into a new tray, and make it active. */
export function duplicateTray(p, id) {
  if (isFull(p)) return p
  const src = p.trays.find(t => t.id === id)
  if (!src) return p
  let next = p.nextId
  const newId = next++
  const base = src.name.slice(0, MAX_NAME_LEN - 5)
  const rows = src.rows.map(r => ({ ...r, id: next++ }))
  const tray = {
    id: newId,
    name: cleanName(`${base} copy`, defaultTrayName(p.trays)),
    rows: rows.length > 0 ? rows : [makeRow(next++)],
    egc: { ...src.egc }
  }
  const at = p.trays.findIndex(t => t.id === id)
  const trays = [...p.trays.slice(0, at + 1), tray, ...p.trays.slice(at + 1)]
  return { ...p, trays, activeId: newId, nextId: next }
}

/** Delete a tray. The last remaining tray is never deleted. */
export function deleteTray(p, id) {
  if (p.trays.length <= 1) return p
  const at = p.trays.findIndex(t => t.id === id)
  if (at === -1) return p
  const trays = p.trays.filter(t => t.id !== id)
  const activeId = p.activeId === id
    ? trays[Math.min(at, trays.length - 1)].id
    : p.activeId
  return { ...p, trays, activeId }
}

/** Rename a tray. Blank or whitespace-only names keep the existing name. */
export function renameTray(p, id, name) {
  return {
    ...p,
    trays: p.trays.map(t => (t.id === id ? { ...t, name: cleanName(name, t.name) } : t))
  }
}

const mapTray = (p, id, fn) => ({
  ...p,
  trays: p.trays.map(t => (t.id === id ? fn(t) : t))
})

export function addRow(p, trayId) {
  const id = p.nextId
  return { ...mapTray(p, trayId, t => ({ ...t, rows: [...t.rows, makeRow(id)] })), nextId: id + 1 }
}

export function updateRow(p, trayId, rowId, patch) {
  return mapTray(p, trayId, t => ({
    ...t,
    rows: t.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r))
  }))
}

/** Changing size re-defaults the OD to the catalog value for that size. */
export function changeRowSize(p, trayId, rowId, size) {
  const od = defaultOd(size)
  return updateRow(p, trayId, rowId, { size, odIn: od !== null ? String(od) : '' })
}

export function deleteRow(p, trayId, rowId) {
  return mapTray(p, trayId, t =>
    (t.rows.length <= 1 ? t : { ...t, rows: t.rows.filter(r => r.id !== rowId) }))
}

export function setEgc(p, trayId, patch) {
  return mapTray(p, trayId, t => ({ ...t, egc: { ...t.egc, ...patch } }))
}

/** Changing EGC size or insulation re-defaults its OD from Table 5. */
export function setEgcSize(p, trayId, size, insulation) {
  const od = egcOdFromTable5(size, insulation)
  return setEgc(p, trayId, { size, insulation, odIn: od !== null ? String(od) : '' })
}

/** Reset one tray's circuit list back to a single blank row. */
export function clearTray(p, trayId) {
  const id = p.nextId
  return { ...mapTray(p, trayId, t => ({ ...t, rows: [makeRow(id)] })), nextId: id + 1 }
}

/** Fold the pre-tabs single-tray storage into a one-tray project. */
export function migrateLegacy(legacyRows, legacyEgc) {
  const p = emptyProject()
  let next = p.nextId
  const rows = Array.isArray(legacyRows) && legacyRows.length > 0
    ? legacyRows.map(r => ({ ...makeRow(next++), ...r, id: next - 1 }))
    : [makeRow(next++)]
  const egc = legacyEgc && typeof legacyEgc === 'object'
    ? { ...makeEgc(), ...legacyEgc }
    : makeEgc()
  return {
    ...p,
    trays: [{ id: p.trays[0].id, name: 'Tray 1', rows, egc }],
    nextId: next
  }
}

export function serialize(p) {
  return JSON.stringify({ v: SCHEMA_VERSION, trays: p.trays, activeId: p.activeId, nextId: p.nextId })
}

/**
 * Rebuild a project from stored text, repairing anything malformed rather than
 * throwing - a corrupt entry must never cost the user the whole list.
 */
export function deserialize(raw) {
  let d
  try { d = JSON.parse(raw) } catch { return null }
  if (!d || !Array.isArray(d.trays) || d.trays.length === 0) return null

  let maxId = 0
  const trays = d.trays.slice(0, MAX_TRAYS).map((t, i) => {
    const id = Number.isFinite(t?.id) ? t.id : i + 1
    const rows = (Array.isArray(t?.rows) && t.rows.length > 0 ? t.rows : [null])
      .map((r, j) => {
        const rid = Number.isFinite(r?.id) ? r.id : (i + 1) * 1000 + j
        maxId = Math.max(maxId, rid)
        return { ...makeRow(rid), ...(r || {}), id: rid }
      })
    maxId = Math.max(maxId, id)
    return {
      id,
      name: cleanName(t?.name, `Tray ${i + 1}`),
      rows,
      egc: { ...makeEgc(), ...(t?.egc && typeof t.egc === 'object' ? t.egc : {}) }
    }
  })

  const activeId = trays.some(t => t.id === d.activeId) ? d.activeId : trays[0].id
  return {
    v: SCHEMA_VERSION,
    trays,
    activeId,
    nextId: Math.max(Number.isFinite(d.nextId) ? d.nextId : 0, maxId + 1)
  }
}
