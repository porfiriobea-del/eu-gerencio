# Custo médio, último custo e sugestões de preço

`Product.unitCost` passa a representar o custo médio ponderado por unidade de estoque: carteira para cigarros, unidade para os demais. Não há recálculo retroativo nem migração de vendas ou compras. O custo existente é a base inicial da média, sem tentar reconstruir um passado incompleto.

Ao registrar uma entrada, `recebido = comprado + bônus do mesmo produto`. O custo efetivo da entrada já considera a bonificação: `valor pago / (comprado + bônus)`. A média fica `(saldo atual × média atual + recebido × custo efetivo) / (saldo atual + recebido)`. Numerador e denominador incluem as bonificações. O saldo e o valor atuais são relidos na transação, com retentativas de conflito. Se o saldo for zero, a média assume o custo efetivo da entrada. Não se arredonda custo a centavos antes de gravar.

Bônus de outro produto segue o rateio de aquisição já adotado: custo efetivo igual por unidade base recebida. Cada produto pondera sua entrada e seu valor com o próprio estoque anterior. Ao juntar cadastros, o valor dos dois saldos também é ponderado; preços e históricos não são reescritos.

`lastCost` mantém o custo efetivo da última entrada separado da média e aparece em Compras, Estoque e nos cards de Preços. Para cadastros antigos sem esse campo, a interface mostra o custo inicial existente até registrar a próxima compra. Novas compras guardam `previousAverageCost`, `averageCostAfter` e, se houver bônus de outro produto, `bonusAverageCostAfter`. A exportação CSV inclui a média resultante quando esse snapshot existir; compras antigas não recebem um valor inventado.

A opção antiga de não atualizar custo não desativa a média ao receber estoque. Compras registradas sem entrada não ponderam unidades que não foram recebidas. O Caixa, inclusive o fluxo do funcionário no Supabase, lê `unitCost` atual e grava o custo correspondente no item vendido. Relatórios usam o custo do item histórico, não o custo atual do cadastro. Um ajuste posterior de custo nunca altera vendas anteriores.

Se a média variar estritamente mais de 3%, o produto guarda uma proposta persistente `pendingPriceReview`, visível em Compras, Estoque e Preços. Alta e queda têm mensagens distintas. A fórmula preserva o acréscimo atual: `preço atual × nova média / média anterior`. Arredonda ao múltiplo de 0,50 mais próximo, com mínimo 0,50 para não desativar um formato que já era vendido. Em cigarros, todos os formatos habilitados são apresentados juntos; carteira, meia carteira e unidade não são inferidas quando seus preços estão vazios ou zerados. O formato de 10 carteiras também participa se estiver habilitado.

Se uma proposta estiver pendente e houver nova entrada, a referência original é preservada para não perder pequenas altas acumuladas. Sem custo anterior positivo, não há acréscimo estimável e nenhum preço é inventado. A margem baixa continua sinalizada na Reposição.

Aceitar relê o produto e valida a versão da proposta, o custo e os preços anteriores. Grava todos os formatos juntos, limpa a proposta e registra a alteração de preço na mesma transação. Manter apenas limpa a proposta. Sugestões antigas não sobrescrevem decisões feitas em outro aparelho. Edições manuais de preço dispensam propostas anteriores; ajustes manuais de custo podem gerar nova proposta. A edição de nome não reenvia custo, saldo e preços que permaneceram iguais no formulário, evitando sobrescrever alterações recentes de outro aparelho.

Alterações reais de preço, tanto pelas sugestões quanto por edição em Estoque/Preços ou aplicação explícita de promoção na compra, registram movimentação `product_update` com `priceChanges` (campo, antigo e novo), data/hora, funcionário e `actorUserId` da conta autenticada. Nomes dos formatos aparecem na descrição. Não há alteração automática de preço por mudança de custo. As escolhas explícitas de promoção existentes no formulário continuam dependendo da confirmação da compra.

Reposição alerta sobre margem de venda `(preço − custo médio) / preço`, usando a margem desejada do produto, quando definida, ou a margem padrão dos Ajustes da loja (30% na ausência de configuração). O alerta inclui promoções e formatos fracionados habilitados, também para produtos que ainda não precisam de estoque. Ele não adiciona compras nem muda os critérios de quantidade da lista.

A exclusão de compra mantém o fluxo anterior: pode estornar quantidades, mas não reconstrói a sequência de médias ou o último custo e não reescreve vendas. Essa limitação é informada antes da exclusão; corrigir dados históricos exige uma revisão contábil explícita, não um recálculo silencioso.

Os campos ficam nos documentos JSON existentes. Não é necessária nova migração SQL para esta alteração. Os textos novos contemplam os três modos de linguagem e respeitam a moeda da loja.
