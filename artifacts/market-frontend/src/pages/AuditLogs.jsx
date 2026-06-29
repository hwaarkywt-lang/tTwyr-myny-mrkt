import React, { useEffect, useState } from 'react';
import {
  ScrollText, Search, ShieldAlert, Filter, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import api from '../lib/api';
import { toast } from '../hooks/use-toast';

export default function AuditLogs() {
  const [filters, setFilters] = useState({ action: '', entity: '', severity: 'all', date_from: '', date_to: '' });
  const [actions, setActions] = useState([]);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (filters.action)    params.action = filters.action;
      if (filters.entity)    params.entity = filters.entity;
      if (filters.severity && filters.severity !== 'all') params.severity = filters.severity;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to = filters.date_to;
      const { data: res } = await api.get('/audit-logs', { params });
      setData(res);
    } catch (e) {
      toast({ title: 'فشل تحميل السجل', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [offset, filters.severity]);

  useEffect(() => {
    api.get('/audit-logs/actions').then((r) => setActions(r.data || [])).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="audit-logs-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="text-indigo-500" /> سجل العمليات (Audit Log)
          </h1>
          <p className="text-sm text-slate-500 mt-1">سجل شامل لكل العمليات في النظام — للمدير فقط</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-rose-100 text-rose-700">عمليات أمنية: {data.items.filter(i => i.is_security).length}</Badge>
          <Button variant="outline" onClick={() => { setOffset(0); load(); }}>
            <RefreshCw className="w-4 h-4 ml-1" /> تحديث
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">العملية</Label>
              <Select value={filters.action || 'all'} onValueChange={(v) => setFilters({ ...filters, action: v === 'all' ? '' : v })}>
                <SelectTrigger data-testid="filter-action"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">الكل</SelectItem>
                  {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الكيان</Label>
              <Input value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                placeholder="products / users / sales..." data-testid="filter-entity" />
            </div>
            <div>
              <Label className="text-xs">الخطورة</Label>
              <Select value={filters.severity} onValueChange={(v) => setFilters({ ...filters, severity: v })}>
                <SelectTrigger data-testid="filter-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="security">أمني فقط 🚨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} data-testid="filter-from" />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} data-testid="filter-to" />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setFilters({ action: '', entity: '', severity: 'all', date_from: '', date_to: '' }); setOffset(0); }}>إعادة ضبط</Button>
            <Button onClick={() => { setOffset(0); load(); }} className="bg-indigo-500 hover:bg-indigo-600 text-white" data-testid="apply-filters">
              <Search className="w-4 h-4 ml-1" /> بحث
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ والوقت</th>
                <th className="px-3 py-2 text-right">المستخدم</th>
                <th className="px-3 py-2 text-right">الدور</th>
                <th className="px-3 py-2 text-right">العملية</th>
                <th className="px-3 py-2 text-right">الكيان</th>
                <th className="px-3 py-2 text-right">IP</th>
                <th className="px-3 py-2 text-right">الخطورة</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">لا توجد سجلات</td></tr>
              )}
              {data.items.map((it) => (
                <tr key={it.id} className={`border-t ${it.is_security ? 'bg-rose-50' : ''}`}>
                  <td className="px-3 py-2 text-xs font-mono">{new Date(it.created_at).toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2">{it.user?.name || '-'}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{it.user?.role || '-'}</Badge></td>
                  <td className="px-3 py-2 font-medium">{it.action}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{it.entity || '-'}</td>
                  <td className="px-3 py-2 text-xs font-mono text-slate-400">{it.ip_address || '-'}</td>
                  <td className="px-3 py-2">
                    {it.is_security ? (
                      <Badge className="bg-rose-100 text-rose-700"><ShieldAlert className="w-3 h-3 ml-1" />أمني</Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700">عادي</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">الإجمالي: <strong>{data.total}</strong> | صفحة <strong>{currentPage}</strong> من <strong>{totalPages}</strong></p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            <ChevronRight className="w-4 h-4" /> السابق
          </Button>
          <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}>
            التالي <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
