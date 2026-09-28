import { describe, it, expect } from 'vitest'
import * as S from '../vdSchedule.js'

const inp = o => ({ ...S.DEFAULT_INPUTS, ...o })

// The five feeds from the approved mockup.
function roomSchedule() {
  let s = S.emptySchedule()
  const add = (tag, upId, inputs) => {
    const r = S.addFeed(s, { tag, upId, inputs: inp(inputs) })
    s = r.schedule
    return r.id
  }
  const msb = add('MSB-1 to PDP-1', null,
    { amps: '800', lengthFt: '250', voltage: '480', phase: 3, size: '350', sets: '3' })
  add('PDP-1 to MCC-1', msb,
    { amps: '400', lengthFt: '180', voltage: '480', phase: 3, size: '4/0', sets: '2' })
  const xf = add('PDP-1 to T-LP1', msb,
    { amps: '60', lengthFt: '120', voltage: '480', phase: 3, size: '4' })
  const rp = add('T-LP1 to RP-2', xf,
    { amps: '100', lengthFt: '150', voltage: '208', phase: 3, size: '1', raceway: 'pvc', pf: '0.9' })
  add('RP-2 ckt 14', rp,
    { amps: '16', lengthFt: '140', voltage: '120', phase: 1, size: '12', pf: '1' })
  return s
}
const byTag = (ev, tag) => ev.find(e => e.feed.tag === tag)

describe('the mockup schedule', () => {
  const ev = S.evaluateSchedule(roomSchedule())

  it('computes each feed with the Table 9 calc', () => {
    expect(byTag(ev, 'MSB-1 to PDP-1').result.vdPct).toBeCloseTo(1.43, 2)
    expect(byTag(ev, 'PDP-1 to MCC-1').result.vdPct).toBeCloseTo(1.04, 2)
    expect(byTag(ev, 'RP-2 ckt 14').result.vdPct).toBeCloseTo(7.47, 2)
  })
  it('adds drops along a chain on the same system', () => {
    // 1.43 + 1.04
    expect(byTag(ev, 'PDP-1 to MCC-1').chainPct).toBeCloseTo(2.47, 1)
    expect(byTag(ev, 'PDP-1 to MCC-1').chainOk).toBe(true)
  })
  it('restarts the chain at a transformer (480 V feeding 208 V)', () => {
    const rp = byTag(ev, 'T-LP1 to RP-2')
    expect(rp.chainNote).toBe('transformer')
    expect(rp.chainPct).toBeCloseTo(rp.result.vdPct, 2)
    // a restarted chain is not graded against 5% - its source is the transformer
    expect(rp.chainOk).toBeNull()
  })
  it('keeps the chain through a 120 V branch off a 208 V panel, and flags 5%', () => {
    const ckt = byTag(ev, 'RP-2 ckt 14')
    expect(ckt.chainNote).toBeNull()
    expect(ckt.chainPct).toBeCloseTo(1.94 + 7.47, 1)
    expect(ckt.chainOk).toBe(false)
    expect(ckt.ownOk).toBe(false)
  })
  it('lists feeds in tree order with depth for indenting', () => {
    expect(ev.map(e => [e.feed.tag, e.depth])).toEqual([
      ['MSB-1 to PDP-1', 0],
      ['PDP-1 to MCC-1', 1],
      ['PDP-1 to T-LP1', 1],
      ['T-LP1 to RP-2', 2],
      ['RP-2 ckt 14', 3]
    ])
  })
  it('names each feed\'s source', () => {
    expect(byTag(ev, 'MSB-1 to PDP-1').upTag).toBeNull()
    expect(byTag(ev, 'RP-2 ckt 14').upTag).toBe('T-LP1 to RP-2')
  })
})

describe('same-system test', () => {
  it('treats equal voltages, wye line-to-neutral and 120 off 240 as one system', () => {
    expect(S.sameSystem(480, 480)).toBe(true)
    expect(S.sameSystem(208, 120)).toBe(true)
    expect(S.sameSystem(480, 277)).toBe(true)
    expect(S.sameSystem(240, 120)).toBe(true)
  })
  it('treats anything else as through a transformer', () => {
    expect(S.sameSystem(480, 208)).toBe(false)
    expect(S.sameSystem(480, 120)).toBe(false)
    expect(S.sameSystem(4160, 480)).toBe(false)
  })
  it('a forced isolation transformer restarts the chain at the same voltage', () => {
    let s = roomSchedule()
    const mcc = s.feeds.find(f => f.tag === 'PDP-1 to MCC-1')
    s = S.updateFeed(s, mcc.id, { forceXfmr: true })
    const e = byTag(S.evaluateSchedule(s), 'PDP-1 to MCC-1')
    expect(e.chainNote).toBe('transformer')
    expect(e.chainPct).toBeCloseTo(e.result.vdPct, 2)
  })
})

