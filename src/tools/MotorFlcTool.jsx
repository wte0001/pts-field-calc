import React, { useMemo, useState } from 'react'
import { motorFlc, HP_LIST, VOLTAGE_LIST } from '../calc/motorFlc.js'

export default function MotorFlcTool() {
  const [hp, setHp] = useState('25')
  const [voltage, setVoltage] = useState(460)

  const result = useMemo(() => motorFlc(hp, voltage), [hp, voltage])

  return (
    <div>
      <h2>Motor FLC — NEC Table 430.250</h2>

      <label className="fld" htmlFor="m-hp">Horsepower (three-phase)</label>
      <select id="m-hp" value={hp} onChange={e => setHp(e.target.value)}>
        {HP_LIST.map(h => <option key={h} value={h}>{h} HP</option>)}
      </select>

      <label className="fld">Voltage</label>
      <div className="seg" role="group" aria-label="Voltage">
        {VOLTAGE_LIST.map(v => (
          <button key={v} className={voltage === v ? 'on' : ''} onClick={() => setVoltage(v)}>{v}</button>
        ))}
      </div>

      {result.error && <div className="err">{result.error}</div>}

      {!result.error && (
        <div className="card result">
          <div className="bigval">{result.flc}<span className="unit"> A</span></div>
          <table className="kv">
            <tbody>
              <tr><td>Table FLC</td><td>{result.flc} A ({result.hp} HP, {result.voltage} V, 3Ø)</td></tr>
              <tr>
                <td>125% of FLC <em>(derived)</em></td>
                <td><b>{result.minBranchAmpacity} A</b> — minimum branch-circuit conductor ampacity per NEC 430.22</td>
              </tr>
              <tr>
                <td>Overload reference <em>(derived label)</em></td>
                <td>{result.overloadReferenceFlc} A — table FLC for overload sizing reference (430.32 uses nameplate current, not this table)</td>
              </tr>
            </tbody>
          </table>
          <div className="cite">Source: {result.table}, induction-type squirrel cage and wound rotor. Use nameplate FLA for overload protection per 430.6(A).</div>
        </div>
      )}
    </div>
  )
}
