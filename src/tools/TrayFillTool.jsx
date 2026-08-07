import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  trayFill, trayFillCsv, traysCsv, defaultOd, CABLE_SIZES, CABLE_DATA, isLargeConductor,
  EGC_SIZES, EGC_INSULATIONS, egcOdFromTable5, CONTROL_SIZES, STANDARD_WIDTHS
} from '../calc/trayFill.js'
import * as P from '../calc/trayProject.js'
import TrayDiagram from './TrayDiagram.jsx'

const LS_PROJECT = 'pts-tray-project-v1'
// Pre-tabs keys. Read once to migrate, then left in place as a fallback copy.
const LS_LEGACY_ROWS = 'pts-tray-circuits-v1'
const LS_LEGACY_EGC = 'pts-tray-egc-v1'

// Numeric test rather than a hardcoded list so EGC sizes up to 1000 kcmil label right.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

function loadProject() {
  try {
    const raw = localStorage.getItem(LS_PROJECT)
    if (raw) {
      const p = P.deserialize(raw)
      if (p) return p
    }
    // First run after the tabs upgrade: fold the single saved tray into tab one.
    const legacyRows = localStorage.getItem(LS_LEGACY_ROWS)
    const legacyEgc = localStorage.getItem(LS_LEGACY_EGC)
    if (legacyRows || legacyEgc) {
      return P.migrateLegacy(
        legacyRows ? JSON.parse(legacyRows) : null,
        legacyEgc ? JSON.parse(legacyEgc) : null
      )
    }
  } catch { /* corrupt storage - fall through to a fresh project */ }
  return P.emptyProject()
}

