/**
 * Connectivity status badge — shows online/offline state + pending sync count.
 * Auto-updates and listens to online/offline browser events.
 */
import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { onConnectivityChange, isOnline, listQueue, flushQueue } from '../lib/offline';
import { toast } from '../hooks/use-toast';

const ConnectivityBadge = () => {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = async () => {
    const items = await listQueue();
    setPending(items.length);
  };

  useEffect(() => {
    refreshPending();
    const off = onConnectivityChange((isOn) => setOnline(isOn));
    const onSync = (e) => {
      const { success, failed } = e.detail || {};
      if (success > 0) {
        toast({
          title: '✅ تمت المزامنة',
          description: `${success} عملية مزامنة. ${failed > 0 ? `فشل ${failed}.` : ''}`,
        });
      }
      refreshPending();
    };
    window.addEventListener('offline-sync', onSync);
    const t = setInterval(refreshPending, 5000);
    return () => {
      off();
      window.removeEventListener('offline-sync', onSync);
      clearInterval(t);
    };
  }, []);

  const handleManualSync = async () => {
    if (!online) {
      toast({ title: 'لا يوجد اتصال', description: 'لا يمكن المزامنة دون إنترنت', variant: 'destructive' });
      return;
    }
    setSyncing(true);
    try {
      const { success, failed } = await flushQueue();
      toast({
        title: 'انتهت المزامنة',
        description: `${success} نجح • ${failed} فشل`,
      });
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  };

  if (online && pending === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" data-testid="connectivity-online">
        <Wifi className="w-3 h-3" />
        <span>متصل</span>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 cursor-help" data-testid="connectivity-offline" title={pending > 0 ? `${pending} عملية بانتظار المزامنة` : 'سيتم حفظ العمليات محلياً'}>
        <WifiOff className="w-3 h-3" />
        <span>غير متصل</span>
        {pending > 0 && <span className="bg-rose-500 text-white rounded-full px-1.5 ml-0.5">{pending}</span>}
      </div>
    );
  }

  // Online but has pending queue — show sync button
  return (
    <button
      onClick={handleManualSync}
      disabled={syncing}
      data-testid="connectivity-sync"
      className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
    >
      {syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
      <span>{syncing ? 'جارٍ المزامنة...' : `مزامنة (${pending})`}</span>
    </button>
  );
};

export default ConnectivityBadge;
