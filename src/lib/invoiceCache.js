// Generated invoices (page images and all) kept in memory per order, so reopening
// one is instant. Anything that changes what the invoice shows (lumpers) clears
// its entry; OrderInvoice has a "Regenerar" button for the rest.
export const invoiceCache = {}

export function clearInvoiceCache(orderId) {
  delete invoiceCache[orderId]
}
