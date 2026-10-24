# Análise comercial na exportação

Em Relatórios, selecione período e filtros e use **Baixar análise com gráficos (.xlsx)** (o nome acompanha o modo de linguagem). O botão também está na exportação por período. O CSV continua disponível como dados em uma única folha. A opção Google Sheets adiciona a aba **Análise** usando a API oficial e a autorização Google já existente; não reativa o webhook removido de Ajustes.

O Excel possui Análise, Vendas, Compras, Fiado atual e Estoque atual. Os gráficos do Excel são objetos OOXML nativos editáveis, com referências às tabelas e cache de dados para abertura. Os gráficos do Sheets também são editáveis. Não são capturas de tela nem exigem links externos para renderizar.

## Escopo e auditoria

- A análise usa as mesmas vendas e compras selecionadas para exportação. Ela confirma o intervalo e exclui cancelamentos, datas inválidas, valores negativos/inválidos e registros fora das datas, apresentando as quantidades excluídas. No Excel, as bases de origem incluem a indicação de inclusão na análise.
- Datas são agrupadas pelo dia no fuso do dispositivo que exportou; esse fuso e a data de extração ficam registrados. Os campos monetários são números nativos, na moeda da loja, sem conversão. Cada valor é arredondado para centavos antes da soma.
- O faturamento inclui vendas fiadas; não equivale a dinheiro recebido. Ticket = valor das vendas / número de vendas válidas. Sem vendas, aparece “Sem vendas”, não uma média fictícia.
- A média diária divide pelos dias corridos, incluindo início, fim e dias sem registros. O período escolhido pode incluir dias futuros. Dias com vendas são apresentados separadamente e não significam dias de abertura.
- Taxas são as gravadas na venda, sem reaplicar configurações atuais. Taxas ausentes ou inválidas ficam sinalizadas. Pix direto e Pix na maquininha aparecem em categorias distintas.
- Saldo operacional = vendas − compras − taxas. Compras não equivalem ao custo das mercadorias vendidas; esse saldo não é lucro nem fluxo de caixa recebido. A análise não inventa CMV nem lucros quando os dados necessários não estão disponíveis.
- Fiado atual e Estoque atual são fotografias da extração, não posições históricas do fim do período. O arquivo não se atualiza automaticamente com o Supabase.
- Em filtros por categoria, vendas mistas seguem o rateio já usado no relatório. O número de vendas conta operações que contêm essa categoria, não o número de itens.

## Gráficos e explicações

1. Evolução diária do valor vendido, com quantidade e compras na tabela. Acima de 62 dias, o gráfico agrega por mês. Até 366 dias, a tabela inclui dias vazios; em períodos maiores, explicita que só lista dias com registros, sem mudar o denominador da média.
2. Valor e participação por forma de pagamento, com quantidade e taxas.
3. Comparativo entre vendas, compras, taxas e saldo operacional, inclusive saldo negativo.

Cada seção inclui cálculo, leitura e limites. A conclusão informa o maior dia com vendas; empates mostram a primeira data. Não afirma causalidade, crescimento, previsão ou ranking de produtos a partir de texto livre. Para ranking e lucro auditáveis é preciso exportar linhas estruturadas dos itens e seus custos.

## Verificação

Os testes reconciliam totais, centavos, períodos, dias vazios, fiado, tipos de Pix, registros inválidos, cancelamentos, nomes literais e ausência de fórmulas nos dados. Abrem o XLSX gerado e verificam referências dos três gráficos. O transporte do Sheets é simulado e confere criação de aba, números RAW e gráficos; isso não comprova gravação numa conta Google real. A estrutura XLSX também foi aberta com openpyxl, que reconheceu os três gráficos nativos.

Após o deploy, faça uma nova exportação no site e confira o período/filtros na aba Análise. As planilhas antigas não são alteradas. Não há migração SQL, mudança de estoque ou alteração de vendas/compras históricas.
