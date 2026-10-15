import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TutorialGuide } from './TutorialGuide';

export function GuidedTour({ isOpen, onClose, initialStepIndex = 0 }: { isOpen: boolean; onClose: () => void; initialStepIndex?: number }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const finish = () => {
    try { localStorage.setItem('eu_gerencio_guided_tour_completed', 'true'); } catch {}
    onClose();
  };
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget) finish(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Tutorial do aplicativo" className="w-full max-w-xl"><TutorialGuide onClose={finish} initialStepIndex={initialStepIndex} /></div>
  </div>, document.body);
}
