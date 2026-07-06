import React, { useEffect, useState } from 'react';
import {
  Search, FileText, CheckCircle, XCircle, Printer, RefreshCw,
  AlertTriangle, Receipt, User, Filter, TrendingDown,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeReturn, setActiveReturn] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // إحصائيات اليوم والشهر
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 });
  const [monthStats, setMonthStats] = useState({ count: 0, total: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales-returns', { params: { status: tab === 'all' ? undefined : tab } });
      setList(data || []);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      // نحسب الإحصائيات من قائمة المرتجعات المعتمدة
      const { data: all } = await api.get('/sales-returns', { params: { limit: 500 } });
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const approved = all.filter((r) => r.status === 'approved');
      const todayItems = approved.filter((r) => r.approved_at && r.approved_at.startsWith(todayStr));
      const monthItems = approved.filter((r) => r.approved_at && new Date(r.approved_at) >= monthStart);

      setTodayStats({
        count: todayItems.length,
        total: todayItems.reduce((s, r) => s + Number(r.total || 0), 0),
      });
      setMonthStats({
        count: monthItems.length,
        total: monthItems.reduce((s, r) => s + Number(r.total || 0), 0),
      });
    } catch (_) {}
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);
  useEffect(() => { loadStats(); }, []);

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
      paymentMethod: ret.return_type === 'credit' ? 'آجل (خصم من رصيد العميل)' : 'نقدي',
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
      loadStats();
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

  const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n ?? 0);

  return (
    <div className="p-6 space-y-6" data-testid="returns-page" dir="rtl">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="text-orange-500" /> مرتجعات المبيعات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            متابعة طلبات المرتجع واعتمادها — الإنشاء يتم من نقطة البيع
          </p>
        </div>
        {/* إنشاء المرتجع يتم فقط من نقطة البيع */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            إنشاء المرتجعات يتم من <strong>نقطة البيع</strong> أو <strong>حسابات التجار</strong> فقط
          </p>
        </div>
      </div>

      {/* إحصائيات المرتجعات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-4 text-white">
              <TrendingDown className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">عدد المرتجعات اليوم</p>
              <p className="text-2xl font-bold">{todayStats.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 text-white">
              <Receipt className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">قيمة المرتجعات اليوم</p>
              <p className="text-2xl font-bold">{fmt(todayStats.total)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-4 text-white">
              <TrendingDown className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">عدد المرتجعات الشهر</p>
              <p className="text-2xl font-bold">{monthStats.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 text-white">
              <Receipt className="w-6 h-6 mb-2 opacity-80" />
              <p className="text-white/80 text-xs mb-0.5">قيمة المرتجعات الشهر</p>
              <p className="text-2xl font-bold">{fmt(monthStats.total)} <span className="text-sm">ر.ي</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ملخص الحالة الحالية */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Receipt className="w-10 h-10 text-orange-500 bg-orange-100 p-2 rounded-lg flex-shrink-0" />
          <div><p className="text-xs text-slate-500">عدد الطلبات (الحالي)</p>
            <p className="text-2xl font-bold" data-testid="returns-count">{totals.count}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <RefreshCw className="w-10 h-10 text-rose-500 bg-rose-100 p-2 rounded-lg flex-shrink-0" />
          <div><p className="text-xs text-slate-500">إجمالي القيمة</p>
            <p className="text-2xl font-bold text-rose-600" data-testid="returns-total">{totals.sum.toFixed(2)} ر.ي</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Filter className="w-10 h-10 text-blue-500 bg-blue-100 p-2 rounded-lg flex-shrink-0" />
          <div><p className="text-xs text-slate-500">الحالة المعروضة</p>
            <p className="text-lg font-bold text-blue-600">{STATUS_LABELS[tab]?.label || 'الكل'}</p></div>
        </CardContent></Card>
      </div>

      {/* تبويبات */}
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

      {/* جدول المرتجعات */}
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

      {/* نافذة التفاصيل */}
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
                  {(activeReturn.items || []).map(i => (
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

      {/* نافذة الرفض */}
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
