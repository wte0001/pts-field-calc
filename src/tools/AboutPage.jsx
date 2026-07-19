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
        <li><b>Chapter 9, Table 9</b> — AC resistance and reactance for 600V conductors (Voltage Drop tool)</li>
        <li><b>Chapter 9, Table 8</b> — conductor circular mils (Voltage Drop tool, K-factor method)</li>
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

      <h3>Wire Size tool — stock preferences and parallel runs</h3>
      <p>
        Two behaviors are <b>PTS procurement preferences, not code rules</b>: sizes that are hard
        to get (3 AWG, 300, 400, and 700 kcmil) are shown when they would satisfy the load but the
        recommendation skips to the next common size (e.g. 700 → 750 kcmil). For loads above 420 A
        (600 kcmil Cu at 75°C — the largest single conductor PTS considers practical), the tool also
        suggests parallel-run options per NEC 310.10(G): 1/0 AWG minimum, identical size, material,
        length, and terminations, each run assumed in its own raceway with the same correction factors.
        Parallel picks are capped at 750 kcmil per conductor and 16 sets per phase (PTS pulling and
        termination practice) — e.g. a 5000 A load suggests 11 sets of 750 kcmil copper.
      </p>

      <h3>Voltage Drop tool</h3>
      <p>
        Two selectable methods. <b>NEC Table 9 (R + jX):</b> effective impedance
        Z = R·cosθ + X·sinθ from Chapter 9 Table 9 (60 Hz, 75°C, three single conductors in one
        raceway, lagging PF), with VD = √3 (or 2 for single-phase) × I × L/1000 × Z. This is the
        accurate method, especially at 250 kcmil and above where reactance matters.
        <b> K-factor (quick):</b> the classic field estimate VD = 2 (or √3) × K × I × L ÷ cmil with
        K = 12.9 Cu / 21.2 Al Ω·cmil/ft — an estimating convention, not NEC data; it ignores
        reactance and understates drop on large conductors. Length is always <b>one-way</b>.
        Parallel sets divide the current. The 3% / 5% limits shown are the informational notes to
        210.19(A) and 215.2(A) — recommendations, not code requirements.
        <b>The Table 9 data file is the author's lowest-confidence NEC entry in this app — verify
        it against the printed table before relying on it (VERIFICATION.md section 10).</b>
      </p>

      <h3>Power Converter tool</h3>
      <p>
        Standard AC power relationships, no table data: three-phase kVA = √3 × V(L-L) × A ÷ 1000,
        single-phase kVA = V × A ÷ 1000, kW = kVA × PF. Balanced load assumed. Power factor affects
        only kW — the kVA ↔ A conversion is independent of it.
      </p>

      <h3>Heat Rejection tool — estimates only</h3>
      <p>
        Estimates heat rejected to the room by distribution equipment for HVAC load purposes.
        Unlike the NEC tools, <b>this tab is not based on code tables — it is an estimating
        model with typical default values.</b> Every default is editable; replace them with
        manufacturer certified loss data for final design.
      </p>
      <ul>
        <li><b>Transformers:</b> heat = no-load (core) loss + winding loss × (load fraction)².
          LV dry-type defaults are derived from the DOE 2016 minimum efficiencies
          (10 CFR 431.196, defined at 35% load), assuming core loss equals winding loss at the
          35% test point. Unit-substation (MV primary) defaults are typical manufacturer figures
          — the lowest-confidence data in the app.</li>
        <li><b>Switchboards / MCCs:</b> heat = vertical sections × watts per section (at rated
          load) × (load fraction)². Defaults of 600 W (switchboard) and 400 W (MCC) per section
          are common estimating values.</li>
        <li><b>Manufacturer data:</b> enter the stated watts directly — always preferred.</li>
      </ul>
      <p>
        Conversions: BTU/hr = W × 3.412; tons = BTU/hr ÷ 12,000. The equipment list is saved on
        the phone like the tray-fill circuit list.
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
        <li>Short-circuit or arc-flash calculations</li>
        <li>DC voltage drop (the Voltage Drop tool is AC only)</li>
        <li>Termination temperature checks per 110.14(C)</li>
        <li>Single-conductor cable tray fill (392.22(B)) or signal/control-only tray rules</li>
        <li>Overload sizing from nameplate FLA (430.6 requires nameplate, not table, for overloads)</li>
        <li>Unbalanced or harmonic loads in the power converter (balanced sinusoidal assumed)</li>
        <li>Certified heat-loss data — the Heat tab is an estimating aid, not a substitute for manufacturer data</li>
      </ul>

      <p className="cite">PTS Field Calc v1.0 — runs fully offline after first load. No data leaves the phone.</p>
    </div>
  )
}
