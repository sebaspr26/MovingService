import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Renders an HTML string (a settlement/receipt document) into a multi-page
 * letter-size PDF, returned as a base64 string.
 *
 * Unlike a naive fixed-height slice, page breaks are snapped to the nearest
 * <tr> boundary so a table row is never cut in half across two pages.
 */
export async function htmlToPdfBase64(html, { containerWidth = 900 } = {}) {
  const scale = 2
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${containerWidth}px;background:#f3f4f6;padding:24px;box-sizing:border-box;`
  container.innerHTML = doc.body.innerHTML
  document.body.appendChild(container)

  const imgs = container.querySelectorAll('img')
  await Promise.all(Array.from(imgs).map(img =>
    img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r })
  ))

  const mainDiv = container.firstElementChild || container

  // Safe cut points: the bottom edge of every table row, in canvas pixels
  const containerTop = mainDiv.getBoundingClientRect().top
  const rowBreaks = Array.from(mainDiv.querySelectorAll('tr'))
    .map(tr => Math.round((tr.getBoundingClientRect().bottom - containerTop) * scale))
    .sort((a, b) => a - b)

  const pdf = new jsPDF('p', 'mm', 'letter')
  const pageW = 215.9
  const pageH = 279.4
  const margin = 10

  const canvas = await html2canvas(mainDiv, { scale, backgroundColor: '#ffffff', useCORS: true })
  const imgW = pageW - margin * 2
  const imgH = (canvas.height * imgW) / canvas.width
  const pixPerMM = canvas.height / imgH
  const maxHPx = Math.round((pageH - margin * 2) * pixPerMM)

  if (canvas.height <= maxHPx) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, imgH)
  } else {
    let y = 0
    let first = true
    while (y < canvas.height) {
      if (!first) pdf.addPage()
      first = false

      const naiveEnd = Math.min(y + maxHPx, canvas.height)
      // Snap to the last row boundary that fits within this page, if any
      const safeEnd = rowBreaks.filter(b => b > y && b <= naiveEnd).pop()
      const sy = y
      const sh = (safeEnd || naiveEnd) - y

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sh
      pageCanvas.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
      const sliceHmm = sh / pixPerMM
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceHmm)

      y += sh
    }
  }

  document.body.removeChild(container)
  return pdf.output('datauristring').split(',')[1]
}
