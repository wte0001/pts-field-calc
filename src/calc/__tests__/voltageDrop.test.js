import { describe, it, expect } from 'vitest'
import {
  effectiveZ, voltageDropTable9, voltageDropKFactor, VD_SIZES
} from '../voltageDrop.js'

const base = {
  amps: 200, lengthFt: 300, voltage: 480, phase: 3,
  size: '3/0', material: 'copper', raceway: 'steel', pf: 0.85, sets: 1
}

describe('effective impedance - Chapter 9 Table 9', () => {
  it('combines R and X at the given power factor', () => {
    // 3/0 Cu steel: R 0.079, X 0.052; sin(theta) at 0.85 PF = 0.5268
    const z = effectiveZ('3/0', 'copper', 'steel', 0.85)
    expect(z.r).toBe(0.079)
    expect(z.x).toBe(0.052)
    expect(z.zEff).toBeCloseTo(0.079 * 0.85 + 0.052 * Math.sqrt(1 - 0.85 ** 2), 6)
  })
  it('at unity PF the effective Z is just R', () => {
    const z = effectiveZ('4/0', 'copper', 'pvc', 1)
    expect(z.zEff).toBeCloseTo(0.062, 6)
  })
  it('PVC reactance column also serves aluminum conduit', () => {
    const pvc = effectiveZ('500', 'copper', 'pvc', 0.85)
    const alc = effectiveZ('500', 'copper', 'aluminum', 0.85)
    expect(pvc.x).toBe(alc.x)
    expect(pvc.r).not.toBe(alc.r) // resistance column differs
  })
  it('reports unverified for 14 AWG aluminum (null in dataset)', () => {
    const z = effectiveZ('14', 'aluminum', 'steel', 0.85)
    expect(z.error).toBeTruthy()
    expect(z.unverified).toBe(true)
  })
  it('errors on a size not in Table 9', () => {
    expect(effectiveZ('700', 'copper', 'steel', 0.85).error).toBeTruthy()
  })
})

describe('voltage drop - Table 9 method', () => {
  it('worked example: 200 A, 300 ft, 480V 3-phase, 3/0 Cu in steel at 0.85 PF', () => {
    const r = voltageDropTable9(base)
    // Zeff = 0.079*0.85 + 0.052*0.52678 = 0.094542; VD = 1.7321*200*0.3*0.094542 = 9.827 V
    expect(r.vdVolts).toBeCloseTo(9.827, 2)
    expect(r.vdPct).toBeCloseTo(2.047, 2)
    expect(r.loadVoltage).toBeCloseTo(470.17, 1)
  })
  it('single-phase uses 2x: 20 A, 100 ft, 120V, 12 Cu PVC, PF 1', () => {
    const r = voltageDropTable9({
      amps: 20, lengthFt: 100, voltage: 120, phase: 1,
      size: '12', material: 'copper', raceway: 'pvc', pf: 1, sets: 1
    })
    // VD = 2 * 20 * 0.1 * 2.0 = 8 V -> 6.67%
    expect(r.vdVolts).toBeCloseTo(8, 6)
    expect(r.vdPct).toBeCloseTo(6.667, 2)
  })
  it('two parallel sets halve the drop', () => {
    const one = voltageDropTable9(base)
    const two = voltageDropTable9({ ...base, sets: 2 })
    expect(two.vdVolts).toBeCloseTo(one.vdVolts / 2, 6)
  })
  it('max length at 3% is consistent: recomputing at that length gives 3%', () => {
    const r = voltageDropTable9(base)
    const check = voltageDropTable9({ ...base, lengthFt: r.maxLenAt3Pct })
    expect(check.vdPct).toBeCloseTo(3, 6)
  })
  it('errors on bad inputs', () => {
    expect(voltageDropTable9({ ...base, amps: 0 }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, lengthFt: -5 }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, voltage: NaN }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, phase: 2 }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, pf: 1.05 }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, sets: 0 }).error).toBeTruthy()
    expect(voltageDropTable9({ ...base, sets: 1.5 }).error).toBeTruthy()
  })
})

describe('voltage drop - K-factor method', () => {
  it('worked example: 380 A, 250 ft, 480V 3-phase, 500 kcmil Cu', () => {
    const r = voltageDropKFactor({
      amps: 380, lengthFt: 250, voltage: 480, phase: 3,
      size: '500', material: 'copper', sets: 1
    })
    // VD = 1.7321 * 12.9 * 380 * 250 / 500000 = 4.245 V -> 0.884%
    expect(r.vdVolts).toBeCloseTo(4.245, 2)
    expect(r.vdPct).toBeCloseTo(0.884, 2)
  })
  it('single-phase: 16 A, 150 ft, 120V, 10 AWG Cu', () => {
    const r = voltageDropKFactor({
      amps: 16, lengthFt: 150, voltage: 120, phase: 1,
      size: '10', material: 'copper', sets: 1
    })
    // VD = 2 * 12.9 * 16 * 150 / 10380 = 5.965 V -> 4.97%
    expect(r.vdVolts).toBeCloseTo(5.965, 2)
    expect(r.vdPct).toBeCloseTo(4.971, 2)
  })
  it('aluminum uses K = 21.2', () => {
    const cu = voltageDropKFactor({ amps: 100, lengthFt: 200, voltage: 480, phase: 3, size: '4/0', material: 'copper', sets: 1 })
    const al = voltageDropKFactor({ amps: 100, lengthFt: 200, voltage: 480, phase: 3, size: '4/0', material: 'aluminum', sets: 1 })
    expect(al.vdVolts / cu.vdVolts).toBeCloseTo(21.2 / 12.9, 6)
  })
  it('parallel sets divide the drop', () => {
    const one = voltageDropKFactor({ amps: 900, lengthFt: 300, voltage: 480, phase: 3, size: '500', material: 'copper', sets: 1 })
    const three = voltageDropKFactor({ amps: 900, lengthFt: 300, voltage: 480, phase: 3, size: '500', material: 'copper', sets: 3 })
    expect(three.vdVolts).toBeCloseTo(one.vdVolts / 3, 6)
  })
  it('errors on 14 AWG aluminum and unknown sizes', () => {
    expect(voltageDropKFactor({ amps: 10, lengthFt: 50, voltage: 120, phase: 1, size: '14', material: 'aluminum', sets: 1 }).error).toBeTruthy()
    expect(voltageDropKFactor({ amps: 10, lengthFt: 50, voltage: 120, phase: 1, size: '900', material: 'copper', sets: 1 }).error).toBeTruthy()
  })
})

describe('Table 9 size list', () => {
  it('has 21 sizes, 14 AWG to 1000 kcmil, without 700/800/900', () => {
    expect(VD_SIZES.length).toBe(21)
    expect(VD_SIZES[0]).toBe('14')
    expect(VD_SIZES[VD_SIZES.length - 1]).toBe('1000')
    expect(VD_SIZES).not.toContain('700')
    expect(VD_SIZES).not.toContain('800')
    expect(VD_SIZES).not.toContain('900')
  })
})
