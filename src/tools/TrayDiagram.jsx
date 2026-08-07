import React, { useMemo, useRef } from 'react'
import { trayDiagramLayout, RUNG } from '../calc/trayDiagram.js'

// Literal colors, not CSS variables, so the exported SVG file renders standalone.
// Aluminum reads as a light metal with a hard edge - high contrast for sunlight.
const AL_FACE = '#dfe4e9'
const AL_SHADE = '#c3cad2'
const AL_EDGE = '#6d7885'
const INK = '#111418'
const MUTED = '#4a5765'
const KIND = {
  large: { fill: '#bcd6f2', edge: '#185fa5', core: '#185fa5' },
  small: { fill: '#d5d2f5', edge: '#534ab7', core: '#534ab7' },
  egc: { fill: '#c6dd9c', edge: '#3b6d11', core: '#3b6d11' }
}
const GND = '#4f8b12'

function Cable({ c }) {
  const k = KIND[c.kind]
  const dot = c.r * 0.24
  const off = c.r * 0.44
  const cores = [[0, -off], [-off * 0.87, off * 0.5], [off * 0.87, off * 0.5]]
  return (
    <g>
      <circle cx={c.cx} cy={c.cy} r={c.r} fill={k.fill} stroke={k.edge} strokeWidth="1.6" />
      {c.multiconductor ? (
        <>
          {cores.map(([dx, dy], i) => (
            <circle key={i} cx={c.cx + dx} cy={c.cy + dy} r={dot} fill={k.core} opacity="0.4" />
          ))}
          {c.internalGround && (
            <circle cx={c.cx} cy={c.cy + off * 0.12} r={c.r * 0.14} fill={GND} />
          )}
        </>
      ) : (
        <circle cx={c.cx} cy={c.cy} r={c.r * 0.42} fill={k.core} opacity="0.4" />
      )}
      {/* number inside when it fits, otherwise just above the cable - no leader
          lines, which would cross the rung and collide with the dimensions */}
      {c.r >= 11
        ? <text x={c.cx} y={c.cy + 4} fontSize="12" fill={INK} textAnchor="middle">{c.label}</text>
        : <text x={c.cx} y={c.cy - c.r - 5} fontSize="11" fill={INK} textAnchor="middle">{c.label}</text>}
    </g>
  )
}

function Dim({ x1, x2, y, text, color }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="1" />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke={color} strokeWidth="1" />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke={color} strokeWidth="1" />
      <text x={(x1 + x2) / 2} y={y - 7} fontSize="12" fill={color} textAnchor="middle">{text}</text>
    </g>
  )
}

/**
 * Head-on cross-section of the tray with the cables laid in a single layer.
 * @param {{result:object, widthIn?:number}} props result is a trayFill() output
 */
