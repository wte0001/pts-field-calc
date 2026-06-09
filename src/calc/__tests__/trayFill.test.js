import { describe, it, expect } from 'vitest'
import { trayFill, isLargeConductor, cableArea, defaultOd } from '../trayFill.js'

const row = (size, runs = 1, odIn = defaultOd(size), tag = size) => ({ tag, size, runs, odIn })

describe('classification by conductor size', () => {
  it('classifies exactly 4/0 as "4/0 or larger" (boundary)', () => {
    expect(isLargeConductor('4/0')).toBe(true)
  })
  it('classifies 3/0 as smaller than 4/0', () => {
    expect(isLargeConductor('3/0')).toBe(false)
  })
  it('classifies kcmil sizes as 4/0 or larger', () => {
    expect(isLargeConductor('250')).toBe(true)
    expect(isLargeConductor('750')).toBe(true)
  })
})

describe('Case A: all cables 4/0 or larger - diameter sum vs width', () => {
  it('selects width by sum of ODs', () => {
    // 3x 500 kcmil @ 2.205 -> sum OD = 6.615 in -> needs 9 in tray (6 < 6.615)
    const r = trayFill([row('500', 3)])
    expect(r.caseId).toBe('A')
    expect(r.sumAllOd).toBeCloseTo(6.615, 3)
    expect(r.minWidth).toBe(9)
  })
  it('a single 4/0 cable fits in 6 in tray', () => {
    const r = trayFill([row('4/0', 1)])
    expect(r.caseId).toBe('A')
    expect(r.minWidth).toBe(6)
  })
})

describe('Case B: all cables smaller than 4/0 - area sum vs Column 1', () => {
  it('selects first width whose Column 1 area is adequate', () => {
    // 10x 2/0 @ OD 1.270 -> area each = pi/4*1.27^2 = 1.2668; total = 12.668
    // 6in=7.0 no, 9in=10.5 no, 12in=14.0 yes
    const r = trayFill([row('2/0', 10)])
    expect(r.caseId).toBe('B')
    expect(r.Asmall).toBeCloseTo(12.668, 2)
    expect(r.minWidth).toBe(12)
  })
  it('passes at a width when the sum lands exactly on its allowable area', () => {
    // Manual OD chosen so 1 cable area = exactly 7.0 sq in at a small conductor size:
    // OD = sqrt(7.0 * 4/pi)
    const od = Math.sqrt((7.0 * 4) / Math.PI)
    const r = trayFill([{ tag: 'EXACT', size: '12', runs: 1, odIn: od }])
    expect(r.caseId).toBe('B')
    expect(r.Asmall).toBeCloseTo(7.0, 9)
    expect(r.minWidth).toBe(6) // must pass at 6 in, not jump to 9 in
  })
})

describe('Case C: mixed - Column 1 minus 1.2*Sd', () => {
  it('applies the 1.2*Sd deduction', () => {
    // 2x 500 kcmil (Sd = 4.410) + 6x 1/0 (area each = pi/4*1.175^2 = 1.0843, Asmall = 6.506)
    // width 6: 7.0 - 1.2*4.410 = 1.708 -> no
    // width 9: 10.5 - 5.292 = 5.208 -> no
    // width 12: 14.0 - 5.292 = 8.708 -> yes (6.506 <= 8.708)
    const r = trayFill([row('500', 2), row('1/0', 6)])
    expect(r.caseId).toBe('C')
    expect(r.Sd).toBeCloseTo(4.41, 3)
    expect(r.Asmall).toBeCloseTo(6.506, 2)
    expect(r.minWidth).toBe(12)
    const w6 = r.widths.find(w => w.width === 6)
    expect(w6.ok).toBe(false)
    expect(w6.allowable).toBeCloseTo(7.0 - 1.2 * 4.41, 3)
  })
  it('rejects a width where Column1 - 1.2*Sd is non-positive even if Asmall is tiny', () => {
    // 4x 750 kcmil: Sd = 10.624; 1.2*Sd = 12.749 > Column1 at 6 and 9 (7.0, 10.5)
    // plus one small 14 AWG cable (tiny area)
    // width 12: 14.0 - 12.749 = 1.251 -> 14 AWG area 0.1075 fits -> 12 in
    const r = trayFill([row('750', 4), row('14', 1)])
    expect(r.caseId).toBe('C')
    expect(r.minWidth).toBe(12)
    expect(r.widths.find(w => w.width === 9).ok).toBe(false)
  })
})

describe('parallel runs expand to N cables', () => {
  it('N runs contribute N x OD and N x area, never 1', () => {
    const one = trayFill([row('4/0', 1)])
    const three = trayFill([row('4/0', 3)])
    expect(three.cableCount).toBe(3)
    expect(three.sumAllOd).toBeCloseTo(one.sumAllOd * 3, 9)
  })
  it('parallel runs of small cables multiply area', () => {
    // Compare against the exact unrounded expectation (reported Asmall is
    // rounded to 3 decimals for display, so use the analytic value).
    const r4 = trayFill([row('2/0', 4)])
    expect(r4.Asmall).toBeCloseTo(4 * cableArea(defaultOd('2/0')), 2)
  })
  it('a paralleled mixed circuit is expanded before classification sums', () => {
    // 2 parallel 250 kcmil -> Sd = 2 * 1.646 = 3.292
    const r = trayFill([row('250', 2), row('12', 1)])
    expect(r.caseId).toBe('C')
    expect(r.Sd).toBeCloseTo(3.292, 9)
  })
})

describe('inadequate tray reporting', () => {
  it('reports no standard width adequate instead of returning a wrong number (Case B)', () => {
    // 40x 3/0 @ OD 1.378 -> area each 1.4914, total 59.65 > 42.0 at 36 in
    const r = trayFill([row('3/0', 40)])
    expect(r.caseId).toBe('B')
    expect(r.adequate).toBe(false)
    expect(r.minWidth).toBeNull()
    expect(r.inadequateMessage).toMatch(/No standard tray width/i)
  })
  it('reports inadequate for Case A overflow', () => {
    // 20x 750 kcmil -> sum OD = 53.12 in > 36
    const r = trayFill([row('750', 20)])
    expect(r.caseId).toBe('A')
    expect(r.adequate).toBe(false)
  })
})

describe('input validation and manual OD', () => {
  it('errors on a size requiring manual OD when none is given', () => {
    const r = trayFill([{ tag: 'X', size: '300', runs: 1, odIn: null }])
    expect(r.error).toMatch(/manual OD/i)
  })
  it('accepts manual OD for 300 kcmil and flags the override', () => {
    const r = trayFill([{ tag: 'X', size: '300', runs: 1, odIn: 1.75 }])
    expect(r.error).toBeUndefined()
    expect(r.caseId).toBe('A') // 300 kcmil is 4/0 or larger
    expect(r.warnings.length).toBe(1)
  })
  it('rejects zero or negative runs', () => {
    expect(trayFill([row('4/0', 0)]).error).toBeTruthy()
    expect(trayFill([{ tag: 'X', size: '4/0', runs: -2, odIn: 1.499 }]).error).toBeTruthy()
  })
  it('errors on empty list', () => {
    expect(trayFill([]).error).toBeTruthy()
  })
  it('cableArea computes pi/4 * OD^2', () => {
    expect(cableArea(2)).toBeCloseTo(Math.PI, 9)
  })
})
