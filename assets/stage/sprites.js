// Border collie sprites: one letter per pixel, '.' transparent. Two pixel rows = one terminal row (half blocks).
// Front views are drawn as a left half and mirrored; an outline is added last so white never melts into a light terminal.

const PALETTE = {
  b: '#2A2B31', // black coat
  v: '#4E515A', // sheen on the black
  w: '#F3F2EE', // white blaze, muzzle, ruff, paws
  q: '#C9C7C0', // white in shadow
  n: '#0D0D0F', // nose, eyes, open mouth
  e: '#FFFFFF', // eye glint
  c: '#C27A3E', // tan brows and cheeks
  r: '#B5562E', // red coat
  R: '#8A3D1F', // red in shadow
  p: '#E57C8C', // tongue
  a: '#E5484D', // alarm
  o: '#141417', // outline
}

const mirror = half => half.map(r => r + [...r].reverse().join(''))
const blank = w => '.'.repeat(w)
const pts = (list, ch) => Object.fromEntries(list.map(([x, y]) => [`${x},${y}`, ch]))
const both = (list, ch, w = 12) => pts(list.flatMap(([x, y]) => [[x, y], [w - 1 - x, y]]), ch) // a pixel and its mirror
const set = (rows, map) => rows.map((r, y) => [...r].map((c, x) => map[`${x},${y}`] ?? c).join(''))
const shift = (rows, dy) => rows.map((_, y) => rows[y - dy] ?? blank(rows[0].length))
const recolor = (rows, map) => rows.map(r => [...r].map(c => map[c] ?? c).join(''))
const outline = rows =>
  rows.map((r, y) =>
    [...r]
      .map((c, x) => {
        if (c !== '.') return c
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = rows[y + dy]?.[x + dx]
          if ((dx || dy) && n && n !== '.' && n !== 'o' && n !== 'a') return 'o'
        }
        return c
      })
      .join(''),
  )
const bang = (rows, x, top = 0) => set(rows, pts([[x, top], [x, top + 1], [x, top + 2], [x, top + 4]], 'a'))

// ---------------- the sitting collie: 12 x 16 (8 terminal rows), rows 0-1 are headroom ----------------
const SIT = mirror([
  '......', //  0 headroom
  '......', //  1 headroom (ears perk up into it)
  '...bbb', //  2 skull
  '..bbbw', //  3 blaze starts
  '.bbbbw', //  4 ears begin
  '.bbebw', //  5 glint
  '.bbnbw', //  6 eye beside the blaze
  '.b.www', //  7 ear tips hang free, muzzle
  '...www', //  8
  '...wwn', //  9 nose
  '....ww', // 10 chin (the tongue goes here)
  '...bww', // 11 ruff
  '..bwww', // 12
  '..bqww', // 13 haunch shadow
  '..ww.w', // 14 front legs
  '..ww..', // 15 paws
])
const TAIL = {
  low: { ...pts([[10, 13], [11, 12]], 'b'), ...pts([[11, 11]], 'w') },
  up: { ...pts([[10, 12], [11, 11], [11, 10]], 'b'), ...pts([[11, 9]], 'w') },
  down: { ...pts([[10, 13], [11, 14]], 'b'), ...pts([[11, 15]], 'w') },
}
const sit = (...maps) => set(SIT, Object.assign({}, ...maps))
const TONGUE = pts([[5, 10], [6, 10]], 'p')
const LONG_TONGUE = { ...TONGUE, ...pts([[5, 11], [6, 11]], 'p') }
const BLINK = both([[3, 5], [3, 6]], 'b')
const SQUINT = { ...both([[3, 5]], 'b'), ...both([[3, 6]], 'v') } // happy, eyes shut
const EARS_UP = { ...both([[1, 7]], '.'), ...both([[1, 3], [2, 2], [2, 1]], 'b'), ...both([[1, 2]], 'v') }
const EARS_DOWN = { ...both([[1, 4]], '.'), ...both([[1, 8], [2, 8]], 'b') }
const BARK = { ...pts([[5, 10], [6, 10]], 'n'), ...pts([[5, 11], [6, 11]], 'p') }

const SITTING = {
  idle: [
    sit(TAIL.low), sit(TAIL.low), sit(TAIL.low), sit(TAIL.low, BLINK), sit(TAIL.low), sit(TAIL.low),
    sit(TAIL.low, TONGUE), sit(TAIL.low, LONG_TONGUE), sit(TAIL.low, TONGUE), sit(TAIL.low, LONG_TONGUE), sit(TAIL.low),
  ],
  working: [sit(TAIL.up, TONGUE), sit(TAIL.low, LONG_TONGUE), sit(TAIL.up, TONGUE), sit(TAIL.low, LONG_TONGUE)],
  waiting: [bang(sit(TAIL.up, EARS_UP, BARK), 11, 0), sit(TAIL.up, EARS_UP)],
  happy: [shift(sit(TAIL.up, SQUINT, LONG_TONGUE), -1), sit(TAIL.low, SQUINT, LONG_TONGUE)],
  sad: [shift(sit(TAIL.down, EARS_DOWN, BLINK), 1).map((r, y) => (y > 13 ? sit(TAIL.down)[y] : r))],
}

