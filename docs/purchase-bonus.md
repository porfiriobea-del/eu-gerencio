# Bonificação em compras

A aba Bonificação fica em Compras e usa `bonusRules` no documento de configurações da loja. Não cria tabelas. Dono e gerente usam as permissões de gestão existentes; funcionário não acessa Compras. Cada alteração de regra lê a versão atual das configurações e altera somente a regra selecionada, com retentativas de conflito.

Uma regra identifica fornecedor, produto comprado, quantidade/medida mínima e produto recebido, quantidade/medida do bônus. Maço corresponde sempre a 10 carteiras; pacote corresponde à embalagem de compra configurada (5 ou 10 para cigarros); carteira é uma unidade do estoque. Produtos comuns permitem unidade, fardo ou pacote. O cálculo é `floor(quantidade comprada / mínimo convertido) × bônus convertido`, por compra; não acumula compras anteriores. Regras do mesmo fornecedor/produto podem ser escolhidas no registro. Fornecedor é opcional: sem ele, nenhum benefício é presumido, mas o bônus pode ser informado manualmente.

O formulário calcula o bônus quando muda quantidade ou regra, mostra seu produto e permite ajustar a quantidade ou zerá-la. Salvar é uma confirmação explícita. A compra guarda `bonusQuantity` em unidades de estoque, `bonusProductId`, nome e medida do bônus, regra escolhida, `effectiveUnitCost` e `bonusSavings` históricos. Alterar ou excluir uma regra não reescreve compras antigas.

Na transação, os produtos são lidos novamente, os IDs mesclados são resolvidos e comprado + bônus entram no saldo correto. Um bônus de outro produto aumenta somente o saldo desse produto. Entrada de bonificação usa `stock_in` e `entryKind: bonus`, quantidade recebida e valor zero, na mesma transação da compra. Repetições internas por conflito não duplicam o recebimento.

O custo efetivo é valor pago / (quantidade comprada + bonificada), sem arredondar a duas casas antes de persistir. Por solicitação, quando são produtos diferentes, o rateio é igual por unidade base recebida: ambos recebem esse custo por sua respectiva unidade de estoque. A tela explica o rateio antes da confirmação. Exemplo: 1.000 / 110 = 9,090909… por carteira; a interface mostra 9,09. Esse custo efetivo da entrada é guardado como último custo e ponderado com o valor do saldo anterior para atualizar o custo médio do produto. A atualização da média é obrigatória ao receber estoque; não há mais opção de substituí-la pelo custo da última compra. As próximas vendas usam a média lida do banco; vendas e compras já realizadas mantêm os valores históricos.

Economia mensal é estimada como bônus × (valor pago / quantidade comprada), no mês da data da compra. No exemplo, é 100,00 de mercadoria recebida sem cobrança, não uma entrada financeira. Não é somada novamente ao lucro nem ao faturamento; os efeitos na margem vêm somente do custo médio que inclui essa entrada efetiva. Histórico e CSV incluem os dados do bônus e o custo efetivo.

Na Reposição, regras do fornecedor conhecido são consultadas sobre a compra sugerida. Um aviso aparece quando falta no máximo uma embalagem ou 20% do mínimo para o próximo bônus, informando quantidade adicional e produto ganho. Esse aviso não aumenta automaticamente a compra: o comerciante decide.

Excluir uma compra com estorno retira também seu bônus, usando as quantidades persistidas. Se faltar saldo para estornar qualquer produto, a transação inteira é cancelada. Sem estorno, os saldos são mantidos. Como no fluxo de exclusão anterior, o custo vigente não é restaurado e as movimentações históricas são preservadas; a tela informa isso antes de excluir.

Textos e medidas contemplam linguagem simples, intermediária e técnica, com português como fallback nos demais idiomas. Nomes de produtos e fornecedores não são traduzidos.
