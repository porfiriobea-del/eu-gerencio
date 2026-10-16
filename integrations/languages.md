# Idiomas da interface

O padrão é sempre pt-BR, sem consultar navigator.language. O valor legado pt é
normalizado para pt-BR. Ajustes oferece Português (Brasil), English e Español.
A mudança é imediata e atualiza html.lang, inclusive a proteção contra alteração
pelo tradutor automático.

A preferência usa app_lang no aparelho e app_lang:<UID> por conta. A chave
app_lang_user impede que outra conta herde a escolha anterior. A escolha antiga
do aparelho é migrada uma vez. No Supabase a tabela eu_user_preferences usa
user_id, sem vínculo com loja: proprietário e funcionário escolhem separadamente.
Uma mudança local pendente de envio não é substituída por resposta antiga da nuvem.

## Ativação no Supabase

Execute supabase/migrations/20261016_user_language.sql no SQL Editor, após a
migração cloud_source_of_truth. As políticas permitem consultar e gravar somente
a preferência da identidade autenticada. Sem essa migração, o idioma continua
salvo no aparelho, mas não sincroniza para outro aparelho.

## Dicionários e conteúdo

src/lib/preferencesContext.tsx contém o vocabulário português por modo e as
traduções gerais de navegação/configurações. src/lib/interfaceLanguages.ts contém
inglês e espanhol, cada um com modos basic, neutral e technical. Os textos estáticos
migrados das quatro telas usam chaves ui.* e fallback português explícito.

A resolução é tradução do modo escolhido → texto português do modo → fallback
português fornecido. Uma chave desconhecida sem texto não aparece na tela.
Somente rótulos de interface passam pelo dicionário. Nomes e categorias cadastrados,
funcionários, clientes, observações e histórico não são traduzidos nem regravados.

O idioma não altera a moeda da loja: BRL é o padrão e continua aparecendo como R$
em inglês e espanhol. A seleção explícita de USD/EUR da funcionalidade anterior
permanece independente. Datas e números usam pt-BR, en-US ou es-ES.

## Cobertura e pendências desta etapa

Traduzidos: navegação; títulos e indicadores principais do Início/Estoque/Caixa;
ações principais de estoque, busca, importação, duplicados e salvamento;
títulos de pagamento, dinheiro/cartão, total e finalização do carrinho;
idiomas, títulos de personalização e dados da loja; vocabulário principal dos
três modos e textos gerais de Ajustes.

Ainda usam português quando não há tradução:
- Início: banners de boas-vindas, explicações longas, parte dos gráficos,
  exportação por período e detalhes secundários de vendas.
- Caixa: dicas guiadas, validações/toasts, fechamento/conferência de caixa,
  textos dinâmicos de confirmação, descrição de formatos de venda e parte de
  pagamentos e cadastro de fiado.
- Estoque: formulários avançados, explicações de custos, sugestões de compra,
  mensagens dinâmicas, histórico, rótulos de unidades e revisão completa de catálogo.
- Ajustes: exemplos e descrições longas dos modos, equipe, segurança, integrações,
  movimentações, feedback, relatórios e mensagens de confirmação/erro.
- Componentes compartilhados: câmera, importação, gráficos e exportadores ainda
  possuem textos portugueses além dos rótulos centrais traduzidos.
- Demais telas (Compras, Fiado, Precificação, Movimentações, Tutorial e cadastro):
  vocabulário compartilhado traduzido, mas a tradução completa ainda está pendente.

Não há tradução automática de conteúdo pelo navegador ou pelo Gemini.
