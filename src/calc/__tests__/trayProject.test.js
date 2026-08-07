import { describe, it, expect } from 'vitest'
import * as P from '../trayProject.js'

const names = p => p.trays.map(t => t.name)
const ids = p => p.trays.map(t => t.id)

describe('empty project', () => {
  it('starts with one named tray holding one blank row', () => {
    const p = P.emptyProject()
    expect(p.trays).toHaveLength(1)
    expect(p.trays[0].name).toBe('Tray 1')
    expect(p.trays[0].rows).toHaveLength(1)
    expect(p.trays[0].egc.on).toBe(false)
    expect(P.activeTray(p).id).toBe(p.activeId)
  })
  it('the default row carries the catalog OD for its size', () => {
    const row = P.emptyProject().trays[0].rows[0]
    expect(row.size).toBe('4/0')
    expect(parseFloat(row.odIn)).toBeGreaterThan(0)
    expect(row.runs).toBe('1')
  })
})

describe('adding and naming trays', () => {
  it('adds up to the cap and then refuses', () => {
    let p = P.emptyProject()
    for (let i = 0; i < 20; i++) p = P.addTray(p)
    expect(p.trays).toHaveLength(P.MAX_TRAYS)
    expect(P.isFull(p)).toBe(true)
    // at the cap addTray is a no-op, returning the same project
    expect(P.addTray(p)).toBe(p)
  })
  it('names new trays with the lowest unused number', () => {
    let p = P.addTray(P.addTray(P.emptyProject()))
    expect(names(p)).toEqual(['Tray 1', 'Tray 2', 'Tray 3'])
    p = P.deleteTray(p, p.trays[1].id) // remove Tray 2
    p = P.addTray(p)
    expect(names(p)).toContain('Tray 2')
    expect(names(p).filter(n => n === 'Tray 2')).toHaveLength(1)
  })
  it('makes the new tray active and gives every tray a unique id', () => {
    let p = P.addTray(P.emptyProject())
    expect(p.activeId).toBe(p.trays[1].id)
    p = P.addTray(p)
    expect(new Set(ids(p)).size).toBe(p.trays.length)
  })
  it('renames, trimming and capping length, and keeps the old name if blank', () => {
    let p = P.emptyProject()
    const id = p.trays[0].id
    p = P.renameTray(p, id, '  T-A EAST  ')
    expect(p.trays[0].name).toBe('T-A EAST')
    p = P.renameTray(p, id, '   ')
    expect(p.trays[0].name).toBe('T-A EAST')
    p = P.renameTray(p, id, 'x'.repeat(80))
    expect(p.trays[0].name).toHaveLength(P.MAX_NAME_LEN)
  })
})

describe('duplicating', () => {
  it('copies the circuit list and EGC, inserts after the source, and activates it', () => {
    let p = P.emptyProject()
    const id = p.trays[0].id
    p = P.renameTray(p, id, 'MCC-N')
    p = P.updateRow(p, id, p.trays[0].rows[0].id, { tag: 'FDR-1', runs: '3' })
    p = P.setEgc(p, id, { on: true })
    p = P.addTray(p) // a second tray, so insertion position is observable
    p = P.duplicateTray(p, id)

    const copy = p.trays[1]
    expect(copy.name).toBe('MCC-N copy')
    expect(copy.rows[0].tag).toBe('FDR-1')
    expect(copy.rows[0].runs).toBe('3')
    expect(copy.egc.on).toBe(true)
    expect(p.activeId).toBe(copy.id)
  })
  it('gives the copy its own row ids so edits do not bleed across trays', () => {
    let p = P.emptyProject()
    const id = p.trays[0].id
    p = P.duplicateTray(p, id)
    const [a, b] = p.trays
    expect(b.rows[0].id).not.toBe(a.rows[0].id)
    // editing the copy leaves the original alone
    p = P.updateRow(p, b.id, b.rows[0].id, { tag: 'CHANGED' })
    expect(p.trays[0].rows[0].tag).toBe('')
    expect(p.trays[1].rows[0].tag).toBe('CHANGED')
  })
  it('refuses at the cap and on an unknown id', () => {
    let p = P.emptyProject()
    for (let i = 0; i < 20; i++) p = P.addTray(p)
    expect(P.duplicateTray(p, p.trays[0].id)).toBe(p)
    const q = P.emptyProject()
    expect(P.duplicateTray(q, 999)).toBe(q)
  })
})

