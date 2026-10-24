# Análise comercial na exportação

Em Relatórios, selecione período e filtros e use **Baixar análise com gráficos (.xlsx)** (o nome acompanha o modo de linguagem). O botão também está na exportação por período. O CSV continua disponível como dados em uma única folha. A opção Google Sheets abre diretamente na aba **Painel visual** e também adiciona a aba **Análise** usando a API oficial e a autorização Google já existente; não reativa o webhook removido de Ajustes.

O Excel abre na primeira aba **Painel visual**, seguida de Análise, Vendas, Compras, Fiado atual e Estoque atual. O painel traz seis quadros-resumo (vendas, compras, taxas, saldo, quantidade e média por venda), gráficos e uma leitura curta abaixo de cada gráfico. A aba Análise preserva as tabelas detalhadas e a metodologia. Não é necessário rolar por todas as vendas para encontrar os gráficos. Os gráficos do Excel são objetos OOXML nativos editáveis, com referências às tabelas e cache de dados para abertura. Os gráficos do Sheets também são editáveis. Não são capturas de tela nem exigem links externos para renderizar.

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

1. **Colunas** com a evolução diária do valor vendido, com quantidade e compras na tabela. Acima de 62 dias, o gráfico agrega por mês. Até 366 dias, a tabela inclui dias vazios; em períodos maiores, explicita que só lista dias com registros, sem mudar o denominador da média.
2. **Pizza** da participação por forma de pagamento, com cores, legenda e porcentagens no Excel. As tabelas detalham quantidade, valor, participação e taxas. Sem valor vendido, não é desenhada uma pizza fictícia; o painel explica a ausência.
3. **Barras horizontais** para comparar vendas, compras, taxas e saldo operacional, inclusive saldo negativo.

Cada seção inclui cálculo, leitura e limites. A conclusão informa o maior dia com vendas; empates mostram a primeira data. Não afirma causalidade, crescimento, previsão ou ranking de produtos a partir de texto livre. Para ranking e lucro auditáveis é preciso exportar linhas estruturadas dos itens e seus custos.

## Verificação

Os testes reconciliam totais, centavos, períodos, dias vazios, fiado, tipos de Pix, registros inválidos, cancelamentos, nomes literais e ausência de fórmulas nos dados. Abrem o XLSX gerado e verificam referências dos três gráficos. O transporte do Sheets é simulado e confere criação de aba, números RAW e gráficos; isso não comprova gravação numa conta Google real. A estrutura XLSX também foi aberta com openpyxl, que reconheceu os três gráficos nativos.

Após o deploy, faça uma nova exportação no site pelo botão de análise **(.xlsx)** e confira o período/filtros no **Painel visual**. A alternativa CSV está identificada como **Somente dados (.CSV, sem gráficos)**; CSV não comporta gráficos nem abas. A verificação com openpyxl confirma o painel como primeira aba ativa, os tipos coluna/pizza/barras, os rótulos percentuais e as referências às tabelas de origem. As planilhas antigas não são alteradas. Não há migração SQL, mudança de estoque ou alteração de vendas/compras históricas.

## Painel executivo inspirado na referência visual

O Painel visual agora usa duas colunas: tabelas e indicadores à esquerda; parecer financeiro e diagnóstico de estoque à direita. Faixas azuis organizam as seções, alertas de estoque usam vermelho/amarelo e os indicadores têm valores em destaque. A primeira dupla de gráficos mostra uma rosca por pagamento e barras de reposição dos produtos zerados com limites definidos. A série temporal e o comparativo financeiro continuam disponíveis abaixo.

A disponibilidade é a proporção de produtos com saldo positivo entre os cadastros ativos incluídos. Não é valor de estoque nem total físico. A sugestão de compra usa o maior limite entre máximo e mínimo cadastrados menos o saldo, arredondando para a embalagem do fornecedor. Cigarros respeitam 5 ou 10 carteiras por embalagem; carteiras e unidades comuns são identificadas separadamente. Sem limites não se inventa uma quantidade, e sem produtos fornecidos não se conclui que a loja está vazia. Esse diagnóstico por limites não substitui a Lista de Reposição baseada no histórico de vendas.

Os pareceres são textos determinísticos derivados dos indicadores, sem atribuir causas, perdas de vendas ou lucros não comprovados. As tabelas completas e os dados de origem dos gráficos permanecem na aba Análise. A estrutura se aplica ao Excel e ao Google Sheets; o modo simples usa títulos mais diretos.
