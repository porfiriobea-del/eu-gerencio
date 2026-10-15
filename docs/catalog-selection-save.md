# Cadastro dos selecionados no catálogo

A revisão de foto, galeria e PDF usa a mesma ação. Ela valida somente as linhas marcadas, destaca as pendências no próprio produto e mostra uma orientação junto ao botão. Nome, categoria, custo, medida da compra e preço precisam ser revisados; a IA não inventa preço ausente.

O fluxo registra todos os selecionados apenas depois das validações e confirmações de duplicidade. Se a confirmação for cancelada, nenhum novo cadastro do lote é enviado. Durante a gravação o botão permanece ocupado e cliques repetidos não disparam novas transações. Sucesso confirmado fecha a janela, mostra a quantidade e remove somente os rascunhos confirmados, identificados por ID; linhas desmarcadas permanecem para futura revisão. Erros de banco ou conexão liberam o botão e mantêm a janela e todos os valores revisados, permitindo corrigir ou repetir.

O app envia os IDs estáveis dos rascunhos ao importSupplierCatalog. Os documentos da mesma revisão usam IDs determinísticos por loja. A transação consulta esses documentos e cria somente os ausentes. Uma nova tentativa após confirmação incerta não duplica produtos nem zera um saldo já atualizado. Isto também vale para cópias autorizadas explicitamente. Uma nova leitura é outra revisão e continua passando pela detecção de duplicados.

Títulos, botões, estados de espera, validação, cancelamento, falha e confirmação contemplam os três modos de linguagem no vocabulário central. A mudança não exige migração SQL. Testes locais usam transporte e serviços simulados.

Quando há linhas importadas mas nenhuma marcada, o botão continua acionável para explicar a pendência, sem enviar uma gravação vazia. O rodapé mostra o aviso de seleção ou duplicidade e o clique mostra uma confirmação flutuante de atenção. Extrações vazias têm mensagem específica e mantêm a opção de cadastro manual. Validações de dados também mostram aviso flutuante, além das linhas destacadas, evitando a impressão de que o clique não respondeu quando o erro está fora da área visível.
