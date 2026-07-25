import { describe, it, expect } from 'vitest'
import {
  nextStandardOcpd, egcFromTable, groundConductor, STANDARD_OCPD, CMIL
} from '../groundWire.js'

describe('standard OCPD ratings - 240.6(A)', () => {
  it('rounds up to the next standard rating', () => {
    expect(nextStandardOcpd(95)).toBe(100)
    expect(nextStandardOcpd(100)).toBe(100)
    expect(nextStandardOcpd(101)).toBe(110)
    expect(nextStandardOcpd(21)).toBe(25)
    expect(nextStandardOcpd(430)).toBe(450)
  })
  it('includes the classic ratings and excludes non-standard ones', () => {
    expect(STANDARD_OCPD).toContain(15)
    expect(STANDARD_OCPD).toContain(1200)
    expect(STANDARD_OCPD).not.toContain(130)
    expect(STANDARD_OCPD).not.toContain(900)
  })
  it('returns null for bad input or ratings beyond the list', () => {
    expect(nextStandardOcpd(0)).toBeNull()
    expect(nextStandardOcpd(NaN)).toBeNull()
    expect(nextStandardOcpd(7000)).toBeNull()
  })
})

describe('Table 250.122 lookup', () => {
  it('exact rows: 20 A -> 12 Cu / 10 Al, 100 A -> 8 Cu / 6 Al', () => {
    expect(egcFromTable(20, 'copper').size).toBe('12')
    expect(egcFromTable(20, 'aluminum').size).toBe('10')
    expect(egcFromTable(100, 'copper').size).toBe('8')
    expect(egcFromTable(100, 'aluminum').size).toBe('6')
  })
  it('rounds up to the next table row: 30 A and 40 A both land on the 60 A row', () => {
    expect(egcFromTable(30, 'copper').size).toBe('10')
    expect(egcFromTable(40, 'copper').size).toBe('10')
    expect(egcFromTable(30, 'copper').tableRating).toBe(60)
  })
  it('common feeder ratings: 400 A -> 3 Cu, 600 A -> 1 Cu, 1200 A -> 3/0 Cu', () => {
    expect(egcFromTable(400, 'copper').size).toBe('3')
    expect(egcFromTable(600, 'copper').size).toBe('1')
    expect(egcFromTable(1200, 'copper').size).toBe('3/0')
    expect(egcFromTable(1200, 'aluminum').size).toBe('250')
  })
  it('a 225 A device uses the 300 A row, not the 200 A row', () => {
    const r = egcFromTable(225, 'copper')
    expect(r.tableRating).toBe(300)
    expect(r.size).toBe('4')
  })
  it('reports unverified for the 4000 A aluminum cell (null in dataset)', () => {
    const r = egcFromTable(4000, 'aluminum')
    expect(r.error).toBeTruthy()
    expect(r.unverified).toBe(true)
    expect(egcFromTable(4000, 'copper').size).toBe('500')
  })
  it('errors past the end of the table and on bad input', () => {
    expect(egcFromTable(7000, 'copper').error).toBeTruthy()
    expect(egcFromTable(0, 'copper').error).toBeTruthy()
    expect(egcFromTable(100, 'steel').error).toBeTruthy()
  })
})

describe('groundConductor - companion rules', () => {
  it('plain case: no upsizing, returns the table value unchanged', () => {
    const r = groundConductor({ ocpdAmps: 200, material: 'copper', circuitSize: '3/0', minAmpacitySize: '3/0' })
    expect(r.size).toBe('6')
    expect(r.baseSize).toBe('6')
    expect(r.proportional).toBeNull()
    expect(r.capped).toBe(false)
  })
  it('250.122(B): hard-to-get upsizing 700 -> 750 kcmil bumps the EGC proportionally', () => {
    // 800 A device -> 1/0 Cu base (105,600 cmil); ratio 750/700 = 1.071 -> 113,143 cmil -> 2/0
    const r = groundConductor({ ocpdAmps: 800, material: 'copper', circuitSize: '750', minAmpacitySize: '700' })
    expect(r.baseSize).toBe('1/0')
    expect(r.proportional.ratio).toBeCloseTo(1.071, 3)
    expect(r.size).toBe('2/0')
    expect(r.notes.some(n => n.includes('250.122(B)'))).toBe(true)
  })
  it('250.122(B): a small upsize that does not clear the next size leaves the EGC alone', () => {
    // 200 A -> 6 Cu (26,240); 250->300 kcmil ratio 1.2 -> 31,488 cmil, still under 4 AWG (41,740)
    const r = groundConductor({ ocpdAmps: 200, material: 'copper', circuitSize: '300', minAmpacitySize: '250' })
    expect(r.size).toBe('4')
    expect(r.proportional.size).toBe('4')
  })
  it('250.122(A): EGC is capped at the circuit conductor size', () => {
    // 60 A device -> 10 Cu, but the circuit conductor is only 12 AWG
    const r = groundConductor({ ocpdAmps: 60, material: 'copper', circuitSize: '12', minAmpacitySize: '12' })
    expect(r.size).toBe('12')
    expect(r.capped).toBe(true)
    expect(r.notes.some(n => n.includes('250.122(A)'))).toBe(true)
  })
  it('250.122(F): parallel sets get a note, and the EGC is not divided', () => {
    const r = groundConductor({ ocpdAmps: 1200, material: 'copper', circuitSize: '500', minAmpacitySize: '500', sets: 3 })
    expect(r.size).toBe('3/0')
    expect(r.notes.some(n => n.includes('250.122(F)') && n.includes('3'))).toBe(true)
  })
  it('aluminum EGC carries the 250.120(B) restriction note', () => {
    const r = groundConductor({ ocpdAmps: 400, material: 'aluminum', circuitSize: '500', minAmpacitySize: '500' })
    expect(r.size).toBe('1')
    expect(r.notes.some(n => n.includes('250.120(B)'))).toBe(true)
  })
  it('propagates lookup errors', () => {
    expect(groundConductor({ ocpdAmps: 4000, material: 'aluminum', circuitSize: '1000' }).error).toBeTruthy()
  })
  it('works when no conductor size context is supplied (bare table lookup)', () => {
    const r = groundConductor({ ocpdAmps: 500, material: 'copper' })
    expect(r.size).toBe('2')
    expect(r.capped).toBe(false)
    expect(r.proportional).toBeNull()
  })
})

describe('Table 8 circular mils (relocated file)', () => {
  it('covers sizes past 1000 kcmil that Table 9 omits', () => {
    expect(CMIL['700']).toBe(700000)
    expect(CMIL['900']).toBe(900000)
    expect(CMIL['2000']).toBe(2000000)
  })
  it('keeps the verified AWG values', () => {
    expect(CMIL['14']).toBe(4110)
    expect(CMIL['1/0']).toBe(105600)
    expect(CMIL['4/0']).toBe(211600)
  })
})
