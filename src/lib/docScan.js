// "CamScanner" for driver photos of PODs, all in the browser (no service, no
// library): find the sheet's corners, straighten it (perspective warp) and
// clean it up (remove shadows / gray background, stretch contrast, sharpen).
// Used by components/DocScanner.jsx.

const WORK_MAX_SIDE = 3000  // photos are processed at most this big
const DETECT_SIDE = 420     // corner detection runs on a small copy
const OUTPUT_MAX_SIDE = 2400

/** File -> canvas (EXIF rotation applied), at most WORK_MAX_SIDE. */
export async function loadImageCanvas(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const scale = Math.min(1, WORK_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return canvas
}

export function rotateCanvas(src, clockwise = true) {
  const out = makeCanvas(src.height, src.width)
  const ctx = out.getContext('2d')
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((clockwise ? 1 : -1) * Math.PI / 2)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return out
}

/** The whole image as corners [TL, TR, BR, BL]. */
export function fullCorners(canvas) {
  const w = canvas.width, h = canvas.height
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
}

/**
 * Guess the sheet's corners: the paper is the biggest bright blob. On a small
 * copy: gray -> Otsu threshold -> largest bright connected region -> its
 * extreme points. Falls back to the whole image when nothing convincing shows up
 * (e.g. the photo is already just the sheet).
 */
export function detectCorners(canvas) {
  const scale = Math.min(1, DETECT_SIDE / Math.max(canvas.width, canvas.height))
  const w = Math.max(1, Math.round(canvas.width * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))
  const small = makeCanvas(w, h)
  const ctx = small.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  const blurred = boxBlur(gray, w, h, 2)
  const t = otsu(blurred)

  // Largest 4-connected region above the threshold
  const label = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  let best = null
  let id = 0
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || blurred[start] <= t) continue
    let sp = 0, count = 0
    let tl = start, tr = start, br = start, bl = start
    const score = (p, a, b) => (p % w) * a + ((p / w) | 0) * b
    stack[sp++] = start; label[start] = id
    while (sp) {
      const p = stack[--sp]
      count++
      if (score(p, 1, 1) < score(tl, 1, 1)) tl = p
      if (score(p, 1, 1) > score(br, 1, 1)) br = p
      if (score(p, 1, -1) > score(tr, 1, -1)) tr = p
      if (score(p, 1, -1) < score(bl, 1, -1)) bl = p
      const x = p % w
      const nbrs = [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1]
      for (const q of nbrs) {
        if (q < 0 || q >= w * h || label[q] !== -1 || blurred[q] <= t) continue
        label[q] = id
        stack[sp++] = q
      }
    }
    if (!best || count > best.count) best = { count, pts: [tl, tr, br, bl] }
    id++
  }

  const area = best ? best.count / (w * h) : 0
  if (!best || area < 0.15) return fullCorners(canvas)
  const corners = best.pts.map(p => ({ x: (p % w) / scale, y: ((p / w) | 0) / scale }))
  // A quad that's basically the whole frame or degenerate isn't worth cropping
  const quadArea = polygonArea(corners) / (canvas.width * canvas.height)
  if (quadArea < 0.15 || quadArea > 0.97) return fullCorners(canvas)
  return corners
}

/** Straighten the quad [TL, TR, BR, BL] into a rectangle. */
export function warpToRect(src, corners) {
  const [tl, tr, br, bl] = corners
  let outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  let outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)))
  const s = Math.min(1, OUTPUT_MAX_SIDE / Math.max(outW, outH))
  outW = Math.max(1, Math.round(outW * s)); outH = Math.max(1, Math.round(outH * s))

  const sctx = src.getContext('2d', { willReadFrequently: true })
  const sData = sctx.getImageData(0, 0, src.width, src.height).data
  const sw = src.width, sh = src.height
  const out = makeCanvas(outW, outH)
  const octx = out.getContext('2d')
  const img = octx.createImageData(outW, outH)
  const d = img.data

  // H maps output (u, v) -> source (x, y)
  const H = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    [tl, tr, br, bl],
  )
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const den = H[6] * u + H[7] * v + 1
      const x = (H[0] * u + H[1] * v + H[2]) / den
      const y = (H[3] * u + H[4] * v + H[5]) / den
      const o = (v * outW + u) * 4
      // Bilinear sample
      const x0 = Math.max(0, Math.min(sw - 2, x | 0)), y0 = Math.max(0, Math.min(sh - 2, y | 0))
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0))
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        const top = sData[i00 + c] + (sData[i10 + c] - sData[i00 + c]) * fx
        const bot = sData[i01 + c] + (sData[i11 + c] - sData[i01 + c]) * fx
        d[o + c] = top + (bot - top) * fy
      }
      d[o + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

/**
 * Clean the straightened sheet.
 *  'color' — shadows and paper tint removed, colors kept (stamps, signatures)
 *  'gray'  — same in grayscale
 *  'bw'    — black and white, the most legible for faded text
 */
export function enhance(src, mode = 'color') {
  const w = src.width, h = src.height
  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')
  const sData = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const img = octx.createImageData(w, h)
  const d = img.data

  // Lighting of the paper per area: downscale, drop the text (max filter),
  // smooth. Dividing by it flattens shadows and the gray/yellow paper tint.
  const bg = backgroundMap(sData, w, h)

  const n = w * h
  const norm = new Float32Array(n * 3)
  const grayN = new Uint8Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const b = bg.sample(x, y)
      let gsum = 0
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, (sData[i * 4 + c] / Math.max(24, b[c])) * 255)
        norm[i * 3 + c] = v
        gsum += v * (c === 0 ? 0.299 : c === 1 ? 0.587 : 0.114)
      }
      grayN[i] = gsum
    }
  }

  // Contrast stretch from the image's own histogram: darkest ink -> black, paper -> white
  const lo = percentile(grayN, 0.02)
  const hi = Math.max(lo + 40, percentile(grayN, 0.6))
  const stretch = v => Math.max(0, Math.min(255, ((v - lo) * 255) / (hi - lo)))
  // Ink a bit darker so faint handwriting reads
  const curve = v => 255 * Math.pow(v / 255, 1.35)

  if (mode === 'bw') {
    const g = new Uint8Array(n)
    for (let i = 0; i < n; i++) g[i] = stretch(grayN[i])
    const t = Math.min(215, Math.max(120, otsu(g) + 10))
    for (let i = 0; i < n; i++) {
      // Soft edge around the threshold keeps letters smooth instead of jagged
      const v = Math.max(0, Math.min(255, (g[i] - (t - 18)) * (255 / 36)))
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
      d[i * 4 + 3] = 255
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (mode === 'gray') {
        const v = curve(stretch(grayN[i]))
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
      } else {
        let m = 255
        for (let c = 0; c < 3; c++) { d[i * 4 + c] = curve(stretch(norm[i * 3 + c])); m = Math.min(m, d[i * 4 + c]) }
        // Near-white = paper: push it to pure white so no yellow/gray tint is left
        if (m > 200) {
          const t = Math.min(1, (m - 200) / 40)
          for (let c = 0; c < 3; c++) d[i * 4 + c] += (255 - d[i * 4 + c]) * t
        }
      }
      d[i * 4 + 3] = 255
    }
    sharpen(d, w, h)
  }
  octx.putImageData(img, 0, 0)
  return out
}

