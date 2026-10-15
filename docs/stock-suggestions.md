# Sugestões de mínimo e máximo

Em Estoque, abra Novo Produto ou edite um produto. Na parte de quantidades, informe a média diária estimada e o prazo do fornecedor. O painel de sugestão permite configurar cobertura entre compras, inicialmente sete dias. O botão Usar limites sugeridos preenche o formulário; Salvar Produto confirma os limites no Supabase. A aplicação da sugestão não altera stock nem gera entrada de mercadorias.

A base é a média cadastrada, não um cálculo automático do histórico de vendas. É possível usar uma estimativa quando o produto ainda não tem histórico. Média zero, negativa ou não finita não produz sugestão.

- Reserva de segurança = média diária × prazo de entrega × 25%, arredondada para cima.
- Mínimo (ponto de reposição) = média diária × prazo + reserva, arredondado para cima.
- Máximo = média diária × (prazo + cobertura entre compras) + reserva, arredondado para cima e nunca abaixo do mínimo.
- Comprar até o máximo = máximo − estoque atual, nunca negativo.
- Duração estimada = estoque atual ÷ média diária.

O estoque atual altera a duração, a quantidade a comprar e o aviso de excesso; não aumenta artificialmente os limites quando o produto está encalhado. O máximo é um alvo de planejamento, não uma restrição de capacidade física.

O campo legado safetyStock armazena apenas a reserva, pois as telas somam a demanda durante a entrega para calcular o ponto de reposição. Persistir o mínimo inteiro nesse campo duplicaria a demanda; a implementação evita isso. stockCoverageDays é um campo opcional no JSON do produto e dispensa migração SQL. Estoque, Início e Compras usam getReorderPoint para manter o mesmo alerta.

Produtos comuns usam unidades inteiras. Cigarros usam carteiras e incrementos de 0,05 carteira, mantendo 1 maço = 10 carteiras e 1 cigarro = 0,05 carteira. Fardos não alteram a unidade base de contagem.

Exemplo: média de 4 unidades/dia, entrega em 3 dias e cobertura de 7 dias resulta em reserva de 3, mínimo de 15 e máximo de 43. Se há 5 unidades, a cobertura atual é 1,25 dia e faltam 38 para atingir o máximo.

## Linguagem e embalagem de cigarros

Todos os textos do painel de sugestão usam o vocabulário central nos modos técnico, neutro e simples. No simples, use Quando comprar mais, Quanto manter na loja e Preencher para mim; a explicação de 25% fica recolhida em Como fizemos a conta?. Mensagens de estoque zerado, excedente, reposição, confirmação e falta de média também seguem o modo selecionado.

Para cigarros, o cadastro oferece exclusivamente maço inteiro (10 carteiras, padrão) e meio maço (5 carteiras). A preferência é persistida no campo opcional supplierPackageUnits. O campo unitsPerPackage e as conversões do Caixa continuam com maço de venda igual a 10 carteiras. O custo por carteira, a conversão de embalagens no formulário de estoque e as entradas na tela Compras usam getPurchasePackageUnits; a opção de meio maço não transforma uma venda de maço em cinco carteiras. Ao mudar a embalagem, o total de compra informado é dividido pela quantidade escolhida; confira o valor pago antes de salvar.
