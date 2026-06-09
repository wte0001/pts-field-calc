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