/** Canvas -> JPEG File ready to upload. */
export function canvasToFile(canvas, name, mode) {
  const quality = mode === 'bw' ? 0.8 : 0.86
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('No se pudo generar la imagen'))
      const base = (name || 'POD').replace(/\.[^.]+$/, '')
      resolve(new File([blob], `${base}-escaneado.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', quality)
  })
}

// ───────── helpers ─────────

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

function polygonArea(p) {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length
    a += p[i].x * p[j].y - p[j].x * p[i].y
  }
  return Math.abs(a) / 2
}

function otsu(values) {
  const hist = new Float64Array(256)
  for (let i = 0; i < values.length; i++) hist[values[i] | 0]++
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, t = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; t = i }
  }
  return t
}

function percentile(values, p) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < values.length; i++) hist[values[i] | 0]++
  const target = values.length * p
  let acc = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i }
  return 255
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y * w + xx]; c++ } }
      tmp[y * w + x] = s / c
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; c++ } }
      out[y * w + x] = s / c
    }
  }
  return out
}

// Paper brightness per channel on a coarse grid, read back with bilinear interpolation
function backgroundMap(data, w, h) {
  const cell = Math.max(8, Math.round(Math.max(w, h) / 90))
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell)
  // Per cell: the brighter pixels (≈ paper), not the mean (text pulls it down)
  const grid = new Float32Array(gw * gh * 3)
  const step = Math.max(1, Math.floor(cell / 6))
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const vals = [[], [], []]
      for (let y = gy * cell; y < Math.min(h, (gy + 1) * cell); y += step) {
        for (let x = gx * cell; x < Math.min(w, (gx + 1) * cell); x += step) {
          const i = (y * w + x) * 4
          vals[0].push(data[i]); vals[1].push(data[i + 1]); vals[2].push(data[i + 2])
        }
      }
      for (let c = 0; c < 3; c++) {
        const v = vals[c].sort((a, b) => a - b)
        grid[(gy * gw + gx) * 3 + c] = v.length ? v[Math.floor(v.length * 0.9)] : 255
      }
    }
  }
  // Max filter (wipes out cells that were all text) then blur, per channel
  const smooth = new Float32Array(grid.length)
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(gw * gh)
    for (let i = 0; i < gw * gh; i++) ch[i] = grid[i * 3 + c]
    const mx = new Float32Array(gw * gh)
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx >= 0 && xx < gw && yy >= 0 && yy < gh) m = Math.max(m, ch[yy * gw + xx])
      }
      mx[y * gw + x] = m
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let s = 0, k = 0
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx >= 0 && xx < gw && yy >= 0 && yy < gh) { s += mx[yy * gw + xx]; k++ }
      }
      smooth[(y * gw + x) * 3 + c] = s / k
    }
  }
  const px = [0, 0, 0]
  return {
    sample(x, y) {
      const fx = Math.min(gw - 1, Math.max(0, x / cell - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / cell - 0.5))
      const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1)
      const ax = fx - x0, ay = fy - y0
      for (let c = 0; c < 3; c++) {
        const a = smooth[(y0 * gw + x0) * 3 + c], b = smooth[(y0 * gw + x1) * 3 + c]
        const cc = smooth[(y1 * gw + x0) * 3 + c], dd = smooth[(y1 * gw + x1) * 3 + c]
        px[c] = (a + (b - a) * ax) * (1 - ay) + (cc + (dd - cc) * ax) * ay
      }
      return px
    },
  }
}

// Mild unsharp mask (3x3) on RGB, in place
function sharpen(d, w, h) {
  const src = new Uint8ClampedArray(d)
  const amount = 0.55
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const blur = (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c] + src[i + c] * 4) / 8
        d[i + c] = src[i + c] + (src[i + c] - blur) * amount
      }
    }
  }
}

// 3x3 projective transform taking points `from` to points `to` (4 pairs)
function homography(from, to) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i], { x, y } = to[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y)
  }
  return solve(A, b)
}

function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const p = M[col][col] || 1e-12
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / p
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12))
}
