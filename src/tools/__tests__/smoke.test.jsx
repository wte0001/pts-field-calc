// Render smoke tests - catch mount-time errors in the tool screens without a browser.
// renderToStaticMarkup runs the full initial render (hooks included, effects excluded).
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../../App.jsx'
import PowerConvertTool from '../PowerConvertTool.jsx'
import HeatRejectTool from '../HeatRejectTool.jsx'
import VoltageDropTool from '../VoltageDropTool.jsx'
import WireSizeTool from '../WireSizeTool.jsx'
import TrayFillTool from '../TrayFillTool.jsx'
import AboutPage from '../AboutPage.jsx'

describe('render smoke tests', () => {
  it('App renders all seven tool tabs plus the About header button', () => {
    const html = renderToStaticMarkup(React.createElement(App))
    for (const label of ['Wire', 'VDrop', 'Motor', 'Conduit', 'Tray', 'Power', 'Heat', 'About']) {
      expect(html).toContain(label)
    }
  })
  it('Wire size tool renders, and the EGC card appears only once a load is entered', () => {
    const html = renderToStaticMarkup(React.createElement(WireSizeTool))
    expect(html).toContain('Wire Size')
    // No load current by default -> no result, so no EGC section yet
    expect(html).not.toContain('Equipment grounding conductor')
  })
  it('Tray fill tool renders the cross-section drawing in the result card', () => {
    const html = renderToStaticMarkup(React.createElement(TrayFillTool))
    expect(html).toContain('Cable Tray Fill')
    expect(html).toContain('<svg')
    expect(html).toContain('inside width')
    expect(html).toContain('Export drawing (SVG)')
    // single-layer promise is stated on the drawing
    expect(html).toContain('Single layer only')
  })
  it('Tray fill tool renders the tray tab strip and its controls', () => {
    const html = renderToStaticMarkup(React.createElement(TrayFillTool))
    expect(html).toContain('Tray designs')
    expect(html).toContain('Tray 1')
    expect(html).toContain('of 10 trays')
    expect(html).toContain('Rename')
    expect(html).toContain('Duplicate')
    expect(html).toContain('Delete tray')
    // the tray name titles the circuit list and the drawing
    expect(html).toContain('Circuit list — Tray 1')
    // roll-up only appears with more than one tray
    expect(html).not.toContain('All trays')
  })
  it('Voltage drop tool renders with defaults', () => {
    const html = renderToStaticMarkup(React.createElement(VoltageDropTool))
    expect(html).toContain('Voltage Drop')
    expect(html).toContain('ONE-WAY')
    expect(html).toContain('NEC Table 9')
  })
  it('Power converter renders with defaults', () => {
    const html = renderToStaticMarkup(React.createElement(PowerConvertTool))
    expect(html).toContain('Power Converter')
    expect(html).toContain('Three-phase')
    expect(html).toContain('Power factor')
  })
  it('Heat rejection renders its default row and a result', () => {
    const html = renderToStaticMarkup(React.createElement(HeatRejectTool))
    expect(html).toContain('BTU/hr')
    expect(html).toContain('Dry-type transformer')
    // default row: 75 kVA at 80% load -> 186 + 1521*0.64 = 1159.4 W -> total shows 3,956 BTU/hr
    expect(html).toContain('1,159')
  })
  it('About page renders the new tool sections', () => {
    const html = renderToStaticMarkup(React.createElement(AboutPage))
    expect(html).toContain('Power Converter tool')
    expect(html).toContain('Heat Rejection tool')
  })
})
