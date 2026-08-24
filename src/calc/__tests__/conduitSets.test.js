import { describe, it, expect } from 'vitest'
import { conduitFillSets, MAX_SETS } from '../conduitFill.js'

const phase = (size, qty) => ({ insulation: 'THHN/THWN-2', size, qty, role: 'phase' })
const ground = (size, qty = 1) => ({ insulation: 'THHN/THWN-2', size, qty, role: 'ground' })
const neutral = (size, qty = 1) => ({ insulation: 'THHN/THWN-2', size, qty, role: 'neutral' })

describe('the 3-sets-of-350 case', () => {
  const rows = [phase('350', 3), ground('2/0')]

  it('recommends three 2-1/2 in. EMT, one per set', () => {
    const r = conduitFillSets('EMT', rows, { sets: 3 })
    expect(r.recommended).toBe('perSet')
    const a = r.arrangements.perSet
    expect(a.conduits).toBe(3)
    expect(a.fill.minimum.tradeSize).toBe('2-1/2')
    expect(a.fill.totalCount).toBe(4) // 3 phase + 1 EGC
    expect(a.fill.totalArea).toBeCloseTo(1.7949, 4)
    expect(a.ccc).toBe(3)
    expect(a.adjust.factor).toBe(1)
  })
  it('all in one conduit is 4 in. EMT and derates to 70%', () => {
    const a = conduitFillSets('EMT', rows, { sets: 3 }).arrangements.single
    expect(a.conduits).toBe(1)
    expect(a.fill.minimum.tradeSize).toBe('4')
    expect(a.ccc).toBe(9)
    expect(a.adjust.factor).toBe(0.7)
  })
  it('quantifies the ampacity given up: 930 A vs 651 A per phase', () => {
    const r = conduitFillSets('EMT', rows, { sets: 3, material: 'copper', tempRating: 75 })
    expect(r.ampacity.base).toBe(310)
    expect(r.ampacity.perSet.derated).toBe(310)
    expect(r.ampacity.perSet.perPhase).toBe(930)
    expect(r.ampacity.single.derated).toBe(217)
    expect(r.ampacity.single.perPhase).toBe(651)
    expect(r.capacityLossPct).toBe(30)
  })
})

describe('what multiplies with the set count', () => {
  it('phase and neutral multiply, the ground does not - 250.122(F)', () => {
    const rows = [phase('350', 3), neutral('350'), ground('2/0')]
    const single = conduitFillSets('EMT', rows, { sets: 3 }).arrangements.single
    const byRole = Object.fromEntries(single.contents.map(c => [c.role, c.qty]))
    expect(byRole.phase).toBe(9)
    expect(byRole.neutral).toBe(3)
    expect(byRole.ground).toBe(1)
  })
  it('one conduit per set holds exactly one set', () => {
    const rows = [phase('350', 3), ground('2/0')]
    const perSet = conduitFillSets('EMT', rows, { sets: 4 }).arrangements.perSet
    expect(perSet.contents.map(c => c.qty)).toEqual([3, 1])
    expect(perSet.conduits).toBe(4)
  })
  it('a single set gives identical arrangements and no recommendation to split', () => {
    const r = conduitFillSets('EMT', [phase('350', 3), ground('2/0')], { sets: 1 })
    expect(r.recommended).toBe('single')
    expect(r.capacityLossPct).toBe(0)
    expect(r.arrangements.perSet.fill.minimum.tradeSize)
      .toBe(r.arrangements.single.fill.minimum.tradeSize)
  })
})

