import React, { useEffect, useMemo, useState } from 'react'
import {
  EQUIPMENT_TYPES, LV_XFMR_KVA_LIST, MV_XFMR_KVA_LIST, SECTION_WATTS, DATA_CAVEAT,
  lvXfmrTypicalLosses, mvXfmrTypicalLosses, itemHeat, heatTotal, heatRejectCsv, W_TO_BTUH
} from '../calc/heatReject.js'

const LS_KEY = 'pts-heat-items-v1'

let nextId = 1
const typeDefaults = type => {
  if (type === 'xfmr') {
    const t = lvXfmrTypicalLosses(75)
    return { kva: '75', noLoadW: String(t.noLoadW), loadLossW: String(t.loadLossW), loadPct: '80', sections: '', wPerSection: '', watts: '' }
  }
  if (type === 'unitsub') {
    const t = mvXfmrTypicalLosses(1500)
    return { kva: '1500', noLoadW: String(t.noLoadW), loadLossW: String(t.loadLossW), loadPct: '80', sections: '3', wPerSection: String(SECTION_WATTS.unitsubLv), watts: '' }
  }
  if (type === 'swbd') return { kva: '', noLoadW: '', loadLossW: '', loadPct: '80', sections: '4', wPerSection: String(SECTION_WATTS.swbd), watts: '' }
  if (type === 'mcc') return { kva: '', noLoadW: '', loadLossW: '', loadPct: '80', sections: '4', wPerSection: String(SECTION_WATTS.mcc), watts: '' }
  return { kva: '', noLoadW: '', loadLossW: '', loadPct: '', sections: '', wPerSection: '', watts: '' }
}
const newRow = (type = 'xfmr') => ({ id: nextId++, type, tag: '', ...typeDefaults(type) })

function loadRows() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return [newRow()]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [newRow()]
    return parsed.map(r => ({ ...r, id: nextId++ }))
  } catch { return [newRow()] }
}

const fmtW = x => Math.round(x).toLocaleString()

