// Render smoke tests - catch mount-time errors in the tool screens without a browser.
// renderToStaticMarkup runs the full initial render (hooks included, effects excluded).
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../../App.jsx'
import PowerConvertTool from '../PowerConvertTool.jsx'
import HeatRejectTool from '../HeatRejectTool.jsx'
import AboutPage from '../AboutPage.jsx'

describe('render smoke tests', () => {
  it('App renders with all seven tabs', () => {
    const html = renderToStaticMarkup(React.createElement(App))
    for (const label of ['Wire', 'Motor', 'Conduit', 'Tray', 'Power', 'Heat', 'About']) {
      expect(html).toContain(label)
    }
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
