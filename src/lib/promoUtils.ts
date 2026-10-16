import { formatMoney, type MoneyOptions } from './currency';
import { differenceInCalendarDays, parseISO, isValid, addDays, format } from 'date-fns';

export interface ExpirationStatus {
  hasExpiration: boolean;
  daysLeft: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean; // <= 30 dias
  isCritical: boolean; // <= 7 dias
  urgency: 'expired' | 'critical' | 'warning' | 'ok' | 'none';
  statusText: string;
  badgeClass: string;
  borderClass: string;
}

/**
 * Calcula o status de validade a partir de uma data no formato 'yyyy-MM-dd'
 */
export function calculateExpirationStatus(expirationDate?: string): ExpirationStatus {
  if (!expirationDate || expirationDate.trim() === '') {
    return {
      hasExpiration: false,
      daysLeft: null,
      isExpired: false,
      isExpiringSoon: false,
      isCritical: false,
      urgency: 'none',
      statusText: 'Validade não informada',
      badgeClass: 'text-muted-foreground bg-muted',
      borderClass: 'border-border'
    };
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDate = parseISO(expirationDate);
    if (!isValid(expDate)) {
      return {
        hasExpiration: false,
        daysLeft: null,
        isExpired: false,
        isExpiringSoon: false,
        isCritical: false,
        urgency: 'none',
        statusText: 'Data inválida',
        badgeClass: 'text-muted-foreground bg-muted',
        borderClass: 'border-border'
      };
    }

    const diff = differenceInCalendarDays(expDate, today);

    if (diff < 0) {
      const daysAgo = Math.abs(diff);
      return {
        hasExpiration: true,
        daysLeft: diff,
        isExpired: true,
        isExpiringSoon: true,
        isCritical: true,
        urgency: 'expired',
        statusText: daysAgo === 1 ? 'Venceu ontem' : `Vencido há ${daysAgo} dias`,
        badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
        borderClass: 'border-red-500/40'
      };
    }

    if (diff === 0) {
      return {
        hasExpiration: true,
        daysLeft: 0,
        isExpired: false,
        isExpiringSoon: true,
        isCritical: true,
        urgency: 'critical',
        statusText: 'Vence hoje!',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 font-bold border-red-500/40',
        borderClass: 'border-red-500/50'
      };
    }

    if (diff <= 7) {
      return {
        hasExpiration: true,
        daysLeft: diff,
        isExpired: false,
        isExpiringSoon: true,
        isCritical: true,
        urgency: 'critical',
        statusText: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'} (Crítico)`,
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold',
        borderClass: 'border-amber-500/40'
      };
    }

    if (diff <= 30) {
      return {
        hasExpiration: true,
        daysLeft: diff,
        isExpired: false,
        isExpiringSoon: true,
        isCritical: false,
        urgency: 'warning',
        statusText: `Vence em ${diff} dias (Atenção)`,
        badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
        borderClass: 'border-yellow-500/30'
      };
    }

    const months = Math.floor(diff / 30);
    const text = months >= 2 ? `Válido por ~${months} meses` : `Válido por ${diff} dias`;

    return {
      hasExpiration: true,
      daysLeft: diff,
      isExpired: false,
      isExpiringSoon: false,
      isCritical: false,
      urgency: 'ok',
      statusText: text,
      badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      borderClass: 'border-emerald-500/20'
    };
  } catch {
    return {
      hasExpiration: false,
      daysLeft: null,
      isExpired: false,
      isExpiringSoon: false,
      isCritical: false,
      urgency: 'none',
      statusText: 'Validade não informada',
      badgeClass: 'text-muted-foreground bg-muted',
      borderClass: 'border-border'
    };
  }
}

/**
 * Formata com segurança a data de validade 'yyyy-MM-dd' para visualização
 */
export function formatExpirationDate(dateStr?: string, pattern = 'dd/MM/yy'): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  try {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) return dateStr;
    return format(parsed, pattern);
  } catch {
    return dateStr;
  }
}

/**
 * Atalhos rápidos de data a partir de hoje
 */