export default function HeatRejectTool() {
  const [rows, setRows] = useState(loadRows)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.map(({ id, ...r }) => r)))
    } catch { /* storage full or blocked - nonfatal */ }
  }, [rows])

  const update = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const del = id => setRows(rs => rs.filter(r => r.id !== id))
  const changeType = (id, type) => setRows(rs => rs.map(r => (r.id === id ? { ...r, type, ...typeDefaults(type) } : r)))
  const changeKva = (id, type, kva) => {
    const t = type === 'xfmr' ? lvXfmrTypicalLosses(parseFloat(kva)) : mvXfmrTypicalLosses(parseFloat(kva))
    update(id, { kva, noLoadW: t ? String(t.noLoadW) : '', loadLossW: t ? String(t.loadLossW) : '' })
  }
  const clearAll = () => {
    if (window.confirm('Clear the entire equipment list? This cannot be undone.')) {
      setRows([newRow()])
    }
  }

  const calcItems = useMemo(() => rows.map(r => ({
    type: r.type, tag: r.tag,
    noLoadW: parseFloat(r.noLoadW),
    loadLossW: parseFloat(r.loadLossW),
    loadPct: parseFloat(r.loadPct),
    sections: parseInt(r.sections, 10),
    wPerSection: parseFloat(r.wPerSection),
    watts: parseFloat(r.watts)
  })), [rows])

  const result = useMemo(() => heatTotal(calcItems), [calcItems])

  const exportCsv = () => {
    if (result.error) return
    const csv = heatRejectCsv(calcItems, result)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `heat-rejection-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2>Equipment Heat Rejection — HVAC Load Estimate</h2>
      <div className="warn">
        Estimating tool. Loss values below are typical prefilled defaults — every one is editable.
        Replace with manufacturer certified loss data for final HVAC design.
      </div>

      {/* Result panel - always visible, on top so it's seen while editing */}
      {result.error
        ? <div className="err">{result.error}</div>
        : (
          <div className="card result">
            <div className="bigval">{fmtW(result.btuh)}<span className="unit"> BTU/hr</span></div>
            <table className="kv">
              <tbody>
                <tr><td>Total heat</td><td><b>{fmtW(result.totalW)} W</b> ({result.totalKw.toFixed(2)} kW)</td></tr>
                <tr><td>Cooling load</td><td><b>{result.tons.toFixed(2)} tons</b> (BTU/hr ÷ 12,000)</td></tr>
                <tr><td>Items</td><td>{result.items.length} equipment item(s); W × 3.412 = BTU/hr</td></tr>
              </tbody>
            </table>
            {result.warnings.map((w, i) => <div className="warn" key={i}>⚠ {w}</div>)}
            <div className="cite">{DATA_CAVEAT}</div>
          </div>
        )}

      <h3>Equipment list</h3>
      {rows.map(r => {
        const isXfmr = r.type === 'xfmr' || r.type === 'unitsub'
        const isSections = r.type === 'swbd' || r.type === 'mcc' || r.type === 'unitsub'
        const kvaList = r.type === 'xfmr' ? LV_XFMR_KVA_LIST : MV_XFMR_KVA_LIST
        const typical = r.type === 'xfmr' ? lvXfmrTypicalLosses(parseFloat(r.kva))
          : r.type === 'unitsub' ? mvXfmrTypicalLosses(parseFloat(r.kva)) : null
        const overridden = typical && (
          Math.abs(parseFloat(r.noLoadW) - typical.noLoadW) > 0.5 ||
          Math.abs(parseFloat(r.loadLossW) - typical.loadLossW) > 0.5
        )
        const rowResult = itemHeat({
          type: r.type, noLoadW: parseFloat(r.noLoadW), loadLossW: parseFloat(r.loadLossW),
          loadPct: parseFloat(r.loadPct), sections: parseInt(r.sections, 10),
          wPerSection: parseFloat(r.wPerSection), watts: parseFloat(r.watts)
        })
        return (
          <div className="rowcard" key={r.id}>
            <div className="rowgrid">
              <div className="full">
                <label className="fld">Equipment tag</label>
                <input type="text" placeholder='e.g. "T-2A" or "MSB-1"' value={r.tag}
                  onChange={e => update(r.id, { tag: e.target.value })} />
              </div>
              <div className="full">
                <label className="fld">Equipment type</label>
                <select value={r.type} onChange={e => changeType(r.id, e.target.value)}>
                  {EQUIPMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              {isXfmr && (
                <>
                  <div>
                    <label className="fld">Rating (kVA)</label>
                    <select value={r.kva} onChange={e => changeKva(r.id, r.type, e.target.value)}>
                      {kvaList.map(k => <option key={k} value={String(k)}>{k} kVA</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="fld">Load (%)</label>
                    <input type="number" inputMode="decimal" min="0" max="150" value={r.loadPct}
                      onChange={e => update(r.id, { loadPct: e.target.value })} />
                  </div>
                  <div>
                    <label className="fld">No-load loss (W)</label>
                    <input type="number" inputMode="decimal" min="0" value={r.noLoadW}
                      onChange={e => update(r.id, { noLoadW: e.target.value })} />
                  </div>
                  <div>
                    <label className="fld">Winding loss at 100% (W)</label>
                    <input type="number" inputMode="decimal" min="0" value={r.loadLossW}
                      onChange={e => update(r.id, { loadLossW: e.target.value })} />
                  </div>
                </>
              )}

              {isSections && (
                <>
                  <div>
                    <label className="fld">{r.type === 'unitsub' ? 'LV sections' : 'Vertical sections'}</label>
                    <input type="number" inputMode="numeric" min="1" step="1" value={r.sections}
                      onChange={e => update(r.id, { sections: e.target.value })} />
                  </div>
                  <div>
                    <label className="fld">W per section (rated)</label>
                    <input type="number" inputMode="decimal" min="0" value={r.wPerSection}
                      onChange={e => update(r.id, { wPerSection: e.target.value })} />
                  </div>
                </>
              )}

              {!isXfmr && isSections && (
                <div>
                  <label className="fld">Load (%)</label>
                  <input type="number" inputMode="decimal" min="0" max="150" value={r.loadPct}
                    onChange={e => update(r.id, { loadPct: e.target.value })} />
                </div>
              )}

              {r.type === 'custom' && (
                <div className="full">
                  <label className="fld">Heat loss (W) — from manufacturer data</label>
                  <input type="number" inputMode="decimal" min="0" placeholder="e.g. 1250" value={r.watts}
                    onChange={e => update(r.id, { watts: e.target.value })} />
                </div>
              )}
            </div>

            {typical && !overridden && (
              <span className="note" style={{ background: '#e7eef6', color: '#27415f' }}>
                Typical losses prefilled{r.type === 'xfmr' ? ` (from DOE 2016 efficiency, ${typical.effPct}%)` : ' (typical MV dry-type)'} — verify with manufacturer data
              </span>
            )}
            {overridden && <span className="note">Losses overridden (typical: NL {typical.noLoadW} W, LL {typical.loadLossW} W)</span>}

            <div className="cite" style={{ marginTop: 6 }}>
              {rowResult.error
                ? rowResult.error
                : <>Contributes <b>{fmtW(rowResult.watts)} W</b> ({fmtW(rowResult.watts * W_TO_BTUH)} BTU/hr)</>}
            </div>
            {rows.length > 1 && <button className="btn danger del" onClick={() => del(r.id)}>Delete item</button>}
          </div>
        )
      })}

      <div className="btn-row">
        <button className="btn secondary" onClick={() => setRows(rs => [...rs, newRow()])}>+ Add equipment</button>
        <button className="btn" onClick={exportCsv} disabled={!!result.error}>Export CSV</button>
        <button className="btn danger" onClick={clearAll}>Clear all</button>
      </div>
    </div>
  )
}