describe('incomplete feeds', () => {
  it('an incomplete feed has no drop and breaks the chain below it', () => {
    let s = S.emptySchedule()
    let r = S.addFeed(s, { tag: 'SRC', inputs: inp({ amps: '', lengthFt: '100' }) }); s = r.schedule
    r = S.addFeed(s, { tag: 'LOAD', upId: r.id, inputs: inp({ amps: '50', lengthFt: '100', size: '6' }) }); s = r.schedule
    const ev = S.evaluateSchedule(s)
    expect(byTag(ev, 'SRC').result).toBeNull()
    expect(byTag(ev, 'SRC').ownOk).toBeNull()
    expect(byTag(ev, 'LOAD').chainPct).toBeNull()
    expect(byTag(ev, 'LOAD').chainNote).toBe('upstream incomplete')
  })
  it('an unlinked feed stands alone: chain equals its own drop, no 5% grade', () => {
    let s = S.emptySchedule()
    s = S.addFeed(s, { tag: 'A', inputs: inp({ amps: '200', lengthFt: '300', size: '3/0' }) }).schedule
    const e = S.evaluateSchedule(s)[0]
    expect(e.chainPct).toBeCloseTo(e.result.vdPct, 3)
    expect(e.chainOk).toBeNull()
  })
})

describe('editing the schedule', () => {
  it('caps at MAX_FEEDS', () => {
    let s = S.emptySchedule()
    for (let i = 0; i < S.MAX_FEEDS + 5; i++) s = S.addFeed(s, {}).schedule
    expect(s.feeds).toHaveLength(S.MAX_FEEDS)
    expect(S.isFull(s)).toBe(true)
    expect(S.addFeed(s, {}).id).toBeNull()
  })
  it('names new feeds with the lowest unused number', () => {
    let s = S.emptySchedule()
    s = S.addFeed(s, {}).schedule
    s = S.addFeed(s, {}).schedule
    expect(s.feeds.map(f => f.tag)).toEqual(['Feed 1', 'Feed 2'])
    s = S.deleteFeed(s, s.feeds[0].id)
    s = S.addFeed(s, {}).schedule
    expect(s.feeds.map(f => f.tag)).toContain('Feed 1')
  })
  it('refuses a source that would make a loop', () => {
    let s = roomSchedule()
    const msb = s.feeds.find(f => f.tag === 'MSB-1 to PDP-1')
    const ckt = s.feeds.find(f => f.tag === 'RP-2 ckt 14')
    s = S.updateFeed(s, msb.id, { upId: ckt.id }) // ckt is downstream of msb
    expect(s.feeds.find(f => f.id === msb.id).upId).toBeNull()
    s = S.updateFeed(s, msb.id, { upId: msb.id }) // itself
    expect(s.feeds.find(f => f.id === msb.id).upId).toBeNull()
  })
  it('finds every downstream feed', () => {
    const s = roomSchedule()
    const msb = s.feeds.find(f => f.tag === 'MSB-1 to PDP-1')
    expect(S.descendantIds(s, msb.id).size).toBe(4)
  })
  it('deleting a source unlinks what it fed rather than inventing a new link', () => {
    let s = roomSchedule()
    const xf = s.feeds.find(f => f.tag === 'PDP-1 to T-LP1')
    s = S.deleteFeed(s, xf.id)
    const rp = s.feeds.find(f => f.tag === 'T-LP1 to RP-2')
    expect(rp.upId).toBeNull()
    expect(s.feeds).toHaveLength(4)
  })
  it('duplicates directly after the source with the same inputs and source', () => {
    let s = roomSchedule()
    const mcc = s.feeds.find(f => f.tag === 'PDP-1 to MCC-1')
    const r = S.duplicateFeed(s, mcc.id)
    s = r.schedule
    const at = s.feeds.findIndex(f => f.id === mcc.id)
    expect(s.feeds[at + 1].id).toBe(r.id)
    expect(s.feeds[at + 1].tag).toBe('PDP-1 to MCC-1 copy')
    expect(s.feeds[at + 1].upId).toBe(mcc.upId)
    expect(s.feeds[at + 1].inputs).toEqual(mcc.inputs)
    expect(s.feeds[at + 1].inputs).not.toBe(mcc.inputs)
  })
  it('clearing removes every feed', () => {
    expect(S.clearSchedule(roomSchedule()).feeds).toHaveLength(0)
  })
  it('trims tags and keeps the old one when blank', () => {
    let s = S.addFeed(S.emptySchedule(), { tag: '  MSB-1  ' }).schedule
    expect(s.feeds[0].tag).toBe('MSB-1')
    s = S.updateFeed(s, s.feeds[0].id, { tag: '   ' })
    expect(s.feeds[0].tag).toBe('MSB-1')
  })
})

