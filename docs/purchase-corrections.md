# Correção do valor de uma compra

Em **Compras → Histórico de Compras**, use o botão de lápis da linha. A janela permite corrigir o total pago, fornecedor e observações e mostra o valor anterior e o novo custo efetivo. Produto, quantidade, bônus e data de entrada permanecem como foram recebidos: corrigir um preço não registra uma segunda entrada.

A mesma transação `eu_apply_changes` usada pelo aplicativo atualiza a compra no Supabase, os custos dos lotes PEPS que ainda existem, os totais de todas as linhas da nota e o movimento de auditoria. Não há tabela nem migração SQL nova. As permissões já existentes permitem a operação a Dono/Gerente; Funcionário continua sem acesso a Compras. O histórico de compras usa a assinatura Supabase existente e atualiza os resumos e novas exportações a partir do registro corrigido. Arquivos já baixados e eventos de uso já enviados a uma planilha externa não são reescritos.

O custo unitário de aquisição é total pago / quantidade comprada. O custo efetivo é total pago / (quantidade comprada + bônus), conforme a regra de alocação já usada pelo app, inclusive bônus de outro produto. Apenas os lotes remanescentes da compra corrigida são reprecificados; a quantidade de estoque não muda. O último custo só muda se a compra for a aquisição mais recente daquele produto. Não se altera preço de venda: a revisão de preço continua exigindo confirmação.

Vendas anteriores mantêm seus custos e alocações. Os lotes corrigidos recebem uma identidade de versão própria para que uma devolução/cancelamento consiga restaurar a alocação original sem colidir com o custo corrigido. Isso não recalcula retroativamente o lucro histórico de vendas já registradas.

Cada correção recebe uma chave idempotente. Reenviar a mesma correção não duplica o movimento. O horário de versão do registro impede sobrescrever uma alteração feita em outro aparelho: nesse caso o comerciante precisa reabrir a compra. Em falha, o formulário mantém os valores e libera uma nova tentativa; em sucesso, fecha e exibe confirmação.

Testes usam o transporte Supabase simulado e cobrem persistência atômica, bonificação, notas com vários itens, tentativas repetidas, concorrência, lotes parcialmente consumidos, custos de vendas imutáveis, devoluções e os três modos de linguagem. Não comprovam uma alteração real na loja em produção.
