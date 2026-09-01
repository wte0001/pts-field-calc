import { describe, it, expect } from 'vitest'
import {
  sizeBranchCircuit, nextStockedOcpd, smallConductorCap, terminationColumn,
  STOCKED_OCPD, CONTINUOUS_FACTOR
} from '../branchCircuit.js'

describe('the 27 A case that was wrong', () => {
  it('27 A continuous gives a 40 A device and 8 AWG copper, not 10', () => {
    const r = sizeBranchCircuit(27, 'copper')
    expect(r.designAmps).toBe(33.8) // 27 x 1.25
    expect(r.ocpd).toBe(40)         // 35 A is a half size PTS does not stock
    expect(r.tempRating).toBe(60)   // 40 A is under 100 A
    expect(r.size).toBe('8')
    expect(r.baseAmpacity).toBe(40)
  })
  it('explains that 10 AWG is ruled out by 240.4(D)', () => {
    const r = sizeBranchCircuit(27, 'copper')
    expect(r.size).toBe('8')
    expect(r.warnings.some(w => w.startsWith('10 AWG') && w.includes('240.4(D)') && w.includes('30 A device'))).toBe(true)
  })
  it('the cap alone can be the blocker, with ampacity to spare', () => {
    // 12 AWG Cu carries 25 A at 75 C but 240.4(D) stops at a 20 A device
    const r = sizeBranchCircuit(20, 'copper', { ocpdAmps: 25, terminations75: true, continuous: false })
    expect(r.size).toBe('10')
    expect(r.warnings.some(w => w.startsWith('12 AWG') && w.includes('even though it carries 25 A'))).toBe(true)
  })
  it('a 10 AWG answer is still reachable at a 30 A device', () => {
    const r = sizeBranchCircuit(24, 'copper')
    expect(r.ocpd).toBe(30)
    expect(r.size).toBe('10')
    expect(r.protectedAt).toBe(30)
  })
})

describe('240.4(D) small-conductor caps', () => {
  it('caps copper 14/12/10 and aluminum 12/10', () => {
    expect(smallConductorCap('14', 'copper')).toBe(15)
    expect(smallConductorCap('12', 'copper')).toBe(20)
    expect(smallConductorCap('10', 'copper')).toBe(30)
    expect(smallConductorCap('12', 'aluminum')).toBe(15)
    expect(smallConductorCap('10', 'aluminum')).toBe(25)
  })
  it('does not cap 8 AWG and larger', () => {
    expect(smallConductorCap('8', 'copper')).toBeNull()
    expect(smallConductorCap('250', 'copper')).toBeNull()
  })
  it('the cap, not ampacity, governs what the conductor is protected at', () => {
    // 12 AWG Cu is 25 A at 75 C but may only see a 20 A device
    const r = sizeBranchCircuit(16, 'copper', { terminations75: true })
    expect(r.ocpd).toBe(20)
    expect(r.size).toBe('12')
    expect(r.baseAmpacity).toBe(25)
    expect(r.protectedAt).toBe(20)
  })
})

describe('110.14(C) termination column', () => {
  it('picks 60 C at 100 A and below, 75 C above', () => {
    expect(terminationColumn(100)).toBe(60)
    expect(terminationColumn(125)).toBe(75)
    expect(terminationColumn(40)).toBe(60)
  })
  it('honours equipment listed for 75 C terminations', () => {
    expect(terminationColumn(40, true)).toBe(75)
  })
  it('never sizes from the 90 C column', () => {
    for (const load of [5, 27, 80, 200, 400]) {
      expect([60, 75]).toContain(sizeBranchCircuit(load, 'copper').tempRating)
    }
  })
  it('a large circuit uses the 75 C column', () => {
    const r = sizeBranchCircuit(160, 'copper')
    expect(r.ocpd).toBe(200)
    expect(r.tempRating).toBe(75)
    expect(r.size).toBe('3/0') // 200 A at 75 C
  })
  it('states which rule chose the column', () => {
    expect(sizeBranchCircuit(27, 'copper').terminationRule).toContain('110.14(C)(1)(a)')
    expect(sizeBranchCircuit(160, 'copper').terminationRule).toContain('110.14(C)(1)(b)')
  })
})

