import React, { useState } from 'react'
import WireSizeTool from './tools/WireSizeTool.jsx'
import MotorFlcTool from './tools/MotorFlcTool.jsx'
import ConduitFillTool from './tools/ConduitFillTool.jsx'
import TrayFillTool from './tools/TrayFillTool.jsx'
import PowerConvertTool from './tools/PowerConvertTool.jsx'
import HeatRejectTool from './tools/HeatRejectTool.jsx'
import AboutPage from './tools/AboutPage.jsx'

const TABS = [
  { id: 'wire', label: 'Wire', ic: '⌀' },
  { id: 'motor', label: 'Motor', ic: 'M' },
  { id: 'conduit', label: 'Conduit', ic: '◎' },
  { id: 'tray', label: 'Tray', ic: '☰' },
  { id: 'power', label: 'Power', ic: '⚡' },
  { id: 'heat', label: 'Heat', ic: '♨' },
  { id: 'about', label: 'About', ic: 'ⓘ' }
]

export default function App() {
  const [tab, setTab] = useState('tray')

  return (
    <div className="app">
      <header className="header">
        <span>PTS Field Calc</span>
        <span className="sub">NEC 2023</span>
      </header>

      <main className="content">
        {tab === 'wire' && <WireSizeTool />}
        {tab === 'motor' && <MotorFlcTool />}
        {tab === 'conduit' && <ConduitFillTool />}
        {tab === 'tray' && <TrayFillTool />}
        {tab === 'power' && <PowerConvertTool />}
        {tab === 'heat' && <HeatRejectTool />}
        {tab === 'about' && <AboutPage />}
      </main>

      <div className="footer-disclaimer">
        Reference tool only. Verify against the NEC and stamped calculations.
      </div>

      <nav className="tabbar">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ic">{t.ic}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