// ---------------- the head only: 12 x 8 (4 terminal rows), the owl's footprint ----------------
const HEAD = mirror([
  '..bbbb', // 0
  '.bbbbw', // 1 ears
  '.bbebw', // 2 glint
  '.bbnbw', // 3 eye
  '.b.www', // 4 ear tips, muzzle
  '...wwn', // 5 nose
  '....ww', // 6 chin
  '..bwww', // 7 ruff
])
const head = (...maps) => set(HEAD, Object.assign({}, ...maps))
const H_TONGUE = pts([[5, 6], [6, 6]], 'p')
const H_BLINK = both([[3, 2], [3, 3]], 'b')
const H_SQUINT = { ...both([[3, 2]], 'b'), ...both([[3, 3]], 'v') }
const H_EARS_UP = { ...both([[1, 4]], '.'), ...both([[1, 0], [2, 0]], 'b'), ...both([[1, 1]], 'v') }
const H_EARS_DOWN = { ...both([[1, 1]], '.'), ...both([[2, 5]], 'b') }
const H_BARK = pts([[5, 6], [6, 6]], 'n')
const HEADS = {
  idle: [head(), head(), head(), head(H_BLINK), head(), head(H_TONGUE), head(H_TONGUE), head()],
  working: [head(H_TONGUE), head(), head(H_TONGUE), head()],
  waiting: [bang(head(H_EARS_UP, H_BARK), 11, 0), head(H_EARS_UP)],
  happy: [head(H_SQUINT, H_TONGUE), head(H_SQUINT, H_TONGUE, H_EARS_UP)],
  sad: [head(H_EARS_DOWN, H_BLINK)],
}

// ---------------- coats ----------------
const COATS = {
  classic: { name: 'Black & white', map: {} },
  tricolour: { name: 'Tricolour', map: null }, // tan brows and cheeks, added per pose below
  red: { name: 'Red & white', map: { b: 'r', v: 'R' } },
}
const coat = (frames, key, brows) =>
  frames.map(f => {
    let r = key === 'tricolour' ? set(f, Object.fromEntries(Object.entries(brows).filter(([k]) => f[+k.split(',')[1]]?.[+k.split(',')[0]] === 'b'))) : f
    if (key === 'red') r = recolor(r, COATS.red.map)
    return outline(r)
  })
const SIT_BROWS = { ...both([[3, 4]], 'c'), ...both([[2, 7]], 'c') }
const HEAD_BROWS = { ...both([[3, 1]], 'c'), ...both([[2, 4]], 'c') }
const dress = (moods, key, brows) => Object.fromEntries(Object.entries(moods).map(([m, frames]) => [m, coat(frames, key, brows)]))

const ACTS = {
  idle: 'Sits, blinks, pants now and then',
  working: 'Tail wagging, panting, on the job',
  waiting: 'Ears up, barks for you',
  happy: 'Jumps with its eyes shut and tongue out',
  sad: 'Ears down, head low, tail tucked',
}
const VARIANTS = [
  { id: 'sit-classic', name: 'Sitting', coat: 'Black & white', size: [12, 16], idea: 'The whole dog, sitting at your side: floppy ears, white blaze, ruff and paws. The tail tells you its mood.', moods: dress(SITTING, 'classic'), acts: ACTS },
  { id: 'sit-tri', name: 'Sitting', coat: 'Tricolour', size: [12, 16], idea: 'Tan brows and cheeks give the eyes a frame, so the face reads on a dark terminal too.', moods: dress(SITTING, 'tricolour', SIT_BROWS), acts: ACTS },
  { id: 'sit-red', name: 'Sitting', coat: 'Red & white', size: [12, 16], idea: 'A red coat: warmer, and the most visible on a dark terminal.', moods: dress(SITTING, 'red'), acts: ACTS },
  { id: 'head-classic', name: 'Head', coat: 'Black & white', size: [12, 8], idea: 'Only the head and ruff, in the 4 rows the owl uses today. Ears and tongue carry the mood.', moods: dress(HEADS, 'classic'), acts: { ...ACTS, happy: 'Eyes shut, tongue out, ears bounce', sad: 'Ears drop, eyes shut' } },
  { id: 'head-tri', name: 'Head', coat: 'Tricolour', size: [12, 8], idea: 'The compact head with tan brows.', moods: dress(HEADS, 'tricolour', HEAD_BROWS), acts: { ...ACTS, happy: 'Eyes shut, tongue out, ears bounce', sad: 'Ears drop, eyes shut' } },
  { id: 'head-red', name: 'Head', coat: 'Red & white', size: [12, 8], idea: 'The compact head in red.', moods: dress(HEADS, 'red'), acts: { ...ACTS, happy: 'Eyes shut, tongue out, ears bounce', sad: 'Ears drop, eyes shut' } },
]
const MOODS = [
  ['idle', 'Idle'],
  ['working', 'Working'],
  ['waiting', 'Needs you'],
  ['happy', 'Done'],
  ['sad', 'Tool failed'],
]

if (typeof module !== 'undefined') module.exports = { PALETTE, VARIANTS, MOODS }
