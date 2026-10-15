# Modos de linguagem e visualização

Os três modos alteram o vocabulário da interface, sem mudar cálculos, permissões ou dados cadastrados:

| Modo | Objetivo | Exemplos |
| --- | --- | --- |
| Técnico / Profissional | Termos de gestão com significado preciso | Mercadoria, ponto de pedido, contas a receber |
| Neutro / Comercial | Linguagem habitual do comércio | Produto, estoque mínimo, fiado |
| Simples / Descomplicado | Ações diretas e palavras do dia a dia | Item, quando pedir mais, quanto falta receber |

Selecionar Simples ativa também a visualização compacta. Selecionar outro modo retorna à visualização detalhada; o botão de visualização pode ser usado separadamente depois. A preferência de linguagem e o estado da visualização são enviados juntos para salvar no Supabase. O cache do navegador é opcional, não substitui a configuração recebida da nuvem.

O menu, Estoque, Caixa/carrinho, Compras, Preços, Início, Fiado, Movimentações e Ajuda consultam o contexto compartilhado. A troca atualiza os textos sem recarregar a página. Estoque, gráficos, detalhamento financeiro e histórico do rodapé também reagem às mudanças da visualização compacta durante a sessão. Textos comuns podem ser iguais nos três modos: clareza não exige inventar três nomes para cada botão. Nomes de produtos, descrições históricas e conteúdo escrito pelo usuário não são regravados ou traduzidos.

Em Ajustes, o modo simples mostra descrições menores e recolhe as integrações de planilha e segurança em Mais opções. O relatório respeita o tema claro/escuro. O histórico no rodapé começa recolhido e permanece atualizando os registros recebidos, inclusive quando há uma notificação de registro novo. Os filtros de Movimentações ficam disponíveis sob demanda no modo simples.

## Significado dos indicadores

Total vendido inclui vendas fiadas e não equivale a dinheiro recebido. O indicador vendas menos compras compara valores registrados no período; não é lucro nem saldo disponível. Esses rótulos e avisos são consistentes em Ajustes, Início e gráfico mensal. O modo simples evita promessas como dinheiro limpo no bolso. Os cálculos financeiros não foram alterados nesta revisão.

## Validação

`tests/languageModes.test.mjs` verifica os três modos, atualização por evento da nuvem sem eco de gravação, par de preferências salvo, retorno de cache inválido, atualização do histórico recolhido e seleção/autosalvamento em Ajustes. A suíte de modais usa agora o mesmo provider exigido pela tela Fiado. Esses são testes locais com serviços simulados, sem comprovação de dispositivos reais em produção.
