import { showToast, showActionError } from '../lib/actionFeedback';
import { useState, useEffect } from 'react';
import { 
  MessageSquare, Star, Send, CheckCircle2, AlertCircle, 
  HelpCircle, ThumbsUp, Bug, Lightbulb, MessageCircle, Clock, ShieldCheck
} from 'lucide-react';
import { submitFeedback, subscribeFeedbacks } from '../lib/api';
import { Feedback } from '../types';
import { format } from 'date-fns';

interface FeedbackSectionProps {
  storeName?: string;
  defaultContact?: string;
  className?: string;
}

export function FeedbackSection({ storeName, defaultContact = '', className = '' }: FeedbackSectionProps) {
  const [category, setCategory] = useState<'suggestion' | 'bug' | 'praise' | 'question' | 'other'>('suggestion');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(defaultContact);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbacksHistory, setFeedbacksHistory] = useState<Feedback[]>([]);

  useEffect(() => {
    const unsub = subscribeFeedbacks(setFeedbacksHistory);
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMessage('Por favor, escreva sua mensagem antes de enviar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await submitFeedback({
        category,
        rating,
        message: message.trim(),
        contact: contact.trim() || undefined,
        storeName: storeName || undefined
      });

      showToast('✓ Feedback enviado com sucesso!');
      setSubmitSuccess(true);
      setMessage('');
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 6000);
    } catch (err: any) {
      showActionError(err, 'Não foi possível confirmar o envio. Confira antes de repetir.');
      setErrorMessage(
        err?.message || 'Não foi possível enviar seu feedback agora. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const CATEGORY_OPTIONS: { id: 'suggestion' | 'bug' | 'praise' | 'question' | 'other'; label: string; icon: any; color: string }[] = [
    { id: 'suggestion', label: 'Sugestão', icon: Lightbulb, color: 'text-amber-500 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40' },
    { id: 'praise', label: 'Elogio', icon: ThumbsUp, color: 'text-emerald-500 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40' },
    { id: 'bug', label: 'Problema / Erro', icon: Bug, color: 'text-rose-500 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40' },
    { id: 'question', label: 'Dúvida de Uso', icon: HelpCircle, color: 'text-blue-500 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40' },
    { id: 'other', label: 'Outro', icon: MessageSquare, color: 'text-purple-500 border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40' },
  ];

  return (
    <div id="feedback-section-container" className={`bg-surface border border-border rounded-2xl p-6 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-palette-1 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-2xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Seu Feedback sobre o Aplicativo
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Canal Direto
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Diga o que você está achando, envie sugestões de melhorias ou relate qualquer dificuldade no dia a dia.
            </p>
          </div>
        </div>
      </div>

      {submitSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3 text-emerald-900 dark:text-emerald-200 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold">Feedback enviado com sucesso! Muito obrigado!</h3>
            <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-1">
              Sua opinião foi salva e é lida diretamente pela equipe para aperfeiçoar o aplicativo para o seu comércio.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3 text-red-900 dark:text-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Rating Stars */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">
            Como você avalia sua experiência com o app até aqui?
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = (hoverRating !== null ? hoverRating : rating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 rounded-lg hover:bg-muted transition-transform hover:scale-110 cursor-pointer"
                  title={`${star} de 5 estrelas`}
                >
                  <Star
                    className={`w-7 h-7 transition-colors ${
                      active ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              );
            })}
            <span className="text-xs font-bold text-muted-foreground ml-2">
              {rating === 5 ? '⭐ Excelente' : rating === 4 ? '👍 Muito bom' : rating === 3 ? '👌 Regular' : rating === 2 ? '👎 Precisa melhorar' : '⚠️ Ruim'}
            </span>
          </div>
        </div>

        {/* Categories */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">
            Qual o tipo do seu feedback?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CATEGORY_OPTIONS.map((cat) => {
              const isSelected = category === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? `${cat.color} font-bold ring-2 ring-primary/30 shadow-xs`
                      : 'border-border bg-surface hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Sua Mensagem ou Sugestão *
          </label>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Conte em detalhes: o que está funcionando bem? O que você gostaria que tivesse no sistema? Encontrou alguma dificuldade?"
            className="w-full p-3 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm leading-relaxed"
          />
        </div>

        {/* Contact Input (Optional) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Seu nome ou telefone (Opcional)
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Ex: João (11) 99999-9999"
              className="w-full p-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Caso queira que entremos em contato para ajudar ou tirar dúvidas.
            </p>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className="w-full py-2.5 px-5 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 shadow-xs active:scale-98 text-sm"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Enviando...' : 'Enviar Feedback'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Histórico de Feedbacks Enviados */}
      {feedbacksHistory.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Seus Feedbacks Anteriores ({feedbacksHistory.length})
            </h3>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {feedbacksHistory.map((fb) => (
              <div 
                key={fb.id || String(fb.createdAt)} 
                className="p-3 rounded-xl bg-muted/40 border border-border/80 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground capitalize">
                      {fb.category === 'suggestion' ? '💡 Sugestão' : fb.category === 'praise' ? '👍 Elogio' : fb.category === 'bug' ? '🐛 Problema' : fb.category === 'question' ? '❓ Dúvida' : '💬 Outro'}
                    </span>
                    {fb.rating && (
                      <span className="text-amber-500 font-bold">
                        {'★'.repeat(fb.rating)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(fb.createdAt), "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
                  {fb.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
