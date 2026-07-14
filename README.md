# PTS Field Calc

A phone-friendly NEC reference calculator for field use: wire size (Table 310.16), motor FLC (Table 430.250), conduit fill (Chapter 9), cable tray fill (392.22(A)), a kVA / A / kW power converter, and an equipment heat-rejection estimator for HVAC loads. Works fully offline after the first load. No server, no accounts, no data leaves the phone.

**Reference tool only. Verify against the NEC and stamped calculations. Complete VERIFICATION.md before giving this to the team.**

---

## Part 1: Running it on your computer (first time)

### Step 1. Install Node.js

Node.js is the program that runs the build tools. You only install it once.

1. Go to https://nodejs.org
2. Download the **LTS** version (the button on the left).
3. Run the installer. Click Next through every screen. The defaults are fine.
4. Restart your computer (this makes sure the terminal can find it).

### Step 2. Move this folder out of OneDrive

This folder is currently inside a OneDrive-synced location. The next step creates a `node_modules` folder containing ~30,000 small files, and OneDrive will choke trying to sync them.

1. Copy the whole `PTS-Field-Calc` folder to somewhere local, for example `C:\dev\PTS-Field-Calc`.
2. Do all the remaining steps in that copy. Treat the OneDrive copy as the archive.

### Step 3. Open a terminal in the folder

1. Open the `C:\dev\PTS-Field-Calc` folder in File Explorer.
2. Click in the address bar at the top, type `cmd`, press Enter. A black window opens already pointed at the right folder. That window is the "terminal."

### Step 4. Install the project's dependencies

In the terminal, type this and press Enter:

```
npm install
```

This downloads the build tools (React, Vite, the test runner) into a `node_modules` folder. It takes a minute or two. You only do this once per computer. Warnings in yellow are normal; red errors are not.

### Step 5. Run it

```
npm run dev
```

The terminal will print something like:

```
Local: http://localhost:5173/pts-field-calc/
```

**What "localhost" means:** the app is being served by your own computer, to your own computer. Nothing is on the internet. Hold Ctrl and click the link, or copy it into a browser. You should see the app. Edits to the code show up instantly.

To stop it: click in the terminal and press `Ctrl+C`.

### Step 6. Run the tests

```
npm test
```

You should see all tests pass (82 of them, covering the tray fill cases, wire sizing (including hard-to-get size skipping and parallel-run suggestions), motor FLC, conduit fill, the kVA/A/kW converter, the heat-rejection estimator, and screen render checks). Run this any time you change a value in `src/data/`.

---

## Part 2: Putting it on the internet (GitHub Pages)

GitHub Pages hosts the app for free at a public URL your team can open on their phones. One-time setup, then updates are one command.

### Step 1. Create a GitHub account and install GitHub Desktop

1. Sign up at https://github.com (free).
2. Install **GitHub Desktop** from https://desktop.github.com — it lets you avoid the git command line entirely.

### Step 2. Create a repository

1. In GitHub Desktop: File → New repository.
   - Name: `pts-field-calc` — **this exact name matters, see the warning below**
   - Local path: choose `C:\dev` (it will use your existing folder if you point it at `C:\dev\PTS-Field-Calc`... if it complains, create the repo empty and copy the project files into it)
2. Click "Publish repository" (top bar). Uncheck "Keep this code private" if you're fine with public, or keep it private (Pages on private repos requires a paid plan — public is the free path).

> **WARNING — base path.** The app is configured in `vite.config.js` with `base: '/pts-field-calc/'`. This must match your repository name exactly. If you name the repo something else, open `vite.config.js` and change that one line to `'/your-repo-name/'`. If these don't match, the deployed page loads blank and the PWA won't install. This is the #1 GitHub Pages mistake.

### Step 3. Deploy

In the terminal (in the project folder):

```
npm run deploy
```

This builds the app and pushes the result to a branch called `gh-pages`. First time only, then:

1. On github.com, open your repository → Settings → Pages.
2. Under "Build and deployment," set Source to "Deploy from a branch," Branch: `gh-pages`, folder `/ (root)`. Save.
3. Wait 2–3 minutes. Your app is at: `https://YOUR-USERNAME.github.io/pts-field-calc/`

Every future update: make your change, commit it in GitHub Desktop, then run `npm run deploy` again.

### PWA caveats on GitHub Pages

- The app caches itself for offline use via a service worker. After you deploy an update, phones that already installed it will pick up the new version the next time they open the app **with a connection**, usually on the second open. Tell the team to fully close and reopen the app after you announce an update.
- The service worker only works over HTTPS. GitHub Pages is HTTPS, so you're fine. It will NOT work if you open `index.html` directly from a file folder.
- If you ever rename the repo, change `base` in `vite.config.js` to match and redeploy, and everyone must reinstall the app.

---

## Part 3: Installing on phones

Send the team the URL. Then:

**iPhone (must use Safari):**
1. Open the URL in Safari.
2. Tap the Share button (square with the up arrow).
3. Scroll down, tap **Add to Home Screen**, then Add.
4. Open it once from the home screen icon while online. After that it works with no signal.

**Android (Chrome):**
1. Open the URL in Chrome.
2. Tap the three-dot menu → **Add to Home screen** (or "Install app" if offered).
3. Open it once from the icon while online.

The Cable Tray circuit list is saved on the phone (localStorage) and survives refreshes and offline use. "Clear all" in the app erases it. Clearing the browser's site data also erases it.

---

## Project layout

```
src/data/          All NEC table values + Southwire cable ODs + heat-loss estimating defaults (JSON)
src/calc/          Calculation logic (pure functions, no UI) - this is what the tests cover
src/calc/__tests__/  Unit tests (npm test)
src/tools/         The six tool screens + About page
VERIFICATION.md    Checklist - verify every data file against the printed NEC before team use
```

To correct a table value: edit the JSON file in `src/data/`, run `npm test`, then `npm run deploy`.

The Power tab uses standard AC power math (kVA = √3 × V × A ÷ 1000 three-phase; kW = kVA × PF) — no table data. The Heat tab is an **estimating tool**: its default loss values (in `src/data/heat_loss_defaults.json`) are typical figures, editable on every row, and should be replaced with manufacturer certified data for final HVAC design.

## What it deliberately does not do

Voltage drop, short circuit, arc flash, termination checks per 110.14(C), single-conductor tray fill, or overload sizing from nameplate. Scope is the NEC lookups plus the two field converters, done transparently, with the math shown.
