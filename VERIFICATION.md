# VERIFICATION.md — Data Verification Checklist

**Status: NOT VERIFIED. Do not release this tool to the team until every box below is checked against the printed NEC 2023 (NFPA 70) and current Southwire spec sheets.**

Every code/table value in this app lives in a JSON file under `src/data/`. Nothing is computed from interpolation. Values the author could not enter with confidence are stored as `null`; the app reports "unverified" instead of guessing when it hits one. After you verify or correct a value, check the box. If you fix a value, re-run `npm test` afterward.

How to edit: open the JSON file in any text editor (Notepad works), change the number, save. The app picks it up on the next `npm run dev` or rebuild.

---

## 1. `src/data/nec_310_16.json` — Table 310.16 (conductor ampacity)

- [ ] Copper 60°C column, 14 AWG–2000 kcmil (28 values)
- [ ] Copper 75°C column, 14 AWG–2000 kcmil (28 values)
- [ ] Copper 90°C column, 14 AWG–2000 kcmil (28 values)
- [ ] Aluminum 60°C column, 12 AWG–1000 kcmil (24 values)
- [ ] Aluminum 75°C column, 12 AWG–1000 kcmil (24 values)
- [ ] Aluminum 90°C column, 12 AWG–1000 kcmil (24 values)
- [ ] **NULLS — must be filled in before aluminum above 1000 kcmil works:** aluminum 1250, 1500, 1750, 2000 kcmil, all three temperature columns (12 values, all `null`)
- [ ] Confirm 14 AWG aluminum is correctly absent (not listed in the table)

## 2. `src/data/nec_310_15_b1.json` — Table 310.15(B)(1)(1) (ambient correction)

- [ ] All factors, 60°C column (10 values + nulls above 55°C ambient)
- [ ] All factors, 75°C column (13 values + nulls above 70°C ambient)
- [ ] All factors, 90°C column (16 values)
- [ ] Confirm the `null` cells correspond to dashes in the printed table (ambient at/above insulation limit)

Note: these factors equal sqrt((Tc − Ta)/(Tc − 30)) rounded to 2 decimals, which matches the printed table; spot-checking a few per column is reasonable.

## 3. `src/data/nec_310_15_c1.json` — Table 310.15(C)(1) (conductor-count adjustment)

- [ ] 4–6: 80% · 7–9: 70% · 10–20: 50% · 21–30: 45% · 31–40: 40% · 41+: 35%

## 4. `src/data/nec_430_250.json` — Table 430.250 (3-phase motor FLC)

- [ ] 460V column, 1/2–500 HP (27 values)
- [ ] 575V column, 1/2–500 HP (27 values)
- [ ] 230V column, 1/2–200 HP (21 values)
- [ ] 208V column, 1/2–200 HP (21 values)
- [ ] 200V column, 1/2–200 HP (21 values) — **author flagged this column as lowest confidence**
- [ ] **NULLS:** 250–500 HP at 200V, 208V, and 230V (18 cells). Check whether the printed table even lists these; if it shows dashes, leave as `null`. If it shows values, enter them.

## 5. `src/data/nec_ch9_table4.json` — Chapter 9 Table 4 (conduit internal areas, 100% column)

- [ ] EMT, 1/2–4 in. (10 values)
- [ ] RMC, 1/2–6 in. (12 values)
- [ ] PVC Schedule 40, 1/2–6 in. (12 values) 
- [ ] PVC Schedule 80, 1/2–6 in. (12 values) — **author flagged lower confidence**
- [ ] LFMC, 3/8–2 in. (7 values) — **author flagged lower confidence**
- [ ] **NULLS:** LFMC 2-1/2, 3, 3-1/2, 4 in. (4 cells)
- [ ] Confirm the fill percentages applied in code match Chapter 9 Table 1: 53% (1 conductor), 31% (2), 40% (over 2) — see `src/calc/conduitFill.js`, function `fillLimit`

## 6. `src/data/nec_ch9_table5.json` — Chapter 9 Table 5 (conductor approximate areas)

- [ ] THHN/THWN/THWN-2, 14 AWG–1000 kcmil (24 values)
- [ ] XHHW/XHHW-2, 14 AWG–500 kcmil (18 values)
- [ ] **NULLS:** XHHW-2 600, 700, 750, 800, 900, 1000 kcmil (6 cells)

## 7. `src/data/nec_392_22a.json` — Table 392.22(A) Column 1 (ladder tray allowable fill)

Values were supplied by the project engineer and entered exactly: 6 in = 7.0, 9 = 10.5, 12 = 14.0, 18 = 21.0, 24 = 28.0, 30 = 35.0, 36 = 42.0 sq in.

- [ ] Verify all seven Column 1 values against printed Table 392.22(A), ladder/ventilated trough column
- [ ] Verify the Column 2 rule applied in code (Column 1 − 1.2 × Sd for mixed sizes) against the table note — see `src/calc/trayFill.js`
- [ ] Verify the Case A rule (sum of ODs ≤ tray width when all cables ≥ 4/0) against 392.22(A)(1)(a)

## 8. `src/data/tc_cable_dimensions.json` — Southwire TC-ER cable ODs

