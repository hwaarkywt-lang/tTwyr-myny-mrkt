import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Receipt, Calendar } from 'lucide-react';
import api from '../lib/api';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo + 'T23:59:59';
    const r = await api.get('/sales', { params });
    setSales(r.data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const total = sales.reduce((s, x) => s + Number(x.total), 0);

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="sales-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-1">المبيعات</h1>
        <p className="text-slate-500">{sales.length} فاتورة — إجمالي: <span className="font-bold text-emerald-600">{fmt(total)} ر.ي</span></p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button onClick={load} className="bg-amber-500 hover:bg-amber-600 text-white px-6 h-10 rounded-md">
            عرض النتائج
          </button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">رقم الفاتورة</th>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">عدد المنتجات</th>
                <th className="px-4 py-3 text-right">الإجمالي</th>
                <th className="px-4 py-3 text-right">الدفع</th>
                <th className="px-4 py-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr><td colSpan="6" className="text-center py-12">
                  <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400">لا توجد مبيعات</p>
                </td></tr>
              )}
              {sales.map((s) => (
                <tr key={s.id} className="border-t hover:bg-slate-50" data-testid={`sale-row-${s.invoice_no}`}>
                  <td className="px-4 py-3 font-medium text-amber-700">{s.invoice_no}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 inline ml-1" />
                    {new Date(s.created_at).toLocaleString('ar-EG')}
                  </td>
                  <td className="px-4 py-3 text-center">{s.items?.length || 0}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600">{fmt(s.total)} ر.ي</td>
                  <td className="px-4 py-3 text-slate-600">{s.payment_method}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                        : s.status === 'voided' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                    }`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Sales;
