// The Ofimeo mark: an "O" ring on the brand color (public/icons/icon.svg is the
// same drawing). The tile color comes from --brand, the ring from --brand-fg.

const SVG_NS = 'http://www.w3.org/2000/svg'

export function brandMark(size = 36): HTMLElement {
  const tile = document.createElement('span')
  tile.className = 'brand-mark'
  tile.style.width = tile.style.height = `${size}px`
  tile.setAttribute('aria-hidden', 'true')
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 512 512')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  const ring = document.createElementNS(SVG_NS, 'circle')
  for (const [k, v] of Object.entries({ cx: '256', cy: '256', r: '138', fill: 'none', stroke: 'currentColor', 'stroke-width': '76' })) ring.setAttribute(k, v)
  svg.append(ring)
  tile.append(svg)
  return tile
}
