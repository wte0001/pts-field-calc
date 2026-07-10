import { describe, it, expect } from 'vitest'
import {
  lvXfmrTypicalLosses, mvXfmrTypicalLosses, itemHeat, heatTotal, heatRejectCsv, W_TO_BTUH
} from '../heatReject.js'

describe('typical transformer losses', () => {
  it('derives 75 kVA LV dry-type losses from DOE 2016 efficiency (98.60% at 35% load)', () => {
    const t = lvXfmrTypicalLosses(75)
    // TL35 = 0.35 * 75000 * (1/0.986 - 1) = 372.7 W; NL = TL35/2; LL = NL/0.35^2
    expect(t.noLoadW).toBe(186)
    expect(t.loadLossW).toBe(1521)
    expect(t.effPct).toBe(98.6)
  })
  it('full-load losses scale sensibly with size (bigger unit, lower percent)', () => {
    const small = lvXfmrTypicalLosses(15)
    const big = lvXfmrTypicalLosses(1000)
    const pctSmall = (small.noLoadW + small.loadLossW) / (15 * 1000)
    const pctBig = (big.noLoadW + big.loadLossW) / (1000 * 1000)
    expect(pctSmall).toBeGreaterThan(pctBig)
  })
  it('returns null for a kVA not in the list', () => {
    expect(lvXfmrTypicalLosses(200)).toBeNull()
    expect(mvXfmrTypicalLosses(1234)).toBeNull()
  })
  it('returns MV unit-sub typical losses as entered', () => {
    expect(mvXfmrTypicalLosses(1500)).toEqual({ noLoadW: 3900, loadLossW: 13000 })
  })
})

describe('item heat', () => {
  it('transformer: no-load plus winding loss times load squared', () => {
    const full = itemHeat({ type: 'xfmr', noLoadW: 186, loadLossW: 1521, loadPct: 100 })
    expect(full.watts).toBeCloseTo(1707, 6)
    const half = itemHeat({ type: 'xfmr', noLoadW: 186, loadLossW: 1521, loadPct: 50 })
    expect(half.watts).toBeCloseTo(186 + 1521 * 0.25, 6)
  })
  it('transformer at 0% load still rejects core loss', () => {
    expect(itemHeat({ type: 'xfmr', noLoadW: 186, loadLossW: 1521, loadPct: 0 }).watts).toBe(186)
  })
  it('switchboard: sections x watts x load squared', () => {
    expect(itemHeat({ type: 'swbd', sections: 4, wPerSection: 600, loadPct: 100 }).watts).toBeCloseTo(2400, 6)
    expect(itemHeat({ type: 'swbd', sections: 4, wPerSection: 600, loadPct: 50 }).watts).toBeCloseTo(600, 6)
  })
  it('MCC: 6 sections at 400 W, 75% load -> 1350 W', () => {
    expect(itemHeat({ type: 'mcc', sections: 6, wPerSection: 400, loadPct: 75 }).watts).toBeCloseTo(1350, 6)
  })
  it('unit substation combines transformer and LV sections', () => {
    const r = itemHeat({
      type: 'unitsub', noLoadW: 3900, loadLossW: 13000,
      sections: 3, wPerSection: 600, loadPct: 80
    })
    // 3900 + 13000*0.64 + 1800*0.64 = 13372
    expect(r.watts).toBeCloseTo(13372, 6)
  })
  it('custom passes manufacturer watts through', () => {
    expect(itemHeat({ type: 'custom', watts: 1250 }).watts).toBe(1250)
  })
  it('warns above 100% load but still computes', () => {
    const r = itemHeat({ type: 'swbd', sections: 2, wPerSection: 600, loadPct: 120 })
    expect(r.warnings.length).toBe(1)
    expect(r.watts).toBeCloseTo(2 * 600 * 1.44, 6)
  })
  it('errors on bad inputs', () => {
    expect(itemHeat({ type: 'xfmr', noLoadW: -5, loadLossW: 1521, loadPct: 80 }).error).toBeTruthy()
    expect(itemHeat({ type: 'xfmr', noLoadW: 186, loadLossW: NaN, loadPct: 80 }).error).toBeTruthy()
    expect(itemHeat({ type: 'xfmr', noLoadW: 186, loadLossW: 1521, loadPct: 200 }).error).toBeTruthy()
    expect(itemHeat({ type: 'swbd', sections: 0, wPerSection: 600, loadPct: 80 }).error).toBeTruthy()
    expect(itemHeat({ type: 'swbd', sections: 2.5, wPerSection: 600, loadPct: 80 }).error).toBeTruthy()
    expect(itemHeat({ type: 'custom', watts: NaN }).error).toBeTruthy()
    expect(itemHeat({ type: 'chiller' }).error).toBeTruthy()
  })
})

describe('heat totals', () => {
  const items = [
    { type: 'xfmr', tag: 'T-2A', noLoadW: 186, loadLossW: 1521, loadPct: 100 },
    { type: 'mcc', tag: 'MCC-1', sections: 6, wPerSection: 400, loadPct: 75 }
  ]
  it('sums items and converts units', () => {
    const r = heatTotal(items)
    expect(r.totalW).toBeCloseTo(1707 + 1350, 6)
    expect(r.totalKw).toBeCloseTo(3.057, 3)
    expect(r.btuh).toBeCloseTo(3057 * W_TO_BTUH, 3)
    expect(r.tons).toBeCloseTo((3057 * W_TO_BTUH) / 12000, 6)
    expect(r.items.length).toBe(2)
  })
  it('errors on an empty list', () => {
    expect(heatTotal([]).error).toBeTruthy()
  })
  it('names the offending row on error, preferring the tag', () => {
    const r = heatTotal([items[0], { type: 'swbd', tag: 'MSB-1', sections: NaN, wPerSection: 600, loadPct: 80 }])
    expect(r.error).toContain('MSB-1')
    const r2 = heatTotal([{ type: 'custom', tag: '', watts: NaN }])
    expect(r2.error).toContain('item 1')
  })
  it('CSV includes rows, totals, and the caveat', () => {
    const r = heatTotal(items)
    const csv = heatRejectCsv(items, r)
    expect(csv).toContain('T-2A')
    expect(csv).toContain('TOTAL')
    expect(csv).toContain('ESTIMATING VALUES ONLY')
  })
})
