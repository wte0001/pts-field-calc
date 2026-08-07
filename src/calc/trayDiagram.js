// Geometry for the head-on cable tray cross-section drawing. Pure functions only;
// the React component only turns this output into SVG elements.
//
// SINGLE LAYER ONLY, by design. Cables are laid side by side on the rung and never
// stacked: 392.22(A)(1)(a) and (c) require 4/0-and-larger cables in a single layer,
// and stacking smaller cables traps heat and changes the ampacity basis for cables
// in tray (392.80(A)). When the cables exceed the tray width the drawing reports an
// overflow instead of starting a second layer.
//
// Rail and rung PROPORTIONS ARE ILLUSTRATIVE - drawn to look like an aluminum
// NEMA VE 1 ladder tray (I-beam side rails, rung between them), not to certified
// manufacturer dimensions. Only the inside width and the cable ODs are to scale,
// and only those govern fill.

export const SCALE = 26 // px per inch

// Illustrative aluminum ladder-tray section, inches.
export const RAIL = { flangeIn: 1.35, flangeThickIn: 0.28, webThickIn: 0.22 }
export const RUNG = { heightIn: 0.85, lipIn: 0.18 }

const PAD_T = 24
const PAD_L = 68 // room outside the left rail for the vertical depth dimension
const DIM_BLOCK = 74 // space under the tray for the two dimension lines
const KEY_ROW = 15
const KEY_GAP = 10
const KEY_X = 8 // key sits at the canvas edge, not the tray edge
const CHAR_PX = 5.6 // 11.5px text width estimate, for sizing the canvas

const r3 = v => Math.round(v * 1000) / 1000

/** Cable fill category, which is also how the code classifies it. */
export function cableKind(c) {
  if (c.isEgc) return 'egc'
  return c.large ? 'large' : 'small'
}

/**
 * Lay the cables out in one layer inside a tray of the given width.
 * @param {object} result a non-error trayFill() result
 * @param {{widthIn?:number, depthIn?:number, scale?:number}} [opts]
 *   widthIn defaults to the recommended minimum width.
 * @returns layout object, or {error}
 */
