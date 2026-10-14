# Importação de catálogos do fornecedor

No Estoque, **📁 Importar Catálogo (PDF ou Foto da Galeria)** abre um fluxo com três fontes: câmera do celular, fotos da galeria e PDF. O banner e os botões de pré-cadastro genérico foram removidos. O botão verde **📸 Cadastrar por Foto (IA)** continua dedicado ao cadastro de um único produto, preenchendo apenas nome e categoria.

## Leitura e revisão

A API `/api/gemini/recognize-catalog` recebe Base64 puro com o MIME correto e usa Gemini 2.5 Flash para extrair vários produtos, categorias, custos e preços legíveis. PDFs são enviados diretamente ao modelo; não é necessária uma biblioteca de conversão de PDF no navegador. Imagens são redimensionadas antes do envio.

PDFs devem ter até 3 MB por arquivo; fotos JPEG/PNG/WebP até 20 MB antes do redimensionamento. É possível selecionar até 10 arquivos por vez, processados sequencialmente. A extração retorna até 200 itens por arquivo, avisa se o modelo indicar truncamento e permite cadastrar até 200 produtos selecionados por lote. Para documentos maiores, divida as páginas e importe em etapas.

Os produtos são rascunhos editáveis. Custos e preços ausentes permanecem em branco. O usuário confirma nome, categoria, tipo, medida da compra, custo e preços antes de clicar em **Cadastrar selecionados**. As listas de fornecedor não são tratadas automaticamente como preços de venda ao consumidor. Nenhum cadastro acontece só por enviar um arquivo. Em falhas de rede, quota ou leitura, o modal mantém os rascunhos e permite preenchimento manual. Interromper a análise impede que respostas atrasadas substituam a revisão.

No custo de um fardo, a quantidade indicada determina o custo por unidade. Nos cigarros, o custo é convertido para carteira: maço de 10 carteiras ÷ 10; cigarro avulso × 20. Os quatro preços de venda são independentes, e formatos sem preço positivo não ficam disponíveis no Caixa. O estoque inicial dos produtos importados é zero.

## Configuração de produção

Configure `GEMINI_API_KEY` apenas no servidor/Vercel Functions e os dados públicos do Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). A persistência do catálogo usa agora exclusivamente `eu_products` com a transação de banco da aplicação. A tabela antiga `PRODUTOS` e sua migração anterior não são mais usadas pelo aplicativo.

Siga [Supabase como fonte principal](supabase-cloud-persistence.md) para configurar a verificação do login, aplicar `20261014_cloud_source_of_truth.sql` e migrar os dados existentes. Produtos com nome normalizado já cadastrado são ignorados; preços e saldos já ativos são preservados. Uma falha não anuncia sucesso nem grava parcialmente o lote.

## Navegação

A navegação principal é exclusivamente vertical. Com a preferência de menu fixo ativada, a barra lateral permanece aberta em telas a partir de 1024 px. Em celulares, ou com o menu desafixado, o hambúrguer abre a gaveta vertical. Escape, clique no fundo e navegação fecham a gaveta; o teclado permanece nela enquanto aberta. A preferência continua salva em `eu_gerencio_menu_pinned`.

## Validação

`node --import tsx --test --test-concurrency=1 tests/*.test.mjs`, `npm run lint` e `npm run build`.

Os testes simulam Gemini e bancos, sem enviar arquivos de fornecedores para serviços externos nem inserir produtos reais. A configuração de produção precisa ser validada no projeto autorizado.
