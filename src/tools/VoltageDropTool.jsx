import React, { useMemo, useState } from 'react'
import {
  voltageDropTable9, voltageDropKFactor, VD_SIZES, RACEWAY_TYPES,
  VD_GUIDE_BRANCH_PCT, VD_GUIDE_TOTAL_PCT
} from '../calc/voltageDrop.js'
import { groundConductor, nextStandardOcpd } from '../calc/groundWire.js'

const VOLTAGE_PRESETS = {
  3: [208, 240, 400, 480, 600, 4160],
  1: [120, 208, 240, 277]
}
// Numeric test rather than a hardcoded list, so EGC sizes from Table 250.122
// (which reaches 1200 kcmil) label correctly alongside the Table 9 sizes.
const sizeLabel = s => (/^\d+$/.test(s) && parseInt(s, 10) >= 250) ? `${s} kcmil` : `${s} AWG`
const BIG_SIZES = ['250', '300', '350', '400', '500', '600', '750', '1000']

const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—'

export default function VoltageDropTool() {
  const [method, setMethod] = useState('t9')
  const [amps, setAmps] = useState('')
  const [lengthFt, setLengthFt] = useState('')
  const [phase, setPhase] = useState(3)
  const [voltage, setVoltage] = useState('480')
  const [size, setSize] = useState('3/0')
  const [material, setMaterial] = useState('copper')
  const [raceway, setRaceway] = useState('steel')
  const [pf, setPf] = useState('0.85')
  const [sets, setSets] = useState('1')
  const [ocpd, setOcpd] = useState('')
  const [minSize, setMinSize] = useState('')
  const [egcMaterial, setEgcMaterial] = useState('copper')

  const changePhase = p => {
    setPhase(p)
    setVoltage(p === 3 ? '480' : '120')
  }

  const result = useMemo(() => {
    if (!amps || !lengthFt) return null
    const p = {
      amps: parseFloat(amps),
      lengthFt: parseFloat(lengthFt),
      voltage: parseFloat(voltage),
      phase,
      size,
      material,
      raceway,
      pf: parseFloat(pf),
      sets: parseInt(sets, 10)
    }
    return method === 't9' ? voltageDropTable9(p) : voltageDropKFactor(p)
  }, [method, amps, lengthFt, voltage, phase, size, material, raceway, pf, sets])

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

  return (
    <div>
      <h2>Voltage Drop</h2>

      <label className="fld">Method</label>
      <div className="seg" role="group" aria-label="Calculation method">
        <button className={method === 't9' ? 'on' : ''} onClick={() => setMethod('t9')}>NEC Table 9 (R + jX)</button>
        <button className={method === 'k' ? 'on' : ''} onClick={() => setMethod('k')}>K-factor (quick)</button>
      </div>

      <label className="fld" htmlFor="vd-amps">Load current (A)</label>
      <input id="vd-amps" type="number" inputMode="decimal" min="0" placeholder="e.g. 200"
        value={amps} onChange={e => setAmps(e.target.value)} />

      <label className="fld" htmlFor="vd-len">Circuit length (ft) — ONE-WAY, not round trip</label>
      <input id="vd-len" type="number" inputMode="decimal" min="0" placeholder="e.g. 250"
        value={lengthFt} onChange={e => setLengthFt(e.target.value)} />

      <label className="fld">System</label>
      <div className="seg" role="group" aria-label="Phase">
        <button className={phase === 3 ? 'on' : ''} onClick={() => changePhase(3)}>Three-phase</button>
        <button className={phase === 1 ? 'on' : ''} onClick={() => changePhase(1)}>Single-phase</button>
      </div>

      <label className="fld" htmlFor="vd-volt">Voltage (V){phase === 3 ? ' — line-to-line' : ''}</label>
      <div className="seg" role="group" aria-label="Voltage presets" style={{ marginBottom: 8 }}>
        {VOLTAGE_PRESETS[phase].map(v => (
          <button key={v} className={vNum === v ? 'on' : ''} onClick={() => setVoltage(String(v))}>{v}</button>
        ))}
      </div>
      <input id="vd-volt" type="number" inputMode="decimal" min="0" value={voltage}
        onChange={e => setVoltage(e.target.value)} />

      <div className="rowgrid" style={{ marginTop: 4 }}>
        <div>
          <label className="fld">Conductor size</label>
          <select value={size} onChange={e => setSize(e.target.value)}>
            {VD_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="fld">Parallel sets</label>
          <input type="number" inputMode="numeric" min="1" step="1" value={sets}
            onChange={e => setSets(e.target.value)} />
        </div>
      </div>

      <label className="fld">Conductor material</label>
      <div className="seg" role="group" aria-label="Conductor material">
        <button className={material === 'copper' ? 'on' : ''} onClick={() => setMaterial('copper')}>Copper</button>
        <button className={material === 'aluminum' ? 'on' : ''} onClick={() => setMaterial('aluminum')}>Aluminum</button>
      </div>

      {method === 't9' && (
        <>
          <label className="fld">Raceway type (affects R and X)</label>
          <div className="seg" role="group" aria-label="Raceway type">
            {RACEWAY_TYPES.map(rt => (
              <button key={rt.id} className={raceway === rt.id ? 'on' : ''} onClick={() => setRaceway(rt.id)}>{rt.label}</button>
            ))}
          </div>
          <label className="fld" htmlFor="vd-pf">Power factor (lagging)</label>
          <input id="vd-pf" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={pf}
            onChange={e => setPf(e.target.value)} />
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
              value={ocpd} onChange={e => setOcpd(e.target.value)} />
          </div>
          <div>
            <label className="fld">Min. size for ampacity</label>
            <select value={minSize} onChange={e => setMinSize(e.target.value)}>
              <option value="">Same as selected ({sizeLabel(size)})</option>
              {VD_SIZES.map(s => <option key={s} value={s}>{sizeLabel(s)}</option>)}
            </select>
          </div>
        </div>

        <label className="fld">EGC material</label>
        <div className="seg" role="group" aria-label="EGC material">
          <button className={egcMaterial === 'copper' ? 'on' : ''} onClick={() => setEgcMaterial('copper')}>Copper</button>
          <button className={egcMaterial === 'aluminum' ? 'on' : ''} onClick={() => setEgcMaterial('aluminum')}>Aluminum</button>
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
              the Wire tab covers the full Table 310.16 range.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
