import React, { useMemo, useState } from 'react'
import { selectWireSize, UNCOMMON_SIZES, PARALLEL_SUGGEST_AMPS } from '../calc/wireSize.js'

const KCMIL = ['250', '300', '350', '400', '500', '600', '700', '750', '800', '900', '1000', '1250', '1500', '1750', '2000']
const sizeLabel = s => KCMIL.includes(s) ? `${s} kcmil` : `${s} AWG`

export default function WireSizeTool() {
  const [amps, setAmps] = useState('')
  const [material, setMaterial] = useState('copper')
  const [temp, setTemp] = useState(75)
  const [useAdv, setUseAdv] = useState(false)
  const [ambient, setAmbient] = useState('30')
  const [ccc, setCcc] = useState('3')

  const result = useMemo(() => {
    const a = parseFloat(amps)
    if (!amps || !Number.isFinite(a)) return null
    const adv = {}
    if (useAdv) {
      const amb = parseFloat(ambient)
      const n = parseInt(ccc, 10)
      if (Number.isFinite(amb)) adv.ambientC = amb
      if (Number.isFinite(n)) adv.numConductors = n
    }
    return selectWireSize(a, material, temp, adv)
  }, [amps, material, temp, useAdv, ambient, ccc])

  return (
    <div>
      <h2>Wire Size — NEC Table 310.16</h2>

      <label className="fld" htmlFor="ws-amps">Load current (A)</label>
      <input id="ws-amps" type="number" inputMode="decimal" min="0" placeholder="e.g. 380"
        value={amps} onChange={e => setAmps(e.target.value)} />

      <label className="fld">Conductor material</label>
      <div className="seg" role="group" aria-label="Conductor material">
        <button className={material === 'copper' ? 'on' : ''} onClick={() => setMaterial('copper')}>Copper</button>
        <button className={material === 'aluminum' ? 'on' : ''} onClick={() => setMaterial('aluminum')}>Aluminum</button>
      </div>

      <label className="fld">Insulation temperature rating</label>
      <div className="seg" role="group" aria-label="Temperature rating">
        {[60, 75, 90].map(t => (
          <button key={t} className={temp === t ? 'on' : ''} onClick={() => setTemp(t)}>{t}°C</button>
        ))}
      </div>

      <details className="adv" open={useAdv} onToggle={e => setUseAdv(e.target.open)}>
        <summary>Advanced: ambient correction and conductor count</summary>
        <label className="fld" htmlFor="ws-amb">Ambient temperature (°C) — Table 310.15(B)(1)(1), 30°C base</label>
        <input id="ws-amb" type="number" inputMode="decimal" value={ambient}
          onChange={e => setAmbient(e.target.value)} />
        <label className="fld" htmlFor="ws-ccc">Current-carrying conductors in raceway/cable — Table 310.15(C)(1)</label>
        <input id="ws-ccc" type="number" inputMode="numeric" min="1" step="1" value={ccc}
          onChange={e => setCcc(e.target.value)} />
      </details>

      {result && result.error && <div className="err">{result.error}</div>}

      {result && !result.error && (
        <div className="card result">
          <div className="bigval">{sizeLabel(result.size)}</div>
          <table className="kv">
            <tbody>
              <tr><td>Table 310.16 ampacity</td><td>{result.baseAmpacity} A ({result.tempRating}°C, {result.material})</td></tr>
              {result.factors.usingAdvanced && (
                <>
                  <tr><td>Ambient factor</td><td>{result.factors.ambient.factor ?? '—'} {result.factors.ambient.label ? `(${result.factors.ambient.label}°C)` : ''}</td></tr>
                  <tr><td>Conductor-count factor</td><td>{result.factors.adjust.factor} {result.factors.adjust.label ? `(${result.factors.adjust.label})` : ''}</td></tr>
                  <tr><td>Derated ampacity</td><td><b>{result.baseAmpacity} × {result.factors.totalFactor} = {result.deratedAmpacity} A</b></td></tr>
                </>
              )}
              <tr><td>Load</td><td>{result.amps} A {result.deratedAmpacity >= result.amps ? <span className="ok-tag">OK</span> : null}</td></tr>
              {result.nextSize && (
                <tr><td>Next size up</td><td>{result.nextSize.size}: {result.nextSize.baseAmpacity} A table{result.factors.usingAdvanced ? `, ${result.nextSize.deratedAmpacity} A derated` : ''}</td></tr>
              )}
            </tbody>
          </table>
          {result.hardToGetSkipped && (
            <div className="warn">
              ⚠ {sizeLabel(result.hardToGetSkipped.size)} ({result.hardToGetSkipped.deratedAmpacity} A
              {result.factors.usingAdvanced ? ' derated' : ''}) would carry the load but is hard to get —
              recommending {sizeLabel(result.size)} instead.
            </div>
          )}
          {result.warnings.map((w, i) => <div className="warn" key={i}>{w}</div>)}
          <div className="cite">Source: {result.table}. Termination ratings per 110.14(C) may govern separately — this tool does not check terminations.</div>
        </div>
      )}

      {result && result.parallel && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Parallel run options — {result.amps} A</h3>
          <table className="widthtable">
            <thead>
              <tr><th>Runs/phase</th><th>Conductor</th><th>Per run</th><th>Total</th></tr>
            </thead>
            <tbody>
              {result.parallel.map((o, i) => (
                <tr key={o.runs} className={i === 0 ? 'sel' : ''}>
                  <td>{o.runs}×</td>
                  <td>{sizeLabel(o.size)}</td>
                  <td>{o.deratedAmpacity} A</td>
                  <td>{o.totalAmpacity} A</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cite">
            Shown for loads above {PARALLEL_SUGGEST_AMPS} A; fewest-runs option highlighted.
            Per NEC 310.10(G): 1/0 AWG minimum, all runs identical size, material, length, and termination.
            PTS practice: parallel conductors capped at 750 kcmil, up to 16 sets.
            Assumes each run in its own raceway with the same correction factors applied.
            Hard-to-get sizes ({UNCOMMON_SIZES.map(sizeLabel).join(', ')}) are not recommended.
          </div>
        </div>
      )}
    </div>
  )
}
