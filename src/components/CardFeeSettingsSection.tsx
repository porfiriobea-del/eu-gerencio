import { usePreferences } from '../lib/preferencesContext';
import { showToast, showActionError } from '../lib/actionFeedback';
import { useState, useEffect } from 'react';
import { CreditCard, Percent, DollarSign, HelpCircle, ShieldCheck, CheckCircle2, Save, ArrowRight } from 'lucide-react';
import { Settings } from '../types';

interface CardFeeSettingsSectionProps {
  settings: Settings | null;
  onSave: (fees: Partial<Settings>) => Promise<void>;
  isSaving?: boolean;
}

export function CardFeeSettingsSection({ settings, onSave, isSaving = false }: CardFeeSettingsSectionProps) {
  const { v } = usePreferences();
  const [enableCardFees, setEnableCardFees] = useState(settings?.enableCardFees ?? true);
  const [creditCardRate, setCreditCardRate] = useState<number>(settings?.creditCardRate ?? 3.5);
  const [debitCardRate, setDebitCardRate] = useState<number>(settings?.debitCardRate ?? 1.5);
  const [pixRate, setPixRate] = useState<number>(settings?.pixRate ?? 0.0);
  const [voucherRate, setVoucherRate] = useState<number>(settings?.voucherRate ?? 2.0);
  const [otherFeesRate, setOtherFeesRate] = useState<number>(settings?.otherFeesRate ?? 0.0);
  const [passCardFeeToCustomer, setPassCardFeeToCustomer] = useState(settings?.passCardFeeToCustomer ?? false);
  const [cardFeeCalculationMode, setCardFeeCalculationMode] = useState<'absorb' | 'surcharge'>(
    settings?.cardFeeCalculationMode ?? 'absorb'
  );

  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      if (settings.enableCardFees !== undefined) setEnableCardFees(settings.enableCardFees);
      if (settings.creditCardRate !== undefined) setCreditCardRate(settings.creditCardRate);
      if (settings.debitCardRate !== undefined) setDebitCardRate(settings.debitCardRate);
      if (settings.pixRate !== undefined) setPixRate(settings.pixRate);
      if (settings.voucherRate !== undefined) setVoucherRate(settings.voucherRate);
      if (settings.otherFeesRate !== undefined) setOtherFeesRate(settings.otherFeesRate);
      if (settings.passCardFeeToCustomer !== undefined) setPassCardFeeToCustomer(settings.passCardFeeToCustomer);
      if (settings.cardFeeCalculationMode !== undefined) setCardFeeCalculationMode(settings.cardFeeCalculationMode);
    }
  }, [settings]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      await onSave({
        enableCardFees,
        creditCardRate: Number(creditCardRate) || 0,
        debitCardRate: Number(debitCardRate) || 0,
        pixRate: Number(pixRate) || 0,
        voucherRate: Number(voucherRate) || 0,
        otherFeesRate: Number(otherFeesRate) || 0,
        passCardFeeToCustomer,
        cardFeeCalculationMode
      });
      showToast('✓ Taxas da maquininha salvas com sucesso!');
      setFeedback('Taxas da maquininha salvas com sucesso!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      showActionError(err, 'Não foi possível confirmar o salvamento das taxas.');
    }
  };

  // Exemplo dinâmico para R$ 100,00
  const sampleAmount = 100;
  const sampleCreditDiscount = (sampleAmount * (Number(creditCardRate) || 0)) / 100;
  const sampleCreditNet = sampleAmount - sampleCreditDiscount;

  const sampleDebitDiscount = (sampleAmount * (Number(debitCardRate) || 0)) / 100;
  const sampleDebitNet = sampleAmount - sampleDebitDiscount;

  return (
    <div id="card-fees-settings-container" className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 border-b border-border pb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-palette-1 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-2xs">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">
                Taxas de Cartão & Maquininha ("Taxinha do Cartão")
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Pré-configuradas
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Defina as porcentagens cobradas pela sua operadora de maquininha para calcular seu lucro líquido exato.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={isSaving}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Salvando...' : 'Salvar Taxas'}
        </button>
      </div>

      {feedback && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Toggle Ativar Taxas */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-sm font-bold text-foreground block">
              Considerar descontos de taxa nos relatórios e lucros?
            </span>
            <span className="text-xs text-muted-foreground">
              Quando ativado, o sistema desconta a taxa exata de cada forma de pagamento nas apurações financeiras.
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enableCardFees}
              onChange={(e) => {
                setEnableCardFees(e.target.checked);
                onSave({ enableCardFees: e.target.checked });
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Inputs de Porcentagem das Taxas */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">
            Porcentagens Pré-configuradas da Sua Maquininha
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cartão de Crédito */}
            <div className="p-3.5 rounded-xl border border-border bg-surface">
              <label className="block text-xs font-bold text-foreground mb-1">
                💳 Cartão de Crédito à Vista
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={creditCardRate}
                  onChange={(e) => setCreditCardRate(Number(e.target.value))}
                  onBlur={() => onSave({ creditCardRate: Number(creditCardRate) })}
                  className="w-full border border-border bg-surface text-foreground p-2 pr-7 rounded-lg font-bold text-base focus:ring-1 focus:ring-primary outline-none"
                  placeholder="3.5"
                />
                <span className="absolute right-2.5 top-2 text-muted-foreground font-bold text-sm">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Ex: 3,50% por transação</span>
            </div>

            {/* Cartão de Débito */}
            <div className="p-3.5 rounded-xl border border-border bg-surface">
              <label className="block text-xs font-bold text-foreground mb-1">
                💳 Cartão de Débito
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={debitCardRate}
                  onChange={(e) => setDebitCardRate(Number(e.target.value))}
                  onBlur={() => onSave({ debitCardRate: Number(debitCardRate) })}
                  className="w-full border border-border bg-surface text-foreground p-2 pr-7 rounded-lg font-bold text-base focus:ring-1 focus:ring-primary outline-none"
                  placeholder="1.5"
                />
                <span className="absolute right-2.5 top-2 text-muted-foreground font-bold text-sm">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Ex: 1,50% por transação</span>
            </div>

            {/* PIX */}
            <div className="p-3.5 rounded-xl border border-border bg-surface">
              <label htmlFor="pix-machine-rate" className="block text-xs font-bold text-foreground mb-1">
                {v('payment.pixRate', 'Taxa do Pix na maquininha')}
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  id="pix-machine-rate"
                  value={pixRate}
                  onChange={(e) => setPixRate(Number(e.target.value))}
                  onBlur={() => onSave({ pixRate: Number(pixRate) })}
                  className="w-full border border-border bg-surface text-foreground p-2 pr-7 rounded-lg font-bold text-base focus:ring-1 focus:ring-primary outline-none"
                  placeholder="0.0"
                />
                <span className="absolute right-2.5 top-2 text-muted-foreground font-bold text-sm">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">{v('payment.pixHelp', 'Vale apenas para Pix pago na maquininha; a loja paga essa taxa e o Pix direto na conta não tem taxa.')}</span>
            </div>

            {/* Vale Refeição / Alimentação / Outras */}
            <div className="p-3.5 rounded-xl border border-border bg-surface">
              <label className="block text-xs font-bold text-foreground mb-1">
                🎟️ Vale / Outras Taxas
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={voucherRate}
                  onChange={(e) => setVoucherRate(Number(e.target.value))}
                  onBlur={() => onSave({ voucherRate: Number(voucherRate) })}
                  className="w-full border border-border bg-surface text-foreground p-2 pr-7 rounded-lg font-bold text-base focus:ring-1 focus:ring-primary outline-none"
                  placeholder="2.0"
                />
                <span className="absolute right-2.5 top-2 text-muted-foreground font-bold text-sm">%</span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Alimentação, Refeição, etc.</span>
            </div>
          </div>
        </div>

        {/* Pergunta de Repasse ou Absorção da Taxa */}
        <div className="p-4 rounded-xl bg-palette-1/40 border border-primary/20 space-y-3">
          <div className="flex items-start gap-2.5">
            <Percent className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Como seu comércio lida com a taxinha da maquininha?
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escolha se o comércio absorve a taxa na margem de lucro ou se há acréscimo proporcional.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <label
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                cardFeeCalculationMode === 'absorb'
                  ? 'border-primary bg-surface shadow-xs ring-1 ring-primary'
                  : 'border-border bg-surface/50 hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="fee_mode"
                checked={cardFeeCalculationMode === 'absorb'}
                onChange={() => {
                  setCardFeeCalculationMode('absorb');
                  setPassCardFeeToCustomer(false);
                  onSave({ cardFeeCalculationMode: 'absorb', passCardFeeToCustomer: false });
                }}
                className="mt-1 accent-primary"
              />
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Absorver no Lucro da Loja (Recomendado)
                </span>
                <span className="text-[11px] text-muted-foreground leading-relaxed block mt-0.5">
                  O cliente paga o valor normal da tabela. O sistema calcula a dedução automática para você ver o dinheiro líquido real que cai na sua conta.
                </span>
              </div>
            </label>

            <label
              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                cardFeeCalculationMode === 'surcharge'
                  ? 'border-primary bg-surface shadow-xs ring-1 ring-primary'
                  : 'border-border bg-surface/50 hover:bg-surface'
              }`}
            >
              <input
                type="radio"
                name="fee_mode"
                checked={cardFeeCalculationMode === 'surcharge'}
                onChange={() => {
                  setCardFeeCalculationMode('surcharge');
                  setPassCardFeeToCustomer(true);
                  onSave({ cardFeeCalculationMode: 'surcharge', passCardFeeToCustomer: true });
                }}
                className="mt-1 accent-primary"
              />
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Repassar Taxinha para o Cliente (Acréscimo no Cartão)
                </span>
                <span className="text-[11px] text-muted-foreground leading-relaxed block mt-0.5">
                  {v('payment.surchargeHelp', 'O acréscimo vale só para crédito, débito e voucher. A taxa do Pix na maquininha fica com a loja; Pix direto é sem taxa.')}
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Demonstração Prática Transparente (Simulação em Tempo Real) */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border">
          <span className="text-xs font-bold text-foreground block mb-2">
            Simulação transparente: como fica uma venda de R$ 100,00 com suas taxas atuais:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-surface border border-border/80 flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground block">No Crédito ({creditCardRate}%):</span>
                <span className="text-muted-foreground text-[11px]">Taxinha da maquininha: R$ {sampleCreditDiscount.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Você recebe líquido:</span>
                <strong className="text-emerald-600 font-bold text-sm">R$ {sampleCreditNet.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface border border-border/80 flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground block">No Débito ({debitCardRate}%):</span>
                <span className="text-muted-foreground text-[11px]">Taxinha da maquininha: R$ {sampleDebitDiscount.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Você recebe líquido:</span>
                <strong className="text-emerald-600 font-bold text-sm">R$ {sampleDebitNet.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