describe('deleting', () => {
  it('never deletes the last tray', () => {
    const p = P.emptyProject()
    expect(P.deleteTray(p, p.trays[0].id)).toBe(p)
    expect(P.deleteTray(p, p.trays[0].id).trays).toHaveLength(1)
  })
  it('moves the active selection to a neighbour when the active tray goes', () => {
    let p = P.addTray(P.addTray(P.emptyProject())) // 3 trays, third active
    const middle = p.trays[1].id
    p = P.setActive(p, middle)
    p = P.deleteTray(p, middle)
    expect(p.trays).toHaveLength(2)
    expect(ids(p)).not.toContain(middle)
    expect(ids(p)).toContain(p.activeId)
  })
  it('leaves the active selection alone when another tray goes', () => {
    let p = P.addTray(P.emptyProject())
    const active = p.activeId
    p = P.deleteTray(p, p.trays[0].id)
    expect(p.activeId).toBe(active)
  })
})

describe('row and EGC editing is scoped to one tray', () => {
  it('adds, updates and deletes rows on the named tray only', () => {
    let p = P.addTray(P.emptyProject())
    const [t1, t2] = p.trays
    p = P.addRow(p, t1.id)
    expect(p.trays[0].rows).toHaveLength(2)
    expect(p.trays[1].rows).toHaveLength(1)
    p = P.deleteRow(p, t1.id, p.trays[0].rows[0].id)
    expect(p.trays[0].rows).toHaveLength(1)
    expect(p.trays[1].rows).toHaveLength(1)
  })
  it('never deletes a tray\'s last row', () => {
    const p = P.emptyProject()
    const rid = p.trays[0].rows[0].id
    expect(P.deleteRow(p, p.trays[0].id, rid).trays[0].rows).toHaveLength(1)
  })
  it('changing size re-defaults the OD, and a manual-OD size clears it', () => {
    let p = P.emptyProject()
    const t = p.trays[0].id, r = p.trays[0].rows[0].id
    p = P.changeRowSize(p, t, r, '500')
    expect(parseFloat(p.trays[0].rows[0].odIn)).toBeCloseTo(2.205, 3)
    p = P.changeRowSize(p, t, r, '300') // not in the standard 3/C line
    expect(p.trays[0].rows[0].odIn).toBe('')
  })
  it('changing EGC size re-defaults its OD from Table 5', () => {
    let p = P.emptyProject()
    const t = p.trays[0].id
    p = P.setEgcSize(p, t, '1/0', 'THHN/THWN-2')
    expect(parseFloat(p.trays[0].egc.odIn)).toBeCloseTo(0.486, 3)
    p = P.setEgcSize(p, t, '600', 'XHHW-2') // unverified in this app
    expect(p.trays[0].egc.odIn).toBe('')
  })
  it('clearing a tray resets only that tray to one blank row', () => {
    let p = P.addTray(P.emptyProject())
    const [t1, t2] = p.trays
    p = P.addRow(p, t1.id)
    p = P.addRow(p, t2.id)
    p = P.updateRow(p, t1.id, p.trays[0].rows[0].id, { tag: 'GONE' })
    p = P.clearTray(p, t1.id)
    expect(p.trays[0].rows).toHaveLength(1)
    expect(p.trays[0].rows[0].tag).toBe('')
    expect(p.trays[1].rows).toHaveLength(2)
  })
})

