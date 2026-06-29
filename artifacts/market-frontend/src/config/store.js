/**
 * Central store identity configuration.
 * Used across: login, sidebar, dashboard, invoices, statements, reports, PDFs.
 *
 * To change store name/phone, edit this single file.
 */
export const STORE = {
  name:    'ميني ماركت الفنية',
  phone:   '779008092',
  tagline: 'نظام إدارة الميني ماركت',
  // Future: address, taxNumber, ownerName, logoUrl
};

export const STORE_FOOTER_TEXT = `${STORE.name} — هاتف: ${STORE.phone}`;
