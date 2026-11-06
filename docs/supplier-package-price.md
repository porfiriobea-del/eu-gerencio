# Embalagem e preço do fornecedor

O cadastro do produto conserva `unitsPerPackage` (unidades comuns), `supplierPackageUnits` (5 ou 10 carteiras para cigarro) e `supplierPackageCost` (valor de referência da embalagem configurada). Esse preço é independente de `unitCost`, que representa o lote PEPS atual, e de `lastCost`, que representa uma aquisição efetivamente registrada.

Antes, `purchaseTotalCost` existia somente no formulário e era removido antes de salvar. O valor da embalagem era reconstruído na abertura pelo custo do lote antigo, fazendo a alteração parecer perdida. O formulário agora salva o preço do fornecedor, reabre a partir dele e usa a divisão exata por embalagem para sugerir o custo da próxima compra. O campo de unidades permite apagar e digitar novamente; o salvamento exige um inteiro positivo. Custos derivados de uma divisão podem ter mais de duas casas decimais, sem impedir a validação nativa do formulário; o total pago pela embalagem continua em centavos.

Exemplo validado com dados de teste: Heineken Long, fardo com 24 unidades a R$ 150, referência de R$ 6,25 por unidade. A edição da embalagem não aumenta nem converte o saldo físico e não reescreve compras, custos de lotes conhecidos ou preços de venda. Compras e notas usam a referência no preenchimento inicial; o comerciante pode corrigir o valor efetivamente pago antes de confirmar.

Não há migração SQL: o campo é guardado no documento do produto pela transação Supabase existente. Os testes verificam edição/reabertura nos três modos, persistência no transporte simulado e preservação do saldo e dos custos antigos. Nenhum cadastro de produção foi alterado pelos testes. Para atualizar um produto real é necessário abrir sua loja com uma sessão autenticada e salvar o formulário, ou disponibilizar uma conexão administrativa autorizada com escopo identificado da loja.

## Edições com fotos antigas e falhas de salvamento

O formulário omite uma foto que não foi alterada. O serviço compara a imagem com a versão atual antes de processá-la, inclusive para chamadas antigas que ainda enviam a foto junto com todos os campos. Assim, uma imagem Base64 antiga não obriga um novo upload nem bloqueia a alteração de embalagem, referência de custo ou saldo quando o armazenamento de fotos estiver indisponível. Uma foto realmente nova continua validada e enviada antes da gravação; falha nessa etapa não deixa uma atualização parcial do estoque.

Uma gravação rejeitada mantém o formulário e os valores. O alerta distingue permissão, sessão, divergência entre lotes e saldo e confirmação demorada; os detalhes mostram a mensagem recebida para diagnóstico. Não há reconstrução silenciosa de lotes em caso de divergência. O bloqueio síncrono evita submissões duplicadas; a janela fecha somente após sucesso confirmado. Testes simulam o produto com custo antigo zero, imagem legada, alteração de 6 para 24 unidades, referência de R$ 150 e mudança do saldo físico, além de erro, nova tentativa e cliques rápidos.
