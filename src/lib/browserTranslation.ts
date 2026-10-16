const patchKey = Symbol.for('eu-gerencio.translation-dom-guard');

/** Google Translate can detach text nodes still referenced by React. */
export function protectTranslatedDom(onRepair?: () => void): void {
  const prototype = Node.prototype as Node & { [key: symbol]: unknown };
  if (prototype[patchKey]) return;
  const removeChild = prototype.removeChild;
  const insertBefore = prototype.insertBefore;
  const notify = () => { try { onRepair?.(); } catch { /* Recovery must not throw. */ } };
  prototype.removeChild = function<T extends Node>(this: Node, child: T): T {
    if (child instanceof Node && child.parentNode !== this) { notify(); return child; }
    return removeChild.call(this, child) as T;
  };
  prototype.insertBefore = function<T extends Node>(this: Node, child: T, reference: Node | null): T {
    if (reference instanceof Node && reference.parentNode !== this) { notify(); return child; }
    return insertBefore.call(this, child, reference) as T;
  };
  Object.defineProperty(prototype, patchKey, { value: true });
}

export function syncDocumentLanguage(language: 'pt' | 'pt-BR' | 'en' | 'es'): () => void {
  const expected = language === 'pt' ? 'pt-BR' : language;
  const restore = () => { if (document.documentElement.lang !== expected) document.documentElement.lang = expected; };
  restore();
  const observer = new window.MutationObserver(restore);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
}
