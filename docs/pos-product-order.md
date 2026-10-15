# Produtos mais vendidos no Caixa

A grade do Caixa usa o histórico real de itens vendidos no Supabase, filtrado pelo ID da loja autenticada. A consulta a eu_sale_items é paginada para não truncar em 1.000 registros. Cada produto é ordenado pela quantidade vendida na unidade-base do estoque, em ordem decrescente. Fardos contam suas unidades; cigarros usam carteiras, com maço = 10, meia carteira = 0,5 e avulso = 0,05. Usa stockDeduction registrado na venda; itens antigos sem esse campo usam o formato informado como alternativa.

Não usa preço, faturamento ou média estimada do cadastro para definir os mais vendidos. Considera todo o histórico disponível. Empates e produtos sem vendas usam o nome em ordem alfabética; não há preferência artificial por data de cadastro. Busca e categoria filtram a lista sem perder a ordenação. A preferência de embalagem comprada de cigarros não altera o volume de um maço vendido.

A consulta ocorre em segundo plano, é cancelada ao sair da tela e tem timeout por página. Novos snapshots de vendas e produtos atualizam o ranking. Se a consulta falhar, o Caixa continua funcionando com o último ranking carregado ou, sem ranking, em ordem alfabética. O aviso de mais vendidos só aparece quando há histórico agregado disponível. O texto respeita os três modos de linguagem.

Testes cobrem consulta por loja com mais de 1.000 itens, conversões, desempates, preservação da lista original e apresentação/filtro na interface do Caixa. Não houve migração de banco.
