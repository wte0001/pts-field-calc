import { describe, it, expect } from 'vitest'
import { trayFill, defaultOd } from '../trayFill.js'
import { trayDiagramLayout, cableKind, SCALE } from '../trayDiagram.js'

const row = (size, runs = 1, odIn = defaultOd(size), tag = size) => ({ tag, size, runs, odIn })

describe('cable kind classification', () => {
  it('maps to the code categories, EGC first', () => {
    expect(cableKind({ isEgc: true, large: true })).toBe('egc')
    expect(cableKind({ isEgc: false, large: true })).toBe('large')
    expect(cableKind({ isEgc: false, large: false })).toBe('small')
  })
})

describe('trayFill exposes the expanded cable list for drawing', () => {
  it('expands parallel runs and tags each with its circuit row', () => {
    const r = trayFill([row('4/0', 2, undefined, 'PDP-3'), row('12', 1, undefined, 'CTRL')])
    expect(r.cables).toHaveLength(3)
    expect(r.cables.filter(c => c.rowIndex === 1)).toHaveLength(2)
    expect(r.cables[0].tag).toBe('PDP-3')
    expect(r.cables[2].control).toBe(true)
    expect(r.cables[0].control).toBe(false)
  })
  it('marks the standalone EGC and gives it no row index', () => {
    const r = trayFill([row('4/0', 1)], { size: '1/0', odIn: 0.486 })
    const g = r.cables.find(c => c.isEgc)
    expect(g.rowIndex).toBeNull()
    expect(g.control).toBe(false)
  })
})

describe('single-layer geometry', () => {
  it('lays cables side by side on the rung, touching, left to right', () => {
    const r = trayFill([row('4/0', 3)])
    const L = trayDiagramLayout(r, { widthIn: 9 })
    expect(L.cables).toHaveLength(3)
    // touching: each centre is one diameter along from the last
    const d = 1.499 * SCALE
    expect(L.cables[1].cx - L.cables[0].cx).toBeCloseTo(d, 3)
    expect(L.cables[2].cx - L.cables[1].cx).toBeCloseTo(d, 3)
    // all resting on the same floor line
    const bottoms = L.cables.map(c => c.cy + c.r)
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeCloseTo(0, 6)
    expect(bottoms[0]).toBeCloseTo(L.inside.floorY, 6)
  })
  it('never stacks — overflow is reported instead of a second layer', () => {
    // 6x 500 kcmil at 2.205 in = 13.23 in, far past a 6 in tray
    const r = trayFill([row('500', 6)])
    const L = trayDiagramLayout(r, { widthIn: 6 })
    expect(L.cables.length).toBeLessThan(6)
    expect(L.overflowCount).toBeGreaterThan(0)
    expect(L.singleLayerFits).toBe(false)
    // every drawn cable still sits on the floor — no second row
    L.cables.forEach(c => expect(c.cy + c.r).toBeCloseTo(L.inside.floorY, 6))
  })
  it('reports singleLayerFits when everything fits the width', () => {
    const r = trayFill([row('4/0', 3)])
    const L = trayDiagramLayout(r, { widthIn: 9 })
    expect(L.singleLayerFits).toBe(true)
    expect(L.overflowCount).toBe(0)
  })
  it('keeps cables inside the rails', () => {
    const r = trayFill([row('4/0', 5)])
    const L = trayDiagramLayout(r, { widthIn: 12 })
    L.cables.forEach(c => {
      expect(c.cx - c.r).toBeGreaterThanOrEqual(L.inside.x0 - 1e-6)
      expect(c.cx + c.r).toBeLessThanOrEqual(L.inside.x1 + 1e-6)
    })
  })
  it('draws the EGC last so it reads as an addition', () => {
    const r = trayFill([row('4/0', 2)], { size: '250', odIn: 0.711 })
    const L = trayDiagramLayout(r, { widthIn: 9 })
    expect(L.cables[L.cables.length - 1].kind).toBe('egc')
    expect(L.cables[L.cables.length - 1].label).toBe('G')
  })
})

describe('conductor depiction', () => {
  it('multiconductor power cable shows an internal ground, control cable does not', () => {
    const r = trayFill([row('4/0', 1, undefined, 'PWR'), row('12', 1, undefined, 'CTRL')])
    const L = trayDiagramLayout(r, { widthIn: 12 })
    const pwr = L.cables.find(c => c.tag === 'PWR')
    const ctl = L.cables.find(c => c.tag === 'CTRL')
    expect(pwr.multiconductor).toBe(true)
    expect(pwr.internalGround).toBe(true)
    expect(ctl.multiconductor).toBe(true)
    expect(ctl.internalGround).toBe(false)
  })
  it('the standalone EGC is drawn as a single conductor', () => {
    const r = trayFill([row('4/0', 1)], { size: '1/0', odIn: 0.486 })
    const L = trayDiagramLayout(r, { widthIn: 9 })
    const g = L.cables.find(c => c.kind === 'egc')
    expect(g.multiconductor).toBe(false)
    expect(g.internalGround).toBe(false)
  })
})

