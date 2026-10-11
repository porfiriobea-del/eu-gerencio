import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2, ArrowRight } from 'lucide-react';

export interface PocketTipStep {
  id: string;
  badge?: string;
  title: string;
  subtitle?: string;
  step1: {
    label: string;
    description: string;
  };
  step2: {
    label: string;
    description: string;
  };
  actionButton?: {
    label: string;
    to?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
  };
}

interface PocketTipProps {
  id: string;
  title: string;
  subtitle?: string;
  badgeText?: string;
  sections: PocketTipStep[];
  helpfulNote?: string;
  defaultOpen?: boolean;
}

export const PocketTip: React.FC<PocketTipProps> = ({
  id,
  title,
  subtitle,
  badgeText = 'Dica de Bolso',
  sections,
  helpfulNote = 'Você não precisa decorar nada: faça no seu tempo e o sistema cuida das contas!',
  defaultOpen = true,
}) => {
  const storageKey = `pocket_tip_open_${id}`;
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? stored === 'true' : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-palette-1/40 to-emerald-500/10 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                {badgeText}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleOpen}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-surface/80 hover:bg-surface border border-border/80 px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
          title={isOpen ? 'Recolher dica' : 'Abrir dica'}
        >
          <span>{isOpen ? 'Esconder' : 'Ver Dica'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Content */}
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-primary/15 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((sec) => (
              <div
                key={sec.id}
                className="bg-surface/90 border border-border/80 rounded-xl p-4 flex flex-col justify-between shadow-2xs hover:border-primary/30 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-bold text-foreground text-sm sm:text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{sec.title}</span>
                    </h3>
                    {sec.badge && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {sec.badge}
                      </span>
                    )}
                  </div>
                  {sec.subtitle && (
                    <p className="text-xs text-muted-foreground mb-3">
                      {sec.subtitle}
                    </p>
                  )}

                  {/* 2 Simple Steps */}
                  <div className="space-y-2.5 my-3">
                    {/* Step 1 */}
                    <div className="flex items-start gap-3 bg-muted/40 p-2.5 rounded-lg border border-border/40">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div className="text-xs sm:text-sm">
                        <span className="font-bold text-foreground block">
                          {sec.step1.label}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">
                          {sec.step1.description}
                        </span>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-3 bg-muted/40 p-2.5 rounded-lg border border-border/40">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div className="text-xs sm:text-sm">
                        <span className="font-bold text-foreground block">
                          {sec.step2.label}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">
                          {sec.step2.description}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Optional Action Button */}
                {sec.actionButton && (
                  <div className="pt-2">
                    {sec.actionButton.to ? (
                      <Link
                        to={sec.actionButton.to}
                        className="inline-flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity w-full text-center shadow-xs"
                      >
                        {sec.actionButton.icon}
                        <span>{sec.actionButton.label}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : sec.actionButton.onClick ? (
                      <button
                        type="button"
                        onClick={sec.actionButton.onClick}
                        className="inline-flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity w-full cursor-pointer shadow-xs"
                      >
                        {sec.actionButton.icon}
                        <span>{sec.actionButton.label}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>

          {helpfulNote && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 px-1">
              <span className="italic flex items-center gap-1.5">
                💡 {helpfulNote}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
