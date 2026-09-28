import React, { useEffect, useMemo, useState } from 'react'
import {
  VD_SIZES, RACEWAY_TYPES, VD_GUIDE_BRANCH_PCT, VD_GUIDE_TOTAL_PCT
} from '../calc/voltageDrop.js'
import { groundConductor, nextStandardOcpd } from '../calc/groundWire.js'
import * as V from '../calc/vdSchedule.js'

const LS_SCHEDULE = 'pts-vd-schedule-v1'

const VOLTAGE_PRESETS = {
  3: [208, 240, 400, 480, 600, 4160],
  1: [120, 208, 240, 277]
}
// Numeric test rather than a hardcoded list, so EGC sizes from Table 250.122
// (which reaches 1200 kcmil) label correctly alongside the Table 9 sizes.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`
const BIG_SIZES = ['250', '300', '350', '400', '500', '600', '750', '1000']

const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—'

function loadSchedule() {
  try {
    const raw = localStorage.getItem(LS_SCHEDULE)
    if (raw) {
      const s = V.deserialize(raw)
      if (s) return s
    }
  } catch { /* storage blocked or corrupt - start empty */ }
  return V.emptySchedule()
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

const feedSummary = i =>
  `${i.voltage} V ${i.phase === 3 ? '3Ø' : '1Ø'} · ${i.amps || '—'} A · ${i.lengthFt || '—'} ft · ` +
  `${Number(i.sets) > 1 ? `${i.sets} × ` : ''}${sizeLabel(i.size)} ${i.material === 'copper' ? 'Cu' : 'Al'}`

export default function VoltageDropTool() {
  const [schedule, setSchedule] = useState(loadSchedule)
  const [editingId, setEditingId] = useState(null) // null = a new, unsaved feed
  const [inp, setInp] = useState({ ...V.DEFAULT_INPUTS })
  const [tag, setTag] = useState('')
  const [upId, setUpId] = useState(null)
  const [forceXfmr, setForceXfmr] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LS_SCHEDULE, V.serialize(schedule)) } catch { /* nonfatal */ }
  }, [schedule])

  const set = (k, v) => setInp(x => ({ ...x, [k]: v }))
  const {
    method, amps, lengthFt, phase, voltage, size, material, raceway, pf, sets,
    ocpd, minSize, egcMaterial
  } = inp

  const changePhase = p => setInp(x => ({ ...x, phase: p, voltage: p === 3 ? '480' : '120' }))

  const result = useMemo(() => V.evaluateInputs(inp), [inp])
  const vNum = parseFloat(voltage)

  // EGC for the voltage-drop-upsized conductor. The size selected above is the
  // conductor actually being installed; "minimum size for ampacity" is the baseline
  // that 250.122(B) measures the proportional increase against. Defaults to no upsizing.
  const suggestedOcpd = useMemo(() => nextStandardOcpd(parseFloat(amps)), [amps])
  const ocpdUsed = ocpd !== '' ? parseFloat(ocpd) : suggestedOcpd
  const minSizeUsed = minSize !== '' ? minSize : size

  const egc = useMemo(() => {
    if (!Number.isFinite(ocpdUsed)) return null
    const n = parseInt(sets, 10)
    return groundConductor({
      ocpdAmps: ocpdUsed,
      material: egcMaterial,
      circuitSize: size,
      minAmpacitySize: minSizeUsed,
      sets: Number.isFinite(n) && n > 0 ? n : 1
    })
  }, [ocpdUsed, egcMaterial, size, minSizeUsed, sets])

  // ── Feed schedule ──────────────────────────────────────────────────────────
  const evaluated = useMemo(() => V.evaluateSchedule(schedule), [schedule])
  const saved = editingId !== null ? schedule.feeds.find(f => f.id === editingId) : null
  const editorFeed = { tag, upId, forceXfmr, inputs: inp }

  const dirty = saved
    ? JSON.stringify({ t: saved.tag, u: saved.upId, x: saved.forceXfmr, i: saved.inputs }) !==
      JSON.stringify({ t: tag.trim() || saved.tag, u: upId, x: forceXfmr, i: inp })
    : amps !== '' || lengthFt !== '' || tag.trim() !== ''

  // The editor's own chain, computed as if it were saved, so the chain total updates
  // while you type rather than only after Save.
  const preview = useMemo(() => {
    let s = schedule
    let id = editingId
    if (id !== null) s = V.updateFeed(s, id, editorFeed)
    else {
      const r = V.addFeed(s, editorFeed)
      s = r.schedule
      id = r.id
    }
    return id === null ? null : V.evaluateSchedule(s).find(e => e.feed.id === id)
  }, [schedule, editingId, tag, upId, forceXfmr, inp]) // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = editingId !== null ? V.descendantIds(schedule, editingId) : new Set()
  const sourceOptions = schedule.feeds.filter(f => f.id !== editingId && !blocked.has(f.id))
  const source = upId !== null ? schedule.feeds.find(f => f.id === upId) : null
  const sourceV = source ? parseFloat(source.inputs.voltage) : null
  const autoXfmr = source ? !V.sameSystem(sourceV, vNum) : false

  const canSave = result && !result.error && (editingId !== null ? dirty : !V.isFull(schedule))

  const confirmDiscard = () =>
    !dirty || window.confirm('Discard the unsaved changes to this feed?')

  const loadFeed = f => {
    setEditingId(f.id)
    setInp({ ...f.inputs })
    setTag(f.tag)
    setUpId(f.upId)
    setForceXfmr(f.forceXfmr)
  }

  const pick = f => {
    if (f.id === editingId) return
    if (!confirmDiscard()) return
    loadFeed(f)
  }

  // A new feed keeps the system settings, which usually repeat down a schedule.
  const startNew = () => {
    setEditingId(null)
    setInp(x => ({
      ...V.DEFAULT_INPUTS,
      method: x.method, phase: x.phase, voltage: x.voltage,
      material: x.material, raceway: x.raceway, pf: x.pf
    }))
    setTag('')
    setUpId(null)
    setForceXfmr(false)
  }

  const saveFeed = () => {
    if (!canSave) return
    if (editingId !== null) {
      const next = V.updateFeed(schedule, editingId, editorFeed)
      setSchedule(next)
      setTag(next.feeds.find(f => f.id === editingId).tag)
    } else {
      const r = V.addFeed(schedule, editorFeed)
      if (r.id === null) return
      setSchedule(r.schedule)
      setEditingId(r.id)
      setTag(r.schedule.feeds.find(f => f.id === r.id).tag)
    }
  }

  const duplicate = () => {
    if (editingId === null || !confirmDiscard()) return
    const r = V.duplicateFeed(schedule, editingId)
    if (r.id === null) return
    setSchedule(r.schedule)
    loadFeed(r.schedule.feeds.find(f => f.id === r.id))
  }

  const remove = () => {
    if (!saved) return
    const fed = schedule.feeds.filter(f => f.upId === saved.id).length
    const msg = `Delete "${saved.tag}" from the schedule?` +
      (fed ? ` The ${fed} feed(s) it supplies will be unlinked.` : '')
    if (!window.confirm(msg)) return
    setSchedule(V.deleteFeed(schedule, saved.id))
    setEditingId(null)
    setTag('')
    setUpId(null)
    setForceXfmr(false)
  }

  const clearAll = () => {
    if (!window.confirm(`Clear all ${schedule.feeds.length} feeds from the schedule? This cannot be undone.`)) return
    setSchedule(V.clearSchedule(schedule))
    startNew()
  }

  const exportCsv = () => {
    download(V.scheduleCsv(evaluated), 'text/csv;charset=utf-8;',
      `voltage-drop-schedule-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div>
      <h2>Voltage Drop</h2>

      <div className="card" style={{ marginTop: 0 }}>
        <div className="cite" style={{ marginTop: 0, marginBottom: 6 }}>
          {saved
            ? <>Editing <b>{saved.tag}</b>{dirty ? ' — unsaved changes' : ' — saved'}</>
            : <>New feed{dirty ? ' — not saved yet' : ''}. Save it to add it to the schedule below.</>}
        </div>
        <label className="fld" htmlFor="vd-tag">Feed tag</label>
        <input id="vd-tag" type="text" maxLength={V.MAX_TAG_LEN}
          placeholder={saved ? saved.tag : `e.g. "MSB-1 to PDP-1" (blank = ${V.defaultTag(schedule.feeds)})`}
          value={tag} onChange={e => setTag(e.target.value)} />

        <label className="fld" htmlFor="vd-up">Fed from</label>
        <select id="vd-up" value={upId === null ? '' : String(upId)}
          onChange={e => setUpId(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">— none (source, or stands alone)</option>
          {sourceOptions.map(f => <option key={f.id} value={String(f.id)}>{f.tag}</option>)}
        </select>

        {source && autoXfmr && (
          <div className="note" style={{ marginTop: 6 }}>
            Chain restarts here: {sourceV} V feeding {vNum} V means a transformer between, and its
            regulation drop is not in this calc.
          </div>
        )}
        {source && !autoXfmr && (
          <label className="fld" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
            <input type="checkbox" checked={forceXfmr} onChange={e => setForceXfmr(e.target.checked)}
              style={{ width: 20, height: 20 }} />
            Isolation transformer between this feed and its source
          </label>
        )}
      </div>

      <label className="fld">Method</label>
      <div className="seg" role="group" aria-label="Calculation method">
        <button className={method === 't9' ? 'on' : ''} onClick={() => set('method', 't9')}>NEC Table 9 (R + jX)</button>
        <button className={method === 'k' ? 'on' : ''} onClick={() => set('method', 'k')}>K-factor (quick)</button>
      </div>

      <label className="fld" htmlFor="vd-amps">Load current (A)</label>
      <input id="vd-amps" type="number" inputMode="decimal" min="0" placeholder="e.g. 200"
        value={amps} onChange={e => set('amps', e.target.value)} />

      <label className="fld" htmlFor="vd-len">Circuit length (ft) — ONE-WAY, not round trip</label>
      <input id="vd-len" type="number" inputMode="decimal" min="0" placeholder="e.g. 250"
        value={lengthFt} onChange={e => set('lengthFt', e.target.value)} />

      <label className="fld">System</label>
      <div className="seg" role="group" aria-label="Phase">
        <button className={phase === 3 ? 'on' : ''} onClick={() => changePhase(3)}>Three-phase</button>
        <button className={phase === 1 ? 'on' : ''} onClick={() => changePhase(1)}>Single-phase</button>
      </div>

      <label className="fld" htmlFor="vd-volt">Voltage (V){phase === 3 ? ' — line-to-line' : ''}</label>
      <div className="seg" role="group" aria-label="Voltage presets" style={{ marginBottom: 8 }}>
        {VOLTAGE_PRESETS[phase].map(v => (
          <button key={v} className={vNum === v ? 'on' : ''} onClick={() => set('voltage', String(v))}>{v}</button>
        ))}
      </div>
      <input id="vd-volt" type="number" inputMode="decimal" min="0" value={voltage}
        onChange={e => set('voltage', e.target.value)} />

      <div className="rowgrid" style={{ marginTop: 4 }}>
        <div>
          <label className="fld">Conductor size</label>
          <select value={size} onChange={e => set('size', e.target.value)}>
            {VD_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="fld">Parallel sets</label>
          <input type="number" inputMode="numeric" min="1" step="1" value={sets}
            onChange={e => set('sets', e.target.value)} />
        </div>
      </div>

      <label className="fld">Conductor material</label>
      <div className="seg" role="group" aria-label="Conductor material">
        <button className={material === 'copper' ? 'on' : ''} onClick={() => set('material', 'copper')}>Copper</button>
        <button className={material === 'aluminum' ? 'on' : ''} onClick={() => set('material', 'aluminum')}>Aluminum</button>
      </div>

      {method === 't9' && (
        <>
          <label className="fld">Raceway type (affects R and X)</label>
          <div className="seg" role="group" aria-label="Raceway type">
            {RACEWAY_TYPES.map(rt => (
              <button key={rt.id} className={raceway === rt.id ? 'on' : ''} onClick={() => set('raceway', rt.id)}>{rt.label}</button>
            ))}
          </div>
          <label className="fld" htmlFor="vd-pf">Power factor (lagging)</label>
          <input id="vd-pf" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={pf}
            onChange={e => set('pf', e.target.value)} />
        </>
      )}

      {method === 'k' && BIG_SIZES.includes(size) && (
        <div className="warn">
          ⚠ The K-factor method ignores reactance and understates drop on large conductors.
          For {sizeLabel(size)}, use the NEC Table 9 method.
        </div>
      )}

      {result && result.error && <div className="err">{result.error}</div>}

      {result && !result.error && (
        <div className="card result">
          <div className="bigval">{fmt(result.vdPct)}<span className="unit"> %</span></div>
          <table className="kv">
            <tbody>
              <tr>
                <td>Voltage drop</td>
                <td><b>{fmt(result.vdVolts, 1)} V</b> → {fmt(result.loadVoltage, 1)} V at the load</td>
              </tr>
              {result.zEff !== undefined && (
                <tr>
                  <td>Effective Z</td>
                  <td>{fmt(result.r, 3)} × {pf} + {fmt(result.x, 3)} × {fmt(Math.sqrt(1 - parseFloat(pf) ** 2), 3)} = <b>{fmt(result.zEff, 4)} Ω/1000 ft</b></td>
                </tr>
              )}
              {result.k !== undefined && (
                <tr>
                  <td>Basis</td>
                  <td>K = {result.k} Ω·cmil/ft, {result.cmil.toLocaleString()} cmil</td>
                </tr>
              )}
              <tr>
                <td>{VD_GUIDE_BRANCH_PCT}% guideline</td>
                <td>
                  {result.vdPct <= VD_GUIDE_BRANCH_PCT
                    ? <span className="ok-tag">Within {VD_GUIDE_BRANCH_PCT}%</span>
                    : <span className="bad-tag">Exceeds {VD_GUIDE_BRANCH_PCT}%{result.vdPct > VD_GUIDE_TOTAL_PCT ? ` and the ${VD_GUIDE_TOTAL_PCT}% total guideline` : ''}</span>}
                  {' '}— informational note, not a code requirement
                </td>
              </tr>
              {preview && preview.upTag && (
                <tr>
                  <td>Chain from source</td>
                  <td>
                    {preview.chainNote === 'transformer'
                      ? <>Restarts at the transformer — {fmt(preview.chainPct)}% from there</>
                      : preview.chainPct === null
                        ? <>Cannot total — a feed upstream is incomplete</>
                        : <>
                            <b>{fmt(preview.chainPct)}%</b> through {preview.upTag}{' '}
                            {preview.chainOk
                              ? <span className="ok-tag">within {VD_GUIDE_TOTAL_PCT}%</span>
                              : <span className="bad-tag">exceeds {VD_GUIDE_TOTAL_PCT}%</span>}
                          </>}
                  </td>
                </tr>
              )}
              <tr>
                <td>Max length at {VD_GUIDE_BRANCH_PCT}%</td>
                <td>{fmt(result.maxLenAt3Pct, 0)} ft one-way with these settings</td>
              </tr>
            </tbody>
          </table>
          <div className="cite">
            {result.method}. VD = {phase === 3 ? '√3' : '2'} × (I ÷ sets) × (L ÷ 1000) × Z, one-way length, lagging PF.
            Table 9 basis: 60 Hz, 75°C, three single conductors in one raceway.
            Guidelines per 210.19(A) / 215.2(A) Informational Notes.
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Grounding conductor for the upsized conductor — 250.122</h3>
        <div className="cite" style={{ marginTop: 0, marginBottom: 8 }}>
          Upsizing conductors for voltage drop triggers <b>250.122(B)</b>: the EGC must increase
          proportionally by circular-mil area. Enter the device rating and the size ampacity alone
          would have required; the conductor selected above is treated as the installed size.
        </div>

        <div className="rowgrid">
          <div>
            <label className="fld" htmlFor="vd-ocpd">
              Device rating (A){ocpd === '' && suggestedOcpd ? ` — assuming ${suggestedOcpd}` : ''}
            </label>
            <input id="vd-ocpd" type="number" inputMode="decimal" min="0"
              placeholder={suggestedOcpd ? `e.g. ${suggestedOcpd}` : 'e.g. 400'}
              value={ocpd} onChange={e => set('ocpd', e.target.value)} />
          </div>
          <div>
            <label className="fld">Min. size for ampacity</label>
            <select value={minSize} onChange={e => set('minSize', e.target.value)}>
              <option value="">Same as selected ({sizeLabel(size)})</option>
              {VD_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
            </select>
          </div>
        </div>

        <label className="fld">EGC material</label>
        <div className="seg" role="group" aria-label="EGC material">
          <button className={egcMaterial === 'copper' ? 'on' : ''} onClick={() => set('egcMaterial', 'copper')}>Copper</button>
          <button className={egcMaterial === 'aluminum' ? 'on' : ''} onClick={() => set('egcMaterial', 'aluminum')}>Aluminum</button>
        </div>

        {egc && egc.error && <div className="err">{egc.error}</div>}
        {!egc && <div className="warn">Enter a load current above, or a device rating here, to size the EGC.</div>}

        {egc && !egc.error && (
          <>
            <div className="bigval" style={{ marginTop: 12 }}>
              {egc.sets > 1 ? `${egc.sets} × ` : ''}{sizeLabel(egc.size)}
              <span className="unit"> {egc.material} EGC{egc.sets > 1 ? ' (separate raceways)' : ''}</span>
            </div>
            <table className="kv">
              <tbody>
                <tr>
                  <td>Table 250.122 row</td>
                  <td>{egc.tableRating} A device → {sizeLabel(egc.baseSize)} {egc.material}</td>
                </tr>
                {egc.proportional && egc.proportional.size ? (
                  <tr>
                    <td>250.122(B) increase <em>(derived)</em></td>
                    <td>
                      {sizeLabel(egc.proportional.fromSize)} → {sizeLabel(egc.proportional.toSize)} is
                      ×{egc.proportional.ratio} by circular mils, so {sizeLabel(egc.baseSize)} ×
                      {' '}{egc.proportional.ratio} = {egc.proportional.neededCmil.toLocaleString()} cmil
                      → <b>{sizeLabel(egc.proportional.size)}</b>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>250.122(B)</td>
                    <td>
                      {minSizeUsed === size
                        ? 'No upsizing entered — set “Min. size for ampacity” to the smaller size if this conductor was upsized for voltage drop.'
                        : 'Proportional increase does not reach the next EGC size.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {egc.notes.map((n, i) => <div className="warn" key={i}>{n}</div>)}

            {egc.parallelGuidance.length > 0 && (
              <>
                <h3>Permitted EGC arrangements for {egc.sets} parallel sets</h3>
                <table className="kv">
                  <tbody>
                    {egc.parallelGuidance.map((g, i) => (
                      <tr key={i}>
                        <td>{g.arrangement}<br /><em>{g.rule}</em></td>
                        <td>{g.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="cite">
              Source: {egc.table}, sized on the overcurrent device rating — not on the conductor size.
              This tool does not select the overcurrent device. Sizes here come from the Table 9 list;
              the Wire tab covers the full Table 310.16 range. The schedule export lists the EGC only
              for feeds where a device rating was entered.
            </div>
          </>
        )}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={saveFeed} disabled={!canSave}>
          {saved ? 'Save changes' : 'Save feed'}
        </button>
        {saved && <button className="btn secondary" onClick={duplicate} disabled={V.isFull(schedule)}>Duplicate</button>}
        {saved && <button className="btn danger" onClick={remove}>Delete</button>}
        {(saved || dirty) && <button className="btn secondary" onClick={() => confirmDiscard() && startNew()}>+ New feed</button>}
      </div>
      {!canSave && !(saved && !dirty) && (
        <div className="cite">
          {V.isFull(schedule) && !saved
            ? `The schedule is full (${V.MAX_FEEDS} feeds).`
            : 'Enter a load and a length to save this feed.'}
        </div>
      )}

      <h3>Feed schedule</h3>
      <div className="traymeta">
        {schedule.feeds.length} of {V.MAX_FEEDS} feeds · saved on this phone · tap a feed to edit it
      </div>
      {evaluated.length === 0 && (
        <div className="cite">No feeds saved yet. Enter one above and tap Save feed.</div>
      )}
      {evaluated.map(e => {
        const r = e.result
        const ok = r && !r.error
        return (
          <div key={e.feed.id}
            className={`feedrow${e.feed.id === editingId ? ' on' : ''}`}
            style={{ marginLeft: Math.min(e.depth, 3) * 14 }}
            onClick={() => pick(e.feed)}>
            <div className="fr1">
              <span className="frtag">{e.feed.tag}</span>
              <span className="frpct">{ok ? `${fmt(r.vdPct)}%` : '—'}</span>
            </div>
            <div className="fr2">{feedSummary(e.feed.inputs)}</div>
            <div className="fr3">
              {e.ownOk !== null && (
                <span className={`chip ${e.ownOk ? 'good' : 'bad'}`}>
                  {e.ownOk ? 'within' : 'over'} {VD_GUIDE_BRANCH_PCT}%
                </span>
              )}
              {!ok && <span className="chip bad">{r ? r.error : 'inputs incomplete'}</span>}
              {e.chainNote === 'transformer' && e.upTag && <span className="chip note">restarts after transformer</span>}
              {e.chainNote === 'upstream incomplete' && <span className="chip note">upstream incomplete</span>}
              {e.chainOk !== null && (
                <span className={`chip ${e.chainOk ? 'good' : 'bad'}`}>
                  chain {fmt(e.chainPct)}% {e.chainOk ? '≤' : '>'} {VD_GUIDE_TOTAL_PCT}%
                </span>
              )}
            </div>
          </div>
        )
      })}
      <div className="btn-row">
        <button className="btn" onClick={exportCsv} disabled={schedule.feeds.length === 0}>Export schedule (CSV)</button>
        {schedule.feeds.length > 0 && <button className="btn danger" onClick={clearAll}>Clear schedule</button>}
      </div>
      <div className="cite">
        "Fed from" adds each feed's drop to its source's, checked against the {VD_GUIDE_TOTAL_PCT}% feeder
        plus branch guideline. The chain restarts at a transformer — inferred when the voltages cannot be one
        system (480 V feeding 208 V), or ticked for an isolation transformer — because the transformer's own
        regulation drop is not in this calc. A 120 V branch off a 208Y/120 V panel stays on the same chain.
      </div>
    </div>
  )
}
