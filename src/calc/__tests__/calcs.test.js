import { describe, it, expect } from 'vitest'
import { selectWireSize, ambientCorrectionFactor, conductorCountAdjustment } from '../wireSize.js'
import { motorFlc } from '../motorFlc.js'
import { conduitFill, fillLimit } from '../conduitFill.js'

describe('wire size - Table 310.16', () => {
  it('selects 1/0 copper at 75C for 150 A (exact table value passes)', () => {
    const r = selectWireSize(150, 'copper', 75)
    expect(r.size).toBe('1/0')
    expect(r.baseAmpacity).toBe(150)
    expect(r.nextSize.size).toBe('2/0')
  })
  it('selects 12 AWG copper 75C for 21 A', () => {
    const r = selectWireSize(21, 'copper', 75)
    expect(r.size).toBe('12')
    expect(r.baseAmpacity).toBe(25)
  })
  it('aluminum has no 14 AWG and selects from 12 up', () => {
    const r = selectWireSize(10, 'aluminum', 75)
    expect(r.size).toBe('12')
  })
  it('applies ambient correction: 40C, 75C column factor 0.88', () => {
    const a = ambientCorrectionFactor(40, 75)
    expect(a.factor).toBe(0.88)
    // 100 A load, 75C Cu: 3 AWG base 100 -> derated 88, fails; 2 AWG 115 -> 101.2 passes
    const r = selectWireSize(100, 'copper', 75, { ambientC: 40 })
    expect(r.size).toBe('2')
    expect(r.deratedAmpacity).toBeCloseTo(101.2, 1)
  })
  it('applies conductor count adjustment: 6 conductors = 0.80', () => {
    const adj = conductorCountAdjustment(6)
    expect(adj.factor).toBe(0.8)
    const r = selectWireSize(100, 'copper', 75, { numConductors: 6 })
    // 1 AWG base 130 -> 104 passes; 2 AWG 115 -> 92 fails
    expect(r.size).toBe('1')
  })
  it('combines both factors multiplicatively', () => {
    const r = selectWireSize(50, 'copper', 75, { ambientC: 45, numConductors: 4 })
    // factor = 0.82 * 0.80 = 0.656; 6 AWG: 65*0.656=42.6 no; 4 AWG: 85*0.656=55.8 yes
    expect(r.factors.totalFactor).toBeCloseTo(0.656, 3)
    expect(r.size).toBe('4')
  })
  it('errors when ambient exceeds insulation rating range', () => {
    const r = selectWireSize(20, 'copper', 60, { ambientC: 60 })
    expect(r.error).toBeTruthy()
  })
  it('errors on nonsense current', () => {
    expect(selectWireSize(0, 'copper', 75).error).toBeTruthy()
    expect(selectWireSize(NaN, 'copper', 75).error).toBeTruthy()
  })
  it('errors when no size is big enough', () => {
    expect(selectWireSize(99999, 'copper', 90).error).toBeTruthy()
  })
})

describe('motor FLC - Table 430.250', () => {
  it('returns 65 A for 50 HP at 460V', () => {
    const r = motorFlc('50', 460)
    expect(r.flc).toBe(65)
    expect(r.minBranchAmpacity).toBeCloseTo(81.3, 1) // 65 * 1.25
  })
  it('returns 27 A for 20 HP at 460V and 96 A for 75 HP', () => {
    expect(motorFlc('20', 460).flc).toBe(27)
    expect(motorFlc('75', 460).flc).toBe(96)
  })
  it('handles fractional HP keys', () => {
    expect(motorFlc('7-1/2', 460).flc).toBe(11)
    expect(motorFlc('1/2', 230).flc).toBe(2.2)
  })
  it('reports unverified for 250 HP at 230V (null in dataset)', () => {
    const r = motorFlc('250', 230)
    expect(r.error).toBeTruthy()
    expect(r.unverified).toBe(true)
  })
  it('errors on unknown HP', () => {
    expect(motorFlc('55', 460).error).toBeTruthy()
  })
})

describe('conduit fill - Chapter 9 Tables 1, 4, 5', () => {
  it('fill limits per Table 1', () => {
    expect(fillLimit(1)).toBe(0.53)
    expect(fillLimit(2)).toBe(0.31)
    expect(fillLimit(3)).toBe(0.40)
    expect(fillLimit(12)).toBe(0.40)
  })
  it('3x 500 kcmil THHN in EMT: total 2.1219 sq in at 40% -> 3 in EMT', () => {
    const r = conduitFill('EMT', [{ insulation: 'THHN/THWN-2', size: '500', qty: 3 }])
    expect(r.totalArea).toBeCloseTo(2.1219, 4)
    // 2-1/2 EMT: 5.858*0.4 = 2.3432 >= 2.1219 -> minimum is 2-1/2
    expect(r.minimum.tradeSize).toBe('2-1/2')
    expect(r.nextUp.tradeSize).toBe('3')
  })
  it('9x 12 AWG THHN in EMT -> 1/2 in', () => {
    const r = conduitFill('EMT', [{ insulation: 'THHN/THWN-2', size: '12', qty: 9 }])
    // 9 * 0.0133 = 0.1197 <= 0.304*0.4 = 0.1216
    expect(r.minimum.tradeSize).toBe('1/2')
  })
  it('single conductor uses 53%', () => {
    const r = conduitFill('EMT', [{ insulation: 'THHN/THWN-2', size: '4/0', qty: 1 }])
    expect(r.limit).toBe(0.53)
  })
  it('mixed insulation rows sum correctly', () => {
    const r = conduitFill('RMC', [
      { insulation: 'THHN/THWN-2', size: '1/0', qty: 3 },
      { insulation: 'XHHW-2', size: '6', qty: 1 }
    ])
    expect(r.totalArea).toBeCloseTo(3 * 0.1855 + 0.0590, 4)
    expect(r.totalCount).toBe(4)
  })
  it('errors with unverified-data message for null Table 5 values (600 kcmil XHHW-2)', () => {
    const r = conduitFill('EMT', [{ insulation: 'XHHW-2', size: '600', qty: 1 }])
    expect(r.error).toBeTruthy()
    expect(r.unverified).toBe(true)
  })
  it('errors when nothing fits', () => {
    const r = conduitFill('LFMC', [{ insulation: 'THHN/THWN-2', size: '1000', qty: 9 }])
    expect(r.error).toBeTruthy()
  })
  it('errors on empty row list', () => {
    expect(conduitFill('EMT', []).error).toBeTruthy()
  })
})
