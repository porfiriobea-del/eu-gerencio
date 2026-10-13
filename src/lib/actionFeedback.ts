export type ToastKind = 'success' | 'error' | 'warning';
export interface ToastNotice { message: string; kind: ToastKind }
export const TOAST_EVENT = 'eu-gerencio-toast';

export class ConfirmationTimeoutError extends Error {
  constructor() {
    super('A confirmação demorou mais que o esperado. Confira os dados antes de repetir a ação.');
    this.name = 'ConfirmationTimeoutError';
  }
}

/** Stops waiting, without cancelling or claiming failure of an underlying database write. */
export function withActionDeadline<A extends unknown[], R>(action: (...args: A) => Promise<R>, timeoutMs = 30000) {
  return async (...args: A): Promise<R> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => action(...args)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ConfirmationTimeoutError()), timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function showToast(message: string, kind: ToastKind = 'success', persistForReload = false) {
  if (persistForReload && typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem('eu_gerencio_pending_toast', JSON.stringify({ message, kind })); } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ToastNotice>(TOAST_EVENT, { detail: { message, kind } }));
  }
}

export function showActionError(error: unknown, message: string) {
  showToast(error instanceof ConfirmationTimeoutError ? error.message : message, error instanceof ConfirmationTimeoutError ? 'warning' : 'error');
}

export function createToastController(onChange: (notice: ToastNotice | null) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    show(notice: ToastNotice) {
      clearTimeout(timer);
      onChange(notice);
      timer = setTimeout(() => onChange(null), 4000);
    },
    dispose() { clearTimeout(timer); }
  };
}
