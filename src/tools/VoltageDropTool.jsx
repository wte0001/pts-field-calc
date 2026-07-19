import React, { useMemo, useState } from 'react'
import {
  voltageDropTable9, voltageDropKFactor, VD_SIZES, RACEWAY_TYPES,
  VD_GUIDE_BRANCH_PCT, VD_GUIDE_TOTAL_PCT
} from '../calc/voltageDrop.js'

const VOLTAGE_PRESETS = {
  3: [208, 240, 400, 480, 600, 4160],
  1: [120, 208, 240, 277]
}
const KCMIL = ['250', '300', '350', '400', '500', '600', '750', '1000']
const sizeLabel = s => KCMIL.includes(s) ? `${s} kcmil` : `${s} AWG`
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
    </div>
  )
}
