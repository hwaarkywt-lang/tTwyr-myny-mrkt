/**
 * Professional PDF Export — Mini Market Management System
 *
 * Features:
 *  - Full Arabic RTL via html2canvas → jsPDF (perfect Arabic, no font hacks)
 *  - Auto page numbering for multi-page PDFs
 *  - PAID / OUTSTANDING / PARTIAL stamps on invoices and statements
 *  - Pre-print validation (totals, balances, return totals, exchange diff)
 *  - A4 (sales/purchase invoices, statements, reports)
 *  - 58mm and 80mm THERMAL receipt support
 *  - Brand header (logo + store name) + footer with generation timestamp
 *  - QR codes for verification
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { STORE } from '../config/store';

// ====================== BRAND ======================
const BRAND = {
  name:        STORE.name,
  phone:       STORE.phone,
  tagline:     STORE.tagline,
  primary:     '#f59e0b',
  primaryDark: '#d97706',
  dark:        '#0f172a',
  green:       '#10b981',
  red:         '#dc2626',
  amber:       '#f59e0b',
  gray:        '#64748b',
};

// ====================== FORMATTERS ======================
const money = (n) =>
  new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const fmtInt = (n) => new Intl.NumberFormat('ar-EG').format(Number(n) || 0);

const arabicDateTime = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
};

const arabicDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return '—'; }
};

async function qrDataUrl(text, size = 100) {
  try {
    return await QRCode.toDataURL(String(text || '—'), {
      width: size, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch { return null; }
}

// ====================== VALIDATION ======================
/**
 * Validates that line totals and grand total match.
 * @returns { ok: boolean, errors: string[] }
 */
export function validateInvoice({ items, total, paid, remaining }) {
  const errors = [];
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('لا توجد أصناف في الفاتورة');
  } else {
    items.forEach((it, idx) => {
      const qty = Number(it.quantity);
      const price = Number(it.unit_price ?? it.unit_cost);
      const lineTotal = Number(it.total ?? (qty * price));
      if (!Number.isFinite(qty) || qty <= 0) errors.push(`صنف #${idx + 1}: كمية غير صحيحة`);
      if (!Number.isFinite(price) || price < 0) errors.push(`صنف #${idx + 1}: سعر غير صحيح`);
      if (Math.abs(lineTotal - qty * price) > 0.05) {
        errors.push(`صنف #${idx + 1}: إجمالي السطر لا يطابق (الكمية × السعر)`);
      }
    });
    const sumLines = items.reduce((s, it) =>
      s + Number(it.total ?? (Number(it.quantity) * Number(it.unit_price ?? it.unit_cost ?? 0))), 0);
    if (Math.abs(sumLines - Number(total || 0)) > 0.1) {
      errors.push(`الإجمالي (${money(total)}) لا يطابق مجموع الأصناف (${money(sumLines)})`);
    }
  }
  if (paid != null && remaining != null) {
    const expected = Number(total || 0) - Number(paid || 0);
    if (Math.abs(expected - Number(remaining)) > 0.1) {
      errors.push(`المتبقي (${money(remaining)}) لا يساوي الإجمالي - المدفوع (${money(expected)})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validates a statement (customer/supplier)
 */
export function validateStatement({ entries, opening, closing }) {
  const errors = [];
  if (!Array.isArray(entries)) {
    errors.push('قائمة الحركات غير صحيحة');
    return { ok: false, errors };
  }
  let running = Number(opening || 0);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    running += Number(e.debit || 0) - Number(e.credit || 0);
    if (e.balance != null && Math.abs(Number(e.balance) - running) > 0.1) {
      errors.push(`رصيد متراكم خاطئ عند الحركة #${i + 1} (متوقع ${money(running)}, مسجّل ${money(e.balance)})`);
      break;
    }
  }
  if (closing != null && Math.abs(running - Number(closing)) > 0.1) {
    errors.push(`الرصيد الختامي (${money(closing)}) لا يطابق المحسوب (${money(running)})`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validates exchange diff = new_total - return_value
 */
export function validateExchange({ returnValue, newTotal, diff }) {
  const errors = [];
  const expected = Number(newTotal || 0) - Number(returnValue || 0);
  if (Math.abs(expected - Number(diff || 0)) > 0.1) {
    errors.push(`فرق الاستبدال (${money(diff)}) لا يطابق (الجديد - المرتجع) = ${money(expected)}`);
  }
  return { ok: errors.length === 0, errors };
}

// Determine payment status & stamp
function paymentStatus(total, paid) {
  const t = Number(total || 0);
  const p = Number(paid || 0);
  if (p >= t - 0.01) return { code: 'PAID', label: 'مسدد بالكامل', color: BRAND.green };
  if (p <= 0.01) return { code: 'OUTSTANDING', label: 'متبقي على الحساب', color: BRAND.red };
  return { code: 'PARTIAL', label: 'سداد جزئي', color: BRAND.amber };
}

// ====================== CORE RENDERER ======================
function mountOffscreen(html, widthMm = 210) {
  const wrapper = document.createElement('div');
  const widthPx = Math.round(widthMm * 3.78);  // 96 DPI
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: `${widthPx}px`,
    background: '#ffffff',
    direction: 'rtl',
    fontFamily: '"Tajawal","Cairo","Noto Sans Arabic",system-ui,Arial,sans-serif',
    fontSize: '13px',
    color: '#0f172a',
    zIndex: '-1000',
  });
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper;
}

async function htmlToPdfDownload(el, filename, opts = {}) {
  const orientation = opts.orientation || 'p';
  const format = opts.format || 'a4';  // a4 | [width_mm, height_mm]

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let totalPages;
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH, undefined, 'FAST');
    totalPages = 1;
  } else {
    totalPages = Math.ceil(imgH / pageH);
    let offsetY = 0;
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -offsetY, imgW, imgH, undefined, 'FAST');
      offsetY += pageH;
    }
  }

  // Add page numbers (multi-page only) — for A4
  if (totalPages > 1 && format === 'a4') {
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(`صفحة ${i} من ${totalPages}`, pageW / 2, pageH - 5, { align: 'center' });
    }
  }

  pdf.save(filename);
}