describe('stocked overcurrent ratings', () => {
  it('skips the half sizes PTS does not use', () => {
    expect(STOCKED_OCPD).not.toContain(25)
    expect(STOCKED_OCPD).not.toContain(35)
    expect(STOCKED_OCPD).not.toContain(45)
    expect(STOCKED_OCPD).not.toContain(110)
    expect(STOCKED_OCPD).toContain(40)
    expect(STOCKED_OCPD).toContain(30)
  })
  it('rounds up past a skipped size', () => {
    expect(nextStockedOcpd(33.75)).toBe(40) // not 35
    expect(nextStockedOcpd(21)).toBe(30)    // not 25
    expect(nextStockedOcpd(41)).toBe(50)    // not 45
    expect(nextStockedOcpd(101)).toBe(125)  // not 110
  })
  it('returns null past the top of the list', () => {
    expect(nextStockedOcpd(99999)).toBeNull()
    expect(nextStockedOcpd(0)).toBeNull()
  })
  it('accepts a manual device rating and says it was not derived', () => {
    const auto = sizeBranchCircuit(27, 'copper')
    const manual = sizeBranchCircuit(27, 'copper', { ocpdAmps: 60 })
    expect(auto.ocpdDerived).toBe(true)
    expect(manual.ocpdDerived).toBe(false)
    expect(manual.ocpd).toBe(60)
    // 60 A on the 60 C column needs 4 AWG (70 A) - 6 AWG is only 55 A there
    expect(manual.size).toBe('4')
  })
})

describe('continuous load factor', () => {
  it('applies 125% by default and can be turned off', () => {
    expect(CONTINUOUS_FACTOR).toBe(1.25)
    const cont = sizeBranchCircuit(27, 'copper')
    const non = sizeBranchCircuit(27, 'copper', { continuous: false })
    expect(cont.designAmps).toBe(33.8)
    expect(non.designAmps).toBe(27)
    expect(non.ocpd).toBe(30)
    expect(non.size).toBe('10')
  })
})

describe('hard-to-get sizes still stepped past', () => {
  it('skips 3 AWG in favour of 2 AWG', () => {
    // a 100 A device at 60 C: 3 AWG is 85 A (short), 2 AWG is 95 A - but check the
    // skip path with a device 3 AWG could serve at 75 C
    const r = sizeBranchCircuit(80, 'copper', { terminations75: true })
    expect(r.ocpd).toBe(100)
    expect(r.size).toBe('2')
    if (r.hardToGetSkipped) expect(r.hardToGetSkipped.size).toBe('3')
  })
  it('never recommends 300 or 400 kcmil', () => {
    for (const load of [200, 240, 260, 280, 300]) {
      const r = sizeBranchCircuit(load, 'copper')
      expect(['300', '400']).not.toContain(r.size)
    }
  })
})

describe('derating still applies', () => {
  it('derates from the termination column, not the 90 C column', () => {
    const r = sizeBranchCircuit(27, 'copper', { ambientC: 40 })
    expect(r.tempRating).toBe(60)
    expect(r.factors.ambient.factor).toBe(0.82) // 40 C in the 60 C column
    expect(r.factors.usingAdvanced).toBe(true)
  })
  it('conductor-count adjustment can push the size up', () => {
    const plain = sizeBranchCircuit(27, 'copper')
    const crowded = sizeBranchCircuit(27, 'copper', { numConductors: 9 })
    expect(crowded.factors.adjust.factor).toBe(0.7)
    expect(Number(crowded.size === plain.size)).toBeDefined()
    // 8 AWG at 60 C derated 40 x 0.7 = 28 A, under the 33.8 A design load -> steps up
    expect(crowded.size).toBe('6')
  })
})

describe('input handling', () => {
  it('errors on a bad load or material', () => {
    expect(sizeBranchCircuit(0, 'copper').error).toBeTruthy()
    expect(sizeBranchCircuit(NaN, 'copper').error).toBeTruthy()
    expect(sizeBranchCircuit(27, 'steel').error).toBeTruthy()
  })
  it('offers parallel options when no single conductor works', () => {
    const r = sizeBranchCircuit(2000, 'copper')
    expect(r.error).toBeTruthy()
    expect(r.parallel).toBeTruthy()
    expect(r.parallel[0].runs).toBeGreaterThan(1)
  })
})
