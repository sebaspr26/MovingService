/** Triggers a browser download of a base64-encoded PDF. */
export function downloadBase64Pdf(base64, filename) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  downloadBlob(blob, filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Downloads a file from a URL (e.g. Supabase Storage public URL) as a real save-to-disk
 * download. The plain `download` attribute on an <a> is ignored by browsers for
 * cross-origin URLs, so this fetches the file as a blob first.
 */
export async function downloadFromUrl(url, filename) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el archivo')
  const blob = await res.blob()
  downloadBlob(blob, filename || 'archivo')
}