describe('current-carrying count', () => {
  it('never counts the ground, but always counts it in fill', () => {
    const r = conduitFillSets('EMT', [phase('12', 3), ground('12')], { sets: 1 })
    expect(r.arrangements.single.ccc).toBe(3)
    expect(r.arrangements.single.fill.totalCount).toBe(4)
    expect(r.arrangements.single.adjust.factor).toBe(1)
  })
  it('counts the neutral only when it carries harmonics - 310.15(E)', () => {
    const rows = [phase('12', 3), neutral('12'), ground('12')]
    expect(conduitFillSets('EMT', rows, { sets: 1 }).arrangements.single.ccc).toBe(3)
    expect(conduitFillSets('EMT', rows, { sets: 1, neutralCounts: true })
      .arrangements.single.ccc).toBe(4)
  })
  it('a counted neutral can be what tips the derate over', () => {
    const rows = [phase('12', 3), neutral('12')]
    const off = conduitFillSets('EMT', rows, { sets: 1 })
    const on = conduitFillSets('EMT', rows, { sets: 1, neutralCounts: true })
    expect(off.arrangements.single.adjust.factor).toBe(1)
    expect(on.arrangements.single.adjust.factor).toBe(0.8) // 4 CCC
  })
  it('rows with no role default to phase', () => {
    const r = conduitFillSets('EMT', [{ insulation: 'THHN/THWN-2', size: '12', qty: 4 }], { sets: 1 })
    expect(r.arrangements.single.ccc).toBe(4)
  })
})

describe('adjustment factor bands', () => {
  const f = n => conduitFillSets('EMT', [phase('12', n)], { sets: 1 }).arrangements.single.adjust.factor
  it('matches Table 310.15(C)(1)', () => {
    expect(f(3)).toBe(1)
    expect(f(4)).toBe(0.8)
    expect(f(6)).toBe(0.8)
    expect(f(7)).toBe(0.7)
    expect(f(9)).toBe(0.7)
    expect(f(10)).toBe(0.5)
    expect(f(20)).toBe(0.5)
    expect(f(21)).toBe(0.45)
  })
})

describe('ampacity comparison guards', () => {
  it('is omitted when phase sizes are mixed - no single honest number', () => {
    const r = conduitFillSets('EMT', [phase('350', 3), phase('250', 1)], { sets: 2 })
    expect(r.ampacity).toBeNull()
  })
  it('is omitted when the size is not in Table 310.16 for that material', () => {
    // 14 AWG aluminum is not listed
    const r = conduitFillSets('EMT', [phase('14', 3)], { sets: 2, material: 'aluminum' })
    expect(r.ampacity).toBeNull()
  })
  it('follows the chosen material and temperature column', () => {
    const rows = [phase('350', 3)]
    const cu75 = conduitFillSets('EMT', rows, { sets: 2, material: 'copper', tempRating: 75 })
    const cu90 = conduitFillSets('EMT', rows, { sets: 2, material: 'copper', tempRating: 90 })
    const al75 = conduitFillSets('EMT', rows, { sets: 2, material: 'aluminum', tempRating: 75 })
    expect(cu75.ampacity.base).toBe(310)
    expect(cu90.ampacity.base).toBe(350)
    expect(al75.ampacity.base).toBe(250)
  })
})

describe('input handling', () => {
  it('errors on an empty conductor list', () => {
    expect(conduitFillSets('EMT', []).error).toBeTruthy()
    expect(conduitFillSets('EMT', [phase('12', 0)]).error).toBeTruthy()
  })
  it('defaults to one set and clamps the set count', () => {
    expect(conduitFillSets('EMT', [phase('12', 3)]).sets).toBe(1)
    expect(conduitFillSets('EMT', [phase('12', 3)], { sets: 99 }).sets).toBe(MAX_SETS)
    expect(conduitFillSets('EMT', [phase('12', 3)], { sets: 0 }).sets).toBe(1)
  })
  it('reports a fill error inside the arrangement rather than failing outright', () => {
    // far too much copper for any LFMC trade size
    const r = conduitFillSets('LFMC', [phase('1000', 9)], { sets: 3 })
    expect(r.error).toBeUndefined()
    expect(r.arrangements.single.fill.error).toBeTruthy()
    expect(r.arrangements.perSet.ccc).toBe(9)
  })
})