const download = (text, mime, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const today = () => new Date().toISOString().slice(0, 10)
const calcRows = rows => rows.map(r => ({
  tag: r.tag, size: r.size, runs: parseInt(r.runs, 10), odIn: parseFloat(r.odIn)
}))
const calcEgcOf = egc => (egc.on ? { size: egc.size, odIn: parseFloat(egc.odIn) } : null)

export default function TrayFillTool() {
  const [project, setProject] = useState(loadProject)
  const [drawWidth, setDrawWidth] = useState(null) // null = recommended width
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(LS_PROJECT, P.serialize(project)) } catch { /* nonfatal */ }
  }, [project])

  useEffect(() => { if (renaming && nameRef.current) nameRef.current.select() }, [renaming])

  // Every tray is evaluated, not just the active one - the roll-up needs them all.
  const evaluated = useMemo(() => project.trays.map(t => ({
    tray: t,
    rows: calcRows(t.rows),
    result: trayFill(calcRows(t.rows), calcEgcOf(t.egc))
  })), [project.trays])

  const activeId = project.activeId
  const current = evaluated.find(e => e.tray.id === activeId) || evaluated[0]
  const tray = current.tray
  const result = current.result
  const egc = tray.egc

  const pick = id => { setProject(p => P.setActive(p, id)); setDrawWidth(null); setRenaming(false) }
  const commitName = () => { setProject(p => P.renameTray(p, tray.id, nameDraft)); setRenaming(false) }

  const addTray = () => { setProject(p => P.addTray(p)); setDrawWidth(null) }
  const duplicate = () => { setProject(p => P.duplicateTray(p, tray.id)); setDrawWidth(null) }
  const remove = () => {
    if (project.trays.length <= 1) return
    if (window.confirm(`Delete "${tray.name}" and its circuit list? This cannot be undone.`)) {
      setProject(p => P.deleteTray(p, tray.id))
      setDrawWidth(null)
    }
  }
  const clearAll = () => {
    if (window.confirm(`Clear the circuit list for "${tray.name}"? This cannot be undone.`)) {
      setProject(p => P.clearTray(p, tray.id))
    }
  }

  const exportCsv = () => {
    if (result.error) return
    download(trayFillCsv(current.rows, result, tray.name), 'text/csv;charset=utf-8;',
      `tray-fill-${tray.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${today()}.csv`)
  }
  const exportAllCsv = () => {
    download(traysCsv(evaluated.map(e => ({ name: e.tray.name, rows: e.rows, result: e.result }))),
      'text/csv;charset=utf-8;', `tray-fill-all-trays-${today()}.csv`)
  }

  return (
    <div>
      <h2>Cable Tray Fill — NEC 392.22(A)</h2>

      <div className="traystrip" role="tablist" aria-label="Tray designs">
        {project.trays.map(t => {
          const r = evaluated.find(e => e.tray.id === t.id).result
          return (
            <button key={t.id} role="tab" aria-selected={t.id === activeId}
              className={t.id === activeId ? 'on' : ''} onClick={() => pick(t.id)}>
              {t.name}
              <span className="w">{r.error || !r.adequate ? '—' : `${r.minWidth} in`}</span>
            </button>
          )
        })}
        <button className="add" onClick={addTray} disabled={P.isFull(project)}
          aria-label="Add tray" title={P.isFull(project) ? `Limit is ${P.MAX_TRAYS} trays` : 'Add tray'}>+</button>
      </div>
      <div className="traymeta">
        {project.trays.length} of {P.MAX_TRAYS} trays · saved on this phone
        {P.isFull(project) ? ' · limit reached' : ''}
      </div>

      {renaming ? (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <input ref={nameRef} type="text" value={nameDraft} maxLength={P.MAX_NAME_LEN}
            aria-label="Tray name" style={{ flex: '1 1 140px' }}
            onChange={e => setNameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setRenaming(false)
            }} />
          <button className="btn" onClick={commitName}>Save</button>
          <button className="btn secondary" onClick={() => setRenaming(false)}>Cancel</button>
        </div>
      ) : (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn secondary"
            onClick={() => { setNameDraft(tray.name); setRenaming(true) }}>Rename</button>
          <button className="btn secondary" onClick={duplicate} disabled={P.isFull(project)}>Duplicate</button>
          <button className="btn danger" onClick={remove} disabled={project.trays.length <= 1}>Delete tray</button>
        </div>
      )}

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
            <TrayDiagram result={result} widthIn={drawWidth || undefined} name={tray.name} />

            <table className="kv">
              <tbody>
                <tr><td>Tray</td><td><b>{tray.name}</b></td></tr>
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

      {project.trays.length > 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>All trays</h3>
          <table className="rollup">
            <thead>
              <tr><th>Tray</th><th>Cables</th><th>Case</th><th>Width</th><th>Status</th></tr>
            </thead>
            <tbody>
              {evaluated.map(e => (
                <tr key={e.tray.id} className={e.tray.id === activeId ? 'sel' : ''}
                  onClick={() => pick(e.tray.id)}>
                  <td>{e.tray.name}</td>
                  <td>{e.result.error ? '—' : e.result.cableCount}</td>
                  <td>{e.result.error ? '—' : e.result.caseId}</td>
                  <td>{e.result.error || !e.result.adequate ? '—' : `${e.result.minWidth} in`}</td>
                  <td>
                    {e.result.error
                      ? <span className="bad-tag">empty</span>
                      : e.result.adequate
                        ? <span className="ok-tag">OK</span>
                        : <span className="bad-tag">too narrow</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row">
            <button className="btn" onClick={exportAllCsv}>Export all trays (CSV)</button>
          </div>
          <div className="cite">Tap a row to open that tray.</div>
        </div>
      )}

      <h3>Standalone EGC in tray</h3>
      <div className="rowcard">
        <div className="seg" role="group" aria-label="Include standalone EGC">
          <button className={egc.on ? 'on' : ''}
            onClick={() => setProject(p => P.setEgc(p, tray.id, { on: true }))}>
            Include EGC in fill
          </button>
          <button className={!egc.on ? 'on' : ''}
            onClick={() => setProject(p => P.setEgc(p, tray.id, { on: false }))}>
            No standalone EGC
          </button>
        </div>

        {egc.on && (
          <>
            <div className="rowgrid" style={{ marginTop: 8 }}>
              <div>
                <label className="fld">EGC size</label>
                <select value={egc.size}
                  onChange={e => setProject(p => P.setEgcSize(p, tray.id, e.target.value, egc.insulation))}>
                  {EGC_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="fld">Insulation</label>
                <select value={egc.insulation}
                  onChange={e => setProject(p => P.setEgcSize(p, tray.id, egc.size, e.target.value))}>
                  {EGC_INSULATIONS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              </div>
              <div className="full">
                <label className="fld">
                  Conductor OD (in){egcOdFromTable5(egc.size, egc.insulation) === null ? ' — manual entry required' : ''}
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={egc.odIn}
                  placeholder="Enter OD from vendor data"
                  onChange={e => setProject(p => P.setEgc(p, tray.id, { odIn: e.target.value }))} />
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

      <h3>Circuit list — {tray.name}</h3>
      {tray.rows.map(r => {
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
                  onChange={e => setProject(p => P.updateRow(p, tray.id, r.id, { tag: e.target.value }))} />
              </div>
              <div>
                <label className="fld">Conductor size</label>
                <select value={r.size}
                  onChange={e => setProject(p => P.changeRowSize(p, tray.id, r.id, e.target.value))}>
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
                  onChange={e => setProject(p => P.updateRow(p, tray.id, r.id, { runs: e.target.value }))} />
              </div>
              <div className="full">
                <label className="fld">Cable OD (in){noCatalog ? ' — manual entry required' : ''}</label>
                <input type="number" inputMode="decimal" min="0" step="0.001" value={r.odIn}
                  placeholder={noCatalog ? 'Enter vendor OD' : ''}
                  onChange={e => setProject(p => P.updateRow(p, tray.id, r.id, { odIn: e.target.value }))} />
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
            {tray.rows.length > 1 && (
              <button className="btn danger del"
                onClick={() => setProject(p => P.deleteRow(p, tray.id, r.id))}>Delete circuit</button>
            )}
          </div>
        )
      })}

      <div className="btn-row">
        <button className="btn secondary" onClick={() => setProject(p => P.addRow(p, tray.id))}>+ Add circuit</button>
        <button className="btn" onClick={exportCsv} disabled={!!result.error}>Export this tray</button>
        <button className="btn danger" onClick={clearAll}>Clear this tray</button>
      </div>
    </div>
  )
}