describe('CSV export', () => {
  const csv = S.scheduleCsv(S.evaluateSchedule(roomSchedule()))
  const rows = csv.split('\r\n')

  it('has the guideline note, a header, and one row per feed', () => {
    expect(csv).toContain('Length is ONE-WAY')
    const header = rows.findIndex(l => l.startsWith('Tag,Fed From'))
    expect(header).toBeGreaterThan(0)
    expect(rows.length - header - 1).toBe(5)
  })
  it('carries the chain and the pass/fail columns', () => {
    const ckt = rows.find(l => l.startsWith('RP-2 ckt 14'))
    expect(ckt).toContain('T-LP1 to RP-2')
    expect(ckt).toContain('7.47')
    // 1.937 + 7.466 = 9.40 unrounded (the mockup added two rounded values: 9.41)
    expect(ckt).toContain(',9.4,')
    expect(ckt).toContain('NO,NO')
    expect(rows.find(l => l.startsWith('T-LP1 to RP-2'))).toContain('restarts - transformer')
  })
  it('includes the device and EGC only where a device was entered', () => {
    let s = S.emptySchedule()
    s = S.addFeed(s, { tag: 'WITH', inputs: inp({ amps: '200', lengthFt: '200', size: '3/0', ocpd: '225' }) }).schedule
    s = S.addFeed(s, { tag: 'WITHOUT', inputs: inp({ amps: '200', lengthFt: '200', size: '3/0' }) }).schedule
    const out = S.scheduleCsv(S.evaluateSchedule(s)).split('\r\n')
    expect(out.find(l => l.startsWith('WITH,'))).toMatch(/225,4 AWG copper$/)
    expect(out.find(l => l.startsWith('WITHOUT,'))).toMatch(/,,$/)
  })
  it('quotes a tag containing a comma', () => {
    const s = S.addFeed(S.emptySchedule(), { tag: 'MSB-1, EAST', inputs: inp({ amps: '100', lengthFt: '100', size: '1' }) }).schedule
    expect(S.scheduleCsv(S.evaluateSchedule(s))).toContain('"MSB-1, EAST"')
  })
  it('K-factor feeds leave R, X and PF blank', () => {
    const s = S.addFeed(S.emptySchedule(), { tag: 'K', inputs: inp({ method: 'k', amps: '100', lengthFt: '100', size: '1' }) }).schedule
    const row = S.scheduleCsv(S.evaluateSchedule(s)).split('\r\n').find(l => l.startsWith('K,'))
    expect(row).toContain(',K-factor,,,')
  })
})

describe('persistence', () => {
  it('round-trips unchanged', () => {
    const s = roomSchedule()
    const back = S.deserialize(S.serialize(s))
    expect(back.feeds).toEqual(s.feeds)
    expect(back.nextId).toBe(s.nextId)
  })
  it('returns null on junk', () => {
    expect(S.deserialize('not json')).toBeNull()
    expect(S.deserialize('{}')).toBeNull()
  })
  it('repairs dangling and self links, and fills missing inputs', () => {
    const back = S.deserialize(JSON.stringify({ feeds: [
      { id: 1, tag: 'A', upId: 99, inputs: { amps: '10' } },
      { id: 2, tag: '', upId: 2 }
    ] }))
    expect(back.feeds[0].upId).toBeNull()
    expect(back.feeds[1].upId).toBeNull()
    expect(back.feeds[1].tag).toBe('Feed 2')
    expect(back.feeds[0].inputs.voltage).toBe('480')
    expect(back.nextId).toBeGreaterThan(2)
  })
  it('clamps to the cap', () => {
    const many = { feeds: Array.from({ length: 80 }, (_, i) => ({ id: i + 1, tag: `F${i}` })) }
    expect(S.deserialize(JSON.stringify(many)).feeds).toHaveLength(S.MAX_FEEDS)
  })
})
