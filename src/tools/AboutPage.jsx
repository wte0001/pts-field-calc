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
        <li><b>Table 310.15(C)(1)</b> — adjustment for more than three current-carrying conductors (Wire Size advanced, and the Conduit Fill parallel-set comparison)</li>
        <li><b>Table 250.122</b> — minimum equipment grounding conductor size (Wire Size tool)</li>
        <li><b>240.6(A)</b> — standard overcurrent device ratings (Wire Size tool, EGC section)</li>
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

      <h3>Wire Size tool — how a conductor is sized</h3>
      <p>
        The conductor is sized to the <b>overcurrent device</b>, not to the raw load, because two rules
        sit on top of Table 310.16:
      </p>
      <ul>
        <li><b>240.4(D) small-conductor limits.</b> 14, 12, and 10 AWG copper may not be protected above
          15, 20, and 30 A (12 and 10 AWG aluminum above 15 and 25 A) whatever the ampacity column says.
          These are the asterisked rows on the printed table. It is why a 40 A circuit cannot use 10 AWG
          even though the 75°C column shows 35 A.</li>
        <li><b>110.14(C) termination temperature.</b> Circuits of 100 A or less are sized from the
          <b>60°C</b> column, above 100 A from the <b>75°C</b> column. The 90°C column is never used for
          sizing — it is only ever a derating basis. Switch to "All listed 75°C" only where every
          termination in the circuit is listed and identified for it, per 110.14(C)(1)(a).</li>
      </ul>
      <p>
        Continuous loads are taken at 125% by default, and the device rating steps up to the next size
        PTS stocks — the half sizes (25, 35, 45, 110 A) are skipped, which is a <b>procurement
        preference, not a code rule</b>, and is editable in <code>src/data/pts_ocpd_sizes.json</code>.
        A 27 A continuous load therefore gives a 40 A device and 8 AWG copper, and the tool says in
        plain words why 10 AWG was ruled out. Enter a device rating yourself to override the derived one.
      </p>
      <p>
        <b>Not applied:</b> motor branch-circuit rules (430.52 permits far larger devices than 125%),
        and the 240.4(B)/(E)/(G) next-size-up and specific-application exceptions. Check those yourself.
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

      <h3>Equipment grounding conductor (Wire Size tool)</h3>
      <p>
        The EGC is sized from <b>Table 250.122 on the overcurrent device rating</b>, not on the
        conductor size — so the Wire Size tool asks for the device rating, defaulting to the next
        standard rating at or above the load per 240.6(A). <b>That default is a convenience, not a
        device selection:</b> continuous-load factors, 240.4 small-conductor rules, and motor rules
        (430.52) all govern the real choice. Three companion rules are applied automatically:
      </p>
      <ul>
        <li><b>250.122(B)</b> — when the ungrounded conductors are increased above the minimum size
          with sufficient ampacity, the EGC increases proportionally by circular-mil area. Because
          this app skips hard-to-get sizes (700 → 750 kcmil), that upsizing triggers the rule and the
          tool shows the arithmetic. Voltage-drop upsizing does the same in real designs — a step
          commonly missed.</li>
        <li><b>250.122(A)</b> — the EGC is never required to exceed the circuit conductor size.</li>
        <li><b>250.122(F)</b> — parallel runs. The EGC is sized on the device rating and is never
          divided among the runs. The tool lists the permitted arrangements: a full-size EGC in
          <em>each</em> separate raceway or cable; <em>or</em> a single EGC for the group where all the
          parallel conductors share one raceway, auxiliary gutter, or cable tray; <em>or</em>, for
          parallel multiconductor cables in a common cable tray, <b>one standalone EGC run in the tray</b>,
          bonded together with the grounds inside the individual cables — so each cable does not need
          its own full-size EGC. Separately, <b>392.60</b> permits a metallic tray system itself to serve
          as the EGC where it meets that article (minimum metal cross-section per Table 392.60(A),
          qualified-persons servicing, marking, bonded sections and fittings).
          <b> The subdivision numbering under 250.122(F) was reorganized in recent code cycles — confirm
          it against your edition (VERIFICATION.md section 11).</b></li>
      </ul>
      <p>
        Tap any row of the parallel-runs table to size the EGC for that makeup. For large feeders where
        no single conductor is adequate, the EGC section still appears and sizes against the fewest-runs
        option. Note the EGC follows the <em>device</em> rating, not the per-run current: a 1200 A feeder
        split three ways still needs 3/0 copper in each raceway, not the 1 AWG a 400 A share would suggest.
      </p>
      <p>
        Aluminum EGCs carry the 250.120(B) restriction (not in contact with masonry or earth, not in
        corrosive conditions, not within 18 in. of earth). Grounded (neutral) conductors and
        grounding-electrode conductors are different conductors governed by different rules
        (250.102, 250.66) and are <b>not</b> covered. Motor circuits per 250.122(D) use the
        branch-circuit protective device rating — enter that rating rather than the FLC.
      </p>

      <h3>Conduit fill, parallel sets, and the derating trap</h3>
      <p>
        Conduit fill counts <b>every physical conductor</b> — phases, neutrals, and grounds alike. A
        Chapter 9 note requires equipment grounding and bonding conductors to be included using their
        actual dimensions, so give the ground its own row (the app carries insulated dimensions from
        Table 5; a bare EGC is smaller, so entering it as insulated is conservative). Fill limits come
        from Table 1: 53% for one conductor, 31% for two, 40% for three or more.
      </p>
      <p>
        Enter the conductors for <b>one set</b> and set the parallel set count. The tool then compares
        both arrangements: one conduit per set, or every set sharing one conduit. Fill alone favours the
        single big conduit — <b>ampacity usually does not.</b> Piling sets into one raceway pushes the
        current-carrying count past three and triggers the Table 310.15(C)(1) adjustment, so the tool
        shows the current-carrying count, the resulting factor, and what it costs in amps. Three sets of
        350 kcmil copper is the classic example: three 2-1/2 in. conduits carry 930 A per phase, while
        one 4 in. conduit carries 651 A — a 30% loss to save conduit.
      </p>
      <p>
        Roles drive the current-carrying count, not the fill: a ground never counts, and a neutral counts
        only where it carries harmonic current from nonlinear loads per 310.15(E). Note also that with
        metallic conduit all phases of a set must share one raceway (300.3(B), and 300.20(A) for induced
        heating), and per 250.122(F) parallel sets in separate raceways each need a full-size EGC while
        sets sharing one raceway may share one. The tool does not size conductors, check terminations per
        110.14(C), or check jam ratio, pull tension, or the 60% nipple allowance.
      </p>

      <h3>Multiple tray designs</h3>
      <p>
        The Cable Tray Fill tab holds up to <b>10 independent tray designs</b> — enough for an electrical
        room with several trays leaving it — each with its own circuit list, standalone EGC setting, and
        result. Trays appear as a scrollable strip at the top, each chip showing its computed minimum
        width, so the whole room is visible without switching. Rename a tray to match your drawing
        callout, duplicate one to build a similar tray without re-entering the list, or delete it (the
        last tray cannot be deleted). With more than one tray an <b>All trays</b> roll-up lists every
        tray's cable count, case, width, and status; tap a row to open it.
      </p>
      <p>
        Everything is saved on the phone. Exports carry the tray name: <em>Export this tray</em> writes
        one CSV, <em>Export all trays</em> writes a single CSV with a room roll-up followed by each
        tray's detail, and the cross-section SVG is titled and filenamed with the tray name for a
        submittal. Work saved before this feature existed is folded into the first tray automatically.
      </p>

      <h3>Tray cross-section drawing</h3>
      <p>
        The Cable Tray Fill result card draws a head-on section of the tray with the cables laid in,
        updating as you edit the circuit list. Inside width and cable ODs are to scale;
        <b> rail and rung proportions are illustrative</b> of an aluminum NEMA VE 1 ladder tray and are
        not certified manufacturer dimensions — fill is governed by width and area, never by the drawn
        rail shape. Multiconductor cables show three conductors plus their internal ground; a standalone
        EGC shows as a single conductor, which makes visible why it is <em>in addition to</em> the grounds
        already inside the cables. Cables are numbered by circuit-list row with a key beneath, and the
        drawing exports as an SVG for a submittal.
      </p>
      <p>
        <b>The drawing is single layer only, and that is a deliberate constraint.</b> 392.22(A)(1)(a) and
        (c) require 4/0-and-larger cables in a single layer, and stacking smaller cables traps heat and
        changes the ampacity basis for cables in tray (392.80(A)). So rather than drawing a second layer
        when cables exceed the width, the tool reports the overflow. This exposes a real gap worth
        knowing: for cables all smaller than 4/0 the fill rule is <em>area</em>-based and does not itself
        require one layer, so a tray can pass the area rule at a width the cables cannot physically be
        laid into side by side. When that happens the result card says so and reports the width a single
        layer would need.
      </p>

      <h3>Standalone tray EGC and tray fill</h3>
      <p>
        A standalone EGC run in a tray occupies real tray space, so the Cable Tray Fill tool has an
        optional entry for it and <b>counts it in the fill</b>. Its diameter is derived from the
        Chapter 9 Table 5 approximate area (OD = √(4·area/π)) so it stays consistent with how every
        other item in that tool is measured, and it can be overridden. <b>Code basis, stated plainly:</b>
        392.22(A) addresses multiconductor cables while single conductors fall under 392.22(B), and the
        NEC gives no single tabulated case for mixing them in one tray. The app counts the EGC under the
        same 4/0-or-larger classification as the cables — which means it can change the governing case
        (adding a 1/0 EGC to a tray of 4/0 cables moves Case A to the mixed Case C) and can push the
        required width up a size. That is a deliberate, conservative treatment, not a literal table
        application; confirm it with the engineer of record. Turn it off if the tray itself serves as the
        EGC per 392.60 or each cable carries its own full-size ground.
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
        The tab also carries its own <b>250.122 grounding section</b>: upsizing a conductor for voltage
        drop triggers 250.122(B), so enter the device rating and the size ampacity alone would have
        required, and it computes the proportionally increased EGC for the conductor you install —
        including the parallel-set arrangements when sets is above 1.
        The Table 9 / Table 8 data was verified in 2026-07 against multiple independent published
        reproductions of the table text and manufacturer engineering handbooks with zero
        discrepancies; a spot-check against the printed NEC 2023 remains as final sign-off
        (VERIFICATION.md section 10).
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
