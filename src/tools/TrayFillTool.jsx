import React, { useEffect, useMemo, useState } from 'react'
import {
  trayFill, trayFillCsv, defaultOd, CABLE_SIZES, CABLE_DATA, isLargeConductor,
  EGC_SIZES, EGC_INSULATIONS, egcOdFromTable5, CONTROL_SIZES, STANDARD_WIDTHS
} from '../calc/trayFill.js'
import TrayDiagram from './TrayDiagram.jsx'

const LS_KEY = 'pts-tray-circuits-v1'
const LS_EGC_KEY = 'pts-tray-egc-v1'
// Numeric test rather than a hardcoded list so EGC sizes up to 1000 kcmil label right.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

let nextId = 1
const newRow = (size = '4/0') => ({
  id: nextId++, tag: '', size, runs: '1',
  odIn: defaultOd(size) !== null ? String(defaultOd(size)) : ''
})

function loadRows() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return [newRow()]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [newRow()]
    return parsed.map(r => ({ ...r, id: nextId++ }))
  } catch { return [newRow()] }
}

const DEFAULT_EGC_INS = EGC_INSULATIONS[0].id
const newEgc = (size = '1/0', insulation = DEFAULT_EGC_INS) => {
  const od = egcOdFromTable5(size, insulation)
  return { on: false, size, insulation, odIn: od !== null ? String(od) : '' }
}

function loadEgc() {
  try {
    const raw = localStorage.getItem(LS_EGC_KEY)
    if (!raw) return newEgc()
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? { ...newEgc(), ...parsed } : newEgc()
  } catch { return newEgc() }
}

