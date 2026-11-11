// Both sleeves share Side A's original geometry. Only the ink and label vary.
const center = { x: 709, y: 463 };
export function recordVinyl({ side, rim, edge, label, ink, title }) {
  const circle = (radius, attributes) => `<circle cx="${center.x}" cy="${center.y}" r="${radius}" ${attributes}/>`;
  return `<g id="record-vinyl" data-center="709 463" data-outer-radius="240">
    ${circle(240, `fill="${rim}"`)}
    ${circle(228, `stroke="${edge}" stroke-opacity=".52"`)}
    ${circle(208, 'fill="url(#vinyl)"')}
    <g stroke="${edge}" stroke-opacity=".13">${[198,187,176,165,154,143,132,121,110,99].map(radius => circle(radius, '')).join('')}</g>
    ${circle(208, 'fill="url(#sheen)"')}
    ${circle(65, `fill="${label}"`)}
    ${circle(57, `stroke="${ink}" stroke-opacity=".35"`)}
    <text x="709" y="449" text-anchor="middle" fill="${ink}" font-family="Georgia,serif" font-size="17" font-style="italic">${title}</text>
    ${circle(6, 'fill="#252329"')}
    <text x="709" y="490" text-anchor="middle" fill="${ink}" font-family="monospace" font-size="7" letter-spacing="1.7">${side} / 33⅓ RPM</text>
  </g>`;
}
