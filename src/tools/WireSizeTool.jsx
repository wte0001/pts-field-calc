import React, { useMemo, useState } from 'react'
import { selectWireSize, UNCOMMON_SIZES, PARALLEL_SUGGEST_AMPS } from '../calc/wireSize.js'
import { groundConductor, nextStandardOcpd } from '../calc/groundWire.js'

// Sizes are AWG below 250 and kcmil at 250 and above; AWG names like "4/0" are not
// plain digits. Numeric test rather than a hardcoded list so EGC sizes from
// Table 250.122 (which reaches 1200 kcmil) label correctly too.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

export default function WireSizeTool() {
  const [amps, setAmps] = useState('')
  const [material, setMaterial] = useState('copper')
  const [temp, setTemp] = useState(75)
  const [useAdv, setUseAdv] = useState(false)
  const [ambient, setAmbient] = useState('30')
  const [ccc, setCcc] = useState('3')
  const [ocpd, setOcpd] = useState('')
  const [egcMaterial, setEgcMaterial] = useState('copper')
  const [pickedRuns, setPickedRuns] = useState(null)

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

  // OCPD defaults to the next standard rating at or above the load (240.6(A)) until
  // the user types one. Table 250.122 keys off the device rating, not the conductor.
  const suggestedOcpd = useMemo(() => nextStandardOcpd(parseFloat(amps)), [amps])
  const ocpdUsed = ocpd !== '' ? parseFloat(ocpd) : suggestedOcpd

  // Which makeup the EGC is sized for. A picked parallel row wins; otherwise the
  // single conductor, falling back to the fewest-runs parallel option when no single
  // conductor is adequate (large feeders, where an EGC is still very much needed).
  const config = useMemo(() => {
    if (!result) return null
    const picked = result.parallel && pickedRuns !== null
      ? result.parallel.find(o => o.runs === pickedRuns)
      : null
    if (picked) {
      return { sets: picked.runs, size: picked.size, minSize: picked.minSize, label: `${picked.runs} sets of ${sizeLabel(picked.size)}` }
    }
    if (!result.error) {
      return {
        sets: 1,
        size: result.size,
        minSize: result.hardToGetSkipped ? result.hardToGetSkipped.size : result.size,
        label: `single ${sizeLabel(result.size)}`
      }
    }
    if (result.parallel) {
      const o = result.parallel[0]
      return { sets: o.runs, size: o.size, minSize: o.minSize, label: `${o.runs} sets of ${sizeLabel(o.size)}`, assumed: true }
    }
    return null
  }, [result, pickedRuns])

  const egc = useMemo(() => {
    if (!config || !Number.isFinite(ocpdUsed)) return null
    return groundConductor({
      ocpdAmps: ocpdUsed,
      material: egcMaterial,
      circuitSize: config.size,
      minAmpacitySize: config.minSize,
      sets: config.sets
    })
  }, [config, ocpdUsed, egcMaterial])

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

      {config && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Equipment grounding conductor — Table 250.122</h3>
          <div className="cite" style={{ marginTop: 0, marginBottom: 8 }}>
            Sized for: <b>{config.label}</b>
            {config.assumed ? ' (fewest-runs option — tap another row below to change)' : ''}
            {config.sets > 1 && !config.assumed ? ' (tap another row below to change)' : ''}
          </div>

          <label className="fld" htmlFor="ws-ocpd">
            Overcurrent device rating (A){ocpd === '' && suggestedOcpd ? ` — assuming ${suggestedOcpd} A` : ''}
          </label>
          <input id="ws-ocpd" type="number" inputMode="decimal" min="0"
            placeholder={suggestedOcpd ? `e.g. ${suggestedOcpd}` : 'e.g. 400'}
            value={ocpd} onChange={e => setOcpd(e.target.value)} />

          <label className="fld">EGC material</label>
          <div className="seg" role="group" aria-label="EGC material">
            <button className={egcMaterial === 'copper' ? 'on' : ''} onClick={() => setEgcMaterial('copper')}>Copper</button>
            <button className={egcMaterial === 'aluminum' ? 'on' : ''} onClick={() => setEgcMaterial('aluminum')}>Aluminum</button>
          </div>

          {egc && egc.error && <div className="err">{egc.error}</div>}

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
                  {egc.proportional && egc.proportional.size && (
                    <tr>
                      <td>250.122(B) increase <em>(derived)</em></td>
                      <td>
                        {egc.proportional.fromSize} → {egc.proportional.toSize} is ×{egc.proportional.ratio} by circular mils,
                        so {sizeLabel(egc.baseSize)} × {egc.proportional.ratio} = {egc.proportional.neededCmil.toLocaleString()} cmil
                        → <b>{sizeLabel(egc.proportional.size)}</b>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>Device rating used</td>
                    <td>{egc.ocpdAmps} A {ocpd === '' ? <em>(assumed — next standard rating ≥ load per 240.6(A))</em> : ''}</td>
                  </tr>
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
                This tool does not select the overcurrent device: continuous-load factors (210.19/215.2),
                240.4 small-conductor rules, and motor rules (430.52, with the EGC then per 250.122(D))
                all govern that choice. Grounded (neutral) and grounding-electrode conductors are different
                conductors sized by different rules (200.x, 250.102, 250.66) and are not covered here.
              </div>
            </>
          )}
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
              {result.parallel.map(o => (
                <tr key={o.runs}
                  className={config && config.sets === o.runs ? 'sel' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPickedRuns(o.runs)}>
                  <td>{o.runs}×</td>
                  <td>{sizeLabel(o.size)}</td>
                  <td>{o.deratedAmpacity} A</td>
                  <td>{o.totalAmpacity} A</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.error && pickedRuns !== null && (
            <div className="btn-row">
              <button className="btn secondary" onClick={() => setPickedRuns(null)}>
                Use single {sizeLabel(result.size)} instead
              </button>
            </div>
          )}
          <div className="cite">
            Shown for loads above {PARALLEL_SUGGEST_AMPS} A. Tap a row to size the EGC for that makeup.
            Per NEC 310.10(G): 1/0 AWG minimum, all runs identical size, material, length, and termination.
            Per 250.122(F), each raceway needs its own full-size EGC from the table above — not divided among runs.
            PTS practice: parallel conductors capped at 750 kcmil, up to 16 sets.
            Assumes each run in its own raceway with the same correction factors applied.
            Hard-to-get sizes ({UNCOMMON_SIZES.map(sizeLabel).join(', ')}) are not recommended.
          </div>
        </div>
      )}
    </div>
  )
}
