const reported = new WeakSet<object>();
/** Anonymous, best-effort telemetry; never send exception text or customer data. */
export function reportScreenError(error?: unknown): void {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  void Promise.all([import('./api'), import('./usageReporting')]).then(([api, reporting]) => {
    reporting.reportUsage('erro_tela', api.getEffectiveOwnerId());
  }).catch(() => {});
}