// ====================== HTML BUILDING BLOCKS ======================
function brandHeaderHtml({ title, voucherNo, dateLabel }) {
  return `
    <div style="background:linear-gradient(135deg,${BRAND.dark} 0%,${BRAND.dark} 55%,${BRAND.primaryDark} 100%);color:#fff;padding:18px 24px;border-radius:0 0 14px 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;">
        <div style="display:flex;gap:14px;align-items:center;">
          <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#fbbf24,#d97706);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#0f172a;box-shadow:0 4px 14px rgba(245,158,11,.5);">M</div>
          <div>
            <div style="font-size:20px;font-weight:900;letter-spacing:.3px;">${BRAND.name}</div>
            <div style="font-size:11px;opacity:.75;margin-top:2px;">${BRAND.tagline}</div>
          </div>
        </div>
        <div style="text-align:left;">
          <div style="font-size:18px;font-weight:800;color:#fcd34d;">${title}</div>
          ${voucherNo ? `<div style="font-family:monospace;font-size:13px;opacity:.9;margin-top:3px;">${voucherNo}</div>` : ''}
          ${dateLabel ? `<div style="font-size:11px;opacity:.85;margin-top:2px;">${dateLabel}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function footerHtml() {
  return `
    <div style="text-align:center;padding:14px 18px;margin-top:18px;border-top:2px dashed #cbd5e1;color:#64748b;font-size:10px;">
      <div style="font-weight:800;color:#0f172a;font-size:12px;">${BRAND.name}</div>
      <div style="font-weight:600;margin-top:2px;">هاتف: ${BRAND.phone}</div>
      <div style="margin-top:4px;">${BRAND.tagline}</div>
      <div style="margin-top:3px;">طُبع في: <strong>${arabicDateTime(new Date())}</strong></div>
    </div>
  `;
}

/**
 * Diagonal stamp overlay (PAID / OUTSTANDING / PARTIAL)
 */
function stampHtml(status) {
  return `
    <div style="position:absolute;top:140px;left:50%;transform:translate(-50%,0) rotate(-12deg);
      border:4px solid ${status.color};color:${status.color};font-weight:900;font-size:36px;
      padding:10px 36px;border-radius:14px;opacity:.18;letter-spacing:2px;pointer-events:none;
      text-align:center;white-space:nowrap;background:rgba(255,255,255,.5);
      box-shadow:0 0 0 4px ${status.color}11;">
      ${status.label}
    </div>
  `;
}

function infoRow(label, value, opts = {}) {
  const color = opts.color || BRAND.dark;
  return `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:12.5px;">
      <span style="color:#64748b;">${label}</span>
      <span style="font-weight:700;color:${color};">${value ?? '—'}</span>
    </div>
  `;
}

function totalsCard({ label, value, color = BRAND.primary }) {
  return `
    <div style="background:linear-gradient(135deg,${color} 0%,${BRAND.dark} 100%);color:#fff;padding:14px 20px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 12px rgba(15,23,42,.2);">
      <div style="font-size:13px;opacity:.9;">${label}</div>
      <div style="font-size:24px;font-weight:900;letter-spacing:.4px;">${value} <span style="font-size:13px;opacity:.85;">ر.ي</span></div>
    </div>
  `;
}

// ====================== ITEM TABLE ======================
function itemsTableHtml(items, accent) {
  if (!items || items.length === 0) return '';
  return `
    <div style="margin-top:14px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:${accent};color:#fff;">
            <th style="padding:8px;text-align:center;width:36px;">#</th>
            <th style="padding:8px;text-align:right;">الصنف</th>
            <th style="padding:8px;text-align:center;width:80px;">الكمية</th>
            <th style="padding:8px;text-align:center;width:90px;">سعر الوحدة</th>
            <th style="padding:8px;text-align:center;width:100px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, idx) => {
            const qty = Number(it.quantity || 0);
            const price = Number(it.unit_price ?? it.unit_cost ?? 0);
            const lineTotal = Number(it.total ?? it.refund_amount ?? (qty * price));
            const name = it.name || it.product_name || '—';
            const sku = it.sku || it.product_sku;
            const unitLabel = it.unit === 'carton' ? ' (كرتون)' : '';
            return `
              <tr style="background:${idx % 2 ? '#fefce8' : '#ffffff'};border-top:1px solid #f1f5f9;">
                <td style="padding:7px;text-align:center;font-weight:700;color:#94a3b8;">${idx + 1}</td>
                <td style="padding:7px;text-align:right;">
                  <div style="font-weight:700;color:#0f172a;">${name}${unitLabel}</div>
                  ${sku ? `<div style="font-size:10px;color:#94a3b8;font-family:monospace;">${sku}</div>` : ''}
                </td>
                <td style="padding:7px;text-align:center;font-weight:600;">${fmtInt(qty)}</td>
                <td style="padding:7px;text-align:center;">${money(price)}</td>
                <td style="padding:7px;text-align:center;font-weight:700;color:${accent};">${money(lineTotal)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ====================== UNIVERSAL VOUCHER PDF (A4) ======================
/**
 * Universal voucher / invoice PDF.
 * @param {Object} opts
 *   - title, voucherNo, dateISO
 *   - subjectLabel ('العميل','التاجر','الكاشير'), subjectName
 *   - originalInvoiceLabel, originalInvoiceNo (for return/exchange vouchers)
 *   - paymentMethod, employeeName, approverName, reason, notes
 *   - items: [{name, sku, quantity, unit_price, total, unit}]
 *   - total, paid, remaining (for sale/purchase invoices)
 *   - extraRows: [{label, value, highlight}]
 *   - accent ('#10b981' etc.)
 *   - showStamp (boolean) — auto if paid/remaining provided
 *   - skipValidation (boolean) — bypass validation
 */
export async function exportVoucherPDF(opts) {
  const accent = opts.accent || BRAND.primary;
  const items  = opts.items || [];
  const total  = Number(opts.total || 0);
  const paid   = opts.paid != null ? Number(opts.paid) : null;
  const remaining = opts.remaining != null ? Number(opts.remaining)
                  : (paid != null ? total - paid : null);

  // Validation
  if (!opts.skipValidation && items.length > 0) {
    const v = validateInvoice({ items, total, paid, remaining });
    if (!v.ok) {
      const msg = 'تعذّر إنشاء PDF — بيانات غير متطابقة:\n• ' + v.errors.join('\n• ');
      // toast if available
      try {
        const { toast } = await import('../hooks/use-toast');
        toast.toast({ title: 'فشل التحقق', description: msg, variant: 'destructive' });
      } catch (err) { console.warn('Toast import failed:', err); }
      throw new Error(msg);
    }
  }

  const qr = await qrDataUrl(`${opts.voucherNo}|${opts.dateISO}|${total}`);
  const status = (paid != null) ? paymentStatus(total, paid) : null;

  // Compose top info grid
  const infoCells = [];
  if (opts.subjectName) infoCells.push(infoRow(opts.subjectLabel || 'الطرف', opts.subjectName));
  if (opts.originalInvoiceNo) infoCells.push(infoRow(opts.originalInvoiceLabel || 'الفاتورة الأصلية',
    `<span style="font-family:monospace;color:${accent};">${opts.originalInvoiceNo}</span>`));
  if (opts.paymentMethod) infoCells.push(infoRow('طريقة الدفع', opts.paymentMethod));
  if (opts.employeeName) infoCells.push(infoRow('الموظف المنفّذ', opts.employeeName));
  if (opts.approverName) infoCells.push(infoRow('اعتمد', opts.approverName));
  if (opts.reason) infoCells.push(infoRow('السبب', opts.reason));
  infoCells.push(infoRow('التاريخ والوقت', arabicDateTime(opts.dateISO)));

  // Extra rows
  const extraRowsHtml = (opts.extraRows || []).map((r) => `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;background:${
      r.highlight === 'red' ? '#fef2f2' : r.highlight === 'green' ? '#f0fdf4' : '#f8fafc'
    };border-radius:8px;margin-top:6px;border-right:4px solid ${
      r.highlight === 'red' ? BRAND.red : r.highlight === 'green' ? BRAND.green : BRAND.gray
    };">
      <span style="color:#475569;font-weight:600;">${r.label}</span>
      <span style="font-weight:800;color:${r.highlight === 'red' ? BRAND.red : r.highlight === 'green' ? BRAND.green : BRAND.dark};">${r.value}</span>
    </div>
  `).join('');

  // Payment summary cards (if paid given)
  const paymentSummaryHtml = (paid != null) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 24px 0;">
      <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:11px;color:#64748b;">الإجمالي</div>
        <div style="font-size:18px;font-weight:900;color:${BRAND.dark};">${money(total)} <span style="font-size:11px;">ر.ي</span></div>
      </div>
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:11px;color:#15803d;">المدفوع</div>
        <div style="font-size:18px;font-weight:900;color:${BRAND.green};">${money(paid)} <span style="font-size:11px;">ر.ي</span></div>
      </div>
      <div style="background:${remaining > 0.01 ? '#fef2f2' : '#f0fdf4'};border:2px solid ${remaining > 0.01 ? '#fca5a5' : '#86efac'};border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:11px;color:${remaining > 0.01 ? '#b91c1c' : '#15803d'};">المتبقي</div>
        <div style="font-size:18px;font-weight:900;color:${remaining > 0.01 ? BRAND.red : BRAND.green};">${money(remaining || 0)} <span style="font-size:11px;">ر.ي</span></div>
      </div>
    </div>
  ` : '';

  const html = `
    <div style="position:relative;padding:0 0 18px;background:#fff;font-family:inherit;">
      ${brandHeaderHtml({ title: opts.title, voucherNo: opts.voucherNo, dateLabel: arabicDateTime(opts.dateISO) })}

      ${status ? stampHtml(status) : ''}

      <div style="padding:20px 24px;display:flex;gap:20px;">
        <div style="flex:1;">
          ${infoCells.join('')}
        </div>
        ${qr ? `
          <div style="text-align:center;align-self:flex-start;">
            <img src="${qr}" style="width:96px;height:96px;display:block;border:5px solid ${accent};border-radius:10px;" />
            <div style="font-size:9px;color:#94a3b8;margin-top:5px;">رمز التحقق</div>
          </div>
        ` : ''}
      </div>

      ${items.length > 0 ? `<div style="padding:0 24px;">${itemsTableHtml(items, accent)}</div>` : ''}

      ${extraRowsHtml ? `<div style="margin-top:14px;padding:0 24px;">${extraRowsHtml}</div>` : ''}

      <div style="margin:18px 24px 0;">
        ${totalsCard({ label: 'الإجمالي النهائي', value: money(total), color: accent })}
      </div>

      ${paymentSummaryHtml}

      ${opts.notes ? `
        <div style="margin:14px 24px 0;padding:12px 16px;background:#fffbeb;border-right:4px solid ${BRAND.amber};border-radius:8px;font-size:12px;color:#78350f;">
          <strong>ملاحظات:</strong> ${opts.notes}
        </div>
      ` : ''}

      <!-- Signatures -->
      <div style="display:flex;justify-content:space-around;margin-top:30px;padding:0 24px;gap:30px;">
        <div style="text-align:center;flex:1;">
          <div style="border-top:1.5px dashed #94a3b8;padding-top:6px;font-size:11px;color:#64748b;">توقيع الموظف</div>
        </div>
        <div style="text-align:center;flex:1;">
          <div style="border-top:1.5px dashed #94a3b8;padding-top:6px;font-size:11px;color:#64748b;">توقيع المستلم</div>
        </div>
      </div>

      ${footerHtml()}
    </div>
  `;

  const el = mountOffscreen(html, 210);
  try {
    await htmlToPdfDownload(el, `${opts.voucherNo || 'voucher'}.pdf`, { orientation: 'p', format: 'a4' });
  } finally {
    document.body.removeChild(el);
  }
}

// ====================== STATEMENT PDF (A4 landscape) ======================
/**
 * Account statement (customer / supplier)
 * @param {Object} opts
 *   - title ('كشف حساب عميل' / 'كشف حساب تاجر')
 *   - name, phone, dateFrom, dateTo
 *   - opening, closing, balance
 *   - entries: [{date, op_no, type, description, debit, credit, balance}]
 *   - kind: 'customer' | 'supplier' (affects stamp logic)
 *   - totalInvoices, totalPaid, totalReturns (summary cards)
 */
export async function exportStatementPDF(opts) {
  const entries = opts.entries || [];
  const closing = opts.closing ?? opts.balance ?? 0;
  const opening = opts.opening ?? 0;

  // Validation
  if (!opts.skipValidation) {
    const v = validateStatement({ entries, opening, closing });
    if (!v.ok) {
      const msg = 'تعذّر إنشاء PDF — الكشف يحتوي تناقضات:\n• ' + v.errors.join('\n• ');
      try {
        const { toast } = await import('../hooks/use-toast');
        toast.toast({ title: 'فشل التحقق', description: msg, variant: 'destructive' });
      } catch (err) { console.warn('Toast import failed:', err); }
      throw new Error(msg);
    }
  }

  const qr = await qrDataUrl(`STMT|${opts.name}|${closing}`);

  // Stamp: if closing balance ~ 0, "مسدد بالكامل" — else "متبقي على الحساب"
  const status = Math.abs(Number(closing)) < 0.01
    ? { code: 'PAID', label: 'مسدد بالكامل', color: BRAND.green }
    : { code: 'OUTSTANDING', label: 'متبقي على الحساب', color: BRAND.red };

  const rowsHtml = entries.map((e, idx) => `
    <tr style="background:${idx % 2 ? '#fafafa' : '#ffffff'};">
      <td style="padding:6px;text-align:center;font-size:11px;color:#64748b;width:80px;">${arabicDate(e.date)}</td>
      <td style="padding:6px;text-align:center;font-family:monospace;font-size:11px;color:#475569;width:110px;">${e.op_no || '—'}</td>
      <td style="padding:6px;text-align:right;font-size:12px;">${e.description || e.type || '—'}</td>
      <td style="padding:6px;text-align:center;font-weight:700;color:${Number(e.debit) > 0 ? BRAND.red : '#cbd5e1'};width:85px;">${Number(e.debit) > 0 ? money(e.debit) : '—'}</td>
      <td style="padding:6px;text-align:center;font-weight:700;color:${Number(e.credit) > 0 ? BRAND.green : '#cbd5e1'};width:85px;">${Number(e.credit) > 0 ? money(e.credit) : '—'}</td>
      <td style="padding:6px;text-align:center;font-weight:800;color:${BRAND.dark};width:85px;">${money(e.balance)}</td>
    </tr>
  `).join('');

  // Summary KPI row
  const summaryKpis = [];
  if (opts.totalInvoices != null) summaryKpis.push({ label: opts.kind === 'supplier' ? 'إجمالي المشتريات' : 'إجمالي الفواتير', value: money(opts.totalInvoices), color: BRAND.red });
  if (opts.totalPaid != null) summaryKpis.push({ label: 'إجمالي المدفوع', value: money(opts.totalPaid), color: BRAND.green });
  if (opts.totalReturns != null) summaryKpis.push({ label: 'إجمالي المرتجعات', value: money(opts.totalReturns), color: BRAND.amber });
  summaryKpis.push({ label: 'الرصيد النهائي', value: money(closing), color: status.code === 'PAID' ? BRAND.green : BRAND.red });

  const kpisHtml = summaryKpis.map((k) => `
    <div style="flex:1;background:linear-gradient(135deg,${k.color} 0%,${BRAND.dark} 100%);color:#fff;padding:11px 14px;border-radius:10px;text-align:center;box-shadow:0 3px 8px rgba(15,23,42,.18);">
      <div style="font-size:10px;opacity:.85;margin-bottom:3px;">${k.label}</div>
      <div style="font-size:18px;font-weight:900;">${k.value} <span style="font-size:11px;opacity:.85;">ر.ي</span></div>
    </div>
  `).join('');

  const html = `
    <div style="position:relative;padding:0 0 18px;background:#fff;">
      ${brandHeaderHtml({
        title: opts.title || 'كشف حساب',
        voucherNo: opts.name,
        dateLabel: opts.dateFrom && opts.dateTo
          ? `${arabicDate(opts.dateFrom)} → ${arabicDate(opts.dateTo)}`
          : 'كل المعاملات',
      })}

      ${stampHtml(status)}

      <div style="padding:18px 24px;display:flex;gap:16px;">
        <div style="flex:1;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            ${infoRow('الاسم', opts.name)}
            ${infoRow('الهاتف', opts.phone || '—')}
            ${infoRow('الفترة', opts.dateFrom && opts.dateTo
              ? `${arabicDate(opts.dateFrom)} → ${arabicDate(opts.dateTo)}`
              : 'كل المعاملات')}
            ${infoRow('الرصيد الافتتاحي', `${money(opening)} ر.ي`)}
          </div>
        </div>
        ${qr ? `<img src="${qr}" style="width:88px;height:88px;border:5px solid ${BRAND.primary};border-radius:10px;align-self:flex-start;" />` : ''}
      </div>

      <div style="padding:0 24px;display:flex;gap:8px;margin-bottom:14px;">${kpisHtml}</div>

      <div style="margin:0 24px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:${BRAND.dark};color:#fff;font-size:12px;">
              <th style="padding:9px;text-align:center;">التاريخ</th>
              <th style="padding:9px;text-align:center;">رقم العملية</th>
              <th style="padding:9px;text-align:right;">البيان</th>
              <th style="padding:9px;text-align:center;color:#fca5a5;">مدين</th>
              <th style="padding:9px;text-align:center;color:#86efac;">دائن</th>
              <th style="padding:9px;text-align:center;color:#fcd34d;">الرصيد</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="6" style="padding:30px;text-align:center;color:#94a3b8;">لا توجد عمليات في هذه الفترة</td></tr>`}</tbody>
        </table>
      </div>

      <div style="margin:14px 24px 0;">
        ${totalsCard({
          label: 'الرصيد الختامي',
          value: money(closing),
          color: status.code === 'PAID' ? BRAND.green : BRAND.red,
        })}
      </div>

      ${footerHtml()}
    </div>
  `;

  const el = mountOffscreen(html, 297);
  try {
    await htmlToPdfDownload(el, `statement_${(opts.name || 'party').replace(/\s+/g, '_')}.pdf`,
      { orientation: 'l', format: 'a4' });
  } finally {
    document.body.removeChild(el);
  }
}

// ====================== DAILY/MONTHLY REPORT PDF ======================
export async function exportDailyReportPDF(opts) {
  const qr = await qrDataUrl(`RPT|${opts.title}|${opts.dateLabel}`);
  const kpiColors = {
    green: BRAND.green, amber: BRAND.amber, rose: BRAND.red, blue: '#2563eb', purple: '#7c3aed',
  };
  const kpisHtml = (opts.kpis || []).map((k) => `
    <div style="flex:1;padding:13px;background:linear-gradient(135deg,${kpiColors[k.color] || BRAND.dark} 0%,${BRAND.dark} 100%);color:#fff;border-radius:10px;text-align:center;box-shadow:0 4px 10px rgba(15,23,42,.18);">
      <div style="font-size:11px;opacity:.85;margin-bottom:3px;">${k.label}</div>
      <div style="font-size:20px;font-weight:900;">${k.value}</div>
    </div>
  `).join('');

  const colsHtml = (opts.columns || []).map((c) => `<th style="padding:9px;text-align:center;">${c}</th>`).join('');
  const rowsHtml = (opts.rows || []).map((r, idx) => `
    <tr style="background:${idx % 2 ? '#fafafa' : '#ffffff'};">
      ${r.map((v) => `<td style="padding:7px;text-align:center;font-size:11.5px;">${v ?? '—'}</td>`).join('')}
    </tr>
  `).join('');
  const grandHtml = opts.grandRow ? `
    <tfoot>
      <tr style="background:${BRAND.primary};color:#fff;font-weight:800;">
        ${opts.grandRow.map((v) => `<td style="padding:9px;text-align:center;">${v ?? ''}</td>`).join('')}
      </tr>
    </tfoot>
  ` : '';

  const html = `
    <div style="padding:0 0 18px;background:#fff;">
      ${brandHeaderHtml({ title: opts.title, voucherNo: opts.dateLabel })}

      <div style="padding:18px 24px;display:flex;gap:14px;align-items:flex-start;">
        <div style="flex:1;display:flex;gap:8px;">${kpisHtml}</div>
        ${qr ? `<img src="${qr}" style="width:88px;height:88px;border:5px solid ${BRAND.primary};border-radius:10px;" />` : ''}
      </div>

      <div style="margin:0 24px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:${BRAND.dark};color:#fff;font-size:12px;">${colsHtml}</tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="${(opts.columns || []).length}" style="padding:30px;text-align:center;color:#94a3b8;">لا توجد بيانات</td></tr>`}</tbody>
          ${grandHtml}
        </table>
      </div>

      ${footerHtml()}
    </div>
  `;

  const el = mountOffscreen(html, 297);
  try {
    await htmlToPdfDownload(el, `${(opts.title || 'report').replace(/\s+/g, '_')}.pdf`,
      { orientation: 'l', format: 'a4' });
  } finally {
    document.body.removeChild(el);
  }
}

// ====================== THERMAL RECEIPT (58mm / 80mm) ======================
/**
 * Compact receipt for thermal printers.
 * @param {Object} opts
 *   - widthMm: 58 | 80
 *   - title, voucherNo, dateISO, storeName, storePhone
 *   - items, total, paid, remaining, paymentMethod
 *   - customerName, cashierName, notes
 */
export async function exportThermalReceiptPDF(opts) {
  const widthMm = opts.widthMm === 58 ? 58 : 80;
  const accent = opts.accent || BRAND.primary;
  const items = opts.items || [];
  const total = Number(opts.total || 0);
  const paid = opts.paid != null ? Number(opts.paid) : null;
  const remaining = opts.remaining != null ? Number(opts.remaining)
                   : (paid != null ? total - paid : null);

  if (!opts.skipValidation && items.length > 0) {
    const v = validateInvoice({ items, total, paid, remaining });
    if (!v.ok) throw new Error('تعذّر إنشاء الإيصال: ' + v.errors.join(' • '));
  }

  const status = (paid != null) ? paymentStatus(total, paid) : null;
  const qr = await qrDataUrl(`${opts.voucherNo}|${total}`, 80);

  // Tighter typography for thermal
  const html = `
    <div style="padding:8px;background:#fff;font-family:'Tajawal','Cairo','Noto Sans Arabic',monospace;font-size:11px;color:#0f172a;">
      <div style="text-align:center;border-bottom:1.5px dashed #000;padding-bottom:6px;margin-bottom:6px;">
        <div style="font-size:14px;font-weight:900;">${opts.storeName || BRAND.name}</div>
        ${opts.storePhone ? `<div style="font-size:10px;">📞 ${opts.storePhone}</div>` : ''}
        <div style="font-size:12px;font-weight:700;margin-top:3px;">${opts.title || 'فاتورة مبيعات'}</div>
      </div>

      <div style="font-size:10.5px;line-height:1.5;">
        <div style="display:flex;justify-content:space-between;"><span>رقم:</span><strong>${opts.voucherNo || '—'}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>التاريخ:</span><span>${arabicDateTime(opts.dateISO)}</span></div>
        ${opts.cashierName ? `<div style="display:flex;justify-content:space-between;"><span>الكاشير:</span><span>${opts.cashierName}</span></div>` : ''}
        ${opts.customerName ? `<div style="display:flex;justify-content:space-between;"><span>العميل:</span><span>${opts.customerName}</span></div>` : ''}
        ${opts.paymentMethod ? `<div style="display:flex;justify-content:space-between;"><span>الدفع:</span><span>${opts.paymentMethod}</span></div>` : ''}
      </div>

      <div style="border-top:1.5px dashed #000;border-bottom:1.5px dashed #000;margin:6px 0;padding:5px 0;">
        ${items.map((it) => {
          const qty = Number(it.quantity || 0);
          const price = Number(it.unit_price ?? it.unit_cost ?? 0);
          const lineTotal = Number(it.total ?? (qty * price));
          return `
            <div style="margin-bottom:4px;">
              <div style="font-weight:700;font-size:11px;">${it.name || it.product_name || '—'}</div>
              <div style="display:flex;justify-content:space-between;font-size:10.5px;">
                <span>${fmtInt(qty)} × ${money(price)}</span>
                <strong>${money(lineTotal)}</strong>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="font-size:11.5px;font-weight:700;">
        <div style="display:flex;justify-content:space-between;padding:2px 0;">
          <span>الإجمالي:</span><span>${money(total)} ر.ي</span>
        </div>
        ${paid != null ? `
          <div style="display:flex;justify-content:space-between;padding:2px 0;color:${BRAND.green};">
            <span>المدفوع:</span><span>${money(paid)} ر.ي</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:2px 0;color:${remaining > 0.01 ? BRAND.red : BRAND.green};">
            <span>المتبقي:</span><span>${money(remaining || 0)} ر.ي</span>
          </div>
        ` : ''}
      </div>

      ${status ? `
        <div style="text-align:center;margin-top:6px;padding:4px;border:2px solid ${status.color};color:${status.color};font-weight:900;font-size:12px;border-radius:4px;">
          ${status.label}
        </div>
      ` : ''}

      ${opts.notes ? `
        <div style="margin-top:6px;padding:5px;background:#fffbeb;border-right:3px solid ${accent};font-size:10px;">
          <strong>ملاحظات:</strong> ${opts.notes}
        </div>
      ` : ''}

      <div style="text-align:center;margin-top:8px;">
        ${qr ? `<img src="${qr}" style="width:70px;height:70px;" />` : ''}
        <div style="font-size:9px;margin-top:4px;color:#475569;">شكراً لتسوّقكم معنا</div>
        <div style="font-size:8.5px;margin-top:2px;color:#94a3b8;">${arabicDateTime(new Date())}</div>
      </div>
    </div>
  `;

  // Calculate dynamic height: thermal printers use roll paper. Use a tall format.
  const el = mountOffscreen(html, widthMm);
  // wait one tick for images to load
  await new Promise((r) => setTimeout(r, 200));
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
    const heightMm = Math.max(80, (canvas.height * widthMm) / canvas.width);
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: [widthMm, heightMm], compress: true });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
    pdf.save(`receipt_${widthMm}mm_${opts.voucherNo || 'r'}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
}
