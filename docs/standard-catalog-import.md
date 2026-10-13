# Importação de catálogos do fornecedor

No Estoque, **📁 Importar Catálogo (PDF ou Foto da Galeria)** abre um fluxo com três fontes: câmera do celular, fotos da galeria e PDF. O banner e os botões de pré-cadastro genérico foram removidos. O botão verde **📸 Cadastrar por Foto (IA)** continua dedicado ao cadastro de um único produto, preenchendo apenas nome e categoria.

## Leitura e revisão

A API `/api/gemini/recognize-catalog` recebe Base64 puro com o MIME correto e usa Gemini 2.5 Flash para extrair vários produtos, categorias, custos e preços legíveis. PDFs são enviados diretamente ao modelo; não é necessária uma biblioteca de conversão de PDF no navegador. Imagens são redimensionadas antes do envio.

PDFs devem ter até 3 MB por arquivo; fotos JPEG/PNG/WebP até 20 MB antes do redimensionamento. É possível selecionar até 10 arquivos por vez, processados sequencialmente. A extração retorna até 200 itens por arquivo, avisa se o modelo indicar truncamento e permite cadastrar até 200 produtos selecionados por lote. Para documentos maiores, divida as páginas e importe em etapas.

Os produtos são rascunhos editáveis. Custos e preços ausentes permanecem em branco. O usuário confirma nome, categoria, tipo, medida da compra, custo e preços antes de clicar em **Cadastrar selecionados**. As listas de fornecedor não são tratadas automaticamente como preços de venda ao consumidor. Nenhum cadastro acontece só por enviar um arquivo. Em falhas de rede, quota ou leitura, o modal mantém os rascunhos e permite preenchimento manual. Interromper a análise impede que respostas atrasadas substituam a revisão.

No custo de um fardo, a quantidade indicada determina o custo por unidade. Nos cigarros, o custo é convertido para carteira: maço de 10 carteiras ÷ 10; cigarro avulso × 20. Os quatro preços de venda são independentes, e formatos sem preço positivo não ficam disponíveis no Caixa. O estoque inicial dos produtos importados é zero.

## Configuração de produção

1. Configure `GEMINI_API_KEY` somente no servidor/Vercel Functions. Não use `VITE_GEMINI_API_KEY`: a chave privada não deve ir para o navegador.
2. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto Supabase. Use a chave pública/publishable ou anon, nunca `service_role`.
3. Se ainda não aplicada, execute `supabase/migrations/20261013_standard_catalog.sql` no mesmo projeto. Ela adiciona `catalog_owner_id`, `catalog_key`, `catalog_data` e uma chave única à tabela existente `PRODUTOS`; preserva os dados e políticas RLS.
4. Verifique que a autenticação e as políticas autorizam os registros do estabelecimento. A migração não configura autenticação nem cria políticas. Não desative RLS para contornar falhas.
5. Se ainda não publicadas, publique as regras de `firestore.rules` no banco usado pelo aplicativo. Elas validam `stockUnit` e permitem ler IDs inexistentes numa transação. Produtos existentes permanecem restritos ao estabelecimento.
6. Faça um redeploy depois de configurar as variáveis e teste com um pequeno catálogo do fornecedor.

O aplicativo atual lê Estoque/Caixa do Firestore. A importação confirma um único lote no Supabase e depois uma transação no Firestore. `catalog_data` preserva todos os campos do produto, incluindo categorias, medidas e preços fracionados. Produtos com nome normalizado já existente são ignorados e saldos/preços já importados não são sobrescritos.

Os bancos não compartilham uma transação. Se o Supabase confirmar e o Firestore falhar, a tela mostra erro, conserva a revisão e não anuncia sucesso. Confira os dados antes de repetir; os IDs determinísticos preservam os registros já confirmados. Se a confirmação exceder 60 segundos, a tela avisa que o resultado é incerto.

## Navegação

A navegação principal é exclusivamente vertical. Com a preferência de menu fixo ativada, a barra lateral permanece aberta em telas a partir de 1024 px. Em celulares, ou com o menu desafixado, o hambúrguer abre a gaveta vertical. Escape, clique no fundo e navegação fecham a gaveta; o teclado permanece nela enquanto aberta. A preferência continua salva em `eu_gerencio_menu_pinned`.

## Validação

`node --import tsx --test --test-concurrency=1 tests/*.test.mjs`, `npm run lint` e `npm run build`.

Os testes simulam Gemini e bancos, sem enviar arquivos de fornecedores para serviços externos nem inserir produtos reais. A configuração de produção precisa ser validada no projeto autorizado.
