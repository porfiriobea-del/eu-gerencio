import { useEffect, useState } from 'react';
import { GuidedTour } from './GuidedTour';

export function TutorialModal() {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('tutorialCompleted')) return; } catch {}
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);
  return <GuidedTour isOpen={isOpen} onClose={() => {
    setIsOpen(false);
    try { localStorage.setItem('tutorialCompleted', 'true'); } catch {}
  }} />;
}