export default function TrayFillTool() {
  const [rows, setRows] = useState(loadRows)
  const [egc, setEgc] = useState(loadEgc)
  const [drawWidth, setDrawWidth] = useState(null) // null = recommended width

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.map(({ id, ...r }) => r)))
    } catch { /* storage full or blocked - nonfatal */ }
  }, [rows])

  useEffect(() => {
    try {
      localStorage.setItem(LS_EGC_KEY, JSON.stringify(egc))
    } catch { /* storage full or blocked - nonfatal */ }
  }, [egc])

  const changeEgcSize = (size, insulation = egc.insulation) => {
    const od = egcOdFromTable5(size, insulation)
    setEgc(e => ({ ...e, size, insulation, odIn: od !== null ? String(od) : '' }))
  }

  const update = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const del = id => setRows(rs => rs.filter(r => r.id !== id))
  const changeSize = (id, size) => {
    const od = defaultOd(size)
    update(id, { size, odIn: od !== null ? String(od) : '' })
  }
  const clearAll = () => {
    if (window.confirm('Clear the entire circuit list? This cannot be undone.')) {
      setRows([newRow()])
    }
  }

  const calcRows = useMemo(() => rows.map(r => ({
    tag: r.tag, size: r.size,
    runs: parseInt(r.runs, 10),
    odIn: parseFloat(r.odIn)
  })), [rows])

  const calcEgc = useMemo(
    () => (egc.on ? { size: egc.size, odIn: parseFloat(egc.odIn) } : null),
    [egc]
  )

  const result = useMemo(() => trayFill(calcRows, calcEgc), [calcRows, calcEgc])

  const exportCsv = () => {
    if (result.error) return
    const csv = trayFillCsv(calcRows, result)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tray-fill-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2>Cable Tray Fill — NEC 392.22(A)</h2>
      <div className="cite" style={{ marginBottom: 10 }}>
        Aluminum ladder tray, 6 in. loading depth, NEMA VE 1 Class 20C (labels only — fill is governed by width).
        Cables: multiconductor Type TC-ER, 3/C + ground, Cu, 600V.
      </div>
      <div className="note" style={{ background: '#e7eef6', color: '#27415f', marginBottom: 10 }}>
        Grounding for parallel cables in one tray: per 250.122(F), a single standalone EGC in the tray
        (sized on the overcurrent device, bonded to the cables' own grounds) is permitted for the group —
        each parallel cable does not need its own full-size EGC. Size it on the Wire tab.
      </div>

      {/* Result panel - always visible, on top so it's seen while editing */}
      {result.error
        ? <div className="err">{result.error}</div>
        : (
          <div className="card result">
            {result.adequate ? (
              <div className="bigval">{result.minWidth}<span className="unit"> in. tray width</span></div>
            ) : (
              <div className="bigval bad-tag" style={{ fontSize: 24 }}>{result.inadequateMessage}</div>
            )}
            <div className="seg" role="group" aria-label="Tray width to draw"
              style={{ margin: '10px 0 6px' }}>
              <button className={drawWidth === null ? 'on' : ''} onClick={() => setDrawWidth(null)}>
                {result.adequate ? `${result.minWidth} in. min` : 'Widest'}
              </button>
              {STANDARD_WIDTHS.filter(w => w !== (result.adequate ? result.minWidth : null)).map(w => (
                <button key={w} className={drawWidth === w ? 'on' : ''} onClick={() => setDrawWidth(w)}>{w}</button>
              ))}
            </div>
            <TrayDiagram result={result} widthIn={drawWidth || undefined} />

            <table className="kv">
              <tbody>
                <tr><td>Case</td><td><b>{result.caseId}</b> — {result.caseRule}</td></tr>
                <tr>
                  <td>Single layer</td>
                  <td>
                    Σ OD of all cables {result.sumAllOd} in.
                    {result.minWidthSingleLayer
                      ? ` — fits one layer at ${result.minWidthSingleLayer} in. and wider`
                      : ' — no standard width fits a single layer'}
                  </td>
                </tr>
                <tr><td>Cables (runs expanded)</td><td>{result.cableCount} total{result.egc ? ' (incl. standalone EGC)' : ''}: {result.largeCount} at 4/0 or larger, {result.smallCount} smaller than 4/0</td></tr>
                {result.egc && (
                  <tr>
                    <td>Standalone EGC <em>(250.122(F))</em></td>
                    <td>{result.egc.size} at {result.egc.odIn} in OD, {result.egc.areaSqIn} sq in — counted as {result.egc.large ? '4/0 or larger' : 'smaller than 4/0'}</td>
                  </tr>
                )}
                {result.caseId !== 'B' && <tr><td>Sd (Σ OD, ≥4/0)</td><td>{result.Sd} in</td></tr>}
                {result.caseId !== 'A' && <tr><td>Σ area, &lt;4/0</td><td>{result.Asmall} sq in</td></tr>}
                {result.adequate && (
                  <>
                    <tr>
                      <td>At {result.selected.width} in.</td>
                      <td>allowable {result.selected.allowable} {result.caseId === 'A' ? 'in' : 'sq in'}, used {result.selected.used} → <b>{result.selected.utilizationPct}%</b> <span className="ok-tag">OK</span></td>
                    </tr>
                    {result.nextUp && (
                      <tr>
                        <td>At {result.nextUp.width} in.</td>
                        <td>allowable {result.nextUp.allowable} {result.caseId === 'A' ? 'in' : 'sq in'} → {result.nextUp.utilizationPct}%</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>

            <table className="widthtable">
              <thead>
                <tr><th>Width</th><th>Col. 1</th><th>Allowable</th><th>Used</th><th>OK?</th></tr>
              </thead>
              <tbody>
                {result.widths.map(w => (
                  <tr key={w.width} className={result.adequate && w.width === result.minWidth ? 'sel' : ''}>
                    <td>{w.width} in</td>
                    <td>{w.column1}</td>
                    <td>{w.allowable}</td>
                    <td>{w.used}</td>
                    <td>{w.ok ? <span className="ok-tag">✓</span> : <span className="bad-tag">✗</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.warnings.map((w, i) => <div className="warn" key={i}>⚠ {w}</div>)}
            <div className="cite">Source: {result.rule}. Column 2 computed as Column 1 − 1.2 × Sd per table note.</div>
          </div>
        )}

      <h3>Standalone EGC in tray</h3>
      <div className="rowcard">
        <div className="seg" role="group" aria-label="Include standalone EGC">
          <button className={egc.on ? 'on' : ''} onClick={() => setEgc(e => ({ ...e, on: true }))}>
            Include EGC in fill
          </button>
          <button className={!egc.on ? 'on' : ''} onClick={() => setEgc(e => ({ ...e, on: false }))}>
            No standalone EGC
          </button>
        </div>

        {egc.on && (
          <>
            <div className="rowgrid" style={{ marginTop: 8 }}>
              <div>
                <label className="fld">EGC size</label>
                <select value={egc.size} onChange={e => changeEgcSize(e.target.value)}>
                  {EGC_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="fld">Insulation</label>
                <select value={egc.insulation} onChange={e => changeEgcSize(egc.size, e.target.value)}>
                  {EGC_INSULATIONS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              </div>
              <div className="full">
                <label className="fld">
                  Conductor OD (in){egcOdFromTable5(egc.size, egc.insulation) === null ? ' — manual entry required' : ''}
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={egc.odIn}
                  placeholder="Enter OD from vendor data"
                  onChange={e => setEgc(x => ({ ...x, odIn: e.target.value }))} />
              </div>
            </div>
            {egcOdFromTable5(egc.size, egc.insulation) === null
              ? <span className="note">Table 5 area for this size/insulation is unverified in this app — enter the OD manually.</span>
              : <span className="note" style={{ background: '#e7eef6', color: '#27415f' }}>
                  OD derived from the Chapter 9 Table 5 approximate area (OD = √(4·area/π))
                </span>}
          </>
        )}
        <div className="cite" style={{ marginTop: 6 }}>
          Size the EGC on the Wire tab (Table 250.122, keyed to the overcurrent device). Leave this off if
          the tray itself serves as the EGC per 392.60, or if each cable carries its own full-size ground.
        </div>
      </div>

      <h3>Circuit list</h3>
      {rows.map(r => {
        const cat = CABLE_DATA[r.size]
        const isControl = CONTROL_SIZES.includes(r.size)
        const noCatalog = defaultOd(r.size) === null
        const odNum = parseFloat(r.odIn)
        const overridden = !noCatalog && Number.isFinite(odNum) && Math.abs(odNum - defaultOd(r.size)) > 1e-9
        return (
          <div className="rowcard" key={r.id}>
            <div className="rowgrid">
              <div className="full">
                <label className="fld">Equipment tag</label>
                <input type="text" placeholder='e.g. "PDP-3 FEEDER"' value={r.tag}
                  onChange={e => update(r.id, { tag: e.target.value })} />
              </div>
              <div>
                <label className="fld">Conductor size</label>
                <select value={r.size} onChange={e => changeSize(r.id, e.target.value)}>
                  {CABLE_SIZES.map(s => (
                    <option key={s} value={s}>
                      {sizeLabel(s)}{defaultOd(s) === null ? ' (manual OD)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fld">Parallel runs</label>
                <input type="number" inputMode="numeric" min="1" step="1" value={r.runs}
                  onChange={e => update(r.id, { runs: e.target.value })} />
              </div>
              <div className="full">
                <label className="fld">Cable OD (in){noCatalog ? ' — manual entry required' : ''}</label>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={r.odIn}
                  placeholder={noCatalog ? 'Enter vendor OD' : ''}
                  onChange={e => update(r.id, { odIn: e.target.value })} />
              </div>
            </div>
            {isControl && <span className="note">Control-cable construction (3/C, no ground) — {cat.spec}</span>}
            {noCatalog && <span className="note">Not in Southwire standard 3/C line — manual OD from vendor data</span>}
            {overridden && <span className="note">OD overridden (catalog: {defaultOd(r.size)} in)</span>}
            {!noCatalog && !overridden && cat && <span className="note" style={{ background: '#e7eef6', color: '#27415f' }}>{cat.spec} nominal OD — verify against current spec sheet</span>}
            <div className="cite" style={{ marginTop: 6 }}>
              Class: {isLargeConductor(r.size) ? '4/0 or larger' : 'smaller than 4/0'}
              {Number.isFinite(odNum) && parseInt(r.runs, 10) >= 1
                ? ` · contributes ${parseInt(r.runs, 10)} cable(s)`
                : ''}
            </div>
            {rows.length > 1 && <button className="btn danger del" onClick={() => del(r.id)}>Delete circuit</button>}
          </div>
        )
      })}

      <div className="btn-row">
        <button className="btn secondary" onClick={() => setRows(rs => [...rs, newRow()])}>+ Add circuit</button>
        <button className="btn" onClick={exportCsv} disabled={!!result.error}>Export CSV</button>
        <button className="btn danger" onClick={clearAll}>Clear all</button>
      </div>
    </div>
  )
}
