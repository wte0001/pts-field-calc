import React, { useMemo, useState } from 'react'
import { conduitFill, CONDUIT_TYPES, INSULATION_TYPES, CONDUCTOR_SIZES } from '../calc/conduitFill.js'

let nextId = 1
const newRow = () => ({ id: nextId++, insulation: 'THHN/THWN-2', size: '12', qty: 3 })

export default function ConduitFillTool() {
  const [conduitType, setConduitType] = useState('EMT')
  const [rows, setRows] = useState([newRow()])

  const update = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const del = id => setRows(rs => rs.filter(r => r.id !== id))

  const result = useMemo(
    () => conduitFill(conduitType, rows.map(r => ({ ...r, qty: parseInt(r.qty, 10) || 0 }))),
    [conduitType, rows]
  )

  return (
    <div>
      <h2>Conduit Fill — NEC Ch. 9, Tables 1, 4, 5</h2>

      <label className="fld" htmlFor="c-type">Conduit type</label>
      <select id="c-type" value={conduitType} onChange={e => setConduitType(e.target.value)}>
        <option value="EMT">EMT</option>
        <option value="RMC">RMC (Rigid)</option>
        <option value="PVC40">PVC Schedule 40</option>
        <option value="PVC80">PVC Schedule 80</option>
        <option value="LFMC">LFMC (Liquidtight Flex)</option>
      </select>

      <h3>Conductors</h3>
      {rows.map(r => (
        <div className="rowcard" key={r.id}>
          <div className="rowgrid">
            <div className="full">
              <label className="fld">Insulation</label>
              <select value={r.insulation} onChange={e => update(r.id, { insulation: e.target.value })}>
                {INSULATION_TYPES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="fld">Size</label>
              <select value={r.size} onChange={e => update(r.id, { size: e.target.value })}>
                {CONDUCTOR_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="fld">Quantity</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={r.qty}
                onChange={e => update(r.id, { qty: e.target.value })} />
            </div>
          </div>
          {rows.length > 1 && (
            <button className="btn danger del" onClick={() => del(r.id)}>Delete row</button>
          )}
        </div>
      ))}
      <div className="btn-row">
        <button className="btn secondary" onClick={() => setRows(rs => [...rs, newRow()])}>+ Add conductor</button>
      </div>

      {result.error && <div className="err">{result.error}</div>}

      {!result.error && (
        <div className="card result">
          <div className="bigval">{result.minimum.tradeSize}<span className="unit"> in. {conduitType === 'PVC40' ? 'PVC Sch 40' : conduitType === 'PVC80' ? 'PVC Sch 80' : conduitType}</span></div>
          <table className="kv">
            <tbody>
              <tr><td>Total conductors</td><td>{result.totalCount} → fill limit {result.limitPercent}% (Ch. 9 Table 1)</td></tr>
              <tr><td>Total conductor area</td><td>{result.totalArea} sq in (Ch. 9 Table 5)</td></tr>
              <tr>
                <td>{result.minimum.tradeSize} in. conduit</td>
                <td>{result.minimum.internalArea} sq in internal (Ch. 9 Table 4) × {result.limitPercent}% = {result.minimum.allowableArea} sq in allowed → <b>{result.minimum.percentFill}% fill</b> <span className="ok-tag">OK</span></td>
              </tr>
              {result.nextUp && (
                <tr>
                  <td>Next size: {result.nextUp.tradeSize} in.</td>
                  <td>{result.nextUp.internalArea} sq in internal → {result.nextUp.percentFill}% fill</td>
                </tr>
              )}
            </tbody>
          </table>
          {result.warnings.map((w, i) => <div className="warn" key={i}>{w}</div>)}
          <div className="cite">Source: {result.tables}. {result.conduitLabel}. Jam ratio and pull tension not checked.</div>
        </div>
      )}
    </div>
  )
}
