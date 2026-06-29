import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, CheckCircle, XCircle, Printer, RefreshCw,
  AlertTriangle, Calendar, Receipt, User, Filter,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { exportVoucherPDF } from '../lib/pdfExport';

const STATUS_LABELS = {
  pending:  { label: 'بانتظار الموافقة', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: 'معتمد',            cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  rejected: { label: 'مرفوض',            cls: 'bg-rose-100 text-rose-700 border-rose-300' },
  canceled: { label: 'ملغي',             cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const TYPE_LABELS = {
  cash:   { label: 'مرتجع نقدي', cls: 'bg-emerald-50 text-emerald-700' },
  credit: { label: 'مرتجع آجل',  cls: 'bg-orange-50 text-orange-700' },
};

export default function Returns() {
  const { user, can } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeReturn, setActiveReturn] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales-returns', { params: { status: tab === 'all' ? undefined : tab } });
      setList(data || []);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const totals = {
    count: list.length,
    sum: list.reduce((s, r) => s + Number(r.total || 0), 0),
  };

  const printVoucher = (ret) => {
    exportVoucherPDF({
      title: 'سند مرتجع مبيعات',
      voucherNo: ret.return_no || '—',
      dateISO: ret.approved_at || ret.created_at,
      originalInvoiceLabel: 'الفاتورة الأصلية',
      originalInvoiceNo: ret.invoice_no || '—',
      subjectLabel: 'العميل',
      subjectName: ret.customer_name || 'عميل نقدي',
      paymentMethod: ret.return_type === 'credit' ? 'آجل (خصم من رصيد العميل)' : 'نقدي (خصم من المبيعات)',
      employeeName: ret.creator_name || '—',
      approverName: ret.approver_name || '—',
      reason: ret.reason || null,
      items: (ret.items || []).map((i) => ({
        name: i.product_name, sku: i.product_sku,
        quantity: i.quantity, unit_price: i.unit_price,
        total: i.refund_amount,
      })),
      total: Number(ret.total || 0),
      paid: Number(ret.total || 0),
      remaining: 0,
      accent: '#f59e0b',
      skipValidation: true,
    }).catch((err) => {
      console.error('Voucher PDF failed:', err);
      toast({ title: 'فشل إنشاء PDF', description: err?.message || 'خطأ غير معروف', variant: 'destructive' });
    });
  };

  const approve = async (ret) => {
    if (!window.confirm(`هل تريد اعتماد المرتجع ${ret.return_no || ''} بقيمة ${Number(ret.total).toFixed(2)} ر.ي ؟\nسيتم استرجاع المخزون وتعديل الحسابات تلقائياً.`)) return;
    try {
      await api.post(`/sales-returns/${ret.id}/approve`);
      toast({ title: '✅ تم اعتماد المرتجع' });
      setDetailOpen(false);
      load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const submitReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      toast({ title: 'سبب الرفض إجباري', variant: 'destructive' }); return;
    }
    try {
      await api.post(`/sales-returns/${activeReturn.id}/reject`, { reason: rejectReason });
      toast({ title: 'تم رفض الطلب' });
      setRejectOpen(false); setDetailOpen(false); setRejectReason('');
      load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  return (
    <div className="p-6 space-y-6" data-testid="returns-page" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="text-orange-500" /> مرتجعات المبيعات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إنشاء طلبات المرتجع، متابعة الحالة، واعتماد/رفض من قِبل المدير
          </p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => setCreateOpen(true)}
          data-testid="new-return-btn"
        >
          <Plus className="w-4 h-4 ml-2" /> طلب مرتجع جديد
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Receipt className="w-10 h-10 text-orange-500 bg-orange-100 p-2 rounded-lg" />
          <div><p className="text-xs text-slate-500">عدد الطلبات</p>
            <p className="text-2xl font-bold" data-testid="returns-count">{totals.count}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <RefreshCw className="w-10 h-10 text-rose-500 bg-rose-100 p-2 rounded-lg" />
          <div><p className="text-xs text-slate-500">إجمالي القيمة (في التبويب الحالي)</p>
            <p className="text-2xl font-bold text-rose-600" data-testid="returns-total">{totals.sum.toFixed(2)} ر.ي</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Filter className="w-10 h-10 text-blue-500 bg-blue-100 p-2 rounded-lg" />
          <div><p className="text-xs text-slate-500">الحالة الحالية</p>
            <p className="text-lg font-bold text-blue-600">{STATUS_LABELS[tab]?.label || 'الكل'}</p></div>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {['pending', 'approved', 'rejected', 'all'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'all' ? 'الكل' : STATUS_LABELS[t]?.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-right">رقم السند</th>
              <th className="px-4 py-3 text-right">الفاتورة</th>
              <th className="px-4 py-3 text-right">العميل</th>
              <th className="px-4 py-3 text-right">النوع</th>
              <th className="px-4 py-3 text-right">القيمة</th>
              <th className="px-4 py-3 text-right">السبب</th>
              <th className="px-4 py-3 text-right">الموظف</th>
              <th className="px-4 py-3 text-right">التاريخ</th>
              <th className="px-4 py-3 text-right">الحالة</th>
              <th className="px-4 py-3 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="text-center py-8 text-slate-400">جاري التحميل...</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-slate-400">لا توجد مرتجعات في هذه الحالة</td></tr>
            )}
            {list.map(r => {
              const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
              const tp = TYPE_LABELS[r.return_type] || TYPE_LABELS.cash;
              return (
                <tr key={r.id} className="border-t hover:bg-orange-50/30 cursor-pointer"
                    onClick={() => { setActiveReturn(r); setDetailOpen(true); }}
                    data-testid={`return-row-${r.id}`}>
                  <td className="px-4 py-3 font-mono text-xs">{r.return_no || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoice_no}</td>
                  <td className="px-4 py-3">{r.customer_name || <span className="text-slate-400">عميل نقدي</span>}</td>
                  <td className="px-4 py-3"><Badge className={tp.cls}>{tp.label}</Badge></td>
                  <td className="px-4 py-3 font-bold text-rose-600">{Number(r.total).toFixed(2)} ر.ي</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[150px] truncate">{r.reason || '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.creator_name || '—'}</td>
                  <td className="px-4 py-3 text-xs">{new Date(r.created_at).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-3"><Badge className={st.cls} variant="outline">{st.label}</Badge></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {isAdmin && r.status === 'pending' && (
                      <div className="flex gap-1">
                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white h-8"
                          onClick={() => approve(r)} data-testid={`approve-${r.id}`}>
                          <CheckCircle className="w-3 h-3 ml-1" /> قبول
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 h-8"
                          onClick={() => { setActiveReturn(r); setRejectOpen(true); }}
                          data-testid={`reject-${r.id}`}>
                          <XCircle className="w-3 h-3 ml-1" /> رفض
                        </Button>
                      </div>
                    )}
                    {r.status === 'approved' && (
                      <Button size="sm" variant="outline" className="h-8"
                        onClick={() => printVoucher(r)} data-testid={`print-${r.id}`}>
                        <Printer className="w-3 h-3 ml-1" /> طباعة
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent></Card>

      {/* Create-return wizard */}
      <NewReturnDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={load} />

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="return-detail-dialog">
          <DialogHeader><DialogTitle>تفاصيل المرتجع {activeReturn?.return_no || ''}</DialogTitle></DialogHeader>
          {activeReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">الفاتورة:</span> <strong>{activeReturn.invoice_no}</strong></div>
                <div><span className="text-slate-500">العميل:</span> <strong>{activeReturn.customer_name || 'نقدي'}</strong></div>
                <div><span className="text-slate-500">النوع:</span>{' '}
                  <Badge className={TYPE_LABELS[activeReturn.return_type]?.cls}>
                    {TYPE_LABELS[activeReturn.return_type]?.label}
                  </Badge></div>
                <div><span className="text-slate-500">الحالة:</span>{' '}
                  <Badge variant="outline" className={STATUS_LABELS[activeReturn.status]?.cls}>
                    {STATUS_LABELS[activeReturn.status]?.label}
                  </Badge></div>
                <div className="col-span-2"><span className="text-slate-500">السبب:</span> <span>{activeReturn.reason}</span></div>
                {activeReturn.rejection_reason && (
                  <div className="col-span-2 bg-rose-50 border border-rose-200 p-2 rounded">
                    <span className="text-rose-700 font-medium">سبب الرفض:</span> {activeReturn.rejection_reason}
                  </div>
                )}
              </div>
              <table className="w-full text-sm border">
                <thead className="bg-slate-50"><tr>
                  <th className="px-3 py-2 text-right">الصنف</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">السعر</th>
                  <th className="px-3 py-2">الإجمالي</th>
                </tr></thead>
                <tbody>
                  {activeReturn.items.map(i => (
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-2">{i.product_name}</td>
                      <td className="px-3 py-2 text-center">{Number(i.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">{Number(i.unit_price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center font-medium">{Number(i.refund_amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 bg-amber-50">
                  <td colSpan={3} className="px-3 py-2 text-left font-bold">الإجمالي</td>
                  <td className="px-3 py-2 text-center font-bold text-rose-700">
                    {Number(activeReturn.total).toFixed(2)} ر.ي
                  </td>
                </tr></tfoot>
              </table>
            </div>
          )}
          <DialogFooter>
            {activeReturn?.status === 'approved' && (
              <Button onClick={() => printVoucher(activeReturn)} data-testid="print-voucher-btn">
                <Printer className="w-4 h-4 ml-2" /> طباعة السند
              </Button>
            )}
            {isAdmin && activeReturn?.status === 'pending' && (
              <>
                <Button variant="outline" className="border-rose-300 text-rose-600"
                  onClick={() => setRejectOpen(true)} data-testid="open-reject-btn">
                  رفض
                </Button>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  onClick={() => approve(activeReturn)} data-testid="approve-detail-btn">
                  اعتماد
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>رفض طلب المرتجع</DialogTitle></DialogHeader>
          <div>
            <Label>سبب الرفض <span className="text-rose-500">*</span></Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} data-testid="reject-reason-input" placeholder="مثال: الكمية المرتجعة غير صحيحة، خارج فترة السماح، ..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>إلغاء</Button>
            <Button className="bg-rose-500 hover:bg-rose-600 text-white"
              onClick={submitReject} data-testid="confirm-reject-btn">تأكيد الرفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== New Return Wizard ==============
function NewReturnDialog({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: search invoice, 2: pick items + reason
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [returnable, setReturnable] = useState([]);
  const [picks, setPicks] = useState({}); // sale_item_id -> qty
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1); setSearch(''); setSales([]); setSelectedSale(null);
      setReturnable([]); setPicks({}); setReason(''); setReasonOther('');
    }
  }, [open]);

  const runSearch = async () => {
    try {
      const { data } = await api.get('/sales-returns/search-sales', { params: { q: search, limit: 20 } });
      setSales(data || []);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const pickSale = async (sale) => {
    try {
      const { data } = await api.get(`/sales/${sale.id}/returnable-items`);
      setSelectedSale(data);
      setReturnable(data.items || []);
      const empty = {}; data.items.forEach(i => empty[i.sale_item_id] = 0);
      setPicks(empty);
      setStep(2);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const setQty = (sale_item_id, qty, max) => {
    let q = Number(qty);
    if (Number.isNaN(q) || q < 0) q = 0;
    if (q > max) {
      toast({ title: `الحد الأقصى المتاح للإرجاع: ${max}`, variant: 'destructive' });
      q = max;
    }
    setPicks({ ...picks, [sale_item_id]: q });
  };

  const total = returnable.reduce((s, i) => {
    const q = Number(picks[i.sale_item_id] || 0);
    return s + q * Number(i.unit_price);
  }, 0);

  const submit = async () => {
    const items = Object.entries(picks)
      .filter(([, q]) => Number(q) > 0)
      .map(([sale_item_id, q]) => ({ sale_item_id, quantity: Number(q) }));
    if (items.length === 0) { toast({ title: 'اختر كمية لإرجاع منتج واحد على الأقل', variant: 'destructive' }); return; }
    const r = reason === 'other' ? reasonOther.trim() : reason;
    if (!r || r.length < 3) { toast({ title: 'سبب المرتجع إجباري (3 أحرف على الأقل)', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await api.post('/sales-returns', { sale_id: selectedSale.sale_id, reason: r, items });
      toast({ title: '✅ تم إرسال طلب المرتجع للمدير' });
      onSuccess && onSuccess();
      onClose();
    } catch (e) { toast({ title: 'لا يمكن تنفيذ المرتجع', description: formatApiError(e), variant: 'destructive' }); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl" data-testid="new-return-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-500" />
            طلب مرتجع جديد — الخطوة {step} من 2
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="ابحث برقم الفاتورة، اسم العميل، أو رقم الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                data-testid="search-sales-input"
              />
              <Button onClick={runSearch} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="search-sales-btn">
                <Search className="w-4 h-4 ml-1" /> بحث
              </Button>
            </div>

            <div className="border rounded-lg overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-right">الفاتورة</th>
                    <th className="px-3 py-2 text-right">العميل</th>
                    <th className="px-3 py-2 text-right">القيمة</th>
                    <th className="px-3 py-2 text-right">طريقة الدفع</th>
                    <th className="px-3 py-2 text-right">التاريخ</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">ابحث عن فاتورة لبدء عمل المرتجع</td></tr>}
                  {sales.map(s => (
                    <tr key={s.id} className="border-t hover:bg-orange-50">
                      <td className="px-3 py-2 font-mono text-xs">{s.invoice_no}</td>
                      <td className="px-3 py-2">{s.customer_name || <span className="text-slate-400">نقدي</span>}</td>
                      <td className="px-3 py-2 font-bold">{Number(s.total).toFixed(2)} ر.ي</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={s.payment_method === 'credit' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}>
                          {s.payment_method === 'credit' ? 'آجل' : 'نقدي'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{new Date(s.created_at).toLocaleDateString('ar-EG')}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" onClick={() => pickSale(s)}
                          data-testid={`pick-sale-${s.id}`}
                          className="bg-orange-500 hover:bg-orange-600 text-white">
                          اختر
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 2 && selectedSale && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex justify-between text-sm">
              <div><strong>الفاتورة:</strong> {selectedSale.invoice_no}</div>
              <div><strong>طريقة الدفع:</strong>{' '}
                <Badge className={selectedSale.payment_method === 'credit' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}>
                  {selectedSale.payment_method === 'credit' ? 'آجل (سيخصم من رصيد العميل)' : 'نقدي'}
                </Badge>
              </div>
              <div><strong>إجمالي الفاتورة:</strong> {Number(selectedSale.total).toFixed(2)} ر.ي</div>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-3 py-2 text-right">المنتج</th>
                  <th className="px-3 py-2">مُباع</th>
                  <th className="px-3 py-2">مُرتجع سابقاً</th>
                  <th className="px-3 py-2">المتاح للإرجاع</th>
                  <th className="px-3 py-2">السعر</th>
                  <th className="px-3 py-2">كمية الإرجاع</th>
                </tr></thead>
                <tbody>
                  {returnable.map(it => (
                    <tr key={it.sale_item_id} className="border-t">
                      <td className="px-3 py-2"><div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-slate-400">{it.product_sku}</div></td>
                      <td className="px-3 py-2 text-center">{Number(it.sold_quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center text-orange-600">{Number(it.previously_returned).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-600">{Number(it.remaining_returnable).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">{Number(it.unit_price).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <Input type="number" min="0" step="0.01" max={it.remaining_returnable}
                          value={picks[it.sale_item_id] ?? 0}
                          onChange={(e) => setQty(it.sale_item_id, e.target.value, it.remaining_returnable)}
                          disabled={it.remaining_returnable <= 0}
                          className="w-24 text-center"
                          data-testid={`pick-qty-${it.sale_item_id}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 bg-amber-50">
                  <td colSpan={5} className="px-3 py-2 text-left font-bold">إجمالي المرتجع</td>
                  <td className="px-3 py-2 text-center font-bold text-rose-700" data-testid="return-total">
                    {total.toFixed(2)} ر.ي
                  </td>
                </tr></tfoot>
              </table>
            </div>

            <div>
              <Label>سبب المرتجع <span className="text-rose-500">*</span></Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger data-testid="reason-select"><SelectValue placeholder="اختر السبب..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="منتج معيب">منتج معيب</SelectItem>
                  <SelectItem value="منتج منتهي الصلاحية">منتج منتهي الصلاحية</SelectItem>
                  <SelectItem value="خطأ في الفاتورة">خطأ في الفاتورة</SelectItem>
                  <SelectItem value="العميل غير راضٍ">العميل غير راضٍ</SelectItem>
                  <SelectItem value="فاتورة مكررة">فاتورة مكررة</SelectItem>
                  <SelectItem value="other">سبب آخر...</SelectItem>
                </SelectContent>
              </Select>
              {reason === 'other' && (
                <Textarea className="mt-2" placeholder="اكتب السبب بالتفصيل..." rows={2}
                  value={reasonOther} onChange={(e) => setReasonOther(e.target.value)}
                  data-testid="reason-other-input" />
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                سيتم إرسال هذا الطلب للمدير. <strong>لن يتم تعديل المخزون ولا الحسابات</strong> حتى يعتمد المدير الطلب.
                {selectedSale.payment_method === 'credit'
                  ? ' بعد الاعتماد، سيُخصم المبلغ من رصيد العميل تلقائياً.'
                  : ' بعد الاعتماد، سيُخصم المبلغ من المبيعات النقدية.'}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && <Button variant="outline" onClick={() => setStep(1)}>← العودة</Button>}
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          {step === 2 && (
            <Button onClick={submit} disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              data-testid="submit-return-btn">
              {saving ? 'جاري الإرسال...' : 'إرسال الطلب للمدير'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
