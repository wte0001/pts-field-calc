import React from 'react'
import cableData from '../data/tc_cable_dimensions.json'

export default function AboutPage() {
  return (
    <div className="about">
      <h2>About PTS Field Calc</h2>

      <div className="warn">
        Reference tool only. Verify against the NEC and stamped calculations.
        This app does not replace engineering judgment or a licensed engineer's review.
      </div>

      <h3>Code edition</h3>
      <p>All table references are to the <b>2023 National Electrical Code (NFPA 70)</b>.</p>

      <h3>NEC tables used</h3>
      <ul>
        <li><b>Table 310.16</b> — conductor ampacity (Wire Size tool)</li>
        <li><b>Table 310.15(B)(1)(1)</b> — ambient temperature correction, 30°C base (Wire Size, advanced)</li>
        <li><b>Table 310.15(C)(1)</b> — adjustment for more than three current-carrying conductors (Wire Size, advanced)</li>
        <li><b>Table 430.250</b> — three-phase motor full-load current (Motor FLC tool)</li>
        <li><b>Chapter 9, Table 1</b> — percent conduit fill (Conduit Fill tool)</li>
        <li><b>Chapter 9, Table 4</b> — conduit internal areas (Conduit Fill tool)</li>
        <li><b>Chapter 9, Table 5</b> — insulated conductor dimensions (Conduit Fill tool)</li>
        <li><b>392.22(A)(1) and Table 392.22(A)</b> — multiconductor cable fill in ladder tray (Cable Tray Fill tool)</li>
      </ul>

      <h3>Cable dimension data</h3>
      <p>
        Tray-fill cable ODs come from Southwire catalog data: <b>SPEC 45052</b>{' '}
        (control cable, 3/C no ground, sizes 14–10 AWG) and <b>SPEC 45252</b>{' '}
        (power cable, 3/C + ground, XHHW-2/XLPE, PVC jacket, sizes 8 AWG–750 kcmil). All copper, 600V, Type TC-ER.
      </p>
      <p>
        <b>{cableData._meta.caveat}</b>
      </p>
      <p>
        300 kcmil and 400 kcmil are not in Southwire's standard 3/C power line; those sizes require
        manual OD entry from vendor data. Cable area is computed as π/4 × OD².
      </p>

      <h3>Data verification</h3>
      <p>
        Every table value lives in a JSON file under <code>src/data/</code> and is listed in{' '}
        <code>VERIFICATION.md</code> at the repository root. Values the author could not enter with
        confidence are stored as <code>null</code> and the app says so instead of guessing.
        Verify all tables against the printed NEC 2023 before relying on this tool.
      </p>

      <h3>What this app does not do</h3>
      <ul>
        <li>Voltage drop, short-circuit, or arc-flash calculations</li>
        <li>Termination temperature checks per 110.14(C)</li>
        <li>Single-conductor cable tray fill (392.22(B)) or signal/control-only tray rules</li>
        <li>Overload sizing from nameplate FLA (430.6 requires nameplate, not table, for overloads)</li>
      </ul>

      <p className="cite">PTS Field Calc v1.0 — runs fully offline after first load. No data leaves the phone.</p>
    </div>
  )
}
