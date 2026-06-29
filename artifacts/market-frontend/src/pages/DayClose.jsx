import React, { useEffect, useState } from 'react';
import { Lock, Calendar, Banknote, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import api, { formatApiError } from '../lib/api';
import { toast } from '../hooks/use-toast';

const money = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

export default function DayClose() {
  const today = new Date().toISOString().split('T')[0];
  const [businessDate, setBusinessDate] = useState(today);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closeOpen, setCloseOpen] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/day-closes/preview', { params: { business_date: businessDate } });
      setPreview(data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
    setLoading(false);
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/day-closes', { params: { limit: 30 } });
      setHistory(data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadPreview(); loadHistory(); /* eslint-disable-next-line */ }, [businessDate]);

  const submit = async () => {
    if (actualCash === '' || isNaN(Number(actualCash))) {
      toast({ title: 'أدخل النقد الفعلي المعدود', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/day-closes', {
        business_date: businessDate,
        actual_cash: Number(actualCash),
        notes: notes || null,
      });
      toast({ title: '✅ تم إقفال اليوم بنجاح' });
      setCloseOpen(false); setActualCash(''); setNotes('');
      loadPreview(); loadHistory();
    } catch (e) {
      toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' });
    }
    setSaving(false);
  };

  const variance = preview ? (Number(actualCash || 0) - Number(preview.expected_cash || 0)) : 0;

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="day-close-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="text-purple-500" /> إقفال اليوم
          </h1>
          <p className="text-sm text-slate-500 mt-1">تسوية الصندوق اليومية — مقارنة المحسوب بالفعلي</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">تاريخ:</Label>
          <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)}
            className="w-44" data-testid="business-date" />
        </div>
      </div>

      {preview?.already_closed && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
            <p className="text-emerald-800">
              <strong>هذا اليوم مُقفَل مسبقاً.</strong> تم الإقفال في {new Date(preview.closed_at).toLocaleString('ar-EG')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cash breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-2 border-purple-200 bg-purple-50">
          <CardContent className="p-5">
            <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
              <Banknote className="w-5 h-5" /> النقد المحسوب من النظام
            </h3>
            {loading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto" /> : preview && (
              <div className="space-y-2 text-sm">
                <Row k="مبيعات نقدية" v={`+${money(preview.sales_cash)} ر.ي`} pos />
                <Row k="سندات قبض (عملاء)" v={`+${money(preview.customer_receipts)} ر.ي`} pos />
                <Row k="مصروفات" v={`-${money(preview.expenses_paid)} ر.ي`} neg />
                <Row k="سداد التجار" v={`-${money(preview.supplier_paid)} ر.ي`} neg />
                <Row k="مرتجعات نقدية" v={`-${money(preview.cash_returns)} ر.ي`} neg />
                <hr className="border-purple-200" />
                <div className="flex justify-between items-center bg-white p-3 rounded-lg border-2 border-purple-300">
                  <span className="font-bold text-purple-900">النقد المتوقع</span>
                  <span className="text-2xl font-bold text-purple-700" data-testid="expected-cash">{money(preview.expected_cash)} ر.ي</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold text-slate-800 mb-3">إقفال اليوم</h3>
            {preview?.already_closed ? (
              <p className="text-slate-500 text-center py-6">هذا اليوم مُقفل مسبقاً — لا يمكن إعادة الإقفال</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  عُد النقد الفعلي في الصندوق الآن، ثم اضغط زر "إقفال اليوم".
                  أي فرق بين الفعلي والمحسوب سيُسجَّل في سجل العمليات.
                </p>
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white h-12 text-base"
                  onClick={() => setCloseOpen(true)}
                  data-testid="open-close-day-btn">
                  <Lock className="w-5 h-5 ml-2" /> إقفال اليوم الآن
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-slate-800 mb-3">سجل الإقفالات السابقة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-right">تاريخ اليوم</th>
                <th className="px-3 py-2 text-right">متوقع</th>
                <th className="px-3 py-2 text-right">فعلي</th>
                <th className="px-3 py-2 text-right">فارق</th>
                <th className="px-3 py-2 text-right">ملاحظات</th>
                <th className="px-3 py-2 text-right">وقت الإقفال</th>
              </tr></thead>
              <tbody>
                {history.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-slate-400">لا يوجد سجل</td></tr>}
                {history.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{d.business_date}</td>
                    <td className="px-3 py-2">{money(d.expected_cash)}</td>
                    <td className="px-3 py-2 font-bold">{money(d.actual_cash)}</td>
                    <td className={`px-3 py-2 font-bold ${d.variance === 0 ? 'text-emerald-600' : d.variance > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                      {d.variance > 0 ? '+' : ''}{money(d.variance)} {d.variance === 0 ? '✓' : d.variance > 0 ? '(زيادة)' : '(عجز)'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate">{d.notes || '—'}</td>
                    <td className="px-3 py-2 text-xs">{new Date(d.closed_at).toLocaleString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Close dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent dir="rtl" className="max-w-md" data-testid="close-dialog">
          <DialogHeader><DialogTitle>إقفال يوم {businessDate}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
              <p className="text-xs text-purple-700 mb-1">النقد المتوقع (من النظام)</p>
              <p className="text-2xl font-bold text-purple-700">{money(preview?.expected_cash || 0)} ر.ي</p>
            </div>
            <div>
              <Label>النقد الفعلي في الصندوق <span className="text-rose-500">*</span></Label>
              <Input type="number" step="0.01" value={actualCash} onChange={(e) => setActualCash(e.target.value)}
                placeholder="0.00" className="text-xl font-bold text-center" data-testid="actual-cash-input" autoFocus />
            </div>
            {actualCash !== '' && (
              <div className={`p-3 rounded-lg border-2 ${variance === 0 ? 'bg-emerald-50 border-emerald-300' : variance > 0 ? 'bg-blue-50 border-blue-300' : 'bg-rose-50 border-rose-300'}`}>
                <p className="text-xs">الفارق:</p>
                <p className={`text-2xl font-bold ${variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                  {variance > 0 ? '+' : ''}{money(variance)} ر.ي
                </p>
                <p className="text-xs mt-1">
                  {variance === 0 ? '✅ متطابق تماماً' : variance > 0 ? '📈 زيادة في الصندوق' : '⚠️ عجز في الصندوق — يحتاج تفسير'}
                </p>
              </div>
            )}
            <div>
              <Label>ملاحظات (إجباري عند وجود فارق)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="فسر سبب الفارق إن وُجد..." rows={2} data-testid="notes-input" />
            </div>
            <div className="bg-amber-50 p-2 rounded text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              بعد الإقفال لا يمكن التراجع. سيُسجَّل في سجل العمليات.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white"
              data-testid="confirm-close-btn">
              {saving ? 'جارٍ الإقفال...' : 'تأكيد الإقفال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ k, v, pos, neg }) => (
  <div className="flex justify-between py-1">
    <span className="text-slate-600">{k}</span>
    <span className={`font-medium ${pos ? 'text-emerald-700' : neg ? 'text-rose-700' : ''}`}>{v}</span>
  </div>
);
