import { describe, it, expect } from 'vitest'
import { powerConvert } from '../powerConvert.js'

describe('power converter - kVA / A / kW', () => {
  it('3-phase: 100 kVA at 480V -> 120.28 A, 85 kW at 0.85 PF', () => {
    const r = powerConvert('kva', 100, 480, 3, 0.85)
    expect(r.amps).toBeCloseTo(120.28, 2)
    expect(r.kw).toBeCloseTo(85, 6)
  })
  it('3-phase: 150 A at 480V -> 124.71 kVA', () => {
    const r = powerConvert('amps', 150, 480, 3, 0.85)
    expect(r.kva).toBeCloseTo(124.71, 2)
    expect(r.kw).toBeCloseTo(106.0, 1)
  })
  it('3-phase from kW: 85 kW at 0.85 PF -> 100 kVA -> 120.28 A', () => {
    const r = powerConvert('kw', 85, 480, 3, 0.85)
    expect(r.kva).toBeCloseTo(100, 6)
    expect(r.amps).toBeCloseTo(120.28, 2)
  })
  it('single-phase: 10 kVA at 240V -> 41.67 A', () => {
    const r = powerConvert('kva', 10, 240, 1, 1)
    expect(r.amps).toBeCloseTo(41.667, 2)
    expect(r.kw).toBeCloseTo(10, 6) // PF 1: kW equals kVA
  })
  it('single-phase: 20 A at 120V -> 2.4 kVA', () => {
    const r = powerConvert('amps', 20, 120, 1, 0.9)
    expect(r.kva).toBeCloseTo(2.4, 6)
    expect(r.kw).toBeCloseTo(2.16, 6)
  })
  it('round-trips: kVA -> A -> kVA', () => {
    const a = powerConvert('kva', 112.5, 208, 3, 0.8)
    const b = powerConvert('amps', a.amps, 208, 3, 0.8)
    expect(b.kva).toBeCloseTo(112.5, 6)
    expect(b.kw).toBeCloseTo(a.kw, 6)
  })
  it('errors on non-positive or non-finite value', () => {
    expect(powerConvert('kva', 0, 480, 3, 0.85).error).toBeTruthy()
    expect(powerConvert('kva', -5, 480, 3, 0.85).error).toBeTruthy()
    expect(powerConvert('kva', NaN, 480, 3, 0.85).error).toBeTruthy()
  })
  it('errors on bad voltage, phase, PF, or kind', () => {
    expect(powerConvert('kva', 100, 0, 3, 0.85).error).toBeTruthy()
    expect(powerConvert('kva', 100, 480, 2, 0.85).error).toBeTruthy()
    expect(powerConvert('kva', 100, 480, 3, 0).error).toBeTruthy()
    expect(powerConvert('kva', 100, 480, 3, 1.01).error).toBeTruthy()
    expect(powerConvert('hp', 100, 480, 3, 0.85).error).toBeTruthy()
  })
})