describe('persistence round trip', () => {
  it('survives serialize and deserialize unchanged', () => {
    let p = P.emptyProject()
    p = P.renameTray(p, p.trays[0].id, 'T-A EAST')
    p = P.updateRow(p, p.trays[0].id, p.trays[0].rows[0].id, { tag: 'PDP-3', runs: '4' })
    p = P.setEgc(p, p.trays[0].id, { on: true })
    p = P.addTray(p)
    const back = P.deserialize(P.serialize(p))
    expect(back.trays).toHaveLength(2)
    expect(back.trays[0].name).toBe('T-A EAST')
    expect(back.trays[0].rows[0].tag).toBe('PDP-3')
    expect(back.trays[0].egc.on).toBe(true)
    expect(back.activeId).toBe(p.activeId)
  })
  it('nextId after a reload never collides with a stored id', () => {
    let p = P.addTray(P.addTray(P.emptyProject()))
    const back = P.deserialize(P.serialize(p))
    const used = [...ids(back), ...back.trays.flatMap(t => t.rows.map(r => r.id))]
    expect(Math.max(...used)).toBeLessThan(back.nextId)
    const grown = P.addTray(back)
    expect(used).not.toContain(grown.trays[grown.trays.length - 1].id)
  })
  it('returns null on junk so the caller can fall back', () => {
    expect(P.deserialize('not json')).toBeNull()
    expect(P.deserialize('{}')).toBeNull()
    expect(P.deserialize('{"trays":[]}')).toBeNull()
  })
  it('repairs malformed entries instead of throwing', () => {
    const back = P.deserialize(JSON.stringify({
      trays: [{ name: '', rows: null }, { name: 'B', rows: [{ tag: 'x' }], egc: 'nope' }],
      activeId: 999
    }))
    expect(back.trays).toHaveLength(2)
    expect(back.trays[0].name).toBe('Tray 1')
    expect(back.trays[0].rows).toHaveLength(1)
    expect(back.trays[1].rows[0].tag).toBe('x')
    expect(back.trays[1].egc.on).toBe(false)
    // an activeId that points nowhere falls back to the first tray
    expect(back.activeId).toBe(back.trays[0].id)
  })
  it('clamps a stored project that exceeds the tray cap', () => {
    const many = { trays: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `T${i}`, rows: [{}] })), activeId: 1 }
    expect(P.deserialize(JSON.stringify(many)).trays).toHaveLength(P.MAX_TRAYS)
  })
})

describe('legacy single-tray migration', () => {
  const legacyRows = [
    { tag: 'PDP-3 FEEDER', size: '4/0', runs: '2', odIn: '1.499' },
    { tag: 'CTRL', size: '12', runs: '1', odIn: '0.63' }
  ]
  const legacyEgc = { on: true, size: '250', insulation: 'THHN/THWN-2', odIn: '0.711' }

  it('folds the saved circuit list and EGC into tray one, losing nothing', () => {
    const p = P.migrateLegacy(legacyRows, legacyEgc)
    expect(p.trays).toHaveLength(1)
    expect(p.trays[0].name).toBe('Tray 1')
    expect(p.trays[0].rows).toHaveLength(2)
    expect(p.trays[0].rows[0].tag).toBe('PDP-3 FEEDER')
    expect(p.trays[0].rows[1].size).toBe('12')
    expect(p.trays[0].egc).toMatchObject(legacyEgc)
    expect(p.activeId).toBe(p.trays[0].id)
  })
  it('gives migrated rows distinct ids below nextId', () => {
    const p = P.migrateLegacy(legacyRows, legacyEgc)
    const rowIds = p.trays[0].rows.map(r => r.id)
    expect(new Set(rowIds).size).toBe(rowIds.length)
    expect(Math.max(...rowIds)).toBeLessThan(p.nextId)
  })
  it('handles missing or empty legacy data', () => {
    expect(P.migrateLegacy(null, null).trays[0].rows).toHaveLength(1)
    expect(P.migrateLegacy([], null).trays[0].rows).toHaveLength(1)
    expect(P.migrateLegacy(null, null).trays[0].egc.on).toBe(false)
  })
  it('a migrated project can then be added to and saved like any other', () => {
    let p = P.migrateLegacy(legacyRows, legacyEgc)
    p = P.addTray(p)
    expect(p.trays).toHaveLength(2)
    const back = P.deserialize(P.serialize(p))
    expect(back.trays[0].rows[0].tag).toBe('PDP-3 FEEDER')
    expect(back.trays).toHaveLength(2)
  })
})
