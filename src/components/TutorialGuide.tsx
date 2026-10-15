import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, ChevronLeft, ChevronRight, DollarSign, Lightbulb, Package, ShoppingCart, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

const steps = [
  { title: 'Venda rápida no Caixa', icon: ShoppingCart, url: '/caixa', action: 'Abrir Caixa', items: ['Busque o produto e toque para colocar no carrinho.', 'Confira a quantidade e o formato: unidade, carteira, meia carteira ou maço.', 'Toque em Finalizar Compra e escolha Dinheiro, PIX, Cartão ou Fiado.'], tip: 'Confira o total antes de receber. O estoque só baixa quando a venda é confirmada.' },
  { title: 'Cadastre seus produtos', icon: Package, url: '/estoque', action: 'Abrir Estoque', items: ['Use Novo Produto para cadastrar à mão ou Cadastrar por Foto (IA) para ler o rótulo.', 'Na foto, confira o nome e a categoria. Preencha custo, preço e estoque.', 'Para vários itens, importe o PDF ou a foto do catálogo e revise os produtos antes de salvar.'], tip: 'Nos cigarros, conte o estoque em carteiras: 1 maço vale 10. Preencha só os preços dos formatos que vende.' },
  { title: 'Cuide do Caderno de Fiado', icon: Users, url: '/fiado', action: 'Abrir Fiado', items: ['Na venda, escolha Fiado e selecione o cliente certo.', 'Abra o Caderno de Fiado para conferir quanto cada cliente deve.', 'Quando receber, registre o pagamento para abater a dívida.'], tip: 'Registre cada pagamento na hora, mesmo quando o cliente pagar só uma parte.' },
  { title: 'Confira seus preços e lucro', icon: DollarSign, url: '/precos', action: 'Abrir Preços', items: ['Confira o custo e o preço atual de cada produto.', 'Compare a margem atual com as sugestões de preço.', 'Nos cigarros, confira a margem de cada formato vendido.'], tip: 'Mantenha o custo atualizado. Uma venda alta nem sempre significa um lucro alto.' },
  { title: 'Acompanhe o movimento da loja', icon: BarChart3, url: '/movimentacoes', action: 'Abrir Movimentações', items: ['No Início, confira os resumos de vendas, gastos e produtos.', 'Em Movimentações, acompanhe as entradas e saídas do dinheiro.', 'Revise os números no fim do dia para planejar as compras.'], tip: 'Anote também as compras e despesas para entender quanto sobrou.' },
];

export function TutorialGuide({ onClose, initialStepIndex = 0 }: { onClose: () => void; initialStepIndex?: number }) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(steps.length - 1, Math.trunc(initialStepIndex) || 0)));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reduceMotion = useReducedMotion();
  const step = steps[index];
  const Icon = step.icon;
  useEffect(() => { titleRef.current?.focus(); }, [index]);
  return <section aria-label="Guia do aplicativo" className="flex min-h-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-sm">
    <header className="shrink-0 border-b border-border p-4 sm:p-5">
      <p aria-live="polite" className="mb-2 text-sm font-semibold">Passo {index + 1} de {steps.length}</p>
      <div role="progressbar" aria-label="Progresso do tutorial" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(index + 1) / steps.length * 100}%` }} />
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <motion.div key={index} initial={{ opacity: reduceMotion ? 1 : 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
        <Icon aria-hidden="true" className="mb-3 h-10 w-10 rounded-xl bg-primary/10 p-2 text-primary" />
        <h2 ref={titleRef} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">{step.title}</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">{step.items.map(item => <li key={item}>{item}</li>)}</ol>
        <div className="my-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm"><Lightbulb aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><p><strong>Dica de ouro: </strong>{step.tip}</p></div>
        <Link onClick={onClose} to={step.url} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">{step.action}</Link>
      </motion.div>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <button type="button" onClick={() => setIndex(previous => Math.max(0, previous - 1))} disabled={index === 0} className="flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 text-sm disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Anterior</button>
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-sm text-muted-foreground">Fechar</button>
      <button type="button" onClick={() => index === steps.length - 1 ? onClose() : setIndex(previous => Math.min(steps.length - 1, previous + 1))} className="flex min-h-11 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">{index === steps.length - 1 ? 'Concluir' : 'Próximo'}<ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
    </footer>
  </section>;
}