describe('numbered callouts and key', () => {
  it('numbers by circuit row, not by physical cable', () => {
    const r = trayFill([row('4/0', 3, undefined, 'FDR')])
    const L = trayDiagramLayout(r, { widthIn: 9 })
    expect(L.cables.map(c => c.label)).toEqual(['1', '1', '1'])
    expect(L.keyRows).toHaveLength(1)
    expect(L.keyRows[0].text).toContain('3 runs')
  })
  it('key row carries tag, size, OD and construction', () => {
    const r = trayFill([row('500', 1, undefined, 'MCC-2')])
    const L = trayDiagramLayout(r, { widthIn: 9 })
    const t = L.keyRows[0].text
    expect(t).toContain('MCC-2')
    expect(t).toContain('500 kcmil')
    expect(t).toContain('3/C + gnd')
    // fill class is deliberately NOT repeated in the text - the bullet colour
    // carries it, and the row has to stay short enough to fit the canvas
    expect(t).not.toContain('4/0 or larger')
    expect(L.keyRows[0].kind).toBe('large')
  })
  it('gives the EGC its own key row labelled G', () => {
    const r = trayFill([row('4/0', 1)], { size: '250', odIn: 0.711 })
    const L = trayDiagramLayout(r, { widthIn: 9 })
    const g = L.keyRows.find(k => k.label === 'G')
    expect(g.text).toContain('single conductor')
  })
})

