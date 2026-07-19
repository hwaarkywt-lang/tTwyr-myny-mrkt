import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight, Printer, Wallet, Calendar as CalendarIcon, TrendingUp, TrendingDown,
  RotateCcw, FileText, Phone, Plus, Trash2, Receipt, Package, Search,
  PackagePlus, AlertCircle, Lock, FileDown,
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
import { exportStatementPDF, exportVoucherPDF } from '../lib/pdfExport';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (s) => new Date(s).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

const PM = { cash: 'نقداً', jaib: 'جيب', fluusak: 'فلوسك', hasib: 'حاسب', banki: 'بنكي', bank_transfer: 'تحويل بنكي', card: 'بطاقة' };
const typeMeta = {
  purchase: { color: 'bg-rose-50 text-rose-700 border-rose-200',         label: 'فاتورة توريد' },
  payment:  { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'سند صرف' },
  return:   { color: 'bg-orange-50 text-orange-700 border-orange-200',    label: 'استرجاع للتاجر' },
};

// نوع الرصيد المحاسبي لحساب المورد (المعادلة: دائن - مدين)
// موجب = نحن مدينون للتاجر → مستحق للتاجر (أحمر)
// سالب = دفعنا أكثر → مستحق لنا عند التاجر (أخضر)
const balanceLabel = (b) => {
  const n = Number(b);
  const abs = Math.abs(n);
  if (abs < 0.01) return { text: 'مسدّد', color: 'text-slate-500' };
  if (n > 0) return { text: `${fmt(abs)} ر.ي (مستحق للتاجر)`, color: 'text-rose-700' };
  return { text: `${fmt(abs)} ر.ي (مستحق لنا)`, color: 'text-emerald-700' };
};

