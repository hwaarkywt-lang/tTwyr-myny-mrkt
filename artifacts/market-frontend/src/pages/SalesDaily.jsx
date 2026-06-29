import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Calendar, TrendingUp, Receipt, DollarSign } from 'lucide-react';
import api from '../lib/api';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0);

const SalesDaily = () => {
  const today = new Date().toISOString().split('T')[0];
  const [sales, setSales] = useState([]);
  const [date, setDate] = useState(today);

  useEffect(() => {
    api.get('/sales', {
      params: { date_from: date + 'T00:00:00', date_to: date + 'T23:59:59', limit: 500 },
    }).then((r) => setSales(r.data));
  }, [date]);

  const total = sales.reduce((s, x) => s + Number(x.total), 0);
  const items = sales.reduce((s, x) => s + (x.items?.length || 0), 0);

  return (
    <div className="p-6 lg:p-8" dir="rtl" data-testid="sales-daily-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">المبيعات اليومية</h1>
          <p className="text-slate-500">تفاصيل مبيعات اليوم</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="border rounded-md px-3 py-2" data-testid="sales-daily-date-input" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'إجمالي المبيعات', value: fmt(total) + ' ر.ي', icon: DollarSign, color: 'from-emerald-500 to-teal-600' },
          { label: 'عدد الفواتير', value: sales.length, icon: Receipt, color: 'from-blue-500 to-indigo-600' },
          { label: 'إجمالي المنتجات', value: items, icon: TrendingUp, color: 'from-amber-500 to-orange-600' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="overflow-hidden border-0 shadow-lg">
              <div className={`bg-gradient-to-br ${s.color} p-5 text-white`}>
                <Icon className="w-7 h-7 mb-3 opacity-90" />
                <p className="text-white/80 text-sm">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-right">الوقت</th>
                <th className="px-4 py-3 text-right">رقم الفاتورة</th>
                <th className="px-4 py-3 text-right">الإجمالي</th>
                <th className="px-4 py-3 text-right">الدفع</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr><td colSpan="4" className="text-center py-12 text-slate-400">لا مبيعات في هذا اليوم</td></tr>
              )}
              {sales.map((s) => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{new Date(s.created_at).toLocaleTimeString('ar-EG')}</td>
                  <td className="px-4 py-3 font-medium text-amber-700">{s.invoice_no}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600">{fmt(s.total)} ر.ي</td>
                  <td className="px-4 py-3 text-slate-600">{s.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SalesDaily;
