import React, { useMemo, useState } from 'react'
import {
  conduitFillSets, INSULATION_TYPES, CONDUCTOR_SIZES, ROLES, MAX_SETS
} from '../calc/conduitFill.js'

const TYPE_LABEL = {
  EMT: 'EMT', RMC: 'RMC', PVC40: 'PVC Sch 40', PVC80: 'PVC Sch 80', LFMC: 'LFMC'
}
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

let nextId = 1
const newRow = (role = 'phase', size = '12', qty = 3) =>
  ({ id: nextId++, insulation: 'THHN/THWN-2', size, qty, role })

export default function ConduitFillTool() {
  const [conduitType, setConduitType] = useState('EMT')
  const [rows, setRows] = useState([newRow()])
  const [sets, setSets] = useState('1')
  const [arrangement, setArrangement] = useState('perSet')
  const [neutralCounts, setNeutralCounts] = useState(false)
  const [material, setMaterial] = useState('copper')
  const [tempRating, setTempRating] = useState(75)

  const update = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const del = id => setRows(rs => rs.filter(r => r.id !== id))

  const setCount = Math.max(1, Math.min(parseInt(sets, 10) || 1, MAX_SETS))
  const multi = setCount > 1
  const hasNeutral = rows.some(r => r.role === 'neutral')

  const res = useMemo(() => conduitFillSets(
    conduitType,
    rows.map(r => ({ ...r, qty: parseInt(r.qty, 10) || 0 })),
    { sets: setCount, neutralCounts, material, tempRating }
  ), [conduitType, rows, setCount, neutralCounts, material, tempRating])

  const shown = res.error ? null : res.arrangements[multi ? arrangement : 'single']
  const fill = shown && shown.fill
  const amp = res.ampacity
  const bothOk = !res.error &&
    !res.arrangements.perSet.fill.error && !res.arrangements.single.fill.error

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

      <label className="fld" htmlFor="c-sets">Parallel sets</label>
      <input id="c-sets" type="number" inputMode="numeric" min="1" max={MAX_SETS} step="1"
        value={sets} onChange={e => setSets(e.target.value)} />
      <div className="cite" style={{ marginTop: 4 }}>
        Enter the conductors for <b>one set</b> below — the set count multiplies them.
      </div>

      {multi && (
        <>
          <label className="fld">Arrangement</label>
          <div className="seg" role="group" aria-label="Arrangement">
            <button className={arrangement === 'perSet' ? 'on' : ''}
              onClick={() => setArrangement('perSet')}>One conduit per set</button>
            <button className={arrangement === 'single' ? 'on' : ''}
              onClick={() => setArrangement('single')}>All sets in one</button>
          </div>
        </>
      )}

      <h3>Conductors {multi ? '(per set)' : ''}</h3>
      {rows.map(r => (
        <div className="rowcard" key={r.id}>
          <div className="rowgrid">
            <div>
              <label className="fld">Role</label>
              <select value={r.role} onChange={e => update(r.id, { role: e.target.value })}>
                {ROLES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className="fld">{multi ? 'Qty per set' : 'Quantity'}</label>
              <input type="number" inputMode="numeric" min="1" step="1" value={r.qty}
                onChange={e => update(r.id, { qty: e.target.value })} />
            </div>
            <div className="full">
              <label className="fld">Insulation</label>
              <select value={r.insulation} onChange={e => update(r.id, { insulation: e.target.value })}>
                {INSULATION_TYPES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="full">
              <label className="fld">Size</label>
              <select value={r.size} onChange={e => update(r.id, { size: e.target.value })}>
                {CONDUCTOR_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
              </select>
            </div>
          </div>
          {r.role === 'ground' && (
            <span className="note" style={{ background: '#e7eef6', color: '#27415f' }}>
              Counts toward fill, never toward the current-carrying count. Size it on the Wire tab
              (Table 250.122, keyed to the overcurrent device).
            </span>
          )}
          {rows.length > 1 && (
            <button className="btn danger del" onClick={() => del(r.id)}>Delete row</button>
          )}
        </div>
      ))}
      <div className="btn-row">
        <button className="btn secondary" onClick={() => setRows(rs => [...rs, newRow()])}>+ Add conductor</button>
        <button className="btn secondary" onClick={() => setRows(rs => [...rs, newRow('ground', '6', 1)])}>+ Add ground</button>
      </div>

      {hasNeutral && (
        <>
          <label className="fld">Neutral carries harmonic current? — 310.15(E)</label>
          <div className="seg" role="group" aria-label="Neutral counts as current-carrying">
            <button className={!neutralCounts ? 'on' : ''} onClick={() => setNeutralCounts(false)}>
              No — balanced
            </button>
            <button className={neutralCounts ? 'on' : ''} onClick={() => setNeutralCounts(true)}>
              Yes — nonlinear
            </button>
          </div>
          <div className="cite" style={{ marginTop: 4 }}>
            A neutral always counts toward fill. It counts as a current-carrying conductor only where it
            carries harmonic current from nonlinear loads (VFDs, LED drivers, switch-mode supplies).
          </div>
        </>
      )}

      {res.error && <div className="err">{res.error}</div>}
      {fill && fill.error && <div className="err">{fill.error}</div>}

      {fill && !fill.error && (
        <div className="card result">
          <div className="bigval">
            {shown.conduits > 1 ? `${shown.conduits} × ` : ''}{fill.minimum.tradeSize}
            <span className="unit"> in. {TYPE_LABEL[conduitType]}</span>
          </div>
          <table className="kv">
            <tbody>
              <tr>
                <td>Each conduit holds</td>
                <td>
                  {shown.contents.map(c => `${c.qty} × ${sizeLabel(c.size)}`).join(' + ')}
                  {multi && arrangement === 'single' && shown.contents.some(c => c.role === 'ground')
                    ? ' — one EGC serves the group per 250.122(F)'
                    : ''}
                </td>
              </tr>
              <tr><td>Total conductors</td><td>{fill.totalCount} → fill limit {fill.limitPercent}% (Ch. 9 Table 1)</td></tr>
              <tr><td>Total conductor area</td><td>{fill.totalArea} sq in (Ch. 9 Table 5)</td></tr>
              <tr>
                <td>{fill.minimum.tradeSize} in. conduit</td>
                <td>{fill.minimum.internalArea} sq in internal (Ch. 9 Table 4) × {fill.limitPercent}% = {fill.minimum.allowableArea} sq in allowed → <b>{fill.minimum.percentFill}% fill</b> <span className="ok-tag">OK</span></td>
              </tr>
              {fill.nextUp && (
                <tr>
                  <td>Next size: {fill.nextUp.tradeSize} in.</td>
                  <td>{fill.nextUp.internalArea} sq in internal → {fill.nextUp.percentFill}% fill</td>
                </tr>
              )}
              <tr>
                <td>Current-carrying</td>
                <td>{shown.ccc} per conduit → adjustment factor <b>{shown.adjust.factor}</b> ({shown.adjust.label}, Table 310.15(C)(1))</td>
              </tr>
            </tbody>
          </table>

          {shown.ccc > 3 && (
            <div className="warn">
              ⚠ {shown.ccc} current-carrying conductors in one conduit derates every one of them to{' '}
              {Math.round(shown.adjust.factor * 100)}% of Table 310.16 ampacity per Table 310.15(C)(1).
              {amp ? ` ${sizeLabel(amp.size)} ${amp.material} at ${amp.tempRating}°C: ${amp.base} A → ${amp[multi ? arrangement : 'single'].derated} A each.` : ''}
              {' '}This tool does not size conductors — check the Wire tab.
            </div>
          )}

          {fill.warnings.map((w, i) => <div className="warn" key={i}>{w}</div>)}
          <div className="cite">
            Source: {fill.tables}. {fill.conduitLabel}. Fill counts every physical conductor, including
            neutrals and grounds. Jam ratio, pull tension, and the 60% allowance for nipples 24 in. or
            shorter are not checked.
          </div>
        </div>
      )}

      {multi && bothOk && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>One conduit per set vs. all in one</h3>
          <table className="rollup">
            <thead>
              <tr>
                <th>Arrangement</th><th>Conduit</th><th>CCC</th><th>Factor</th>
                {amp ? <th>Per phase</th> : null}
              </tr>
            </thead>
            <tbody>
              {['perSet', 'single'].map(k => {
                const a = res.arrangements[k]
                return (
                  <tr key={k} className={arrangement === k ? 'sel' : ''} onClick={() => setArrangement(k)}>
                    <td>{k === 'perSet' ? `${setCount} conduits, one per set` : 'All sets in one conduit'}</td>
                    <td>{a.conduits} × {a.fill.minimum.tradeSize} in.</td>
                    <td>{a.ccc}</td>
                    <td>{a.adjust.factor}</td>
                    {amp ? <td>{amp[k].perPhase} A</td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {res.capacityLossPct > 0 && (
            <div className="warn">
              ⚠ Putting all {setCount} sets in one conduit costs <b>{res.capacityLossPct}% of your ampacity</b>.
              {amp
                ? ` Each ${sizeLabel(amp.size)} drops from ${amp.perSet.derated} A to ${amp.single.derated} A, taking the circuit from ${amp.perSet.perPhase} A to ${amp.single.perPhase} A per phase.`
                : ''}
              {' '}The conduit saving is real, but it is usually the wrong trade.
            </div>
          )}

          <div className="card result" style={{ margin: '10px 0 0' }}>
            <b>Recommended: </b>
            {res.recommended === 'perSet'
              ? `${setCount} conduits, each ${res.arrangements.perSet.fill.minimum.tradeSize} in. ${TYPE_LABEL[conduitType]} holding ` +
                res.arrangements.perSet.contents.map(c => `${c.qty} × ${sizeLabel(c.size)}`).join(' + ') + '.'
              : `one ${res.arrangements.single.fill.minimum.tradeSize} in. ${TYPE_LABEL[conduitType]} holding ` +
                res.arrangements.single.contents.map(c => `${c.qty} × ${sizeLabel(c.size)}`).join(' + ') + '.'}
          </div>

          {amp && (
            <>
              <label className="fld">Phase conductor basis for the ampacity figures</label>
              <div className="seg" role="group" aria-label="Conductor material">
                <button className={material === 'copper' ? 'on' : ''} onClick={() => setMaterial('copper')}>Copper</button>
                <button className={material === 'aluminum' ? 'on' : ''} onClick={() => setMaterial('aluminum')}>Aluminum</button>
              </div>
              <div className="seg" role="group" aria-label="Temperature rating" style={{ marginTop: 6 }}>
                {[60, 75, 90].map(t => (
                  <button key={t} className={tempRating === t ? 'on' : ''} onClick={() => setTempRating(t)}>{t}°C</button>
                ))}
              </div>
            </>
          )}

          <div className="cite">
            With metallic conduit every phase of a set must share one raceway — 300.3(B), and 300.20(A)
            for induced heating. Never run one phase per conduit. Per 250.122(F), parallel sets in
            separate raceways each need their own full-size EGC; sets sharing one raceway may share one.
            Derating from the 90°C column is permitted, but the result is still limited by the
            termination rating per 110.14(C), which this tool does not check.
          </div>
        </div>
      )}
    </div>
  )
}