export function trayDiagramLayout(result, opts = {}) {
  if (!result || result.error) return { error: 'No valid tray result to draw.' }
  const cables = result.cables || []
  if (cables.length === 0) return { error: 'No cables to draw.' }

  const S = opts.scale || SCALE
  const depthIn = opts.depthIn || 6
  const widthIn = opts.widthIn || result.minWidth || result.widths[result.widths.length - 1].width

  const x0 = PAD_L
  const x1 = x0 + widthIn * S
  const topY = PAD_T
  const ft = RAIL.flangeThickIn * S
  // Rail is tall enough that the USABLE depth above the rung equals depthIn, so the
  // "loading depth" dimension means what it says instead of being eaten by the rung.
  const railBotY = topY + (depthIn + RAIL.flangeThickIn + RUNG.heightIn) * S
  const rungTopY = railBotY - ft - RUNG.heightIn * S
  const floorY = rungTopY // cables rest here

  // Side rails: the vertical web face is FLUSH with the inside-width line and the
  // flanges run outboard from it, so the inside of the tray is a flat wall. The
  // cables bear on that wall, the rung lands flush on it, and the inside-width and
  // cable dimensions line up with it - all three referenced to the same face.
  const fw = RAIL.flangeIn * S
  const wt = RAIL.webThickIn * S
  const rail = side => {
    const inner = side === 'left' ? x0 : x1
    const out = side === 'left' ? -1 : 1
    const fx = side === 'left' ? inner - fw : inner
    const wx = side === 'left' ? inner - wt : inner
    return {
      side,
      wallX: r3(inner), // the face everything is dimensioned to
      outward: out,
      topFlange: { x: r3(fx), y: r3(topY), w: r3(fw), h: r3(ft) },
      botFlange: { x: r3(fx), y: r3(railBotY - ft), w: r3(fw), h: r3(ft) },
      web: { x: r3(wx), y: r3(topY), w: r3(wt), h: r3(railBotY - topY) }
    }
  }

  // The rung is welded to the inner wall of each rail and lands flush on it - no gap
  // at either end. Ends run a hair into the web so antialiasing cannot open a
  // hairline at the joint; the webs are drawn after the rung and cover the overlap.
  const bite = Math.min(1.5, wt / 2)
  const rung = {
    x: r3(x0 - bite), y: r3(rungTopY), w: r3(x1 - x0 + 2 * bite), h: r3(RUNG.heightIn * S),
    lip: r3(RUNG.lipIn * S)
  }

  // Single layer, left to right, in circuit-list order with the EGC last.
  const ordered = [...cables].sort((a, b) => (a.isEgc ? 1 : 0) - (b.isEgc ? 1 : 0))
  const laid = []
  let overflow = []
  let cur = x0
  for (const c of ordered) {
    const d = c.odIn * S
    if (cur + d <= x1 + 1e-6) {
      laid.push({
        cx: r3(cur + d / 2),
        cy: r3(floorY - d / 2),
        r: r3(d / 2),
        odIn: c.odIn,
        size: c.size,
        tag: c.tag,
        kind: cableKind(c),
        control: !!c.control,
        multiconductor: !c.isEgc,
        // Multiconductor rows carry their own internal ground; control cable
        // construction (3/C, no ground) does not.
        internalGround: !c.isEgc && !c.control,
        label: c.isEgc ? 'G' : String(c.rowIndex)
      })
      cur += d
    } else {
      overflow.push(c)
    }
  }

  // Key rows, one per circuit row plus the EGC - not one per physical cable.
  const keyRows = []
  const seen = new Set()
  for (const c of ordered) {
    const k = c.isEgc ? 'G' : String(c.rowIndex)
    if (seen.has(k)) continue
    seen.add(k)
    const count = ordered.filter(x => (x.isEgc ? 'G' : String(x.rowIndex)) === k).length
    keyRows.push({
      label: k,
      // Class is omitted here - the bullet colour already encodes it.
      text: `${c.tag ? c.tag + ' · ' : ''}${sizeText(c.size)}` +
        `${count > 1 ? ` · ${count} runs` : ''} · ${c.odIn} in OD` +
        `${c.isEgc ? ' · single conductor' : c.control ? ' · 3/C control' : ' · 3/C + gnd'}`,
      kind: cableKind(c)
    })
  }

  const overflowText = overflow.length > 0
    ? `+${overflow.length} more cable(s) not shown — exceeds a single layer at ${widthIn} in.`
    : null
  const keyTop = railBotY + DIM_BLOCK + KEY_GAP + (overflowText ? 16 : 0)
  // Canvas must clear the widest thing on it: the tray with both rail flanges, or a
  // key/overflow line of text.
  const textW = [...keyRows.map(k => KEY_X + 22 + k.text.length * CHAR_PX),
    ...(overflowText ? [KEY_X + overflowText.length * CHAR_PX] : [])]
  const svgW = Math.ceil(Math.max(x1 + fw + 16, ...textW, 260))
  const svgH = Math.ceil(keyTop + keyRows.length * KEY_ROW + 12)

  return {
    scale: S,
    widthIn,
    depthIn,
    svgW,
    svgH,
    inside: { x0: r3(x0), x1: r3(x1), topY: r3(topY), railBotY: r3(railBotY), floorY: r3(floorY) },
    rails: [rail('left'), rail('right')],
    rung,
    cables: laid,
    overflowCount: overflow.length,
    overflowText,
    sumAllOdIn: result.sumAllOd,
    singleLayerFits: overflow.length === 0,
    usedWidthPx: r3(cur - x0),
    dims: {
      widthY: r3(railBotY + 30),
      usedY: r3(railBotY + 60),
      // Loading depth as a proper vertical dimension OUTSIDE the left rail, measured
      // from the rung top (where cables bear) up to the top of the rails.
      depth: {
        x: r3(x0 - fw - 16),
        yTop: r3(topY),
        yBot: r3(floorY),
        extendFromX: r3(x0 - fw),
        textY: r3((topY + floorY) / 2)
      }
    },
    keyX: KEY_X,
    keyTop: r3(keyTop),
    keyRowHeight: KEY_ROW,
    keyRows
  }
}

const KCMIL = n => /^\d+$/.test(n) && parseInt(n, 10) >= 250
function sizeText(s) { return KCMIL(String(s)) ? `${s} kcmil` : `${s} AWG` }
