import React, { useMemo, useState } from 'react'
import { powerConvert } from '../calc/powerConvert.js'

const VOLTAGE_PRESETS = {
  3: [208, 240, 400, 480, 600, 4160],
  1: [120, 208, 240, 277]
}
const KIND_LABEL = { kva: 'kVA', amps: 'Amps', kw: 'kW' }

const fmt = x => {
  if (!Number.isFinite(x)) return '—'
  if (x >= 1000) return Math.round(x).toLocaleString()
  if (x >= 10) return x.toFixed(1)
  return x.toFixed(2)
}

export default function PowerConvertTool() {
  const [known, setKnown] = useState('kva')
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState(3)
  const [voltage, setVoltage] = useState('480')
  const [pf, setPf] = useState('0.85')

  const changePhase = p => {
    setPhase(p)
    setVoltage(p === 3 ? '480' : '120')
  }

  const result = useMemo(() => {
    if (!value) return null
    return powerConvert(known, parseFloat(value), parseFloat(voltage), phase, parseFloat(pf))
  }, [known, value, phase, voltage, pf])

  const vNum = parseFloat(voltage)
  const kText = phase === 3 ? '√3 × V' : 'V'

  return (
    <div>
      <h2>Power Converter — kVA · A · kW</h2>

      <label className="fld">I know the...</label>
      <div className="seg" role="group" aria-label="Known quantity">
        {['kva', 'amps', 'kw'].map(k => (
          <button key={k} className={known === k ? 'on' : ''} onClick={() => setKnown(k)}>{KIND_LABEL[k]}</button>
        ))}
      </div>

      <label className="fld" htmlFor="pc-val">{KIND_LABEL[known]}</label>
      <input id="pc-val" type="number" inputMode="decimal" min="0"
        placeholder={known === 'amps' ? 'e.g. 150' : 'e.g. 112.5'}
        value={value} onChange={e => setValue(e.target.value)} />

      <label className="fld">System</label>
      <div className="seg" role="group" aria-label="Phase">
        <button className={phase === 3 ? 'on' : ''} onClick={() => changePhase(3)}>Three-phase</button>
        <button className={phase === 1 ? 'on' : ''} onClick={() => changePhase(1)}>Single-phase</button>
      </div>

      <label className="fld" htmlFor="pc-volt">
        Voltage (V){phase === 3 ? ' — line-to-line' : ''}
      </label>
      <div className="seg" role="group" aria-label="Voltage presets" style={{ marginBottom: 8 }}>
        {VOLTAGE_PRESETS[phase].map(v => (
          <button key={v} className={vNum === v ? 'on' : ''} onClick={() => setVoltage(String(v))}>{v}</button>
        ))}
      </div>
      <input id="pc-volt" type="number" inputMode="decimal" min="0" value={voltage}
        onChange={e => setVoltage(e.target.value)} />

      <label className="fld" htmlFor="pc-pf">Power factor (affects kW only)</label>
      <input id="pc-pf" type="number" inputMode="decimal" min="0.01" max="1" step="0.01" value={pf}
        onChange={e => setPf(e.target.value)} />

      {result && result.error && <div className="err">{result.error}</div>}

      {result && !result.error && (
        <div className="card result">
          <div className="trio">
            {['kva', 'amps', 'kw'].map(k => (
              <div key={k} className={known === k ? 'tcell in' : 'tcell'}>
                <div className="tv">{fmt(k === 'kva' ? result.kva : k === 'amps' ? result.amps : result.kw)}</div>
                <div className="tl">{k === 'amps' ? 'A' : KIND_LABEL[k]}{known === k ? ' (entered)' : ''}</div>
              </div>
            ))}
          </div>
          <table className="kv">
            <tbody>
              <tr>
                <td>Apparent power</td>
                <td>kVA = {kText} × A ÷ 1000 = <b>{fmt(result.kva)} kVA</b></td>
              </tr>
              <tr>
                <td>Current</td>
                <td>A = kVA × 1000 ÷ ({kText}) = <b>{fmt(result.amps)} A</b></td>
              </tr>
              <tr>
                <td>Real power</td>
                <td>kW = kVA × PF = {fmt(result.kva)} × {result.pf} = <b>{fmt(result.kw)} kW</b></td>
              </tr>
            </tbody>
          </table>
          <div className="cite">
            {result.phase === 3 ? `Three-phase, ${result.voltage} V line-to-line, √3 = 1.732.` : `Single-phase, ${result.voltage} V.`}{' '}
            kVA ↔ A does not depend on power factor; kW does. Balanced load assumed.
          </div>
        </div>
      )}
    </div>
  )
}
