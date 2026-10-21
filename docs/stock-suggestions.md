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

## Lista de Reposição: vendas reais e fornecedor

A tela Compras consulta os itens vendidos no Supabase, com filtro da loja, paginação e janela móvel dos últimos 14 dias. Recalcula ao abrir, quando o estoque muda, ao retomar a janela e a cada minuto. Falha na consulta exibe aviso e impede apresentar ausência de histórico como se fosse um resultado confirmado.

A data do estoque inicial, quando mais recente, limita o início do período. O divisor é o tempo decorrido em dias (incluindo dias sem venda), com mínimo de um dia. As quantidades usam unidades de estoque: carteiras e suas frações para cigarros, unidades para os demais. A média gravada no cadastro não participa da lista.

Um produto entra se esgotado, abaixo da segurança ou com estoque/média menor que os dias desejados (`stockCoverageDays`, padrão 7). Sem vendas no período, média e cobertura ficam indisponíveis e a tela informa “Ainda sem histórico de vendas”; esgotamento e segurança continuam valendo.

O alvo é `max(maxStock, média × dias desejados)`. A diferença positiva para o estoque é arredondada para cima por embalagens completas; o custo usa essa quantidade final × custo por unidade de estoque. Pacotes de cigarro respeitam a compra de 5 ou 10 carteiras; os formatos de venda não são alterados. Comprar por embalagem pode ultrapassar o alvo: o valor sugerido não deve cortar uma embalagem no meio.

O máximo não pode ser menor que a segurança no cadastro. Máximo abaixo do saldo atual gera aviso, sem ajustar o saldo. Fornecedor continua opcional nas compras, com sugestões de nomes já registrados. A lista agrupa pela última compra datada com fornecedor de cada produto (não existe vínculo obrigatório ou fornecedor inferido pela categoria). Grupos e seus itens aparecem pela urgência: esgotamento, segurança e menor cobertura; produtos empatados ficam em ordem alfabética. Sem informação, o grupo é “Sem fornecedor”.

A revisão de nomes parecidos ignora acentos, maiúsculas e espaços. Detecta distância de edição até 2 ou similaridade acima de 85%, preservando apresentações e números de tamanho/volume. A revisão e a união ficam disponíveis somente para o dono. A união exige conferência explícita: mantém o primeiro produto, soma estoques e oculta o segundo, preservando históricos. Tipos de estoque incompatíveis não podem ser unidos. Recomendações nunca movimentam estoque automaticamente.
