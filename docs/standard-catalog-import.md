# Importação do catálogo padrão

O botão **📦 Importar Catálogo Padrão (100+ Produtos)** no Estoque importa 139 produtos de referência, incluindo 14 cigarros com preços de Maço, Carteira, Meia Carteira e Unidade.

Os preços e custos são referências editáveis, não cotações atuais de fornecedores. O estoque inicial é zero: faça a contagem ou registre as compras depois da importação. Os cigarros usam carteiras como unidade de estoque e de custo; o maço contém 10 carteiras.

## Configuração do Supabase

1. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ambiente do aplicativo (na Vercel, em Production e nos previews usados). Use somente a chave pública/publishable ou anon, nunca `service_role`.
2. Execute `supabase/migrations/20261013_standard_catalog.sql` no SQL Editor do mesmo projeto Supabase. A migração adiciona metadados completos e uma chave única por estabelecimento à tabela existente `PRODUTOS`; preserva os dados e as políticas RLS atuais.
3. Verifique que a configuração de autenticação e as políticas existentes autorizam o usuário a inserir os registros do seu estabelecimento. Não desative RLS para contornar um erro de permissão. A migração não configura autenticação nem cria políticas de acesso.
4. Publique as regras atualizadas de `firestore.rules` no banco Firestore usado pelo aplicativo. Elas validam `stockUnit` e permitem à transação ler um ID ainda inexistente; as leituras de produtos existentes continuam restritas ao estabelecimento.
5. Faça um redeploy após configurar as variáveis. Entre no aplicativo e clique no botão.

O aplicativo atual lê Estoque/Caixa do Firestore. Por isso a importação confirma primeiro um único lote no Supabase e depois uma transação no Firestore, preservando esse fluxo. No Supabase, os campos básicos ficam em `nome`, `preco_venda`, `preco_custo`, `estoque_atual`; `catalog_data` contém a categoria, embalagens, unidade de estoque e todos os preços fracionados. `catalog_owner_id` e `catalog_key` identificam o estabelecimento e o produto.

Produtos cujo nome normalizado já existe no Estoque são ignorados. Repetições da importação não substituem os preços ou saldos já importados. A transação do Firestore usa IDs determinísticos e verifica os registros antes de criar.

Os dois bancos não compartilham uma transação. Se o Supabase confirmar e o Firestore falhar, a tela mostra erro e não anuncia sucesso. Confira os dados e repita para completar o Estoque; os registros já confirmados no Supabase são preservados. Caso a confirmação exceda 60 segundos, a tela avisa que o resultado é incerto e orienta conferir antes de repetir.

## Validação

`node --import tsx --test --test-concurrency=1 tests/*.test.mjs`, `npm run lint` e `npm run build`.

Os testes de catálogo simulam os bancos: não inserem produtos reais. A importação em produção exige a configuração, a migração e as permissões acima.