Values were supplied by the project engineer from Southwire catalog data (SPEC 45052 control, SPEC 45252 power) and entered exactly as provided. They are nominal and subject to manufacturing tolerance and catalog revision.

- [ ] Re-check all 17 ODs against the **current** Southwire SPEC 45052 / SPEC 45252 sheets (catalog revisions change)
- [ ] Confirm 300 kcmil and 400 kcmil remain absent from the standard 3/C power line (they are intentionally `null` and force manual OD entry in the app)
- [ ] Confirm 14/12/10 AWG rows are flagged in the app as control-cable construction (3/C, no ground)

## 9. `src/data/heat_loss_defaults.json` — Heat Rejection tool estimating defaults

**This file is different from the NEC files above: it contains estimating values, not code values.** The app labels the whole Heat tab as an estimate and every default is editable in the UI. Verification here means confirming the defaults are reasonable starting points, not that they are "correct" — the correct number for a real project is always the manufacturer's certified loss data.

- [ ] LV dry-type efficiencies (11 values, three-phase, 15–1000 kVA) against DOE 2016 / 10 CFR 431.196 (efficiency defined at 35% load, unity PF). The app derives no-load and winding losses from these in `src/calc/heatReject.js` assuming core loss = winding loss at the 35% test point — review that assumption.
- [ ] MV dry-type unit-substation typical losses (7 rows, 300–2500 kVA) — **author flagged as the lowest-confidence data in the app.** Compare against a couple of recent transformer submittals (certified test reports) and adjust to your fleet's typical values.
- [ ] Watts-per-section defaults (switchboard 600 W, MCC 400 W, unit-sub LV sections 600 W at rated load) — sanity-check against manufacturer heat-release data from recent projects.
- [ ] Confirm the load-scaling model in `src/calc/heatReject.js` (core loss constant, conduction losses × load², BTU/hr = W × 3.412142) reads correctly to another engineer.

## 10. `src/data/nec_ch9_table9.json` — Chapter 9 Table 9 (AC resistance and reactance) + Table 8 circular mils

**Status: research-verified 2026-07-19, awaiting printed-book sign-off.** All 186 values were entered from memory, then verified by a multi-source research pass with adversarial cross-checking: every value matched primary reproductions of the 2017 NEC table text (licensed Chapter 9 PDFs from two independent hosts, the 2007 California Electrical Code adoption of the same tables, 2011/2014 Table 8 scans) and independent non-NEC sources (Southwire Power Cable Manual, Okonite Engineering Handbook, a Mike Holt textbook, a PE-authored PDH course) — **zero discrepancies found in any column, including the ones originally flagged low-confidence.** The Table 9 Note 2 effective-Z formula, the two-column XL layout, the 21-size list (no 700/800/900 kcmil), and the missing 14 AWG aluminum row were likewise confirmed against the table text.

Remaining risk is narrow: the primary text read was the **2017** edition; secondary sources say Tables 8 and 9 are unchanged through 2020/2023 but those editions were not directly read. The book check below is therefore a spot-check against the printed **2023** NEC rather than a from-scratch verification. All values are ohms per 1000 ft at 75°C, 60 Hz, three single conductors in conduit.

- [ ] Spot-check XL columns against printed 2023 Table 9 (a few rows incl. the genuine quirks: 8 AWG > 10 AWG, 1 AWG 0.046 > 2 AWG 0.045, 250 kcmil steel 0.052 > 4/0 0.051)
- [ ] Spot-check copper resistance columns (PVC/aluminum/steel) — e.g. 3/0: 0.077/0.082/0.079, 250: 0.052/0.057/0.054, 500: 0.027/0.032/0.029
- [ ] Spot-check aluminum-wire resistance columns — e.g. 250: 0.085/0.090/0.086, 1000: 0.023/0.027/0.025; confirm the 14 AWG row is dashes
- [ ] Confirm 2023 Table 9 still lists exactly 21 sizes (no 700/800/900 kcmil, nothing above 1000)
- [ ] Confirm 2023 Note 2 still reads Ze = R × PF + XL sin[arccos(PF)] (the formula in `src/calc/voltageDrop.js`)
- [ ] Circular mils vs. printed Table 8 (AWG sizes are printed digits; kcmil rows show a dash — the app's kcmil × 1000 entries are definitional)
- [ ] K-factor constants (12.9 Cu / 21.2 Al Ω·cmil/ft) — research confirmed these are a Table-8-derived estimating convention appearing nowhere in the NEC text; confirm the app still labels them as such

---

## Edition caveat

The author's table knowledge is strongest from the 2017/2020 NEC cycles. No changes to these specific table values in the 2023 edition are known to the author, but that claim itself is unverified. Check against the **2023** book, not an older one.

## Sign-off

| Section | Verified by | Date |
|---|---|---|
| 1. Table 310.16 | | |
| 2. Table 310.15(B)(1)(1) | | |
| 3. Table 310.15(C)(1) | | |
| 4. Table 430.250 | | |
| 5. Ch. 9 Table 4 | | |
| 6. Ch. 9 Table 5 | | |
| 7. Table 392.22(A) | | |
| 8. Southwire ODs | | |
| 9. Heat-loss estimating defaults | | |
| 10. Ch. 9 Table 9 / Table 8 (voltage drop) | | |
