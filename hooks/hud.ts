import type { Limit } from '../types'

// Turns the account's rate-limit windows into two game health bars, and
// draws them as an SVG HUD for surfaces that draw Svg.

export type Bar = {
  label: 'SESSION' | 'WEEKLY'
  hp: number | null // 0 to 100; null before the first reading
  respawn: string // when the window resets: "2h 50m", "38m" or "Sun 10am"
}

export type Mood = 'healthy' | 'hurt' | 'critical' | 'dead' | 'unknown'

const KINDS: Record<Bar['label'], string> = { SESSION: 'five_hour', WEEKLY: 'seven_day' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const respawnIn = (resetsAt: string | undefined, now: number) => {
  if (resetsAt === undefined) return ''
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''
  const mins = Math.max(0, Math.round((at - now) / 60000))
  if (mins < 60) return `${mins}m`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  const d = new Date(at)
  const h = d.getHours()
  const time = `${h % 12 === 0 ? 12 : h % 12}${d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
  return `${DAYS[d.getDay()]} ${time}`
}

export const bars = (limits: Limit[], demo: number | null, now: number): Bar[] =>
  (['SESSION', 'WEEKLY'] as const).map(label => {
    const limit = limits.find(l => l.kind === KINDS[label])
    if (demo !== null) return { label, hp: demo, respawn: respawnIn(limit?.resetsAt, now) || '4h 20m' }
    if (limit === undefined) return { label, hp: null, respawn: '' }
    return { label, hp: Math.max(0, Math.round(100 - limit.percentUsed)), respawn: respawnIn(limit.resetsAt, now) }
  })

const lowest = (all: Bar[]) => {
  const known = all.flatMap(b => (b.hp === null ? [] : [b.hp]))
  return known.length === 0 ? null : Math.min(...known)
}

export const mood = (all: Bar[]): Mood => {
  const low = lowest(all)
  if (low === null) return 'unknown'
  return low <= 0 ? 'dead' : low < 25 ? 'critical' : low < 50 ? 'hurt' : 'healthy'
}

// "back in 2h 50m", "back Sun 10am"
export const backIn = (respawn: string) => (respawn ? (/^\d/.test(respawn) ? `back in ${respawn}` : `back ${respawn}`) : 'back soon')

export const killer = (all: Bar[]) => all.find(b => b.hp !== null && b.hp <= 0)

// ---- the SVG HUD: a modern status card with the villager, 960 x 64 ----

export const HUD_W = 960
export const HUD_H = 64
const AV = { cx: 34, cy: 32, r: 25 } // the avatar circle
const ICON_X = 74
const LABEL_X = 92
const BAR_X = 172
// The right of the card is kept for the rank badge: a zone as wide as the
// widest badge, so every rank sits the same distance from the reset times.
const BADGE_ZONE = 156
const BADGE_GAP = 24 // between the reset times and the badge zone
// The bars fill what the badge leaves; hudSvg fits them to the badge it draws.
let BAR_W = 960 - 16 - BADGE_ZONE - BADGE_GAP - 78 - 66 - 16 - 172
const BAR_H = 12
let VALUE_X = BAR_X + BAR_W + 16
const ROW_CY = [20, 44] // the two rows' centre lines
const UI = `font-family="'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif"`

const T = {
  text: '#f1f4f8',
  muted: '#8f9aa7',
  faint: '#5d6875',
  track: '#1b2129',
  trackEdge: '#2b333d',
  lost: '#3a1c20', // lost HP, a faint red under the track
  chip: '#1e252e',
  green: ['#22c55e', '#86efac'],
  amber: ['#f59e0b', '#fcd34d'],
  red: ['#ef4444', '#fca5a5'],
}

const tone = (hp: number) => (hp > 50 ? 'green' : hp > 25 ? 'amber' : 'red') as 'green' | 'amber' | 'red'

// ---- the villager: a vector bust in a brown cap and a blue tunic ----

const SKIN = { base: '#eab98e', shade: '#d39a6c', ear: '#dca57a' }
const DEAD = { base: '#9a958e', shade: '#7f7a73', ear: '#8c8780' }
const INK = '#2b1a12'

// A tear that runs from under an eye down the cheek, over and over.
const tear = (x: number, delay: number) => `
  <path d="M ${x},35 q 1.3,2.2 0,3 q -1.3,-0.8 0,-3 z" fill="#5ec4ff" opacity="0">
    <animateTransform attributeName="transform" type="translate" values="0 0; 0 9" dur="1.1s" begin="${delay}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.95;0.95;0" keyTimes="0;0.7;1" dur="1.1s" begin="${delay}s" repeatCount="indefinite"/>
  </path>`

// His face by how much health is left: grinning, flat, frowning, crying, sobbing.
const face = (hp: number) => {
  const ry = hp < 25 ? 1.5 : 2
  const blink = `keyTimes="0;0.9;0.94;0.98;1" dur="4.2s" repeatCount="indefinite"`
  const eye = (x: number) =>
    `<ellipse cx="${x}" cy="32.2" rx="1.7" ry="${ry}" fill="${INK}"><animate attributeName="ry" values="${ry};${ry};0.2;${ry};${ry}" ${blink}/></ellipse>` +
    `<circle cx="${x + 0.6}" cy="31.4" r="0.6" fill="#fff"><animate attributeName="opacity" values="1;1;0;1;1" ${blink}/></circle>`
  const eyes = eye(29.8) + eye(38.2)
  const nose = `<path d="M 34,33.5 q 1.2,1.6 0,2.3" fill="none" stroke="${SKIN.shade}" stroke-width="1.1" stroke-linecap="round"/>`
  const stroke = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`
  const brows = (sad: boolean) =>
    sad
      ? stroke('M 27.4,28.6 L 31.4,27.2') + stroke('M 36.6,27.2 L 40.6,28.6')
      : stroke('M 27.6,27.6 Q 29.8,26.6 32,27.4') + stroke('M 36,27.4 Q 38.2,26.6 40.4,27.6')
  const blush = `<circle cx="27.2" cy="36" r="2" fill="#f28b82" opacity="0.35"/><circle cx="40.8" cy="36" r="2" fill="#f28b82" opacity="0.35"/>`
  if (hp >= 75) return brows(false) + eyes + nose + blush + stroke('M 30.4,38.2 Q 34,41.4 37.6,38.2')
  if (hp >= 50) return brows(false) + eyes + nose + stroke('M 31,39.2 L 37,39.2')
  if (hp >= 25) return brows(true) + eyes + nose + stroke('M 30.6,40.4 Q 34,37.8 37.4,40.4')
  if (hp >= 10) return brows(true) + eyes + nose + stroke('M 30.4,40.6 Q 34,37.4 37.6,40.6') + tear(29.4, 0)
  return (
    brows(true) +
    eyes +
    nose +
    `<ellipse cx="34" cy="39.8" rx="3" ry="2" fill="#5a1d14"/>` +
    tear(29.4, 0) +
    tear(38.6, 0.55) +
    tear(29.4, 0.55)
  )
}

// How the villager moves in each state: his pickaxe, his head, his breathing.
type Motion = { pick: string; head: string; breathe: number; tremble?: string }
const motion = (m: Mood, hp: number): Motion => {
  if (m === 'dead') return { pick: '', head: '', breathe: 0 }
  // Happy: hard at work, the pickaxe chopping, head bobbing along.
  if (hp >= 75)
    return {
      pick: `values="0 44 62;-24 44 62;6 44 62;0 44 62" keyTimes="0;0.45;0.6;1" dur="1.6s"`,
      head: `values="0 0;0 -0.9;0 0" dur="0.8s"`,
      breathe: 2.4,
    }
  // Content: a slower, steadier swing.
  if (hp >= 50)
    return { pick: `values="0 44 62;-14 44 62;0 44 62" dur="2.6s"`, head: `values="0 0;0 -0.5;0 0" dur="2.6s"`, breathe: 2.8 }
  // Hurt: the pickaxe barely lifts, his head drooping.
  if (hp >= 25)
    return { pick: `values="0 44 62;-5 44 62;0 44 62" dur="3.6s"`, head: `values="0 0;0 0.8;0 0" dur="3.6s"`, breathe: 3.6 }
  // Crying: the dropped pickaxe drags a little; he sniffles.
  if (hp >= 10)
    return { pick: `values="0 46 62;3 46 62;0 46 62" dur="2.2s"`, head: `values="0 0;0 0.7;0 0;0 0.5;0 0" dur="1.1s"`, breathe: 1.4 }
  // Sobbing: shoulders heaving, the whole villager trembling.
  return {
    pick: `values="0 46 62;4 46 62;0 46 62" dur="1.4s"`,
    head: `values="0 0;0 1;0 0;0 1;0 0" dur="0.7s"`,
    breathe: 0.7,
    tremble: `values="0 0;-0.4 0;0.4 0;0 0" dur="0.18s"`,
  }
}

const villager = (m: Mood, hp: number) => {
  const dead = m === 'dead'
  const skin = dead ? DEAD : SKIN
  const tunic = dead ? '#5f6470' : '#3b6fe0'
  const tunicDark = dead ? '#4c505a' : '#2c56b8'
  const cap = dead ? '#5a554f' : '#7a4a24'
  const capDark = dead ? '#4a4540' : '#5e3818'
  const coping = hp >= 25 || dead
  const mv = motion(m, hp)
  const spin = (v: string) => (v ? `<animateTransform attributeName="transform" type="rotate" ${v} repeatCount="indefinite"/>` : '')
  const move = (v: string) => (v ? `<animateTransform attributeName="transform" type="translate" ${v} repeatCount="indefinite"/>` : '')

  // The pickaxe, behind him: on his shoulder while he's coping, dropped once he isn't.
  const pick = coping
    ? `<g>${spin(mv.pick)}
       <path d="M 44,62 L 53,24" stroke="${dead ? '#6a655e' : '#8b5a2b'}" stroke-width="2.6" stroke-linecap="round"/>
       <path d="M 45.5,24.5 Q 53,19 60,26" fill="none" stroke="${dead ? '#77726b' : '#c7cfd8'}" stroke-width="3" stroke-linecap="round"/></g>`
    : `<g>${spin(mv.pick)}
       <path d="M 46,62 L 60,48" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/>
       <path d="M 56,44 Q 62,47 61,54" fill="none" stroke="#c7cfd8" stroke-width="3" stroke-linecap="round"/></g>`

  // His body breathes: the tunic rises and settles.
  const body = `<g>${mv.breathe ? move(`values="0 0;0 -0.7;0 0" dur="${mv.breathe}s"`) : ''}
    <ellipse cx="34" cy="63" rx="19" ry="14" fill="${tunic}"/>
    <path d="M 22,55 Q 34,60 46,55 L 46,60 Q 34,65 22,60 Z" fill="${tunicDark}" opacity="0.6"/>
    <path d="M 29.5,49.5 L 34,55.5 L 38.5,49.5" fill="none" stroke="${tunicDark}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="30.5" y="41" width="7" height="9" rx="2" fill="${skin.shade}"/></g>`

  const head = `
    <circle cx="23.8" cy="33.5" r="2.4" fill="${skin.ear}"/>
    <circle cx="44.2" cy="33.5" r="2.4" fill="${skin.ear}"/>
    <ellipse cx="34" cy="32.5" rx="10.2" ry="11" fill="${skin.base}"/>
    <path d="M 40,24.5 Q 45.5,32 40.5,42 Q 44.8,33 40,24.5 Z" fill="${skin.shade}" opacity="0.55"/>
    <path d="M 23.4,30 Q 23,18.6 34,18.2 Q 45,18.6 44.6,30 Q 41,25.2 34,25.6 Q 27,25.2 23.4,30 Z" fill="${cap}"/>
    <path d="M 23.4,30 Q 27,25.2 34,25.6 Q 41,25.2 44.6,30 Q 41,27.4 34,27.6 Q 27,27.4 23.4,30 Z" fill="${capDark}"/>`

  const bandage =
    !dead && hp < 50
      ? `<rect x="25" y="26.2" width="18" height="3.4" rx="1.2" fill="#f3efe6" transform="rotate(-8 34 28)"/><circle cx="38.5" cy="27.4" r="0.9" fill="#d84a4a"/>`
      : ''
  const sweat =
    !dead && hp < 25
      ? `<path d="M 45.5,24 q 1.6,2.8 0,3.8 q -1.6,-1 0,-3.8 z" fill="#5ec4ff"><animate attributeName="opacity" values="1;0.2;1" dur="0.9s" repeatCount="indefinite"/></path>`
      : ''
  // Dead: X eyes and a halo that bobs above him, glinting.
  const deadFace = dead
    ? `<path d="M 28.4,30.6 l 3,3 M 31.4,30.6 l -3,3 M 36.6,30.6 l 3,3 M 39.6,30.6 l -3,3" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
       <path d="M 31,39.4 L 37,39.4" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
       <path d="M 35,39.4 q 0.6,2.6 2,0" fill="#e57373"/>
       <g>${move(`values="0 0;0 -1.6;0 0" dur="2.4s"`)}
         <ellipse cx="34" cy="14.6" rx="8" ry="2.2" fill="none" stroke="#f5d061" stroke-width="1.8">
           <animate attributeName="stroke-opacity" values="1;0.55;1" dur="2.4s" repeatCount="indefinite"/>
         </ellipse></g>`
    : face(hp)

  const headGroup = `<g>${move(mv.head)}${head}${bandage}${deadFace}${sweat}</g>`
  const all = pick + body + headGroup
  return mv.tremble ? `<g>${move(mv.tremble)}${all}</g>` : all
}

// The villager in a round avatar. His ring is coloured by his health, and a
// bright arc orbits it.
const avatar = (m: Mood, low: number | null) => {
  const ring = m === 'dead' ? '#59616d' : low === null ? '#3a4350' : T[tone(low)][0]
  const pulse =
    m === 'critical' ? `<animate attributeName="stroke-opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite"/>` : ''
  const orbit =
    m === 'dead'
      ? ''
      : `<circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r + 3.5}" fill="none" stroke="${ring}" stroke-width="2" stroke-linecap="round" stroke-dasharray="22 160" opacity="0.85" filter="url(#soft)">
           <animateTransform attributeName="transform" type="rotate" values="0 ${AV.cx} ${AV.cy};360 ${AV.cx} ${AV.cy}" dur="${low !== null && low < 25 ? 1.2 : 3.2}s" repeatCount="indefinite"/>
         </circle>`
  return `
  <circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r + 5}" fill="${ring}" opacity="0.10"/>
  ${orbit}
  <circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r}" fill="url(#avbg)"/>
  <g clip-path="url(#avclip)">${villager(m, low ?? 100)}</g>
  <circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r}" fill="none" stroke="${ring}" stroke-width="2.5">${pulse}</circle>`
}

// ---- the bars ----

// A heart that beats, faster the lower the health.
const heartIcon = (x: number, cy: number, fill: string, hp: number | null) => {
  const beat = hp === null || hp <= 0 ? '' : `<animateTransform attributeName="transform" type="scale" values="1;1.28;1;1.16;1" keyTimes="0;0.14;0.3;0.44;1" dur="${hp < 25 ? 0.6 : hp < 50 ? 0.9 : 1.3}s" repeatCount="indefinite"/>`
  return `<g transform="translate(${x + 6} ${cy})"><g>${beat}<path transform="translate(-6.2 -6.6) scale(0.62)" d="M10 18 L2.4 10.4 A5 5 0 0 1 10 3.6 A5 5 0 0 1 17.6 10.4 Z" fill="${fill}"/></g></g>`
}
const calendarIcon = (x: number, cy: number, fill: string) =>
  `<g transform="translate(${x} ${cy - 6})"><rect x="0.5" y="1.5" width="11" height="10" rx="2" fill="none" stroke="${fill}" stroke-width="1.5"/><path d="M 0.5,5 L 11.5,5 M 3.5,0 L 3.5,3 M 8.5,0 L 8.5,3" stroke="${fill}" stroke-width="1.5" stroke-linecap="round"/></g>`

// One row: icon and label, a living bar, the value and a reset chip. The bar
// sweeps in from empty, energy stripes flow through it, a shine passes along
// it now and then, and sparks drift off its glowing leading edge.
// Sci-fi accents, all drawn over the card without moving anything on it.
const HUD_CYAN = '#5ec4ff'

// Thin targeting brackets at the card's four corners, pulsing gently.
const cornerBrackets = () => {
  const L = 14
  const i = 6
  const W = HUD_W
  const H = HUD_H
  const d = [
    `M ${i},${i + L} L ${i},${i} L ${i + L},${i}`,
    `M ${W - i - L},${i} L ${W - i},${i} L ${W - i},${i + L}`,
    `M ${i},${H - i - L} L ${i},${H - i} L ${i + L},${H - i}`,
    `M ${W - i - L},${H - i} L ${W - i},${H - i} L ${W - i},${H - i - L}`,
  ].join(' ')
  return `<path d="${d}" fill="none" stroke="${HUD_CYAN}" stroke-width="1.4" stroke-linecap="round" opacity="0.45">
    <animate attributeName="opacity" values="0.25;0.6;0.25" dur="3.6s" repeatCount="indefinite"/>
  </path>`
}

// A faint dot grid, and a light band that sweeps across like a hologram scan.
const hologram = () => `
  <g clip-path="url(#cardclip)">
    <rect x="0" y="0" width="${HUD_W}" height="${HUD_H}" fill="url(#dots)"/>
    <rect x="-120" y="0" width="90" height="${HUD_H}" fill="url(#scanband)">
      <animate attributeName="x" values="-120;-120;${HUD_W + 30}" keyTimes="0;0.55;1" dur="7s" repeatCount="indefinite"/>
    </rect>
  </g>`

// A dashed radar ring with tick marks, turning against the glowing arc.
const radar = (m: Mood) =>
  m === 'dead'
    ? ''
    : `<g opacity="0.55">
    <circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r + 7.5}" fill="none" stroke="${HUD_CYAN}" stroke-width="0.9" stroke-dasharray="2 5">
      <animateTransform attributeName="transform" type="rotate" values="360 ${AV.cx} ${AV.cy};0 ${AV.cx} ${AV.cy}" dur="12s" repeatCount="indefinite"/>
    </circle>
    ${[0, 90, 180, 270].map(a => `<line x1="${AV.cx}" y1="${AV.cy - AV.r - 5}" x2="${AV.cx}" y2="${AV.cy - AV.r - 10}" stroke="${HUD_CYAN}" stroke-width="1.2" transform="rotate(${a} ${AV.cx} ${AV.cy})"/>`).join('')}
  </g>`

// Electric arcs crackling along a full bar's edges.
const zigzag = (x0: number, x1: number, y: number, amp: number, seed: number) => {
  const pts: string[] = []
  for (let x = x0, k = 0; x <= x1; x += 7, k++) {
    const jitter = ((Math.sin((k + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1
    pts.push(`${x.toFixed(1)},${(y + (k % 2 === 0 ? -1 : 1) * amp * (0.4 + jitter)).toFixed(1)}`)
  }
  return pts.join(' ')
}
const overcharge = (x0: number, x1: number, top: number) => `
  <g>
    <polyline points="${zigzag(x0, x1, top - 1, 2.4, 1)}" fill="none" stroke="#e8fbff" stroke-width="1.1" opacity="0">
      <animate attributeName="opacity" values="0;0.95;0;0;0.8;0" keyTimes="0;0.08;0.16;0.5;0.58;0.66" dur="1.7s" repeatCount="indefinite"/>
    </polyline>
    <polyline points="${zigzag(x0, x1, top + BAR_H + 1, 2.4, 2)}" fill="none" stroke="${HUD_CYAN}" stroke-width="1.1" opacity="0">
      <animate attributeName="opacity" values="0;0;0.9;0;0;0.7;0" keyTimes="0;0.25;0.33;0.41;0.75;0.83;0.91" dur="1.7s" repeatCount="indefinite"/>
    </polyline>
  </g>`

// Flashing red chevrons warning that a bar is low.
const redAlert = (x: number, cy: number) => `
  <text x="${x}" y="${cy + 5}" ${UI} font-size="13" font-weight="900" letter-spacing="-1" fill="#ff4d5e">❯❯
    <animate attributeName="opacity" values="1;0.15;1" dur="0.7s" repeatCount="indefinite"/>
  </text>`

const row = (bar: Bar, cy: number, id: string, delay: number) => {
  const hp = bar.hp
  const top = cy - BAR_H / 2
  const colour = (hp === null ? T.faint : T[tone(hp)][0]) ?? T.faint
  const light = (hp === null ? T.faint : T[tone(hp)][1]) ?? T.faint
  const icon = bar.label === 'SESSION' ? heartIcon(ICON_X, cy, colour, hp) : calendarIcon(ICON_X + 1, cy, colour)
  const label = `<text x="${LABEL_X}" y="${cy + 4}" ${UI} font-size="11.5" font-weight="700" letter-spacing="1.4" fill="${T.muted}">${bar.label}</text>`
  const track = `<rect x="${BAR_X}" y="${top}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${hp === null || hp >= 100 ? T.track : T.lost}" stroke="${T.trackEdge}" stroke-width="1"/>`
  let ticks = ''
  for (let k = 1; k < 10; k++) {
    const x = BAR_X + (BAR_W * k) / 10
    ticks += `<line x1="${x}" y1="${top + 2}" x2="${x}" y2="${top + BAR_H - 2}" stroke="#0b0e12" stroke-opacity="0.4" stroke-width="1.5"/>`
  }
  if (hp === null) {
    return `${icon}${label}${track}${ticks}<text x="${VALUE_X}" y="${cy + 5}" ${UI} font-size="15" font-weight="600" fill="${T.faint}">—</text>`
  }
  const w = hp <= 0 ? 0 : Math.max(BAR_H, Math.round((BAR_W * hp) / 100))
  const sweep = `begin="${delay}s" dur="1.1s" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1" fill="freeze"`
  const pulse = hp < 25 && hp > 0 ? `<animate attributeName="opacity" values="1;0.55;1" dur="0.9s" repeatCount="indefinite"/>` : ''
  const edge = BAR_X + w - BAR_H / 2
  const sparks = [0, 1, 2]
    .map(
      k => `<circle cx="${edge}" cy="${cy}" r="1.4" fill="${light}" opacity="0">
        <animate attributeName="cy" values="${cy};${cy - 13}" dur="1.4s" begin="${delay + 1.1 + k * 0.47}s" repeatCount="indefinite"/>
        <animate attributeName="cx" values="${edge};${edge + (k - 1) * 5}" dur="1.4s" begin="${delay + 1.1 + k * 0.47}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.9;0" dur="1.4s" begin="${delay + 1.1 + k * 0.47}s" repeatCount="indefinite"/>
      </circle>`,
    )
    .join('')
  const fill =
    w > 0
      ? `<g>${pulse}
          <clipPath id="clip-${id}"><rect x="${BAR_X}" y="${top - 1}" width="0" height="${BAR_H + 2}" rx="${BAR_H / 2}"><animate attributeName="width" values="0;${w}" ${sweep}/></rect></clipPath>
          <g clip-path="url(#clip-${id})">
            <rect x="${BAR_X}" y="${top}" width="${w}" height="${BAR_H}" rx="${BAR_H / 2}" fill="url(#${id})" filter="url(#soft)"/>
            <rect x="${BAR_X}" y="${top}" width="${w}" height="${BAR_H}" rx="${BAR_H / 2}" fill="url(#stripes)"/>
            <rect x="${BAR_X + 4}" y="${top + 2}" width="${Math.max(0, w - 10)}" height="3" rx="1.5" fill="#fff" opacity="0.32"/>
            <rect x="${BAR_X - 60}" y="${top - 2}" width="46" height="${BAR_H + 4}" fill="url(#shine)">
              <animate attributeName="x" values="${BAR_X - 60};${BAR_X - 60};${BAR_X + w + 10}" keyTimes="0;0.55;1" dur="3.4s" begin="${delay + 1.2}s" repeatCount="indefinite"/>
            </rect>
          </g>
          <circle cx="${BAR_X + BAR_H / 2}" cy="${cy}" r="${BAR_H / 2 + 1.5}" fill="${light}" opacity="0.5" filter="url(#soft)">
            <animate attributeName="cx" values="${BAR_X + BAR_H / 2};${edge}" ${sweep}/>
            <animate attributeName="r" values="${BAR_H / 2};${BAR_H / 2 + 2.5};${BAR_H / 2}" dur="1.6s" repeatCount="indefinite"/>
          </circle>
          <circle cx="${BAR_X + BAR_H / 2}" cy="${cy}" r="${BAR_H / 2 - 2}" fill="#fff" opacity="0.85">
            <animate attributeName="cx" values="${BAR_X + BAR_H / 2};${edge}" ${sweep}/>
          </circle>
          ${sparks}
        </g>`
      : ''
  const chipText = bar.respawn
  // Only a full bar reads MAX; a nearly full one still crackles, and says its number.
  const isMax = hp >= 100
  const isCharged = hp >= 90
  const value = isMax
    ? `<text x="${VALUE_X}" y="${cy + 5.5}" ${UI} font-size="15" font-weight="800" letter-spacing="1.5" fill="${HUD_CYAN}" filter="url(#soft)">MAX</text>`
    : `<text x="${VALUE_X}" y="${cy + 5.5}" ${UI} font-size="17" font-weight="700" fill="${T.text}">${hp}<tspan font-size="12" font-weight="600" fill="${T.muted}">/100</tspan></text>`
  const fx = isCharged ? overcharge(BAR_X + 4, BAR_X + w - 4, top) : hp > 0 && hp < 25 ? redAlert(VALUE_X + 66 + 78 + 5, cy) : ''
  const chipX = VALUE_X + 66
  const CHIP_W = 78 // one width for both rows, so their edges line up
  const chip = chipText
    ? `<rect x="${chipX}" y="${cy - 10}" width="${CHIP_W}" height="20" rx="10" fill="${T.chip}" stroke="${T.trackEdge}"/>
       <text x="${chipX + CHIP_W / 2}" y="${cy + 4.5}" text-anchor="middle" ${UI} font-size="12.5" font-weight="500" fill="${T.muted}">${chipText}</text>`
    : ''
  return icon + label + track + fill + ticks + fx + value + chip
}

// The contributor ranks, lowest first, as the draft rank sheet draws them.
export type Rank = 'scout' | 'contributor' | 'innovator' | 'top' | 'god'
type RankLook = { label: string; name: string; stops: [string, string, string]; edge: string; ink: string; glow?: string; shine?: true }
export const RANKS: Record<Rank, RankLook> = {
  scout: { label: '◇ SCOUT', name: 'Scout', stops: ['#d9e2ec', '#9aa9b8', '#6c7b8a'], edge: '#f1f5f9', ink: '#1b2430' },
  contributor: { label: '✦ CONTRIBUTOR', name: 'Contributor', stops: ['#ffd2a8', '#d98a4e', '#a65a26'], edge: '#ffe7d1', ink: '#2e1606' },
  innovator: { label: '◆ INNOVATOR', name: 'Innovator', stops: ['#c7f0ff', '#5ec4ff', '#2b8fd6'], edge: '#e6f7ff', ink: '#062033', glow: '#5ec4ff' },
  top: { label: '★ OPEN', name: 'Top contributor', stops: ['#ffe27a', '#f7b733', '#e98a15'], edge: '#fff3c4', ink: '#2b1a03', glow: '#f7b733', shine: true },
  god: { label: '⚡ GOD MODE', name: 'GOD MODE', stops: ['#ffe27a', '#f7b733', '#e98a15'], edge: '#fff3c4', ink: '#2b1a03', glow: '#f7b733', shine: true },
}

// The rank badge at the card's right end, past the reset times: a badge to
// show, not a control. Its right edge sits 16 in from the card's, as the
// avatar's left does; long names get a wider pill.
const BADGE_H = 26
const BADGE_Y = 19
const badgeBox = (rank: Rank) => {
  const w = Math.min(BADGE_ZONE, Math.max(108, Math.round(RANKS[rank].label.length * 7.6 + 28)))
  return { x: 960 - 16 - w, w }
}
const rankBadge = (rank: Rank) => {
  const look = RANKS[rank]
  const { x, w } = badgeBox(rank)
  const pill = `<rect x="${x}" y="${BADGE_Y}" width="${w}" height="${BADGE_H}" rx="${BADGE_H / 2}" fill="url(#badgegrad)"/>`
  const shine = look.shine
    ? `<g clip-path="url(#badgeclip)">
    <rect x="${x - 40}" y="${BADGE_Y - 10}" width="22" height="${BADGE_H + 20}" fill="#fff" opacity="0.55" transform="skewX(-20)">
      <animate attributeName="x" values="${x - 40};${x - 40};${x + w + 30}" keyTimes="0;0.6;1" dur="3s" repeatCount="indefinite"/>
    </rect>
  </g>`
    : ''
  return `
  ${look.glow ? `<g filter="url(#badgeglow)">${pill}</g>` : pill}
  ${shine}
  <rect x="${x + 0.5}" y="${BADGE_Y + 0.5}" width="${w - 1}" height="${BADGE_H - 1}" rx="${(BADGE_H - 1) / 2}" fill="none" stroke="${look.edge}" stroke-opacity="0.6"/>
  <text x="${x + w / 2}" y="${BADGE_Y + 17.5}" text-anchor="middle" ${UI} font-size="${look.label.length > 12 ? 11.5 : 12}" font-weight="800" letter-spacing="${look.label.length > 12 ? 0.9 : 1.2}" fill="${look.ink}">${look.label}</text>`
}

const badgeDefs = (rank: Rank) => {
  const look = RANKS[rank]
  const { x, w } = badgeBox(rank)
  return `<linearGradient id="badgegrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${look.stops[0]}"/><stop offset="0.55" stop-color="${look.stops[1]}"/><stop offset="1" stop-color="${look.stops[2]}"/></linearGradient>
    <clipPath id="badgeclip"><rect x="${x}" y="${BADGE_Y}" width="${w}" height="${BADGE_H}" rx="${BADGE_H / 2}"/></clipPath>
    <filter id="badgeglow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/><feFlood flood-color="${look.glow ?? '#000'}" flood-opacity="0.55"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}

const gradient = (id: string, hp: number | null) => {
  const [a, b] = T[tone(hp ?? 100)]
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
}

// Two soft blobs of the health colour drifting slowly behind the card.
const aurora = (colour: string) => `
  <g clip-path="url(#cardclip)" opacity="0.5">
    <ellipse cx="160" cy="34" rx="170" ry="46" fill="url(#aura)">
      <animate attributeName="cx" values="120;420;120" dur="14s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="700" cy="30" rx="150" ry="40" fill="url(#aura2)">
      <animate attributeName="cx" values="760;460;760" dur="18s" repeatCount="indefinite"/>
    </ellipse>
  </g>
  <radialGradient id="aura"><stop offset="0" stop-color="${colour}" stop-opacity="0.16"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>
  <radialGradient id="aura2"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.10"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>`

export const hudSvg = (all: Bar[], rank: Rank = 'god') => {
  // Fit the bars to this badge, so the gap before it is the same for every rank.
  BAR_W = 960 - 16 - badgeBox(rank).w - BADGE_GAP - 78 - 66 - 16 - BAR_X
  VALUE_X = BAR_X + BAR_W + 16
  const m = mood(all)
  const dead = killer(all)
  const known = all.flatMap(b => (b.hp === null ? [] : [b.hp]))
  const low = known.length === 0 ? null : Math.min(...known)
  const session = all[0] ?? { label: 'SESSION' as const, hp: null, respawn: '' }
  const weekly = all[1] ?? { label: 'WEEKLY' as const, hp: null, respawn: '' }
  const glow = (m === 'dead' ? '#59616d' : low === null ? '#3a4350' : T[tone(low)][0]) ?? '#3a4350'

  const deathScreen = dead
    ? `<g>
        <rect x="0.5" y="0.5" width="${HUD_W - 1}" height="${HUD_H - 1}" rx="14" fill="#0b0d11" opacity="0.9"/>
        <rect x="0.5" y="0.5" width="${HUD_W - 1}" height="${HUD_H - 1}" rx="14" fill="none" stroke="#ef4444" stroke-opacity="0.55"/>
        ${avatar(m, 0)}
        <text x="${ICON_X}" y="29" ${UI} font-size="18" font-weight="700" fill="${T.text}">Claude has been defeated<animate attributeName="opacity" values="0;1" dur="0.8s" fill="freeze"/></text>
        <text x="${ICON_X}" y="49" ${UI} font-size="13" fill="${T.muted}">Out of ${dead.label === 'SESSION' ? 'session' : 'weekly'} hit points · ${backIn(dead.respawn)}</text>
      </g>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HUD_W} ${HUD_H}" width="${HUD_W * 3}" height="${HUD_H * 3}" preserveAspectRatio="xMinYMin meet">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2029"/><stop offset="1" stop-color="#12161c"/></linearGradient>
    <clipPath id="cardclip"><rect x="0.5" y="0.5" width="${HUD_W - 1}" height="${HUD_H - 1}" rx="14"/></clipPath>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#ffffff" opacity="0.05"/></pattern>
    <linearGradient id="scanband" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${HUD_CYAN}" stop-opacity="0"/><stop offset="0.5" stop-color="${HUD_CYAN}" stop-opacity="0.09"/><stop offset="1" stop-color="${HUD_CYAN}" stop-opacity="0"/></linearGradient>
    <radialGradient id="cardglow" cx="0.04" cy="0.5" r="0.32"><stop offset="0" stop-color="${glow}" stop-opacity="0.16"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="avbg" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#4b7d46"/><stop offset="0.65" stop-color="#2b4a2c"/><stop offset="1" stop-color="#1b2f1d"/></radialGradient>
    ${badgeDefs(rank)}
    <clipPath id="avclip"><circle cx="${AV.cx}" cy="${AV.cy}" r="${AV.r - 1}"/></clipPath>
    <filter id="soft" x="-5%" y="-80%" width="110%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="stripes" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
      <rect width="6" height="14" fill="#ffffff" opacity="0.16"/>
      <animate attributeName="x" values="0;14" dur="0.9s" repeatCount="indefinite"/>
    </pattern>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${gradient('g0', session.hp)}
    ${gradient('g1', weekly.hp)}
  </defs>
  <rect x="0.5" y="0.5" width="${HUD_W - 1}" height="${HUD_H - 1}" rx="14" fill="url(#card)" stroke="#2a313b"/>
  ${aurora(glow)}
  <rect x="0.5" y="0.5" width="${HUD_W - 1}" height="${HUD_H - 1}" rx="14" fill="url(#cardglow)"/>
  <line x1="14" y1="1.5" x2="${HUD_W - 14}" y2="1.5" stroke="#ffffff" stroke-opacity="0.06"/>
  ${hologram()}
  ${radar(m)}
  ${avatar(m, low)}
  ${row(session, ROW_CY[0] ?? 20, 'g0', 0.15)}
  ${row(weekly, ROW_CY[1] ?? 44, 'g1', 0.35)}
  ${rankBadge(rank)}
  ${cornerBrackets()}
  ${deathScreen}
</svg>`
}
