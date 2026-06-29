import React, { useEffect, useState } from 'react';
import { ShieldCheck, Check, X, Clock } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../hooks/use-toast';
import api, { formatApiError } from '../lib/api';

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};
const statusLabels = { pending: 'بانتظار', approved: 'مقبول', rejected: 'مرفوض' };

const Approvals = () => {
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('pending');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    try {
      const r = await api.get('/product-change-requests', { params: { status: tab } });
      setRequests(r.data);
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const approve = async (id) => {
    try {
      await api.post(`/product-change-requests/${id}/approve`);
      toast({ title: '✅ تمت الموافقة' });
      load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const openReject = (id) => { setRejectingId(id); setReason(''); setRejectOpen(true); };

  const reject = async () => {
    try {
      await api.post(`/product-change-requests/${rejectingId}/reject`, null, {
        params: { reason },
      });
      toast({ title: '❌ تم الرفض' });
      setRejectOpen(false);
      load();
    } catch (e) { toast({ title: 'خطأ', description: formatApiError(e), variant: 'destructive' }); }
  };

  const renderChanges = (cr) => {
    if (cr.request_type === 'delete') {
      return <Badge className="bg-rose-100 text-rose-700">طلب حذف</Badge>;
    }
    const changes = cr.after_data || {};
    return (
      <div className="space-y-1 text-xs">
        {Object.entries(changes).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-slate-500">{k}:</span>
            <span className="line-through text-rose-500">{String(cr.before_data?.[k] ?? '—')}</span>
            <span className="text-emerald-600 font-medium">→ {String(v)}</span>
          </div>
        ))}
        {cr.change_reason && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
            <span className="text-slate-500 ml-1">سبب التعديل:</span>
            <span className="font-medium">{cr.change_reason}</span>
          </div>
        )}
      </div>
    );
  };

  const typeBadge = (t) => {
    if (t === 'delete') return '🗑️ حذف';
    if (t === 'price_change') return '💰 تعديل سعر';
    return '✏️ تعديل';
  };

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="approvals-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-amber-500" /> طلبات التعديل
        </h1>
        <p className="text-slate-500">طلبات المشرفين بتعديل أو حذف المنتجات</p>
      </div>

      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`approvals-tab-${t}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-slate-900 text-white' : 'bg-white border text-slate-700 hover:border-slate-400'
            }`}
          >
            {statusLabels[t]} {tab === t ? `(${requests.length})` : ''}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <Card className="p-12 text-center text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>لا توجد طلبات في هذه الفئة</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="shadow-sm" data-testid={`approval-${r.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
                      <Badge variant="outline">
                        {typeBadge(r.request_type)}
                      </Badge>
                      <span className="text-sm text-slate-500">
                        المشرف: <span className="font-semibold text-slate-900">{r.requester_name}</span>
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{r.product_name}</h3>
                    <p className="text-xs text-slate-500 mb-3">SKU: {r.product_sku}</p>
                    {renderChanges(r)}
                    {r.rejection_reason && (
                      <p className="mt-2 text-xs text-rose-600">سبب الرفض: {r.rejection_reason}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      {new Date(r.created_at).toLocaleString('ar-EG')}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => approve(r.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        data-testid={`approve-${r.id}`}
                      >
                        <Check className="w-4 h-4 ml-1" /> موافقة
                      </Button>
                      <Button
                        onClick={() => openReject(r.id)}
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        data-testid={`reject-${r.id}`}
                      >
                        <X className="w-4 h-4 ml-1" /> رفض
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سبب الرفض</DialogTitle></DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اكتب سبب الرفض..."
            rows={4}
            data-testid="reject-reason-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>إلغاء</Button>
            <Button onClick={reject} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="confirm-reject-btn">
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;