describe('layout envelope', () => {
  it('scales the tray to the requested width and grows the canvas with the key', () => {
    const one = trayDiagramLayout(trayFill([row('4/0', 1)]), { widthIn: 6 })
    const wide = trayDiagramLayout(trayFill([row('4/0', 1)]), { widthIn: 18 })
    expect(wide.inside.x1 - wide.inside.x0).toBeCloseTo(18 * SCALE, 6)
    expect(one.inside.x1 - one.inside.x0).toBeCloseTo(6 * SCALE, 6)
    expect(wide.svgW).toBeGreaterThan(one.svgW)
    const many = trayDiagramLayout(trayFill([row('4/0'), row('2/0'), row('12')]), { widthIn: 12 })
    expect(many.svgH).toBeGreaterThan(one.svgH)
  })
  it('defaults to the recommended minimum width', () => {
    const r = trayFill([row('500', 3)]) // needs 9 in
    expect(r.minWidth).toBe(9)
    expect(trayDiagramLayout(r).widthIn).toBe(9)
  })
  it('the rail wall is flush with the inside-width line, flanges run outboard', () => {
    const L = trayDiagramLayout(trayFill([row('4/0', 1)]), { widthIn: 9 })
    const [left, right] = L.rails
    // the vertical web face IS the inside-width line - everything references it
    expect(left.web.x + left.web.w).toBeCloseTo(L.inside.x0, 6)
    expect(right.web.x).toBeCloseTo(L.inside.x1, 6)
    expect(left.wallX).toBeCloseTo(L.inside.x0, 6)
    expect(right.wallX).toBeCloseTo(L.inside.x1, 6)
    // flanges do not intrude into the tray past that wall
    expect(left.topFlange.x + left.topFlange.w).toBeLessThanOrEqual(L.inside.x0 + 1e-6)
    expect(right.topFlange.x).toBeGreaterThanOrEqual(L.inside.x1 - 1e-6)
    // and they extend outward from it
    expect(left.topFlange.x).toBeLessThan(left.web.x)
    expect(right.topFlange.x + right.topFlange.w).toBeGreaterThan(right.web.x + right.web.w)
  })
  it('rung lands flush on both walls with no gap at either end', () => {
    const L = trayDiagramLayout(trayFill([row('4/0', 1)]), { widthIn: 9 })
    const [left, right] = L.rails
    expect(L.rung.x).toBeLessThanOrEqual(L.inside.x0)
    expect(L.rung.x + L.rung.w).toBeGreaterThanOrEqual(L.inside.x1)
    // ends bite into the webs, which are drawn after and cover the overlap
    expect(L.rung.x).toBeGreaterThanOrEqual(left.web.x)
    expect(L.rung.x + L.rung.w).toBeLessThanOrEqual(right.web.x + right.web.w)
  })
  it('cables bear on the same wall the width is dimensioned to', () => {
    const L = trayDiagramLayout(trayFill([row('4/0', 3)]), { widthIn: 9 })
    // first cable touches the left wall, which is the inside-width extension line
    expect(L.cables[0].cx - L.cables[0].r).toBeCloseTo(L.inside.x0, 6)
    expect(L.rails[0].wallX).toBeCloseTo(L.inside.x0, 6)
  })
  it('rung stays on the canvas at the smallest tray width', () => {
    const L = trayDiagramLayout(trayFill([row('4/0', 1)]), { widthIn: 6 })
    expect(L.rung.x).toBeGreaterThanOrEqual(0)
    expect(L.rung.x + L.rung.w).toBeLessThanOrEqual(L.svgW)
  })
  it('canvas contains the rails, the cables and the key text', () => {
    const r = trayFill([{ tag: 'A VERY LONG EQUIPMENT TAG NAME', size: '4/0', runs: 4, odIn: 1.499 }],
      { size: '250', odIn: 0.711 })
    const L = trayDiagramLayout(r, { widthIn: 9 })
    // right rail flange must be inside the canvas
    const right = L.rails[1]
    expect(right.topFlange.x + right.topFlange.w).toBeLessThanOrEqual(L.svgW)
    // left rail flange must not run off the left edge
    expect(L.rails[0].topFlange.x).toBeGreaterThanOrEqual(0)
    // the long key text must fit too - this is what drives svgW here
    const widest = Math.max(...L.keyRows.map(k => L.keyX + 22 + k.text.length * 5.6))
    expect(L.svgW).toBeGreaterThanOrEqual(widest)
    // and the last key row must sit inside the canvas height
    expect(L.keyTop + (L.keyRows.length - 1) * L.keyRowHeight).toBeLessThanOrEqual(L.svgH)
  })
  it('loading depth is measured above the rung, not swallowed by it', () => {
    const L = trayDiagramLayout(trayFill([{ tag: 'x', size: '4/0', runs: 1, odIn: 1.499 }]), { widthIn: 9 })
    // floor (rung top) to the dashed depth line is exactly depthIn
    expect((L.inside.floorY - L.inside.topY) / L.scale).toBeCloseTo(L.depthIn, 6)
    // and the rung plus bottom flange sit below that, inside the rail
    expect(L.rung.y).toBeCloseTo(L.inside.floorY, 6)
    expect(L.rung.y + L.rung.h).toBeLessThanOrEqual(L.inside.railBotY)
  })
  it('loading depth is a vertical dimension outside the left rail', () => {
    const L = trayDiagramLayout(trayFill([{ tag: 'x', size: '4/0', runs: 1, odIn: 1.499 }]), { widthIn: 9 })
    const D = L.dims.depth
    // outboard of the left flange, and on the canvas with room for rotated text
    expect(D.x).toBeLessThan(L.rails[0].topFlange.x)
    expect(D.x - 12).toBeGreaterThanOrEqual(0)
    // it spans the usable depth: rung top up to the top of the rails
    expect(D.yBot).toBeCloseTo(L.inside.floorY, 6)
    expect(D.yTop).toBeCloseTo(L.inside.topY, 6)
    expect((D.yBot - D.yTop) / L.scale).toBeCloseTo(L.depthIn, 6)
  })
  it('overflow text is carried on the layout and reserves room above the key', () => {
    const L = trayDiagramLayout(trayFill([{ tag: 'x', size: '500', runs: 6, odIn: 2.205 }]), { widthIn: 6 })
    expect(L.overflowText).toContain('exceeds a single layer')
    const noOv = trayDiagramLayout(trayFill([{ tag: 'x', size: '4/0', runs: 1, odIn: 1.499 }]), { widthIn: 9 })
    expect(noOv.overflowText).toBeNull()
    expect(L.keyTop - L.inside.railBotY).toBeGreaterThan(noOv.keyTop - noOv.inside.railBotY)
  })
  it('errors on an error result or empty cable list', () => {
    expect(trayDiagramLayout({ error: 'x' }).error).toBeTruthy()
    expect(trayDiagramLayout(null).error).toBeTruthy()
    expect(trayDiagramLayout({ cables: [] }).error).toBeTruthy()
  })
})

describe('area rule vs single layer', () => {
  it('warns when the area rule passes on a width that cannot hold one layer', () => {
    // Many small cables: area governs, but side-by-side needs far more width
    const r = trayFill([row('12', 30)])
    expect(r.caseId).toBe('B')
    expect(r.adequate).toBe(true)
    if (r.sumAllOd > r.minWidth) {
      expect(r.warnings.some(w => w.includes('single layer'))).toBe(true)
      expect(r.minWidthSingleLayer === null || r.minWidthSingleLayer > r.minWidth).toBe(true)
    }
  })
})