const SupplierDetail = () => {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [statement, setStatement] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [returns, setReturns] = useState([]);
  const [tab, setTab] = useState('statement');

  // Dialogs
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [voucherModal, setVoucherModal] = useState(null);

  const load = useCallback(() => {
    api.get(`/suppliers/${id}`).then((r) => setDetail(r.data)).catch(() => {});
    api.get(`/suppliers/${id}/statement`).then((r) => setStatement(r.data)).catch(() => {});
    api.get(`/suppliers/${id}/purchases`).then((r) => setPurchases(r.data)).catch(() => {});
    api.get(`/suppliers/${id}/payments`).then((r) => setPayments(r.data)).catch(() => {});
    api.get(`/suppliers/${id}/returns`).then((r) => setReturns(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!detail) return <div className="p-10 text-center text-slate-400" dir="rtl">جاري التحميل...</div>;

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="supplier-detail-page">
      <div className="no-print mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/purchases" className="text-slate-500 hover:text-slate-900">
            <ArrowRight className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{detail.name}</h1>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" /> {detail.phone || '—'}
              <span className="mx-1">·</span>
              <CalendarIcon className="w-3.5 h-3.5" /> منذ {new Date(detail.created_at).toLocaleDateString('ar-EG')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPurchaseOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="add-purchase-btn">
            <Plus className="w-4 h-4 ml-1" /> إضافة فاتورة توريد
          </Button>
          <Button onClick={() => setPayOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="pay-supplier-btn">
            <Wallet className="w-4 h-4 ml-1" /> تسديد
          </Button>
          <Button onClick={() => setReturnOpen(true)} variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="return-to-supplier-btn">
            <RotateCcw className="w-4 h-4 ml-1" /> استرجاع منتج تالف
          </Button>
          <Button onClick={() => {
            const entries = (statement?.entries || []).map(e => ({ ...e, balance: e.running_balance ?? e.balance }));
            // فواتير التوريد الآن في عمود الدائن، والمدفوعات/المرتجعات في عمود المدين
            const totalPurchases = entries.filter(e => e.type === 'purchase').reduce((s, e) => s + Number(e.credit || 0), 0);
            const totalPaid = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Number(e.debit || 0), 0);
            const totalReturns = entries.filter(e => e.type === 'return').reduce((s, e) => s + Number(e.debit || 0), 0);
            exportStatementPDF({
              title: 'كشف حساب تاجر',
              kind: 'supplier',
              name: detail.name,
              phone: detail.phone,
              balance: detail.balance,
              opening: statement?.opening_balance || 0,
              closing: statement?.closing_balance ?? detail.balance,
              entries,
              totalInvoices: totalPurchases,
              totalPaid,
              totalReturns,
              skipValidation: true,  // some legacy entries may lack balance field
            }).catch((err) => console.error('Statement PDF failed:', err));
          }}
            className="bg-rose-500 hover:bg-rose-600 text-white" data-testid="export-supplier-pdf-btn">
            <FileDown className="w-4 h-4 ml-1" /> تصدير PDF
          </Button>
          <Button onClick={() => window.print()} variant="outline" data-testid="print-supplier-statement-btn">
            <Printer className="w-4 h-4 ml-1" /> طباعة الكشف
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {(() => {
        const closing = statement ? Number(statement.closing_balance) : Number(detail.balance);
        // موجب = مستحق للتاجر (نحن مدينون) — سالب = مستحق لنا عند التاجر (نحن دائنون)
        const owedToSupplier = Math.max(0, closing);
        const owedToUs      = Math.max(0, -closing);
        const cards = [
          { l: 'إجمالي فواتير التوريد',   v: fmt(detail.total_purchases) + ' ر.ي', color: 'from-blue-500 to-blue-600',    icon: TrendingUp,  t: 'stat-purchases' },
          { l: 'إجمالي المدفوع',          v: fmt(detail.total_paid)      + ' ر.ي', color: 'from-emerald-500 to-emerald-600', icon: TrendingDown, t: 'stat-paid' },
          { l: 'إجمالي الاسترجاع',        v: fmt(detail.total_returns)   + ' ر.ي', color: 'from-orange-500 to-orange-600', icon: RotateCcw,   t: 'stat-returns' },
          {
            l: 'مستحق للتاجر',
            v: owedToSupplier < 0.01 ? 'صفر' : fmt(owedToSupplier) + ' ر.ي',
            color: owedToSupplier < 0.01 ? 'from-slate-400 to-slate-500' : 'from-rose-600 to-rose-700',
            icon: Wallet, t: 'stat-owed-to-supplier',
            note: 'المبالغ التي علينا دفعها للتاجر',
          },
          {
            l: 'مستحق لنا عند التاجر',
            v: owedToUs < 0.01 ? 'صفر' : fmt(owedToUs) + ' ر.ي',
            color: owedToUs < 0.01 ? 'from-slate-400 to-slate-500' : 'from-emerald-600 to-emerald-700',
            icon: TrendingDown, t: 'stat-owed-to-us',
            note: 'رصيد دائن لنا (دفعنا زيادة أو مرتجعات)',
          },
        ];
        return (
          <div className="no-print grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            {cards.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.l} className="overflow-hidden border-0 shadow-md">
                  <div className={`bg-gradient-to-br ${s.color} p-4 text-white`}>
                    <Icon className="w-5 h-5 mb-2 opacity-90" />
                    <p className="text-white/80 text-xs">{s.l}</p>
                    <p className="text-lg font-bold mt-1" data-testid={s.t}>{s.v}</p>
                    {s.note && <p className="text-white/60 text-[10px] mt-0.5">{s.note}</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="no-print flex gap-2 mb-4 flex-wrap">
        {[
          { v: 'statement', l: 'كشف الحساب' },
          { v: 'purchases', l: `الفواتير (${purchases.length})` },
          { v: 'payments', l: `السندات (${payments.length})` },
          { v: 'returns', l: `الإرجاعات (${returns.length})` },
        ].map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`sup-tab-${t.v}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.v ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:border-slate-400'
            }`}>{t.l}</button>
        ))}
      </div>

      {tab === 'statement' && statement && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="supplier-statement-table">
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
                <tr className="bg-slate-50 border-t font-semibold text-slate-600">
                  <td colSpan="5" className="px-3 py-2">رصيد افتتاحي</td>
                  <td className="px-3 py-2">{fmt(statement.opening_balance)} ر.ي</td>
                </tr>
                {statement.entries.length === 0 && (
                  <tr><td colSpan="6" className="px-3 py-8 text-center text-slate-400">لا عمليات</td></tr>
                )}
                {statement.entries.map((e, i) => {
                  const m = typeMeta[e.type];
                  const bl = balanceLabel(e.balance);
                  return (
                    <tr key={e.op_no || e.id || `entry-${i}`} className="border-t hover:bg-slate-50" data-testid={`sup-row-${e.op_no}`}>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.op_no}</td>
                      <td className="px-3 py-2"><Badge className={`${m?.color}`}>{m?.label}</Badge></td>
                      {/* مدين: سند صرف أو مرتجع */}
                      <td className={`px-3 py-2 font-semibold ${e.debit > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {e.debit > 0 ? `${fmt(e.debit)} ر.ي` : '—'}
                      </td>
                      {/* دائن: فاتورة توريد */}
                      <td className={`px-3 py-2 font-semibold ${e.credit > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                        {e.credit > 0 ? `${fmt(e.credit)} ر.ي` : '—'}
                      </td>
                      <td className={`px-3 py-2 font-bold ${bl.color}`}>{bl.text}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-100 border-t-2 font-bold">
                  <td colSpan="5" className="px-3 py-3">الرصيد الختامي</td>
                  <td className={`px-3 py-3 text-lg ${balanceLabel(statement.closing_balance).color}`}>
                    {balanceLabel(statement.closing_balance).text}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'purchases' && (
        <Card>
          <div className="bg-emerald-50 border-b-2 border-emerald-200 px-4 py-2.5 text-xs text-emerald-900 flex items-center gap-2" data-testid="purchases-immutable-note">
            <Lock className="w-4 h-4 text-emerald-700" />
            <span>
              فواتير التوريد <strong>لا يمكن حذفها أو تعديلها</strong> بعد الحفظ.
              لاسترجاع منتج تالف اضغط زر <strong>&quot;استرجاع منتج تالف&quot;</strong> أعلى الصفحة
              (يدعم الاسترجاع بالقطعة أو الكرتون).
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">رقم الفاتورة</th>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">عدد المنتجات</th>
                <th className="px-4 py-3 text-right">الإجمالي</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 && (
                <tr><td colSpan="5" className="text-center py-12 text-slate-400">لا فواتير</td></tr>
              )}
              {purchases.map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-rose-700">{p.ref_no}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-center">{p.items_count}</td>
                  <td className="px-4 py-3 font-bold text-rose-600">{fmt(p.total)} ر.ي</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => api.get(`/purchases/${p.id}`).then((r) => setVoucherModal({ kind: 'purchase', data: r.data }))}>
                      <Receipt className="w-3.5 h-3.5 ml-1" /> عرض / طباعة
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'payments' && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">رقم السند</th>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">المبلغ</th>
                <th className="px-4 py-3 text-right">الطريقة</th>
                <th className="px-4 py-3 text-right">الموظف</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan="6" className="text-center py-12 text-slate-400">لا سندات</td></tr>}
              {payments.map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-emerald-700">{p.voucher_no}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600">{fmt(p.amount)} ر.ي</td>
                  <td className="px-4 py-3">{PM[p.payment_method] || p.payment_method}</td>
                  <td className="px-4 py-3 text-slate-600">{p.created_by_name || '—'}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => setVoucherModal({ kind: 'payment', data: p })}>
                      <Printer className="w-3.5 h-3.5 ml-1" /> طباعة
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'returns' && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">رقم السند</th>
                <th className="px-4 py-3 text-right">من فاتورة</th>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">المبلغ</th>
                <th className="px-4 py-3 text-right">السبب</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 && <tr><td colSpan="6" className="text-center py-12 text-slate-400">لا إرجاعات</td></tr>}
              {returns.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-orange-700">{r.voucher_no}</td>
                  <td className="px-4 py-3 font-mono text-rose-700">{r.purchase_ref}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">{fmt(r.total)} ر.ي</td>
                  <td className="px-4 py-3 text-slate-600">{r.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => api.get(`/supplier-returns/${r.id}`).then((res) => setVoucherModal({ kind: 'return', data: res.data }))}>
                      <Printer className="w-3.5 h-3.5 ml-1" /> طباعة
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <PurchaseDialog open={purchaseOpen} onClose={() => setPurchaseOpen(false)}
        supplierId={id} supplierName={detail.name}
        onSaved={(p) => { load(); setVoucherModal({ kind: 'purchase', data: p }); }} />

      <SupplierPaymentDialog open={payOpen} onClose={() => setPayOpen(false)}
        supplierId={id} balance={detail.balance}
        onSaved={(v) => { load(); setVoucherModal({ kind: 'payment', data: v }); }} />

      <SupplierReturnDialog open={returnOpen} onClose={() => setReturnOpen(false)}
        supplierId={id} purchases={purchases}
        onSaved={(v) => { load(); setVoucherModal({ kind: 'return', data: v }); }} />

      {voucherModal && (
        <VoucherDialog
          voucher={voucherModal}
          supplier={detail}
          onClose={() => setVoucherModal(null)}
        />
      )}
    </div>
  );
};

// ============== Purchase Dialog ==============
const PurchaseDialog = ({ open, onClose, supplierId, supplierName, onSaved }) => {
  const [items, setItems] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [paidAmount, setPaidAmount] = useState('');
  const [saving, setSaving] = useState(false);
  // إضافة منتج جديد inline
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState('');

  const reload = useCallback(() => {
    api.get('/products', { params: { limit: 1000 } }).then((r) => setProducts(r.data));
  }, []);

  useEffect(() => {
    if (open) {
      setItems([]); setNotes(''); setBarcode(''); setPaymentMethod('credit'); setPaidAmount('');
      reload();
      api.get('/categories').then((r) => setCategories(r.data || [])).catch(() => {});
    }
  }, [open, reload]);

  const addProduct = (p) => {
    setItems((prev) => [...prev, {
      product_id: p.id, name: p.name, unit: 'piece',
      cartons: '', pieces_per_carton: '', carton_cost: '',
      quantity: '', unit_cost: '', sale_price: '',
    }]);
    setSearch('');
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 20);
    const s = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)).slice(0, 30);
  }, [products, search]);

  const onBarcode = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      const { data } = await api.get(`/products/by-barcode/${encodeURIComponent(barcode.trim())}`);
      addProduct(data);
      setBarcode('');
    } catch (err) {
      // Auto-open the new-product dialog with the scanned barcode prefilled
      toast({
        title: 'باركود غير موجود',
        description: 'سيتم فتح نافذة إضافة منتج جديد بنفس الباركود.',
      });
      setPrefillBarcode(barcode.trim());
      setNewProductOpen(true);
    }
  };

  // يتم استدعاؤها بعد إنشاء منتج جديد ناجح من الـ dialog
  const handleNewProductCreated = (created, initialLine) => {
    // إضافة المنتج للقائمة المحلية فوراً (دون انتظار reload)
    setProducts((prev) => [created, ...prev]);
    // إضافة السطر إلى الفاتورة الحالية بالقيم التي أدخلها المستخدم
    setItems((prev) => [...prev, {
      product_id: created.id, name: created.name,
      unit: initialLine.unit,
      cartons: initialLine.cartons ?? '',
      pieces_per_carton: initialLine.pieces_per_carton ?? '',
      carton_cost: initialLine.carton_cost ?? '',
      quantity: initialLine.quantity ?? '',
      unit_cost: initialLine.unit_cost ?? '',
      sale_price: initialLine.sale_price ?? '',
    }]);
    setBarcode('');
    setPrefillBarcode('');
    // background reload to refresh products list
    setTimeout(reload, 800);
  };

  const updateItem = (idx, k, v) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it));

  const lineTotal = (it) => {
    if (it.unit === 'carton') {
      const c = Number(it.cartons) || 0; const p = Number(it.carton_cost) || 0;
      return c * p;
    }
    return (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
  };
  const piecePrice = (it) => {
    if (it.unit === 'carton') {
      const p = Number(it.carton_cost) || 0; const pcs = Number(it.pieces_per_carton) || 0;
      return pcs > 0 ? p / pcs : 0;
    }
    return Number(it.unit_cost) || 0;
  };
  const grand = items.reduce((s, it) => s + lineTotal(it), 0);
  const paidNow = Math.min(grand, Math.max(0, Number(paidAmount) || 0));
  const remaining = grand - paidNow;

  const save = async () => {
    if (items.length === 0) { toast({ title: 'أضف منتجاً واحداً على الأقل', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplierId, notes: notes || null, paid_amount: paidNow,
        payment_method: paymentMethod,
        items: items.map((it) => it.unit === 'carton' ? ({
          product_id: it.product_id, unit: 'carton',
          cartons: Number(it.cartons), pieces_per_carton: Number(it.pieces_per_carton),
          carton_cost: Number(it.carton_cost),
          sale_price: it.sale_price ? Number(it.sale_price) : null,
        }) : ({
          product_id: it.product_id, unit: 'piece',
          quantity: Number(it.quantity), unit_cost: Number(it.unit_cost),
          sale_price: it.sale_price ? Number(it.sale_price) : null,
        })),
      };
      const { data } = await api.post('/purchases', payload);
      toast({ title: '✅ فاتورة التوريد محفوظة', description: `رقم: ${data.ref_no}` });
      onClose();
      onSaved(data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة توريد جديدة — {supplierName}</DialogTitle>
        </DialogHeader>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 mb-3 text-sm" data-testid="purchase-immutable-warning">
          <p className="font-bold text-amber-900 mb-1">⚠️ تنبيه هام قبل إضافة المنتجات:</p>
          <ul className="text-amber-800 list-disc pr-5 space-y-0.5 text-xs">
            <li>بعد إضافة المنتج للفاتورة <strong>لا يمكن حذفه أو تعديله</strong>.</li>
            <li>تأكد من بيانات المنتج (الكمية، السعر، الوحدة) قبل إضافته.</li>
            <li>لإلغاء الفاتورة بالكامل اضغط زر <strong>&quot;إلغاء&quot;</strong> أسفل النافذة.</li>
            <li>بعد حفظ الفاتورة، لاسترجاع منتج تالف استخدم زر <strong>&quot;استرجاع منتج تالف&quot;</strong> (بالقطعة أو الكرتون).</li>
          </ul>
        </div>

        <div className="grid grid-cols-12 gap-3 mb-3">
          <form onSubmit={onBarcode} className="col-span-12 md:col-span-6 flex gap-2">
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)}
              placeholder="🔍 امسح الباركود..." className="h-10" data-testid="purchase-barcode-input" />
            <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white">إضافة</Button>
          </form>
          <Button
            type="button"
            onClick={() => { setPrefillBarcode(''); setNewProductOpen(true); }}
            className="col-span-12 md:col-span-3 bg-emerald-500 hover:bg-emerald-600 text-white h-10"
            data-testid="add-new-product-btn"
          >
            <PackagePlus className="w-4 h-4 ml-1" /> إضافة منتج جديد
          </Button>
          <div className="col-span-12 md:col-span-2">
            <Label className="text-xs mb-1 block">طريقة الدفع</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-10 w-full" data-testid="purchase-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">آجل (دين على التاجر)</SelectItem>
                <SelectItem value="cash">نقداً</SelectItem>
                <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات..." className="col-span-12 md:col-span-1 h-10" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div className="md:col-span-1">
            <Label className="text-xs">إضافة منتج بالبحث</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث..." data-testid="purchase-product-search" />
            {search && (
              <div className="border rounded mt-1 max-h-48 overflow-y-auto bg-white shadow">
                {filtered.map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="block w-full text-right p-2 hover:bg-amber-50 text-sm border-b last:border-b-0">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs text-slate-500 mr-2">({p.sku})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-3 bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
            {/* إجمالي الفاتورة */}
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm text-slate-600">إجمالي قيمة المنتجات:</span>
              <span className="text-2xl font-bold text-rose-700" data-testid="purchase-total">{fmt(grand)} ر.ي</span>
            </div>
            {/* المبلغ المدفوع للتاجر */}
            <div className="flex items-center gap-3">
              <Label className="text-sm font-semibold text-slate-700 whitespace-nowrap">المبلغ المدفوع للتاجر:</Label>
              <div className="flex-1 flex gap-2">
                <Input
                  type="number" step="0.01" min="0" max={grand}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  className="text-lg font-bold"
                  data-testid="purchase-paid-amount-input"
                />
                <Button type="button" size="sm"
                  onClick={() => setPaidAmount(String(grand))}
                  className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 whitespace-nowrap text-xs h-9 px-2">
                  تسديد كامل
                </Button>
              </div>
            </div>
            {/* المتبقي للتاجر */}
            <div className={`flex items-center justify-between pt-2 border-t-2 ${remaining > 0 ? 'border-rose-200' : 'border-emerald-200'}`}>
              <span className="text-sm font-bold text-slate-700">
                {remaining > 0 ? 'المتبقي للتاجر (يُضاف لرصيده):' : remaining === 0 ? 'الرصيد:' : 'مستحق لنا عند التاجر:'}
              </span>
              <span className={`text-xl font-extrabold ${remaining > 0 ? 'text-rose-700' : remaining < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                {fmt(Math.abs(remaining))} ر.ي
                {remaining === 0 && <span className="text-sm font-normal text-slate-400 mr-1">(مسدّد)</span>}
              </span>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p>ابحث عن منتج أو امسح باركود لإضافته</p>
          </Card>
        ) : (
          <div className="space-y-3 mb-4">
            {items.map((it, idx) => (
              <Card key={it.product_id || `item-${idx}`} className="p-3" data-testid={`purchase-item-${idx}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="font-bold text-slate-900">{it.name}</h4>
                  <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    مُضاف — لا يمكن حذفه
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                  <div>
                    <Label className="text-xs">الوحدة</Label>
                    <Select value={it.unit} onValueChange={(v) => updateItem(idx, 'unit', v)}>
                      <SelectTrigger className="h-9" data-testid={`purchase-unit-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piece">قطعة</SelectItem>
                        <SelectItem value="carton">كرتون</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {it.unit === 'carton' ? (
                    <>
                      <div><Label className="text-xs">عدد الكراتين</Label>
                        <Input type="number" value={it.cartons} onChange={(e) => updateItem(idx, 'cartons', e.target.value)} className="h-9" /></div>
                      <div><Label className="text-xs">قطع/كرتون</Label>
                        <Input type="number" value={it.pieces_per_carton} onChange={(e) => updateItem(idx, 'pieces_per_carton', e.target.value)} className="h-9" /></div>
                      <div><Label className="text-xs">سعر الكرتون</Label>
                        <Input type="number" step="0.01" value={it.carton_cost} onChange={(e) => updateItem(idx, 'carton_cost', e.target.value)} className="h-9" /></div>
                      <div>
                        <Label className="text-xs">سعر القطعة (تلقائي)</Label>
                        <Input value={fmt(piecePrice(it))} disabled readOnly className="h-9 bg-emerald-50 font-semibold text-emerald-700" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div><Label className="text-xs">الكمية</Label>
                        <Input type="number" step="0.001" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="h-9" /></div>
                      <div><Label className="text-xs">سعر الشراء/قطعة</Label>
                        <Input type="number" step="0.01" value={it.unit_cost} onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)} className="h-9" /></div>
                      <div></div>
                      <div></div>
                    </>
                  )}
                  <div>
                    <Label className="text-xs">سعر البيع (يدوي)</Label>
                    <Input type="number" step="0.01" value={it.sale_price} onChange={(e) => updateItem(idx, 'sale_price', e.target.value)} className="h-9" placeholder="اختياري" />
                  </div>
                </div>
                <div className="text-left mt-2 text-sm font-bold text-rose-700">
                  إجمالي السطر: {fmt(lineTotal(it))} ر.ي
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving || items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="save-purchase-btn">
            {saving ? 'جارٍ الحفظ...' : 'حفظ فاتورة التوريد'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <NewProductInline
        open={newProductOpen}
        onClose={() => setNewProductOpen(false)}
        prefillBarcode={prefillBarcode}
        categories={categories}
        supplierName={supplierName}
        onCreated={handleNewProductCreated}
      />
    </Dialog>
  );
};


// ============== New Product Inline Dialog (داخل فاتورة التوريد) ==============
const NewProductInline = ({ open, onClose, prefillBarcode, categories, supplierName, onCreated }) => {
  const initial = {
    name: '', barcode: '', category_id: '', unit: 'piece',
    expiry_date: '',
    // piece mode
    cost_price: '', sale_price: '', quantity: '',
    // carton mode
    cartons: '', pieces_per_carton: '', carton_cost: '',
  };
  const [form, setForm] = useState(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...initial, barcode: prefillBarcode || '' });
  }, [open, prefillBarcode]);

  // سعر شراء القطعة (محسوب تلقائياً في وضع الكرتون)
  const piecePrice = (() => {
    if (form.unit === 'carton') {
      const cc = Number(form.carton_cost) || 0;
      const pcs = Number(form.pieces_per_carton) || 0;
      return pcs > 0 ? cc / pcs : 0;
    }
    return Number(form.cost_price) || 0;
  })();

  const updateField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.name.trim()) return 'اسم المنتج مطلوب';
    if (!form.barcode.trim()) return 'الباركود مطلوب';
    if (!form.expiry_date) return 'تاريخ انتهاء الصلاحية مطلوب';
    const exp = new Date(form.expiry_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (exp < today) return 'تاريخ الصلاحية يجب أن يكون مستقبلياً';
    if (form.unit === 'piece') {
      if (!Number(form.cost_price) || Number(form.cost_price) <= 0) return 'أدخل سعر شراء القطعة';
      if (!Number(form.quantity)    || Number(form.quantity) <= 0)   return 'أدخل الكمية';
    } else {
      if (!Number(form.cartons)           || Number(form.cartons) <= 0)           return 'أدخل عدد الكراتين';
      if (!Number(form.carton_cost)       || Number(form.carton_cost) <= 0)       return 'أدخل سعر شراء الكرتون';
      if (!Number(form.pieces_per_carton) || Number(form.pieces_per_carton) <= 0) return 'أدخل عدد القطع داخل الكرتون';
    }
    return null;
  };

  const handleReview = () => {
    const err = validate();
    if (err) { toast({ title: err, variant: 'destructive' }); return; }
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    setSaving(true);
    try {
      // Generate a clean SKU from barcode (or a random one if not numeric)
      const sku = `BC-${form.barcode.trim().slice(0, 20)}`;
      const cost = piecePrice;
      const sale = Number(form.sale_price) || 0;
      // current_stock=0 — sytock will be incremented by the purchase invoice on save
      const productPayload = {
        sku,
        name: form.name.trim(),
        category_id: form.category_id || null,
        unit: form.unit === 'carton' ? 'piece' : form.unit,
        cost_price: cost,
        sale_price: sale,
        tax_rate: 0,
        min_stock_level: 0,
        current_stock: 0,
        has_expiry: true,
        expiry_date: form.expiry_date,
        barcodes: [form.barcode.trim()],
      };
      const { data: created } = await api.post('/products', productPayload);

      // Build initial line for the parent invoice
      const initialLine = form.unit === 'carton' ? {
        unit: 'carton',
        cartons: Number(form.cartons),
        pieces_per_carton: Number(form.pieces_per_carton),
        carton_cost: Number(form.carton_cost),
        sale_price: sale || null,
      } : {
        unit: 'piece',
        quantity: Number(form.quantity),
        unit_cost: Number(form.cost_price),
        sale_price: sale || null,
      };

      toast({ title: '✅ تم إنشاء المنتج', description: `${created.name} مضاف للفاتورة` });
      onCreated(created, initialLine);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      toast({ title: 'تعذّر إنشاء المنتج', description: formatApiError(e), variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="new-product-inline-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-emerald-500" />
              إضافة منتج جديد — التاجر: <span className="text-emerald-700">{supplierName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>اسم المنتج <span className="text-rose-500">*</span></Label>
                <Input value={form.name} onChange={(e) => updateField('name', e.target.value)}
                  placeholder="مثال: صلصة حار" data-testid="np-name-input" autoFocus />
              </div>
              <div>
                <Label>الباركود <span className="text-rose-500">*</span></Label>
                <Input value={form.barcode} onChange={(e) => updateField('barcode', e.target.value)}
                  placeholder="8501234567890" className="font-mono" data-testid="np-barcode-input" />
              </div>
              <div>
                <Label>التصنيف</Label>
                <Select value={form.category_id} onValueChange={(v) => updateField('category_id', v)}>
                  <SelectTrigger data-testid="np-category-select">
                    <SelectValue placeholder="بدون تصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الوحدة <span className="text-rose-500">*</span></Label>
                <Select value={form.unit} onValueChange={(v) => updateField('unit', v)}>
                  <SelectTrigger data-testid="np-unit-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">قطعة</SelectItem>
                    <SelectItem value="carton">كرتون</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expiry Date Section - Premium */}
            <div className="bg-gradient-to-br from-rose-50 via-amber-50 to-emerald-50 border-2 border-amber-300 rounded-xl p-4 shadow-sm">
              <Label className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2">
                <CalendarIcon className="w-5 h-5 text-amber-600" />
                تاريخ انتهاء الصلاحية
                <span className="text-rose-500 text-lg">*</span>
                <span className="text-[10px] text-rose-500 font-normal bg-rose-100 px-2 py-0.5 rounded-full">إلزامي</span>
              </Label>

              {/* Quick chips for common durations */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {[
                  { l: '7 أيام',   d: 7 },
                  { l: '15 يوم',   d: 15 },
                  { l: 'شهر',     d: 30 },
                  { l: '3 أشهر',   d: 90 },
                  { l: '6 أشهر',   d: 180 },
                  { l: 'سنة',     d: 365 },
                  { l: 'سنتان',   d: 730 },
                ].map((opt) => (
                  <button
                    key={opt.d}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + opt.d);
                      updateField('expiry_date', d.toISOString().slice(0, 10));
                    }}
                    data-testid={`np-expiry-quick-${opt.d}`}
                    className="text-[11px] px-2.5 py-1 rounded-full border-2 border-amber-300 bg-white hover:bg-amber-100 hover:border-amber-500 text-amber-800 font-semibold transition-all"
                  >
                    +{opt.l}
                  </button>
                ))}
              </div>

              <Input
                type="date"
                value={form.expiry_date || ''}
                onChange={(e) => updateField('expiry_date', e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="h-11 text-base font-mono bg-white border-2 border-amber-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                data-testid="np-expiry-input"
              />

              {/* Live preview */}
              {form.expiry_date && (() => {
                const exp = new Date(form.expiry_date);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const daysLeft = Math.ceil((exp - today) / 86400000);
                const arDate = exp.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
                let color = 'text-emerald-700 bg-emerald-50 border-emerald-300';
                let icon = '✅';
                let msg = `صالح لمدة ${daysLeft} يوم`;
                if (daysLeft < 0) { color = 'text-rose-700 bg-rose-50 border-rose-300'; icon = '⛔'; msg = `منتهي منذ ${Math.abs(daysLeft)} يوم — لن يُحفظ`; }
                else if (daysLeft <= 7)  { color = 'text-rose-700 bg-rose-50 border-rose-300';  icon = '⚠️'; msg = `قريب جداً من الانتهاء (${daysLeft} يوم)`; }
                else if (daysLeft <= 30) { color = 'text-amber-800 bg-amber-50 border-amber-300'; icon = '⏰'; msg = `ينتهي خلال ${daysLeft} يوم`; }
                return (
                  <div className={`mt-2.5 px-3 py-2 rounded-lg border-2 ${color} text-sm flex items-center justify-between`} data-testid="np-expiry-preview">
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="text-base">{icon}</span> {arDate}
                    </span>
                    <span className="text-xs font-semibold">{msg}</span>
                  </div>
                );
              })()}
            </div>

            {/* Piece mode */}
            {form.unit === 'piece' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>سعر شراء القطعة <span className="text-rose-500">*</span></Label>
                  <Input type="number" step="0.01" value={form.cost_price}
                    onChange={(e) => updateField('cost_price', e.target.value)}
                    data-testid="np-piece-cost-input" />
                </div>
                <div>
                  <Label>سعر البيع <span className="text-slate-400 text-xs">(اختياري)</span></Label>
                  <Input type="number" step="0.01" value={form.sale_price}
                    onChange={(e) => updateField('sale_price', e.target.value)}
                    data-testid="np-sale-price-input" />
                </div>
                <div>
                  <Label>الكمية <span className="text-rose-500">*</span></Label>
                  <Input type="number" step="0.01" value={form.quantity}
                    onChange={(e) => updateField('quantity', e.target.value)}
                    data-testid="np-quantity-input" />
                </div>
              </div>
            )}

            {/* Carton mode */}
            {form.unit === 'carton' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>عدد الكراتين <span className="text-rose-500">*</span></Label>
                    <Input type="number" step="1" value={form.cartons}
                      onChange={(e) => updateField('cartons', e.target.value)}
                      data-testid="np-cartons-input" />
                  </div>
                  <div>
                    <Label>سعر شراء الكرتون <span className="text-rose-500">*</span></Label>
                    <Input type="number" step="0.01" value={form.carton_cost}
                      onChange={(e) => updateField('carton_cost', e.target.value)}
                      data-testid="np-carton-cost-input" placeholder="14200" />
                  </div>
                  <div>
                    <Label>عدد القطع داخل الكرتون <span className="text-rose-500">*</span></Label>
                    <Input type="number" step="1" value={form.pieces_per_carton}
                      onChange={(e) => updateField('pieces_per_carton', e.target.value)}
                      data-testid="np-pcs-per-carton-input" placeholder="24" />
                  </div>
                </div>
                <div>
                  <Label>سعر البيع للقطعة <span className="text-slate-400 text-xs">(اختياري)</span></Label>
                  <Input type="number" step="0.01" value={form.sale_price}
                    onChange={(e) => updateField('sale_price', e.target.value)}
                    data-testid="np-sale-price-input" />
                </div>
              </div>
            )}

            {/* Auto piece price preview */}
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4">
              <p className="text-xs text-emerald-700 mb-1">سعر شراء القطعة (محسوب تلقائياً)</p>
              <p className="text-3xl font-bold text-emerald-700" data-testid="np-piece-price-preview">
                {fmt(piecePrice)} <span className="text-base">ر.ي</span>
              </p>
              {form.unit === 'carton' && Number(form.carton_cost) > 0 && Number(form.pieces_per_carton) > 0 && (
                <p className="text-xs text-emerald-600 mt-1">
                  {fmt(form.carton_cost)} ÷ {form.pieces_per_carton} = {fmt(piecePrice)} ر.ي
                </p>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                بعد الاعتماد لن يمكن للمشرف تعديل الأسعار مباشرة — يتحول أي تعديل لاحق
                إلى <strong>طلب تعديل سعر</strong> يحتاج موافقة المدير.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={handleReview} className="bg-emerald-500 hover:bg-emerald-600 text-white"
              data-testid="np-review-btn">
              مراجعة و حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl" className="max-w-md" data-testid="np-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-700">تأكيد اعتماد المنتج</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-slate-600 mb-3">هل أنت متأكد من اعتماد المنتج التالي؟</p>
            <Row k="المنتج" v={form.name} />
            <Row k="الباركود" v={form.barcode} mono />
            <Row k="التاجر" v={supplierName} />
            <Row k="الوحدة" v={form.unit === 'carton' ? 'كرتون' : 'قطعة'} />
            {form.unit === 'carton' && (
              <>
                <Row k="عدد الكراتين" v={`${form.cartons} كرتون`} />
                <Row k="القطع/كرتون" v={form.pieces_per_carton} />
                <Row k="سعر الكرتون" v={`${fmt(form.carton_cost)} ر.ي`} />
              </>
            )}
            {form.unit === 'piece' && (
              <Row k="الكمية" v={`${form.quantity} قطعة`} />
            )}
            <Row k="سعر شراء القطعة" v={`${fmt(piecePrice)} ر.ي`} bold />
            <Row k="سعر البيع" v={form.sale_price ? `${fmt(form.sale_price)} ر.ي` : 'بدون (سيحدده المدير)'} bold />
            <div className="bg-rose-50 border border-rose-200 rounded p-2 text-xs text-rose-700 mt-3">
              ⚠️ بعد الاعتماد لن يمكن تعديل الأسعار مباشرة (إلا للمدير).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>إلغاء</Button>
            <Button onClick={confirmSave} disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="np-confirm-save-btn">
              {saving ? 'جارٍ الحفظ...' : 'موافق - اعتماد المنتج'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Row = ({ k, v, mono, bold }) => (
  <div className="flex justify-between border-b border-slate-100 pb-1">
    <span className="text-slate-500">{k}:</span>
    <span className={`${bold ? 'font-bold text-slate-900' : 'text-slate-800'} ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
  </div>
);

// ============== Payment Dialog ==============
const SupplierPaymentDialog = ({ open, onClose, supplierId, balance, onSaved }) => {
  const [form, setForm] = useState({ amount: '', payment_method: 'cash', notes: '' });
  const save = async () => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast({ title: 'أدخل مبلغاً صحيحاً', variant: 'destructive' }); return; }
    try {
      const { data } = await api.post(`/suppliers/${supplierId}/payments`, { ...form, amount: amt });
      toast({ title: '✅ تم تسجيل السند', description: data.voucher_no });
      onClose(); onSaved(data);
      setForm({ amount: '', payment_method: 'cash', notes: '' });
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>تسديد للتاجر</DialogTitle></DialogHeader>
        {/* ملخص وضع الرصيد الحالي */}
        {Number(balance) > 0.01 ? (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-lg p-3 mb-3 text-sm flex justify-between items-center">
            <span className="font-semibold text-slate-700">مستحق للتاجر (علينا):</span>
            <span className="font-bold text-rose-700 text-lg">{fmt(balance)} ر.ي</span>
          </div>
        ) : Number(balance) < -0.01 ? (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3 mb-3 text-sm flex justify-between items-center">
            <span className="font-semibold text-slate-700">مستحق لنا عند التاجر:</span>
            <span className="font-bold text-emerald-700 text-lg">{fmt(Math.abs(Number(balance)))} ر.ي</span>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 text-sm text-center text-slate-500">
            الرصيد مسدّد بالكامل
          </div>
        )}
        <div className="space-y-3">
          <div><Label>المبلغ</Label>
            <Input type="number" step="0.01" autoFocus value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="text-lg font-bold" data-testid="sup-pay-amount-input" /></div>
          <div><Label>طريقة الدفع</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger data-testid="sup-pay-method-select"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PM).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>ملاحظات</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="save-sup-payment-btn">حفظ السند</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============== Supplier Return Dialog ==============
const SupplierReturnDialog = ({ open, onClose, supplierId, purchases, onSaved }) => {
  const [purchaseId, setPurchaseId] = useState('');
  const [purchase, setPurchase] = useState(null);
  const [items, setItems] = useState([]);  // { purchase_item_id, return_unit, return_quantity, pieces_per_carton }
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) { setPurchaseId(''); setPurchase(null); setItems([]); setReason(''); }
  }, [open]);

  useEffect(() => {
    if (purchaseId) {
      api.get(`/purchases/${purchaseId}`).then((r) => { setPurchase(r.data); setItems([]); });
    }
  }, [purchaseId]);

  const addItem = (pi) => {
    setItems((prev) => [...prev, {
      purchase_item_id: pi.id, name: pi.product_name, unit: pi.product_unit,
      max_available: pi.available_to_return, return_unit: 'piece',
      return_quantity: '', pieces_per_carton: '',
    }]);
  };
  const updateItem = (idx, k, v) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const piecesQty = (it) => {
    const q = Number(it.return_quantity) || 0;
    if (it.return_unit === 'carton') return q * (Number(it.pieces_per_carton) || 0);
    return q;
  };

  const save = async () => {
    if (!purchaseId) return;
    if (items.length === 0) { toast({ title: 'اختر منتجاً للاسترجاع', variant: 'destructive' }); return; }
    // Validate
    for (const it of items) {
      const pieces = piecesQty(it);
      if (pieces <= 0) { toast({ title: `كمية غير صحيحة لـ ${it.name}`, variant: 'destructive' }); return; }
      if (pieces > it.max_available) {
        toast({ title: `الكمية المرتجعة لـ ${it.name} تتجاوز المتاح (${it.max_available})`, variant: 'destructive' }); return;
      }
    }
    try {
      const payload = {
        purchase_id: purchaseId, reason: reason || null,
        items: items.map((it) => ({
          purchase_item_id: it.purchase_item_id,
          return_unit: it.return_unit,
          return_quantity: piecesQty(it),  // always in pieces
        })),
      };
      const { data } = await api.post('/supplier-returns', payload);
      toast({ title: '✅ تم اعتماد الاسترجاع', description: data.voucher_no });
      onClose(); onSaved(data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>استرجاع للتاجر</DialogTitle></DialogHeader>

        <div className="mb-3">
          <Label>اختر فاتورة التوريد</Label>
          <Select value={purchaseId} onValueChange={setPurchaseId}>
            <SelectTrigger data-testid="return-purchase-select"><SelectValue placeholder="اختر فاتورة..." /></SelectTrigger>
            <SelectContent>
              {purchases.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.ref_no} — {fmt(p.total)} ر.ي ({fmtDate(p.created_at)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {purchase && (
          <>
            <div className="mb-3">
              <Label className="text-xs">المنتجات في الفاتورة</Label>
              <div className="grid grid-cols-2 gap-2">
                {purchase.items.filter((it) => it.available_to_return > 0).map((it) => (
                  <button key={it.id} onClick={() => addItem(it)} disabled={items.some(x => x.purchase_item_id === it.id)}
                    className="text-right p-2 border rounded hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    data-testid={`return-add-product-${it.id}`}>
                    <p className="font-semibold">{it.product_name}</p>
                    <p className="text-xs text-slate-500">المتاح: {fmt(it.available_to_return)} قطعة</p>
                  </button>
                ))}
              </div>
            </div>

            {items.map((it, idx) => (
              <Card key={idx} className="p-3 mb-2">
                <div className="flex justify-between mb-2">
                  <h4 className="font-bold">{it.name}</h4>
                  <button onClick={() => removeItem(idx)} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <p className="text-xs text-slate-500 mb-2">المتاح: {fmt(it.max_available)} قطعة</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">طريقة الاسترجاع</Label>
                    <Select value={it.return_unit} onValueChange={(v) => updateItem(idx, 'return_unit', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piece">قطع</SelectItem>
                        <SelectItem value="carton">كراتين</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {it.return_unit === 'carton' && (
                    <div>
                      <Label className="text-xs">قطع/كرتون</Label>
                      <Input type="number" value={it.pieces_per_carton} onChange={(e) => updateItem(idx, 'pieces_per_carton', e.target.value)} className="h-9" />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">{it.return_unit === 'carton' ? 'عدد الكراتين' : 'عدد القطع'}</Label>
                    <Input type="number" step="0.001" value={it.return_quantity}
                      onChange={(e) => updateItem(idx, 'return_quantity', e.target.value)} className="h-9"
                      data-testid={`return-qty-${idx}`} />
                  </div>
                </div>
                <p className="text-xs text-emerald-700 mt-1">= {fmt(piecesQty(it))} قطعة</p>
              </Card>
            ))}

            <div className="mt-3">
              <Label>سبب الاسترجاع</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تالف، انتهاء صلاحية..." />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={!purchaseId || items.length === 0}
            className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="save-return-btn">
            اعتماد الاسترجاع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============== Voucher Modal (print) ==============
const VoucherDialog = ({ voucher, supplier, onClose }) => {
  const k = voucher.kind;
  const d = voucher.data;
  return (
    <>
      <Dialog open={!!voucher} onOpenChange={onClose}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {k === 'purchase' ? `فاتورة توريد ${d.ref_no}` :
               k === 'payment' ? `سند صرف ${d.voucher_no}` :
               `سند استرجاع ${d.voucher_no}`}
            </DialogTitle>
          </DialogHeader>
          <VoucherBody voucher={voucher} supplier={supplier} />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
            <Button
              onClick={() => {
                const titleMap = { purchase: 'فاتورة توريد', payment: 'سند صرف', return: 'سند استرجاع' };
                const accentMap = { purchase: '#e11d48', payment: '#10b981', return: '#f97316' };
                const total = Number(d.total || d.amount || 0);
                // For purchases, paid is from d.paid_amount; for payments/returns paid=total (full settlement)
                const paid = k === 'purchase'
                  ? Number(d.paid_amount ?? 0)
                  : total;
                const remaining = Math.max(0, total - paid);
                exportVoucherPDF({
                  title: titleMap[k] || 'سند',
                  voucherNo: d.ref_no || d.voucher_no,
                  dateISO: d.created_at,
                  subjectLabel: 'التاجر',
                  subjectName: supplier?.name,
                  paymentMethod: d.payment_method ? (PM[d.payment_method] || d.payment_method) : null,
                  employeeName: d.created_by_name,
                  reason: d.reason || null,
                  notes: d.notes || null,
                  items: d.items || [],
                  total,
                  paid,
                  remaining,
                  accent: accentMap[k] || '#f59e0b',
                }).catch((err) => console.error('PDF export failed:', err));
              }}
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
              data-testid="download-voucher-pdf-btn"
            >
              <Printer className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 text-white">
              <Printer className="w-4 h-4 ml-1" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="print-only">
        <VoucherBody voucher={voucher} supplier={supplier} forPrint />
      </div>
    </>
  );
};

const VoucherBody = ({ voucher, supplier, forPrint = false }) => {
  const { kind, data } = voucher;
  return (
    <div className={`bg-white p-5 ${forPrint ? '' : 'border rounded-lg'}`} dir="rtl">
      <div className="text-center mb-4 pb-3 border-b-2 border-dashed">
        <h1 className="text-2xl font-bold">
          {kind === 'purchase' ? 'فاتورة توريد' : kind === 'payment' ? 'سند صرف' : 'سند استرجاع'}
        </h1>
        <p className="text-sm text-slate-600">ميني ماركت الفنية — هاتف: 779008092</p>
      </div>
      <div className="space-y-1 text-sm mb-3">
        <div className="flex justify-between"><span className="text-slate-500">رقم:</span>
          <span className="font-mono font-bold">{data.ref_no || data.voucher_no}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">التاريخ:</span>
          <span>{fmtDate(data.created_at)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">التاجر:</span>
          <span className="font-bold">{supplier.name}</span></div>
        {kind === 'return' && data.purchase_ref && (
          <div className="flex justify-between"><span className="text-slate-500">عن فاتورة:</span>
            <span className="font-mono">{data.purchase_ref}</span></div>
        )}
      </div>

      {kind === 'purchase' && (
        <table className="w-full border text-xs mb-3">
          <thead className="bg-slate-100"><tr>
            <th className="px-2 py-1 text-right">المنتج</th>
            <th className="px-2 py-1">الكمية</th>
            <th className="px-2 py-1">السعر</th>
            <th className="px-2 py-1">الإجمالي</th>
          </tr></thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-2 py-1">{it.product_name}</td>
                <td className="px-2 py-1 text-center">{fmt(it.quantity)}</td>
                <td className="px-2 py-1 text-center">{fmt(it.unit_cost)}</td>
                <td className="px-2 py-1 text-center font-semibold">{fmt(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kind === 'return' && data.items && (
        <table className="w-full border text-xs mb-3">
          <thead className="bg-slate-100"><tr>
            <th className="px-2 py-1 text-right">المنتج</th>
            <th className="px-2 py-1">الوحدة</th>
            <th className="px-2 py-1">الكمية</th>
            <th className="px-2 py-1">القيمة</th>
          </tr></thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">{it.product_name}</td>
                <td className="px-2 py-1 text-center">{it.return_unit === 'carton' ? 'كراتين' : 'قطع'}</td>
                <td className="px-2 py-1 text-center">{fmt(it.quantity)}</td>
                <td className="px-2 py-1 text-center font-semibold">{fmt(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className={`rounded p-3 text-center mt-3 ${
        kind === 'payment' ? 'bg-emerald-50 border-2 border-emerald-200' :
        kind === 'return' ? 'bg-orange-50 border-2 border-orange-200' :
        'bg-rose-50 border-2 border-rose-200'
      }`}>
        <p className="text-xs text-slate-600">الإجمالي</p>
        <p className={`text-3xl font-bold ${
          kind === 'payment' ? 'text-emerald-700' :
          kind === 'return' ? 'text-orange-700' : 'text-rose-700'
        }`}>{fmt(data.total || data.amount)} ر.ي</p>
        {data.payment_method && (
          <p className="text-xs text-slate-500 mt-1">طريقة الدفع: {PM[data.payment_method]}</p>
        )}
      </div>

      {data.notes && <p className="text-sm mt-3"><span className="text-slate-500">ملاحظات:</span> {data.notes}</p>}
      {data.reason && <p className="text-sm mt-3"><span className="text-slate-500">السبب:</span> {data.reason}</p>}

      <div className="flex justify-between text-xs text-slate-500 pt-3 mt-3 border-t">
        <span>الموظف: {data.created_by_name || '—'}</span>
        <span>التوقيع: _________</span>
      </div>
    </div>
  );
};

export default SupplierDetail;
