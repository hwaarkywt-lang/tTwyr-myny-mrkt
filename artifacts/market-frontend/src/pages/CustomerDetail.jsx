import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowRight, Printer, FileDown, Wallet, Receipt, Calendar,
  TrendingUp, TrendingDown, RotateCcw, FileText, Phone,
  CreditCard, Plus, Search,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { exportStatementPDF } from '../lib/pdfExport';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (s) => new Date(s).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
const fmtDateOnly = (s) => new Date(s).toLocaleDateString('ar-EG');

const PRESETS = [
  { v: 'all', l: 'الكل' },
  { v: 'today', l: 'اليوم' },
  { v: 'week', l: 'هذا الأسبوع' },
  { v: 'month', l: 'هذا الشهر' },
  { v: 'year', l: 'هذه السنة' },
  { v: 'custom', l: 'مخصص' },
];

const PAYMENT_METHOD_LABELS = {
  cash: 'نقداً', jaib: 'جيب', fluusak: 'فلوسك', hasib: 'حاسب',
  banki: 'بنكي', bank_transfer: 'تحويل بنكي', credit: 'آجل', card: 'بطاقة',
};

const typeMeta = {
  sale:    { color: 'bg-rose-50 text-rose-700 border-rose-200',         icon: TrendingUp,   label: 'فاتورة آجل' },
  payment: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: TrendingDown, label: 'سند قبض' },
  return:  { color: 'bg-orange-50 text-orange-700 border-orange-200',    icon: RotateCcw,    label: 'مرتجع' },
};

function buildRange(preset, customFrom, customTo) {
  const today = new Date();
  const start = new Date(today); const end = new Date(today);
  if (preset === 'all')   return { from: null, to: null };
  if (preset === 'today') return { from: today.toISOString().slice(0,10), to: today.toISOString().slice(0,10) };
  if (preset === 'week')  { start.setDate(today.getDate() - 7); return { from: start.toISOString().slice(0,10), to: today.toISOString().slice(0,10) }; }
  if (preset === 'month') { start.setMonth(today.getMonth() - 1); return { from: start.toISOString().slice(0,10), to: today.toISOString().slice(0,10) }; }
  if (preset === 'year')  { start.setFullYear(today.getFullYear() - 1); return { from: start.toISOString().slice(0,10), to: today.toISOString().slice(0,10) }; }
  return { from: customFrom, to: customTo };
}

const CustomerDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [detail, setDetail] = useState(null);
  const [statement, setStatement] = useState(null);
  const [payments, setPayments] = useState([]);
  const [tab, setTab] = useState('statement');
  const [preset, setPreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');

  const [payOpen, setPayOpen] = useState(searchParams.get('action') === 'pay');
  const [payForm, setPayForm] = useState({ amount: '', payment_method: 'cash', notes: '' });

  const [rowDetail, setRowDetail] = useState(null);
  const [receiptModal, setReceiptModal] = useState(null);

  const loadDetail = useCallback(async () => {
    try { const r = await api.get(`/customers/${id}`); setDetail(r.data); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  }, [id]);

  const loadStatement = useCallback(async () => {
    const range = buildRange(preset, customFrom, customTo);
    const params = {};
    if (range.from) params.date_from = range.from + 'T00:00:00';
    if (range.to)   params.date_to   = range.to   + 'T23:59:59';
    try { const r = await api.get(`/customers/${id}/statement`, { params }); setStatement(r.data); }
    catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  }, [id, preset, customFrom, customTo]);

  const loadPayments = useCallback(async () => {
    try { const r = await api.get(`/customers/${id}/payments`); setPayments(r.data); }
    catch (e) { /* silent */ }
  }, [id]);

  useEffect(() => { loadDetail(); loadStatement(); loadPayments(); }, [loadDetail, loadStatement, loadPayments]);

  // Auto-trigger print if URL has action=print
  useEffect(() => {
    if (searchParams.get('action') === 'print' && statement) {
      setTimeout(() => window.print(), 600);
    }
  }, [searchParams, statement]);

  const recordPayment = async () => {
    try {
      const amt = Number(payForm.amount);
      if (!amt || amt <= 0) { toast({ title: 'أدخل مبلغاً صحيحاً', variant: 'destructive' }); return; }
      const { data } = await api.post(`/customers/${id}/payments`, {
        amount: amt, payment_method: payForm.payment_method, notes: payForm.notes || null,
      });
      toast({ title: '✅ تم تسجيل السند', description: `رقم السند: ${data.receipt_no}` });
      setPayOpen(false);
      setPayForm({ amount: '', payment_method: 'cash', notes: '' });
      loadDetail(); loadStatement(); loadPayments();
      setReceiptModal(data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const openRowDetail = async (row) => {
    if (row.type === 'sale') {
      try {
        const { data } = await api.get(`/customers/${id}/sales/${row.ref_id}/detail`);
        setRowDetail({ kind: 'sale', data });
      } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    } else if (row.type === 'payment') {
      try {
        const { data } = await api.get(`/customer-payments/${row.ref_id}`);
        setRowDetail({ kind: 'payment', data });
      } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    } else {
      setRowDetail({ kind: 'return', data: row });
    }
  };

  const filteredEntries = useMemo(() => {
    if (!statement?.entries) return [];
    if (!search.trim()) return statement.entries;
    const s = search.toLowerCase();
    return statement.entries.filter((e) =>
      e.op_no.toLowerCase().includes(s) ||
      e.description.toLowerCase().includes(s)
    );
  }, [statement, search]);

  if (!detail) {
    return <div className="p-10 text-center text-slate-400" dir="rtl">جاري التحميل...</div>;
  }

  const isDebt = Number(detail.balance) > 0;

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="customer-detail-page">
      {/* Header */}
      <div className="no-print mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/customers" className="text-slate-500 hover:text-slate-900">
            <ArrowRight className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{detail.full_name}</h1>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" />
              {detail.phone || '—'}
              <span className="mx-1">·</span>
              <Calendar className="w-3.5 h-3.5" />
              منذ {fmtDateOnly(detail.created_at)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setPayOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="record-payment-btn">
            <Wallet className="w-4 h-4 ml-1" /> تسجيل سداد
          </Button>
          <Button onClick={() => {
            const entries = (statement?.entries || []).map(e => ({ ...e, balance: e.running_balance ?? e.balance }));
            exportStatementPDF({
              title: 'كشف حساب عميل',
              kind: 'customer',
              name: detail.full_name,
              phone: detail.phone,
              balance: detail.balance,
              opening: statement?.opening_balance || 0,
              closing: statement?.closing_balance || detail.balance,
              entries,
              totalInvoices: Number(detail.total_credit_purchases || 0),
              totalPaid: Number(detail.total_paid || 0),
              totalReturns: Number(detail.total_returns || 0),
              skipValidation: true,
            }).catch((err) => console.error('Statement PDF failed:', err));
          }}
            className="bg-rose-500 hover:bg-rose-600 text-white" data-testid="export-pdf-btn">
            <FileDown className="w-4 h-4 ml-1" /> تصدير PDF
          </Button>
          <Button onClick={() => window.print()} variant="outline" data-testid="print-statement-btn">
            <Printer className="w-4 h-4 ml-1" /> طباعة
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="no-print grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'الرصيد الحالي', value: fmt(detail.balance) + ' ر.ي',
            color: isDebt ? 'from-rose-500 to-rose-600' : 'from-emerald-500 to-emerald-600',
            icon: isDebt ? TrendingUp : TrendingDown, testId: 'stat-balance' },
          { label: 'إجمالي المشتريات الآجلة', value: fmt(detail.total_credit_purchases) + ' ر.ي',
            color: 'from-rose-500 to-pink-600', icon: Receipt, testId: 'stat-credit-purchases' },
          { label: 'إجمالي المسدد', value: fmt(detail.total_paid) + ' ر.ي',
            color: 'from-emerald-500 to-teal-600', icon: Wallet, testId: 'stat-paid' },
          { label: 'عدد الفواتير', value: fmt(detail.invoice_count),
            color: 'from-blue-500 to-indigo-600', icon: FileText, testId: 'stat-invoices' },
          { label: 'آخر عملية', value: detail.last_activity_at ? fmtDateOnly(detail.last_activity_at) : '—',
            color: 'from-amber-500 to-orange-600', icon: Calendar, testId: 'stat-last-activity' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="overflow-hidden border-0 shadow-md">
              <div className={`bg-gradient-to-br ${s.color} p-4 text-white`}>
                <Icon className="w-5 h-5 mb-2 opacity-90" />
                <p className="text-white/80 text-xs">{s.label}</p>
                <p className="text-lg font-bold mt-1" data-testid={s.testId}>{s.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="no-print flex gap-2 mb-4">
        {[
          { v: 'statement', l: 'كشف الحساب' },
          { v: 'vouchers', l: 'السندات', count: payments.length },
        ].map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`tab-${t.v}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.v ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:border-slate-400'
            }`}>
            {t.l} {t.count !== undefined ? `(${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'statement' && (
        <>
          {/* Filters */}
          <Card className="no-print mb-4">
            <CardContent className="p-4 flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">الفترة</Label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="w-40" data-testid="period-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {preset === 'custom' && (
                <>
                  <div><Label className="text-xs">من</Label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                  <div><Label className="text-xs">إلى</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
                </>
              )}
              <Button onClick={loadStatement} variant="outline">عرض</Button>
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">بحث</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="رقم العملية أو البيان" className="pr-10" data-testid="statement-search" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank-style statement table (also used for print) */}
          <Card className="print-only-block">
            {/* Print header */}
            <div className="hidden print:block px-6 py-4 border-b">
              <div className="text-center mb-3">
                <h1 className="text-2xl font-bold">كشف حساب عميل</h1>
                <p className="text-sm text-slate-600">ميني ماركت الفنية — هاتف: 779008092</p>
              </div>
              <div className="grid grid-cols-2 text-sm gap-2">
                <div><span className="text-slate-500">العميل:</span> <span className="font-bold">{detail.full_name}</span></div>
                <div><span className="text-slate-500">الهاتف:</span> {detail.phone || '—'}</div>
                <div><span className="text-slate-500">من:</span> {statement?.period?.from || 'البداية'}</div>
                <div><span className="text-slate-500">إلى:</span> {statement?.period?.to || 'الآن'}</div>
                <div><span className="text-slate-500">الرصيد الافتتاحي:</span> {fmt(statement?.opening_balance || 0)} ر.ي</div>
                <div><span className="text-slate-500">الرصيد الختامي:</span> <span className="font-bold">{fmt(statement?.closing_balance || 0)} ر.ي</span></div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="statement-table">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-3 py-3 text-right">التاريخ</th>
                    <th className="px-3 py-3 text-right">رقم العملية</th>
                    <th className="px-3 py-3 text-right">البيان</th>
                    <th className="px-3 py-3 text-right">مدين</th>
                    <th className="px-3 py-3 text-right">دائن</th>
                    <th className="px-3 py-3 text-right">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening row */}
                  <tr className="bg-slate-50 border-t font-semibold text-slate-600">
                    <td colSpan="5" className="px-3 py-2">رصيد افتتاحي</td>
                    <td className="px-3 py-2">{fmt(statement?.opening_balance || 0)} ر.ي</td>
                  </tr>
                  {filteredEntries.length === 0 && (
                    <tr><td colSpan="6" className="px-3 py-8 text-center text-slate-400">لا توجد عمليات في هذه الفترة</td></tr>
                  )}
                  {filteredEntries.map((e, i) => {
                    const m = typeMeta[e.type];
                    return (
                      <tr
                        key={i}
                        className={`border-t cursor-pointer hover:bg-slate-50 ${e.voided ? 'opacity-50 line-through' : ''}`}
                        onClick={() => openRowDetail(e)}
                        data-testid={`statement-row-${e.op_no}`}
                      >
                        <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{e.op_no}</td>
                        <td className="px-3 py-2">
                          <Badge className={`${m?.color || ''} hover:opacity-90`}>{m?.label} </Badge>
                          {e.description.replace(m?.label || '', '').trim() && (
                            <span className="text-xs text-slate-500 mr-1">{e.description}</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 font-semibold ${e.debit > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {e.debit > 0 ? `${fmt(e.debit)} ر.ي` : '—'}
                        </td>
                        <td className={`px-3 py-2 font-semibold ${e.credit > 0 && e.type === 'payment' ? 'text-emerald-600' : e.credit > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                          {e.credit > 0 ? `${fmt(e.credit)} ر.ي` : '—'}
                        </td>
                        <td className="px-3 py-2 font-bold">{fmt(e.balance)} ر.ي</td>
                      </tr>
                    );
                  })}
                  {/* Closing row */}
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                    <td colSpan="5" className="px-3 py-3">الرصيد الختامي</td>
                    <td className={`px-3 py-3 text-lg ${(statement?.closing_balance || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {fmt(statement?.closing_balance || 0)} ر.ي
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="hidden print:block p-4 text-xs text-slate-500 text-center border-t">
              تاريخ الطباعة: {fmtDate(statement?.generated_at || new Date().toISOString())}
            </div>
          </Card>
        </>
      )}

      {tab === 'vouchers' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-right">رقم السند</th>
                  <th className="px-4 py-3 text-right">التاريخ</th>
                  <th className="px-4 py-3 text-right">المبلغ</th>
                  <th className="px-4 py-3 text-right">طريقة الدفع</th>
                  <th className="px-4 py-3 text-right">الموظف</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-12">
                    <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-400">لا توجد سندات</p>
                  </td></tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-emerald-700 font-semibold">{p.receipt_no}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{fmt(p.amount)} ر.ي</td>
                    <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                    <td className="px-4 py-3 text-slate-600">{p.created_by_name || '—'}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => setReceiptModal(p)}>
                        <Printer className="w-3.5 h-3.5 ml-1" /> طباعة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل سداد من {detail.full_name}</DialogTitle>
          </DialogHeader>
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-3 text-sm">
            <div className="flex justify-between"><span>الرصيد الحالي:</span>
              <span className="font-bold text-rose-700">{fmt(detail.balance)} ر.ي</span></div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>المبلغ</Label>
              <Input type="number" step="0.01" value={payForm.amount} autoFocus
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                placeholder="0.00" className="text-lg font-bold"
                data-testid="payment-amount-input" />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger data-testid="payment-method-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'credit').map(([k, l]) =>
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
            </div>
            {Number(payForm.amount) > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>الرصيد بعد السداد:</span>
                  <span className="font-bold">{fmt(Number(detail.balance) - Number(payForm.amount))} ر.ي</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button onClick={recordPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="save-payment-btn">
              تسجيل وإنشاء سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Row detail modal */}
      <Dialog open={!!rowDetail} onOpenChange={() => setRowDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {rowDetail?.kind === 'sale' ? `فاتورة ${rowDetail?.data?.invoice_no}` :
               rowDetail?.kind === 'payment' ? `سند قبض ${rowDetail?.data?.receipt_no}` :
               'تفاصيل العملية'}
            </DialogTitle>
          </DialogHeader>
          {rowDetail?.kind === 'sale' && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">التاريخ:</span> {fmtDate(rowDetail.data.created_at)}</div>
                <div><span className="text-slate-500">الكاشير:</span> {rowDetail.data.cashier_name}</div>
                <div><span className="text-slate-500">طريقة الدفع:</span> {PAYMENT_METHOD_LABELS[rowDetail.data.payment_method]}</div>
                <div><span className="text-slate-500">الحالة:</span> {rowDetail.data.status}</div>
              </div>
              <table className="w-full border mt-2 text-xs">
                <thead className="bg-slate-50"><tr>
                  <th className="px-2 py-1 text-right">المنتج</th>
                  <th className="px-2 py-1">الكمية</th>
                  <th className="px-2 py-1">السعر</th>
                  <th className="px-2 py-1">الإجمالي</th>
                </tr></thead>
                <tbody>
                  {rowDetail.data.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{it.product_name}</td>
                      <td className="px-2 py-1 text-center">{fmt(it.quantity)}</td>
                      <td className="px-2 py-1 text-center">{fmt(it.unit_price)}</td>
                      <td className="px-2 py-1 text-center font-semibold">{fmt(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-slate-100 font-bold">
                  <td colSpan="3" className="px-2 py-1 text-right">الإجمالي</td>
                  <td className="px-2 py-1 text-center text-rose-700">{fmt(rowDetail.data.total)} ر.ي</td>
                </tr></tfoot>
              </table>
            </div>
          )}
          {rowDetail?.kind === 'payment' && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">رقم السند:</span> <span className="font-mono font-bold">{rowDetail.data.receipt_no}</span></div>
                <div><span className="text-slate-500">التاريخ:</span> {fmtDate(rowDetail.data.created_at)}</div>
                <div><span className="text-slate-500">المبلغ:</span> <span className="font-bold text-emerald-600">{fmt(rowDetail.data.amount)} ر.ي</span></div>
                <div><span className="text-slate-500">طريقة الدفع:</span> {PAYMENT_METHOD_LABELS[rowDetail.data.payment_method]}</div>
                <div><span className="text-slate-500">الموظف:</span> {rowDetail.data.created_by_name}</div>
                {rowDetail.data.notes && <div className="col-span-2"><span className="text-slate-500">ملاحظات:</span> {rowDetail.data.notes}</div>}
              </div>
              <Button onClick={() => { setRowDetail(null); setReceiptModal(rowDetail.data); }}
                variant="outline" className="w-full mt-2">
                <Printer className="w-4 h-4 ml-1" /> طباعة السند
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print-only receipt voucher */}
      {receiptModal && (
        <>
          <Dialog open={!!receiptModal} onOpenChange={() => setReceiptModal(null)}>
            <DialogContent dir="rtl" className="max-w-md">
              <DialogHeader><DialogTitle>سند قبض</DialogTitle></DialogHeader>
              <ReceiptVoucher voucher={receiptModal} customer={detail} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setReceiptModal(null)}>إغلاق</Button>
                <Button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 text-white">
                  <Printer className="w-4 h-4 ml-1" /> طباعة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* Print-only fragment */}
          <div className="print-only">
            <ReceiptVoucher voucher={receiptModal} customer={detail} forPrint />
          </div>
        </>
      )}
    </div>
  );
};


const ReceiptVoucher = ({ voucher, customer, forPrint = false }) => (
  <div className={`bg-white p-6 ${forPrint ? '' : 'border rounded-lg'}`} dir="rtl">
    <div className="text-center mb-4 pb-3 border-b-2 border-dashed">
      <h1 className="text-2xl font-bold">سند قبض</h1>
      <p className="text-sm text-slate-600">ميني ماركت الفنية — هاتف: 779008092</p>
    </div>
    <div className="space-y-2 text-sm mb-4">
      <div className="flex justify-between"><span className="text-slate-500">رقم السند:</span>
        <span className="font-mono font-bold">{voucher.receipt_no}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">التاريخ:</span>
        <span>{fmtDate(voucher.created_at)}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">العميل:</span>
        <span className="font-semibold">{customer?.full_name || voucher.customer_name}</span></div>
      <div className="flex justify-between"><span className="text-slate-500">الهاتف:</span>
        <span>{customer?.phone || voucher.customer_phone || '—'}</span></div>
    </div>
    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4 text-center mb-4">
      <p className="text-xs text-slate-600 mb-1">المبلغ</p>
      <p className="text-3xl font-bold text-emerald-700">{fmt(voucher.amount)} ر.ي</p>
      <p className="text-xs text-slate-500 mt-2">عن طريق: {PAYMENT_METHOD_LABELS[voucher.payment_method]}</p>
    </div>
    {voucher.notes && (
      <div className="text-sm mb-3"><span className="text-slate-500">ملاحظات:</span> {voucher.notes}</div>
    )}
    <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 pt-4 border-t mt-4">
      <div>الموظف: <span className="text-slate-700 font-medium">{voucher.created_by_name || '—'}</span></div>
      <div className="text-left">توقيع المستلم: _________</div>
    </div>
  </div>
);

export default CustomerDetail;