export function getQuickExpirationDates() {
  const today = new Date();
  return [
    { label: '+15 dias', value: format(addDays(today, 15), 'yyyy-MM-dd') },
    { label: '+30 dias', value: format(addDays(today, 30), 'yyyy-MM-dd') },
    { label: '+60 dias', value: format(addDays(today, 60), 'yyyy-MM-dd') },
    { label: '+90 dias', value: format(addDays(today, 90), 'yyyy-MM-dd') },
    { label: '+6 meses', value: format(addDays(today, 180), 'yyyy-MM-dd') },
    { label: '+1 ano', value: format(addDays(today, 365), 'yyyy-MM-dd') }
  ];
}

/**
 * Sugestão automática inteligente de promoção baseada no preço base, custo unitário e proximidade da validade
 */
export function suggestPromoDiscount(
  basePrice: number,
  unitCost: number = 0,
  daysLeft: number | null = null,
  moneyOptions: MoneyOptions = {}
): {
  discountPercent: number;
  promoPrice: number;
  profit: number;
  profitMarginPercent: number;
  reason: string;
} {
  const price = Math.max(0, basePrice);
  const cost = Math.max(0, unitCost);

  if (price <= 0) {
    return {
      discountPercent: 10,
      promoPrice: 0,
      profit: 0,
      profitMarginPercent: 0,
      reason: 'Preço base zerado'
    };
  }

  let suggestedPercent = 15;
  let reason = 'Desconto promocional padrão (-15%) para acelerar vendas';

  if (daysLeft !== null) {
    if (daysLeft < 0) {
      suggestedPercent = 50;
      reason = 'Item vencido! Recomendado descarte ou liquidação urgente';
    } else if (daysLeft <= 3) {
      suggestedPercent = 35;
      reason = 'Vence em até 3 dias! Queima de estoque urgente (-35%)';
    } else if (daysLeft <= 7) {
      suggestedPercent = 25;
      reason = 'Vence esta semana! Promoção recomendada (-25%)';
    } else if (daysLeft <= 15) {
      suggestedPercent = 20;
      reason = 'Vence em 15 dias! Promoção preventiva (-20%)';
    } else if (daysLeft <= 30) {
      suggestedPercent = 15;
      reason = 'Vence neste mês! Aceleração de giro (-15%)';
    } else {
      suggestedPercent = 10;
      reason = 'Validade segura. Promoção de estímulo (-10%)';
    }
  }

  // Calcula o preço sugerido
  let calculatedPromoPrice = Number((price * (1 - suggestedPercent / 100)).toFixed(2));

  // Proteção: não deixar ficar abaixo do custo (a menos que já estivesse ou item vencido)
  if (cost > 0 && calculatedPromoPrice < cost && (daysLeft === null || daysLeft > 0)) {
    // Se o desconto deixaria abaixo do custo, ajusta para manter custo + pequena margem (ex: 5%)
    const safePrice = Number((cost * 1.05).toFixed(2));
    if (safePrice < price) {
      calculatedPromoPrice = safePrice;
      suggestedPercent = Number((((price - safePrice) / price) * 100).toFixed(0));
      reason = `Desconto limitado a ${suggestedPercent}% para proteger o custo de compra (${formatMoney(cost,moneyOptions)})`;
    }
  }

  const profit = calculatedPromoPrice - cost;
  const profitMarginPercent = cost > 0 ? Number(((profit / cost) * 100).toFixed(1)) : 0;

  return {
    discountPercent: suggestedPercent,
    promoPrice: calculatedPromoPrice,
    profit,
    profitMarginPercent,
    reason
  };
}

/**
 * Converte % de desconto em preço promocional
 */
export function calculatePromoPriceFromPercent(basePrice: number, percent: number): number {
  if (basePrice <= 0) return 0;
  const p = Math.max(0, Math.min(99, percent));
  return Number((basePrice * (1 - p / 100)).toFixed(2));
}

/**
 * Converte preço promocional em % de desconto
 */
export function calculateDiscountPercentFromPrice(basePrice: number, promoPrice: number): number {
  if (basePrice <= 0 || promoPrice >= basePrice) return 0;
  const p = Math.max(0, promoPrice);
  return Number((((basePrice - p) / basePrice) * 100).toFixed(1));
}
