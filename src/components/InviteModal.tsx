import {formatTeamInvitation,isInvalidTemporaryPin,invitationStoreName} from '../lib/teamInvitation';
import {usePreferences} from '../lib/preferencesContext';
import { showToast, showActionError } from '../lib/actionFeedback';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Mail, CheckCircle2, UserPlus, Phone, Shield, 
  Copy, Check, Info, Sparkles, Link as LinkIcon,
  Lock, Eye, EyeOff
} from 'lucide-react';
import { recordMovement, createTeamInvitation } from '../lib/api';

interface InviteModalProps {
  isOpen: boolean;
  storeName?: string;
  onClose: () => void;
  onEmployeeAdded?: () => void;
}

const PRESET_ROLES = [
  'Funcionário',
  'Operador de Caixa',
  'Atendente',
  'Repositor de Estoque',
  'Gerente de Loja',
  'Auxiliar Geral'
];

export function InviteModal({ isOpen, onClose, onEmployeeAdded, storeName: commerce }: InviteModalProps) {
  const {v}=usePreferences();
  const feedbackTimer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>()=>clearTimeout(feedbackTimer.current),[]);
  const [name, setName] = useState('');
  const [role, setRole] = useState(PRESET_ROLES[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLinkOnly, setCopiedLinkOnly] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleRegisterAndSend = async (method: 'email' | 'copy' | 'linkOnly') => {
    if (!name.trim()) {
      setErrorMessage('Por favor, informe o nome do funcionário.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Por favor, informe um e-mail válido para o convite.');
      return;
    }

    if(isInvalidTemporaryPin(pin)){setErrorMessage(v('team.temporaryPinLength'));return;}
    setErrorMessage('');
    setIsSubmitting(true);

    let registered = false;
    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Cria o convite oficial de equipe com URL única de sub-conta
      const { inviteId, inviteUrl, storeName } = await createTeamInvitation({
        email: cleanEmail,
        name: name.trim(),
        role,
        phone: phone.trim() || undefined,
        pin: pin.trim() || undefined
      });

      setGeneratedUrl(inviteUrl);

      // 3. Registra no histórico de movimentações
      recordMovement({
        timestamp: Date.now(),
        employeeId: 'owner',
        employeeName: 'Proprietário',
        employeeRole: 'Administrador',
        type: 'manual_entry',
        description: `Convidou novo colaborador ${name.trim()} (${role}). Vai entrar pelo e-mail que foi convidado (${cleanEmail}) na equipe de ${storeName}.`,
        entityId: inviteId,
        entityName: name.trim(),
        notes: `Convite enviado para ${cleanEmail} (Link: ${inviteUrl})`
      }).catch(err => console.warn('Movement log warning:', err));

      if (onEmployeeAdded) onEmployeeAdded();

      const invitation = formatTeamInvitation({name,role,email:cleanEmail,pin,storeName,url:inviteUrl},method==='email'?'email':'whatsapp');
      const text=invitation.body;
      registered = true;
      showToast('✓ Convite cadastrado com sucesso!');
      setIsSubmitting(false);
      handleReset();

      if (method === 'email') {
        const subject = encodeURIComponent(invitation.subject);
        const body = encodeURIComponent(text);
        window.location.href = `mailto:${cleanEmail}?subject=${subject}&body=${body}`;
      } else if (method === 'copy') {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current=setTimeout(() => setCopied(false), 3000);
      } else if (method === 'linkOnly') {
        await navigator.clipboard.writeText(inviteUrl);
        setCopiedLinkOnly(true);
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current=setTimeout(() => setCopiedLinkOnly(false), 3000);
      }


    } catch (err: any) {
      console.error('Error inviting employee:', err);
      if (registered) showToast('Convite cadastrado. Não foi possível concluir o compartilhamento; confira a equipe.', 'warning');
      else showActionError(err, 'Não foi possível concluir o convite. Confira a equipe antes de tentar novamente.');
    } finally {
      setIsSubmitting(false);
      if (!registered) handleReset();
    }
  };

  const handleReset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPin('');
    setRole(PRESET_ROLES[0]);
    setGeneratedUrl('');
    setSentSuccess(false);
    setErrorMessage('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden z-10 my-8"
          >
            {/* Header */}
            <div className="p-6 border-b border-border bg-muted/30 flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-xs">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold font-heading text-foreground">Convidar Equipe</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v('team.inviteHelp').replace('{store}',invitationStoreName(commerce))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!sentSuccess ? (
                <div className="space-y-4">
                  {/* Banner de instrução explícita solicitada pelo usuário */}
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <p className="font-bold">Aviso importante de acesso:</p>
                      <p className="mt-0.5">
                        {v('team.exactEmail')}
                      </p>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold">
                      {errorMessage}
                    </div>
                  )}

                  {/* Nome do funcionário */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      Nome do Funcionário / Colaborador *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Carlos Oliveira, Maria Atendente..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:outline-none"
                    />
                  </div>

                  {/* Cargo / Função */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5">
                        Cargo / Função no Comércio
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm font-semibold focus:ring-2 focus:ring-primary/40 focus:outline-none cursor-pointer"
                      >
                        {PRESET_ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    <p className="text-xs text-muted-foreground">{v('team.temporaryPinHelp')}</p>
                    {/* Senha Individual do Funcionário */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-foreground flex items-center gap-1">
                          <Lock className="w-3 h-3 text-primary" />
                          Senha de Acesso / PIN *
                        </label>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          para troca de turno
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder={v('team.temporaryPin')}
                          title={v('team.temporaryPinHelp')}
                          minLength={4}
                          maxLength={64}
                          className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-border bg-surface text-foreground text-sm font-mono tracking-wider focus:ring-2 focus:ring-primary/40 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                          title={showPin ? "Ocultar senha" : "Ver senha"}
                        >
                          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* E-mail do convidado com indicação explícita */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-foreground">
                        E-mail do Convidado *
                      </label>
                      <span className="text-[11px] font-semibold text-primary">
                        vai entrar por este e-mail
                      </span>
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email.do.funcionario@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:outline-none"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {v('team.exactEmail')}
                    </p>
                  </div>

                  {/* Telefone */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1.5">
                      Telefone (Opcional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:outline-none"
                    />
                  </div>

                  {/* Botões de Ação para Envio do Convite */}
                  <div className="pt-3 border-t border-border space-y-2">
                    <span className="block text-xs font-bold text-foreground">
                      Escolha como enviar o convite:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

                      <button
                        type="button"
                        disabled={isSubmitting || !name.trim() || !email.trim()}
                        onClick={() => handleRegisterAndSend('email')}
                        className="w-full py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        <Mail className="w-4 h-4" />
                        <span>Convidar por E-mail</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting || !name.trim() || !email.trim()}
                      onClick={() => handleRegisterAndSend('copy')}
                      className="w-full py-2 px-3 rounded-xl border border-border hover:bg-muted text-foreground font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Mensagem de Convite Copiada!' : 'Cadastrar e Copiar Texto do Convite'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      Funcionário Cadastrado com Sucesso!
                    </h3>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                      {name} ({role})
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 text-left max-w-md w-full">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Como o colaborador vai acessar:
                    </p>
                    <p>
                      {v('team.exactEmail')} <span className="font-mono font-bold notranslate" translate="no">{email}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {v('team.exactEmail')}
                    </p>
                  </div>

                  {generatedUrl && (
                    <div className="w-full max-w-md bg-muted/60 p-3.5 rounded-2xl border border-border text-left space-y-2">
                      <span className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Link Oficial de Convite (Sub-conta):
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={generatedUrl}
                          className="flex-1 bg-surface border border-border px-3 py-1.5 rounded-xl text-xs font-mono text-foreground truncate focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedUrl);
                            setCopiedLinkOnly(true);
                            clearTimeout(feedbackTimer.current);
                            feedbackTimer.current=setTimeout(() => setCopiedLinkOnly(false), 3000);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold flex items-center gap-1 hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                          title="Copiar link"
                        >
                          {copiedLinkOnly ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedLinkOnly ? 'Copiado!' : 'Copiar Link'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 w-full pt-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all cursor-pointer shadow-md"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
