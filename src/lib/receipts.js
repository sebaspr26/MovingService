import { supabase } from './supabase'

// Receipt images for expenses/diesel/DEF. The scanner used to read the photo
// and throw it away; now the file is kept in Storage and each row points to it
// through `receipt_path` (supabase/033_receipt_images.sql). Several rows can
// share one path when a single photo held several receipts.

const BUCKET = 'order-docs'
const MAX_SIDE = 2000

// Phone photos are 3-8MB; ~2000px JPEG keeps them readable at a fraction of the size
async function compressForStorage(file) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file
  } catch {
    // Formats the browser can't draw (e.g. HEIC on some browsers) are kept as-is
    return file
  }
}

/** Uploads a receipt file and returns its storage path. */
export async function uploadReceipt(file, truckId) {
  const toUpload = await compressForStorage(file)
  const ext = toUpload.type === 'application/pdf' ? 'pdf' : toUpload.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `receipts/${truckId || 'sin-camion'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, toUpload, { contentType: toUpload.type || undefined })
  if (error) throw error
  return path
}

export function receiptUrl(path) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || null
}

export const isPdfReceipt = path => /\.pdf$/i.test(path || '')
