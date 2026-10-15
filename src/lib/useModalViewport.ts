import { useEffect, useState } from 'react';

/** Fit the modal to the visible area, including the on-screen keyboard on mobile. */
export function useModalViewport(open: boolean) {
  const read = () => ({ height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0 });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    if (!open) return;
    const update = () => setViewport(read());
    update();
    const visible = window.visualViewport;
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visible?.removeEventListener('resize', update);
      visible?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [open]);
  return viewport;
}