export default function TrayDiagram({ result, widthIn }) {
  const svgRef = useRef(null)
  const L = useMemo(() => trayDiagramLayout(result, { widthIn }), [result, widthIn])

  if (L.error) return null

  const { inside: I } = L
  const D = L.dims.depth

  const download = () => {
    const svg = svgRef.current
    if (!svg) return
    const text = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `tray-section-${L.widthIn}in-${new Date().toISOString().slice(0, 10)}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="traydiag">
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${L.svgW} ${L.svgH}`} width="100%" role="img"
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
        <title>{`Cable tray cross-section, ${L.widthIn} in. wide, ${L.cables.length} cables in a single layer`}</title>
        <desc>
          Head-on section of an aluminum ladder tray drawn to scale from the circuit list.
          Rail and rung proportions are illustrative; inside width and cable diameters are to scale.
        </desc>

        {/* rung: cables rest on its top face */}
        <rect x={L.rung.x} y={L.rung.y} width={L.rung.w} height={L.rung.h}
          fill={AL_FACE} stroke={AL_EDGE} strokeWidth="1.4" />
        <rect x={L.rung.x} y={L.rung.y} width={L.rung.w} height={L.rung.lip}
          fill={AL_SHADE} stroke="none" />
        <rect x={L.rung.x} y={L.rung.y + L.rung.h - L.rung.lip} width={L.rung.w} height={L.rung.lip}
          fill={AL_SHADE} stroke="none" />

        {/* cables, single layer */}
        {L.cables.map((c, i) => <Cable key={i} c={c} />)}

        {/* side rails drawn last so cables tuck behind the flanges */}
        {L.rails.map(r => (
          <g key={r.side}>
            <rect x={r.web.x} y={r.web.y} width={r.web.w} height={r.web.h}
              fill={AL_SHADE} stroke={AL_EDGE} strokeWidth="1.4" />
            <rect x={r.topFlange.x} y={r.topFlange.y} width={r.topFlange.w} height={r.topFlange.h}
              fill={AL_FACE} stroke={AL_EDGE} strokeWidth="1.4" />
            <rect x={r.botFlange.x} y={r.botFlange.y} width={r.botFlange.w} height={r.botFlange.h}
              fill={AL_FACE} stroke={AL_EDGE} strokeWidth="1.4" />
          </g>
        ))}

        {/* loading depth: vertical dimension outside the left rail, rung top to rail top */}
        <g>
          <line x1={D.x} y1={D.yTop} x2={D.x} y2={D.yBot} stroke={MUTED} strokeWidth="1" />
          <line x1={D.x - 4} y1={D.yTop} x2={D.x + 4} y2={D.yTop} stroke={MUTED} strokeWidth="1" />
          <line x1={D.x - 4} y1={D.yBot} x2={D.x + 4} y2={D.yBot} stroke={MUTED} strokeWidth="1" />
          <line x1={D.x} y1={D.yTop} x2={D.extendFromX} y2={D.yTop}
            stroke={MUTED} strokeWidth="0.6" strokeDasharray="3 3" />
          <line x1={D.x} y1={D.yBot} x2={I.x0} y2={D.yBot}
            stroke={MUTED} strokeWidth="0.6" strokeDasharray="3 3" />
          <text x={D.x - 5} y={D.textY} fontSize="11" fill={MUTED} textAnchor="middle"
            transform={`rotate(-90 ${D.x - 5} ${D.textY})`}>
            {`${L.depthIn} in. loading depth`}
          </text>
        </g>

        <Dim x1={I.x0} x2={I.x1} y={L.dims.widthY} text={`inside width ${L.widthIn} in.`} color={MUTED} />
        <Dim x1={I.x0} x2={I.x0 + L.usedWidthPx} y={L.dims.usedY}
          text={`cables ${L.sumAllOdIn} in.`} color={KIND.large.edge} />

        {L.overflowText && (
          <text x={L.keyX} y={L.keyTop - 12} fontSize="12" fill="#a31515">{L.overflowText}</text>
        )}

        {L.keyRows.map((k, i) => {
          const y = L.keyTop + i * L.keyRowHeight
          return (
            <g key={k.label}>
              <circle cx={L.keyX + 6} cy={y - 4} r="6"
                fill={KIND[k.kind].fill} stroke={KIND[k.kind].edge} strokeWidth="1.2" />
              <text x={L.keyX + 6} y={y - 1} fontSize="9" fill={INK} textAnchor="middle">{k.label}</text>
              <text x={L.keyX + 18} y={y} fontSize="11.5" fill={MUTED}>{k.text}</text>
            </g>
          )
        })}
      </svg>

      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="btn secondary" onClick={download}>Export drawing (SVG)</button>
      </div>
      <div className="cite">
        Single layer only — 392.22(A)(1)(a) and (c) require 4/0-and-larger cables in one layer, and this
        app does not depict stacking (it traps heat and changes the tray ampacity basis, 392.80(A)).
        Inside width and cable ODs are to scale; <b>rail and rung proportions are illustrative</b> of an
        aluminum NEMA VE 1 ladder tray and are not certified manufacturer dimensions. Fill is governed by
        width and area, never by the drawn rail shape.
      </div>
    </div>
  )
}
