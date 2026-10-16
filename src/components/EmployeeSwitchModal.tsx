import { showToast, showActionError } from '../lib/actionFeedback';
import React, { useState } from 'react';
import { 
  Users, LogIn, LogOut, Plus, X, Shield, Clock, 
  Check, AlertCircle, Phone, Lock, Sparkles, Trash2, 
  Edit3, Eye, EyeOff, KeyRound, AlertTriangle, UserCheck,
  RefreshCw, ChevronRight, ArrowLeft, ShieldCheck, Mail
} from 'lucide-react';
import { useEmployee } from '../lib/employeeContext';
import { Employee } from '../types';

const PRESET_ROLES = [
  'Operador de Caixa',
  'Atendente',
  'Balconista',
  'Repositor de Estoque',
  'Gerente de Loja',
  'Vendedor',
  'Auxiliar Geral'
];

const PRESET_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-cyan-500'
];

export const EmployeeSwitchModal: React.FC = () => {
  const { 
    currentEmployee, 
    employees, 
    loginEmployee, 
    logoutEmployee, 
    createEmployee, 
    editEmployee,
    removeEmployee,
    isSwitchModalOpen, 
    closeSwitchModal,
    activeShiftDuration 
  } = useEmployee();

  // Navigation states: 'list' | 'create' | 'edit' | 'verify_pin'
  const [modalMode, setModalMode] = useState<'list' | 'create' | 'edit' | 'verify_pin'>('list');
  
  // Verification State (Password / Senha)
  const [selectedToLogin, setSelectedToLogin] = useState<Employee | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [settingNewPinForEmp, setSettingNewPinForEmp] = useState(false);

  // Delete State
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Form States (Create / Edit)
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState(PRESET_ROLES[0]);
  const [formPassword, setFormPassword] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [showFormPassword, setShowFormPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  if (!isSwitchModalOpen) return null;

  // -------------------------------------------------------------------------
  // INICIAR PROCESSO DE MUDANÇA DE FUNCIONÁRIO (EXIGE SENHA)
  // -------------------------------------------------------------------------
  const handleStartSwitch = (emp: Employee) => {
    setSelectedToLogin(emp);
    setPasswordInput('');
    setPasswordError('');
    setShowPassword(false);
    // Se o funcionário ainda não tem senha configurada no banco
    const hasPin = Boolean(emp.pin && emp.pin.trim().length > 0);
    setSettingNewPinForEmp(!hasPin);
    setModalMode('verify_pin');
  };

  const handleConfirmLogin = async () => {
    if (!selectedToLogin) return;

    if (!passwordInput.trim()) {
      setPasswordError('Por favor, informe a senha para autorizar a troca.');
      return;
    }

    let didStartRequest = false;
    setIsVerifying(true);
    setPasswordError('');

    try {
      // Se o funcionário já tem senha, valida estritamente
      if (selectedToLogin.pin && selectedToLogin.pin.trim().length > 0) {
        if (selectedToLogin.pin.trim() !== passwordInput.trim()) {
          setPasswordError('Senha incorreta! Digite a senha individual cadastrada deste funcionário.');
          setIsVerifying(false);
          return;
        }
      } else {
        // Se ainda não tinha senha (legado), salva a senha informada agora
        if (selectedToLogin.id) {
          didStartRequest = true;
          await editEmployee(selectedToLogin.id, { pin: passwordInput.trim() });
        }
      }

      didStartRequest = true;
      await loginEmployee(selectedToLogin);
      showToast('✓ Operador alterado com sucesso!');
      setFeedbackSuccess(`Operador alterado para ${selectedToLogin.name}! Turno iniciado.`);
      setTimeout(() => setFeedbackSuccess(null), 3000);
      setSelectedToLogin(null);
      setPasswordInput('');
      setModalMode('list');
    } catch (err: any) {
      console.error('Erro ao efetuar login de funcionário:', err);
      showActionError(err, 'Não foi possível confirmar a troca de operador. Confira a equipe antes de repetir.');
    } finally {
      setIsVerifying(false);
      if (didStartRequest) closeSwitchModal();
    }
  };

  // Teclado numérico / rápido para PIN
  const handleKeypadPress = (val: string) => {
    if (val === 'backspace') {
      setPasswordInput(prev => prev.slice(0, -1));
    } else if (val === 'clear') {
      setPasswordInput('');
    } else {
      if (passwordInput.length < 20) {
        setPasswordInput(prev => prev + val);
      }
    }
    setPasswordError('');
  };

  // -------------------------------------------------------------------------
  // FORMULÁRIO DE ADICIONAR / EDITAR FUNCIONÁRIO
  // -------------------------------------------------------------------------
  const handleOpenCreate = () => {
    setFormName('');
    setFormRole(PRESET_ROLES[0]);
    setFormPassword('');
    setFormEmail('');
    setFormPhone('');
    setFormColor(PRESET_COLORS[0]);
    setFormError('');
    setEditingEmpId(null);
    setModalMode('create');
  };

  const handleOpenEdit = (emp: Employee) => {
    setFormName(emp.name);
    setFormRole(emp.role || PRESET_ROLES[0]);
    setFormPassword(emp.pin || '');
    setFormEmail(emp.email || '');
    setFormPhone(emp.phone || '');
    setFormColor(emp.color || PRESET_COLORS[0]);
    setFormError('');
    setEditingEmpId(emp.id || null);
    setModalMode('edit');
  };

  const handleSubmitEmployeeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Por favor, informe o nome do funcionário.');
      return;
    }

    if (!formPassword.trim()) {
      setFormError('A senha é obrigatória para cada funcionário para garantir segurança ao mudar de operador.');
      return;
    }

    if (formPassword.trim().length < 3) {
      setFormError('A senha deve ter no mínimo 3 caracteres ou números.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const cleanEmail = formEmail.trim().toLowerCase() || undefined;
      const cleanPhone = formPhone.trim() || undefined;
      const cleanPin = formPassword.trim();

      if (modalMode === 'create') {
        // Criar novo funcionário
        await createEmployee({
          name: formName.trim(),
          role: formRole,
          pin: cleanPin,
          email: cleanEmail,
          phone: cleanPhone,
          color: formColor,
          isActive: true
        });

        setFeedbackSuccess(`Funcionário "${formName.trim()}" adicionado com sucesso!`);
        setTimeout(() => setFeedbackSuccess(null), 3500);
        setModalMode('list');
      } else if (modalMode === 'edit' && editingEmpId) {
        // Atualizar funcionário existente
        await editEmployee(editingEmpId, {
          name: formName.trim(),
          role: formRole,
          pin: cleanPin,
          email: cleanEmail,
          phone: cleanPhone,
          color: formColor
        });

        setFeedbackSuccess(`Dados e senha de "${formName.trim()}" atualizados!`);
        setTimeout(() => setFeedbackSuccess(null), 3500);
        setModalMode('list');
      }
      showToast('✓ Dados do funcionário salvos com sucesso!');
    } catch (err: any) {
      console.error('Error saving employee:', err);
      showActionError(err, 'Não foi possível salvar o funcionário. Confira a equipe antes de repetir.');
    } finally {
      setIsSubmitting(false);
      closeSwitchModal();
    }
  };

  // -------------------------------------------------------------------------
  // EXCLUIR FUNCIONÁRIO
  // -------------------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!employeeToDelete?.id) return;
    setIsSubmitting(true);
    try {
      const deletedName = employeeToDelete.name;
      await removeEmployee(employeeToDelete.id);
      showToast('✓ Funcionário removido com sucesso!');
      setEmployeeToDelete(null);
      setFeedbackSuccess(`Funcionário "${deletedName}" foi excluído da equipe.`);
      setTimeout(() => setFeedbackSuccess(null), 3500);
    } catch (err: any) {
      console.error('Error deleting employee:', err);
      showActionError(err, 'Não foi possível remover o funcionário. Confira a equipe antes de repetir.');
    } finally {
      setEmployeeToDelete(null);
      setIsSubmitting(false);
      closeSwitchModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-surface border border-border rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl relative my-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar Modal */}
        <button
          onClick={closeSwitchModal}
          className="absolute top-4 right-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-palette-1 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-xs">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-heading text-foreground">
                Modo do Funcionário & Equipe
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adicione e exclua funcionários. Cada colaborador possui senha para mudar de operador.
            </p>
          </div>
        </div>

        {/* Feedback Alert Toast */}
        {feedbackSuccess && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CARD DO FUNCIONÁRIO ATUAL EM TURNO / STATUS OPERACIONAL */}
        {/* ========================================================================= */}
        {modalMode === 'list' && (
          currentEmployee ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={['notranslate', 'normal-case', (`w-11 h-11 rounded-2xl ${currentEmployee.color || 'bg-emerald-500'} text-white font-bold flex items-center justify-center shadow-xs text-base shrink-0`)].filter(Boolean).join(' ')} translate="no">
                  {currentEmployee.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground text-sm sm:text-base truncate notranslate normal-case" translate="no">
                      {currentEmployee.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white tracking-wide uppercase">
                      Modo Funcionário Ativo
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span>{currentEmployee.role || 'Operador'}</span>
                    {activeShiftDuration && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                          <Clock className="w-3 h-3" />
                          {activeShiftDuration} em turno
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={logoutEmployee}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Encerrar turno e voltar ao modo proprietário"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair / Voltar ao Proprietário</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-palette-1/50 border border-primary/20 mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Modo Proprietário / Gerente Ativo
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Selecione um funcionário abaixo e digite a senha dele para iniciar o turno de atendimento.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TELA DE DIGITAÇÃO DE SENHA PARA MUDAR DE FUNCIONÁRIO (VERIFY PIN) */}
        {/* ========================================================================= */}
        {modalMode === 'verify_pin' && selectedToLogin && (
          <div className="p-5 rounded-2xl bg-palette-1 border border-primary/30 mb-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3 border-b border-primary/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={['notranslate', 'normal-case', (`w-9 h-9 rounded-xl ${selectedToLogin.color || 'bg-primary'} text-white font-bold flex items-center justify-center text-sm shadow-2xs shrink-0`)].filter(Boolean).join(' ')} translate="no">
                  {selectedToLogin.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="notranslate normal-case" translate="no">Mudar para: {selectedToLogin.name}</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{selectedToLogin.role}</p>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => {
                  setSelectedToLogin(null);
                  setModalMode('list');
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                Voltar
              </button>
            </div>

            <div className="mb-4">
              <p className="text-xs text-foreground/90 font-medium notranslate normal-case" translate="no">
                {settingNewPinForEmp 
                  ? '🔒 Este colaborador ainda não tem senha configurada. Defina uma senha para ele agora para confirmar a troca:'
                  : `🔑 Digite a senha individual de ${selectedToLogin.name} para confirmar a mudança de operador:`}
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmLogin()}
                  placeholder="Digite a senha do funcionário..."
                  autoFocus
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-border bg-surface text-foreground text-base font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  title={showPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {passwordError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5 animate-in shake">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {/* Teclado numérico rápido para agilidade */}
              <div className="pt-1">
                <div className="grid grid-cols-3 gap-1.5 max-w-[260px] mx-auto mb-2">
                  {['1','2','3','4','5','6','7','8','9','clear','0','backspace'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleKeypadPress(key)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        key === 'clear'
                          ? 'border-border text-muted-foreground hover:bg-muted text-[10px]'
                          : key === 'backspace'
                          ? 'border-border text-muted-foreground hover:bg-muted text-[11px]'
                          : 'border-border bg-surface hover:bg-palette-1 text-foreground shadow-2xs active:scale-95'
                      }`}
                    >
                      {key === 'clear' ? 'Limpar' : key === 'backspace' ? '⌫' : key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botão de redefinir senha caso o funcionário tenha esquecido */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenEdit(selectedToLogin);
                  }}
                  className="text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  Esqueceu a senha? Redefinir senha deste funcionário
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedToLogin(null);
                    setModalMode('list');
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isVerifying || !passwordInput.trim()}
                  onClick={handleConfirmLogin}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Confirmar e Entrar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CONFIRMAÇÃO DE EXCLUSÃO DE FUNCIONÁRIO */}
        {/* ========================================================================= */}
        {employeeToDelete && (
          <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 mb-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-sm mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="notranslate normal-case" translate="no">Excluir Funcionário: {employeeToDelete.name}?</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Tem certeza que deseja remover <strong className="notranslate normal-case" translate="no">{employeeToDelete.name}</strong> ({employeeToDelete.role}) da equipe? Ele será excluído permanentemente do sistema e não terá mais acesso às trocas de operador.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Excluindo...' : 'Sim, Excluir Funcionário'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FORMULÁRIO DE ADICIONAR / EDITAR FUNCIONÁRIO */}
        {/* ========================================================================= */}
        {(modalMode === 'create' || modalMode === 'edit') && (
          <form onSubmit={handleSubmitEmployeeForm} className="space-y-4 mb-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                {modalMode === 'create' ? <Plus className="w-4 h-4 text-primary" /> : <Edit3 className="w-4 h-4 text-primary" />}
                {modalMode === 'create' ? 'Adicionar Novo Funcionário' : `Editar ${formName || 'Funcionário'}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode('list')}
                className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Voltar à lista
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Nome do Funcionário */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Nome do Funcionário *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Carlos Caixa, Maria Atendente..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
              />
            </div>

            {/* Cargo e Senha Individual Obrigatória */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Função / Cargo *
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium cursor-pointer"
                >
                  {PRESET_ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                  <option value="Outro">Outro...</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3 text-primary" />
                    Senha do Funcionário *
                  </label>
                  <span className="text-[10px] font-bold text-primary bg-palette-1 px-1.5 py-0.2 rounded">
                    Obrigatória
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showFormPassword ? 'text' : 'password'}
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Defina a senha..."
                    className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-border bg-surface text-foreground text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(!showFormPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={showFormPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showFormPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  Exigida sempre para mudar para este colaborador
                </span>
              </div>
            </div>

            {/* E-mail (Opcional - para sub-conta) */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                E-mail do Funcionário (Opcional - para login direto pelo Google)
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="funcionario@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Telefone (Opcional) */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Telefone (Opcional)
              </label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="(11) 98765-4321"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Cor de Identificação */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Cor do Crachá de Identificação
              </label>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full ${c} transition-all cursor-pointer flex items-center justify-center text-white ${
                      formColor === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {formColor === c && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Botões do Formulário */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalMode('list')}
                className="flex-1 py-2.5 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !formName.trim() || !formPassword.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting 
                  ? 'Salvando...' 
                  : modalMode === 'create' 
                  ? 'Salvar e Adicionar Funcionário' 
                  : 'Salvar Alterações e Senha'}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* LISTA DE FUNCIONÁRIOS (ADICIONAR, EXCLUIR E TROCAR COM SENHA) */}
        {/* ========================================================================= */}
        {modalMode === 'list' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span>Equipe Cadastrada ({employees.length})</span>
              </span>
              
              {/* Botão Adicionar Funcionário */}
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-xs active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Funcionário</span>
              </button>
            </div>

            {employees.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-border rounded-2xl bg-muted/20">
                <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">
                  Nenhum funcionário cadastrado ainda
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-xs mx-auto">
                  Adicione colaboradores com senha individual para que cada um opere o caixa e tenha suas ações registradas.
                </p>
                <button
                  onClick={handleOpenCreate}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Primeiro Funcionário
                </button>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {employees.map((emp) => {
                  const isCurrent = currentEmployee?.id === emp.id;
                  const hasPassword = Boolean(emp.pin && emp.pin.trim().length > 0);

                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        if (!isCurrent) {
                          handleStartSwitch(emp);
                        }
                      }}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent 
                          ? 'border-emerald-500/50 bg-emerald-500/5 shadow-2xs'
                          : 'border-border bg-surface hover:border-primary/50 hover:bg-muted/30 cursor-pointer shadow-2xs group'
                      }`}
                    >
                      {/* Avatar e Dados do Funcionário */}
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <div className={['notranslate', 'normal-case', (`w-10 h-10 rounded-2xl ${emp.color || 'bg-primary'} text-white font-bold flex items-center justify-center text-sm shrink-0 shadow-2xs group-hover:scale-105 transition-transform`)].filter(Boolean).join(' ')} translate="no">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <p className="text-sm font-bold text-foreground truncate flex items-center gap-1.5">
                            <span className="notranslate normal-case" translate="no">{emp.name}</span>
                            {isCurrent && (
                              <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                                Ativo
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                            <span>{emp.role}</span>
                            <span>•</span>
                            <span 
                              className={`flex items-center gap-1 text-[11px] font-medium ${
                                hasPassword 
                                  ? 'text-emerald-700 dark:text-emerald-300' 
                                  : 'text-amber-700 dark:text-amber-300'
                              }`}
                              title={hasPassword ? "Protegido por senha individual" : "Sem senha configurada"}
                            >
                              <Lock className="w-3 h-3" />
                              {hasPassword ? 'Com senha' : 'Sem senha'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ações: Editar, Excluir e Mudar Funcionário com Senha */}
                      <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* Botão Editar Senha e Dados */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(emp)}
                          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          title="Editar dados e senha deste funcionário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Botão Excluir Funcionário */}
                        <button
                          type="button"
                          onClick={() => setEmployeeToDelete(emp)}
                          className="p-2 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Excluir funcionário da equipe"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Botão de Trocar / Entrar com Senha */}
                        {isCurrent ? (
                          <span className="ml-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15">
                            <Check className="w-3.5 h-3.5" />
                            Em Turno
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartSwitch(emp)}
                            className="ml-1 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                            title="Mudar para este funcionário exigindo senha"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Mudar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-primary" />
            Cada funcionário possui senha para troca de operador
          </span>
          <button
            onClick={closeSwitchModal}
            className="font-semibold text-foreground hover:underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
