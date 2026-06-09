import React, { useEffect, useMemo, useState } from 'react'
import { trayFill, trayFillCsv, defaultOd, CABLE_SIZES, CABLE_DATA, isLargeConductor } from '../calc/trayFill.js'

const LS_KEY = 'pts-tray-circuits-v1'
const CONTROL_SIZES = ['14', '12', '10']
const KCMIL = ['250', '300', '350', '400', '500', '600', '750']
const sizeLabel = s => KCMIL.includes(s) ? `${s} kcmil` : `${s} AWG`

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

export default function TrayFillTool() {
  const [rows, setRows] = useState(loadRows)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.map(({ id, ...r }) => r)))
    } catch { /* storage full or blocked - nonfatal */ }
  }, [rows])

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

  const result = useMemo(() => trayFill(calcRows), [calcRows])

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
            <table className="kv">
              <tbody>
                <tr><td>Case</td><td><b>{result.caseId}</b> — {result.caseRule}</td></tr>
                <tr><td>Cables (runs expanded)</td><td>{result.cableCount} total: {result.largeCount} at 4/0 or larger, {result.smallCount} smaller than 4/0</td></tr>
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
