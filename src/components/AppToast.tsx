import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { TOAST_EVENT, createToastController, type ToastNotice } from '../lib/actionFeedback';

export function AppToast() {
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  useEffect(() => {
    const controller = createToastController(setNotice);
    const receive = (event: Event) => controller.show((event as CustomEvent<ToastNotice>).detail);
    window.addEventListener(TOAST_EVENT, receive);
    const restoreTimer = setTimeout(() => {
      try {
        const pending = sessionStorage.getItem('eu_gerencio_pending_toast');
        if (pending) {
          sessionStorage.removeItem('eu_gerencio_pending_toast');
          controller.show(JSON.parse(pending));
        }
      } catch {}
    }, 0);
    return () => {
      clearTimeout(restoreTimer);
      window.removeEventListener(TOAST_EVENT, receive);
      controller.dispose();
    };
  }, []);
  if (!notice) return null;
  return (
    <div role="status" aria-live="polite" className={`fixed bottom-4 left-4 right-4 z-[100] flex items-center gap-3 rounded-xl border p-4 shadow-lg sm:left-auto sm:max-w-md ${notice.kind === 'success' ? 'border-emerald-600 bg-emerald-700 text-white' : notice.kind === 'warning' ? 'border-amber-400 bg-amber-100 text-amber-950' : 'border-red-600 bg-red-700 text-white'}`}>
      {notice.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
      <span className="text-sm font-medium">{notice.message}</span>
      <button type="button" aria-label="Fechar mensagem" onClick={() => setNotice(null)} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>
  );
}
