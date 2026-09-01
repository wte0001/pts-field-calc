import React, { useMemo, useState } from 'react'
import { UNCOMMON_SIZES, PARALLEL_SUGGEST_AMPS } from '../calc/wireSize.js'
import { sizeBranchCircuit } from '../calc/branchCircuit.js'
import { groundConductor } from '../calc/groundWire.js'

// Sizes are AWG below 250 and kcmil at 250 and above; AWG names like "4/0" are not
// plain digits. Numeric test rather than a hardcoded list so EGC sizes from
// Table 250.122 (which reaches 1200 kcmil) label correctly too.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`

export default function WireSizeTool() {
  const [amps, setAmps] = useState('')
  const [material, setMaterial] = useState('copper')
  const [continuous, setContinuous] = useState(true)
  const [term75, setTerm75] = useState(false)
  const [useAdv, setUseAdv] = useState(false)
  const [ambient, setAmbient] = useState('30')
  const [ccc, setCcc] = useState('3')
  const [ocpd, setOcpd] = useState('')
  const [egcMaterial, setEgcMaterial] = useState('copper')
  const [pickedRuns, setPickedRuns] = useState(null)

  const result = useMemo(() => {
    const a = parseFloat(amps)
    if (!amps || !Number.isFinite(a)) return null
    const opts = { continuous, terminations75: term75 }
    const manual = parseFloat(ocpd)
    if (ocpd !== '' && Number.isFinite(manual)) opts.ocpdAmps = manual
    if (useAdv) {
      const amb = parseFloat(ambient)
      const n = parseInt(ccc, 10)
      if (Number.isFinite(amb)) opts.ambientC = amb
      if (Number.isFinite(n)) opts.numConductors = n
    }
    return sizeBranchCircuit(a, material, opts)
  }, [amps, material, continuous, term75, ocpd, useAdv, ambient, ccc])

  // The device rating now comes from the sizing method itself, so the EGC section
  // and the conductor are always talking about the same circuit.
  const ocpdUsed = result && result.ocpd ? result.ocpd : null

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

      <label className="fld">Load type</label>
      <div className="seg" role="group" aria-label="Load type">
        <button className={continuous ? 'on' : ''} onClick={() => setContinuous(true)}>Continuous (125%)</button>
        <button className={!continuous ? 'on' : ''} onClick={() => setContinuous(false)}>Non-continuous</button>
      </div>

      <label className="fld">Terminations</label>
      <div className="seg" role="group" aria-label="Termination rating">
        <button className={!term75 ? 'on' : ''} onClick={() => setTerm75(false)}>Per 110.14(C)</button>
        <button className={term75 ? 'on' : ''} onClick={() => setTerm75(true)}>All listed 75°C</button>
      </div>
      <div className="cite" style={{ marginTop: 4 }}>
        Default follows 110.14(C): the 60°C column at 100 A and below, the 75°C column above it.
        The 90°C column is never used for sizing. Switch to 75°C only where every termination in the
        circuit is listed and identified for it.
      </div>

      <label className="fld" htmlFor="ws-ocpd">
        Overcurrent device (A){result && result.ocpdDerived ? ' — leave blank to size it for you' : ''}
      </label>
      <input id="ws-ocpd" type="number" inputMode="numeric" min="0" step="1"
        placeholder={result && result.ocpd ? String(result.ocpd) : 'auto'}
        value={ocpd} onChange={e => setOcpd(e.target.value)} />

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
          <div className="bigval">
            {sizeLabel(result.size)}
            <span className="unit"> on a {result.ocpd} A device</span>
          </div>
          <table className="kv">
            <tbody>
              <tr>
                <td>Design current</td>
                <td>
                  {result.loadAmps} A load
                  {result.continuous ? ` × 125% continuous = ${result.designAmps} A` : ' (non-continuous)'}
                </td>
              </tr>
              <tr>
                <td>Overcurrent device</td>
                <td>
                  <b>{result.ocpd} A</b>{' '}
                  {result.ocpdDerived
                    ? <em>(derived — next size PTS stocks at or above {result.designAmps} A)</em>
                    : <em>(entered)</em>}
                </td>
              </tr>
              <tr><td>Column used</td><td>{result.terminationRule}</td></tr>
              <tr><td>Table 310.16 ampacity</td><td>{result.baseAmpacity} A ({result.tempRating}°C, {result.material})</td></tr>
              {result.smallConductorCap !== null && result.smallConductorCap !== undefined && (
                <tr>
                  <td>240.4(D) limit</td>
                  <td>{result.size} AWG may be protected at up to {result.smallConductorCap} A → protected at <b>{result.protectedAt} A</b></td>
                </tr>
              )}
              {result.factors.usingAdvanced && (
                <>
                  <tr><td>Ambient factor</td><td>{result.factors.ambient.factor ?? '—'} {result.factors.ambient.label ? `(${result.factors.ambient.label}°C)` : ''}</td></tr>
                  <tr><td>Conductor-count factor</td><td>{result.factors.adjust.factor} {result.factors.adjust.label ? `(${result.factors.adjust.label})` : ''}</td></tr>
                  <tr><td>Derated ampacity</td><td><b>{result.baseAmpacity} × {result.factors.totalFactor} = {result.deratedAmpacity} A</b></td></tr>
                </>
              )}
              <tr>
                <td>Check</td>
                <td>
                  carries {result.deratedAmpacity} A ≥ {result.designAmps} A design{' '}
                  <span className="ok-tag">OK</span>, and may be protected at {result.protectedAt} A ≥ {result.ocpd} A{' '}
                  <span className="ok-tag">OK</span>
                </td>
              </tr>
              {result.nextSize && (
                <tr><td>Next size up</td><td>{sizeLabel(result.nextSize.size)}: {result.nextSize.baseAmpacity} A at {result.tempRating}°C</td></tr>
              )}
            </tbody>
          </table>
          {result.hardToGetSkipped && (
            <div className="warn">
              ⚠ {sizeLabel(result.hardToGetSkipped.size)} ({result.hardToGetSkipped.baseAmpacity} A at
              {' '}{result.tempRating}°C) would work but is hard to get — recommending {sizeLabel(result.size)} instead.
            </div>
          )}
          {result.warnings.map((w, i) => <div className="warn" key={i}>{w}</div>)}
          <div className="cite">
            Source: {result.table}, sized to the overcurrent device. Applies 240.4(D) small-conductor
            limits and the 110.14(C) termination column; the 90°C column is never used for sizing.
            Half-size device ratings PTS does not stock are stepped past — a procurement preference,
            not a code rule. Motor circuits (430.52) and 240.4(B)/(E)/(G) exceptions are not applied.
          </div>
        </div>
      )}

      {result && result.parallel && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Load-carrying conductors — parallel run options, {result.designAmps} A design</h3>
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
            These are the <b>phase (load-carrying) conductors</b> — the grounding conductor is sized
            separately below. Shown for loads above {PARALLEL_SUGGEST_AMPS} A. Tap a row to size the EGC
            for that makeup.
            Per NEC 310.10(G): 1/0 AWG minimum, all runs identical size, material, length, and termination.
            PTS practice: parallel conductors capped at 750 kcmil, up to 16 sets.
            Assumes each run in its own raceway with the same correction factors applied.
            Hard-to-get sizes ({UNCOMMON_SIZES.map(sizeLabel).join(', ')}) are not recommended.
          </div>
        </div>
      )}

      {config && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Equipment grounding conductor — Table 250.122</h3>
          <div className="cite" style={{ marginTop: 0, marginBottom: 8 }}>
            The grounding conductor, <b>in addition to</b> the phase conductors above.
            Sized for: <b>{config.label}</b>
            {config.assumed ? ' (fewest-runs option — tap another row in the table above to change)' : ''}
            {config.sets > 1 && !config.assumed ? ' (tap another row in the table above to change)' : ''}
          </div>

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
                    <td>{egc.ocpdAmps} A — the same device the conductor above was sized to</td>
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

    </div>
  )
}
