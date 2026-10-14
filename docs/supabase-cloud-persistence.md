# Supabase como fonte principal dos dados

O cadastro da loja e os dados de produtos, clientes, vendas, pagamentos, compras, funcionários, movimentações e configurações agora são lidos e gravados diretamente no Supabase. O login Google/Firebase foi mantido para conservar os IDs das contas já existentes. Firebase não é mais usado como banco operacional; o único acesso ao banco antigo é a migração de leitura.

## Preparar produção antes de liberar a atualização

1. No mesmo projeto Supabase da aplicação, configure **Authentication → Third-Party Auth → Firebase**, usando o projeto Firebase `comercio-em-crescimento` já definido em `firebase-applet-config.json`. O Supabase precisa verificar os ID tokens desse projeto. Não configure um login Google separado no Supabase: ele criaria outra identidade e não preservaria o UID existente.
2. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel (Production e previews necessários). Use somente chave pública/publishable ou anon. Nunca coloque uma chave `service_role` ou senha do banco em variáveis `VITE_`.
3. Faça um backup administrativo do banco e execute **supabase/migrations/20261014_cloud_source_of_truth.sql** no SQL Editor do mesmo projeto. A migração é repetível. Ela cria tabelas novas, políticas RLS, transações e Realtime; preserva as tabelas antigas e bloqueia o acesso público ao espelho sem isolamento por loja.
4. Se você utiliza um projeto Firebase diferente, ajuste **tanto** `firebase-applet-config.json` **quanto** o issuer/audience em `eu_user_id()` na migração. O projeto e o UID verificados devem ser os mesmos.
5. Faça o deploy/redeploy e entre primeiro com a conta do proprietário no aparelho que contém os dados antigos. Recarregue o aplicativo em todos os outros aparelhos para que todos usem a nova versão.
6. Entre em um segundo aparelho com a mesma conta Google. Verifique o nome da loja, produtos e clientes; altere um estoque e confira a atualização no outro aparelho. Uma venda deve descontar o saldo corrente e uma entrada deve somar ao saldo corrente.

A aplicação valida `eu_user_id()` antes de consultar o cadastro. Ausência de configuração, migração SQL ou autorização mostra uma tela de recuperação, **não** o cadastro de uma loja nova. A operação em produção depende das etapas acima; publicar os arquivos no GitHub não executa SQL nem altera as configurações da Vercel/Supabase.

### Diagnóstico de instalação e autenticação

Uma resposta HTTP 200 em `/auth/v1/settings` confirma apenas que o endpoint público aceita a chave. Ela não comprova que as tabelas existem ou que o token Firebase será aceito nas consultas da loja. Erros `PGRST202` para `eu_user_id` e `PGRST205` para `eu_store_settings` indicam que a estrutura não está disponível no projeto: aplique a migração SQL antes de tentar cadastrar a loja. Se essas funções/tabelas já foram criadas, confirme o projeto selecionado e a atualização do schema cache do PostgREST.

Para erros de sessão/JWT, configure a integração Firebase acima e entre novamente. Mantenha RLS ativo. O código não contorna autenticação usando a chave publishable ou uma chave administrativa.

## Tabelas e isolamento

| Modelo | Tabela |
| --- | --- |
| Loja/configurações | `eu_store_settings` |
| Produtos/estoque | `eu_products` |
| Clientes/fiado | `eu_customers` |
| Vendas/itens | `eu_sales`, `eu_sale_items` |
| Pagamentos/compras | `eu_payments`, `eu_purchases` |
| Fechamentos | `eu_cash_closures` |
| Funcionários/movimentações | `eu_employees`, `eu_movements` |
| Convites/vínculos | `eu_team_invitations`, `eu_user_stores` |
| Feedback | `eu_feedbacks` |

Cada tabela preserva o modelo completo no JSONB `data`, com `id`, `collection_path`, `owner_id` gerado do proprietário e uma revisão para concorrência. A loja usa o UID do proprietário como identificador estável. Produtos e consultas são filtrados pelo proprietário/loja; RLS protege os dados mesmo se alguém manipular filtros ou armazenamento no navegador. Colaboradores recebem acesso apenas por vínculo aprovado no servidor.

A política verifica o issuer, audience, e-mail verificado e `sub` do JWT Firebase. Como alguns tokens Firebase não trazem uma claim `role`, as políticas aceitam os papéis de banco `authenticated` e `anon`, sempre condicionados à identidade verificada. Uma chave pública/anon sem um JWT válido não permite ler ou gravar dados de nenhuma loja.

## Migração dos dados antigos

Quando o perfil da loja ainda não está no Supabase, a aplicação lê o Firestore antigo com a autenticação da conta e copia os registros. IDs e relacionamentos do fiado/histórico são preservados; cigarros antigos contados em unidades são normalizados uma vez para carteiras. Registros já existentes no Supabase não são substituídos. O perfil é confirmado por último para não marcar uma migração parcial como concluída.

Se houver dados apenas no cache IndexedDB do aparelho original, a migração precisa ocorrer nesse aparelho. Um computador novo não consegue buscar o cache de outro telefone. Se a origem estiver indisponível, os dados disponíveis no cache podem ser copiados, e `legacyMigrationPending` registra a necessidade de continuar a reconciliação com a origem. Os registros já usados no Supabase não são sobrescritos ao retomar a migração. Os aparelhos da equipe devem entrar depois da migração pelo proprietário, que copia também os vínculos existentes.

A origem não é apagada. Mantenha seu backup e não continue operando com uma versão antiga do aplicativo no Firestore após a mudança. Quando os dados estiverem conferidos na nuvem, o administrador pode decidir sobre a retenção do banco antigo. Uma limpeza de conta no Supabase deixa um marcador vazio no perfil para impedir restauração automática do legado na próxima entrada.

## Tempo real, operações e armazenamento local

`cloudStore.ts` executa SELECTs pelo SDK e assina `supabase.channel('postgres_changes')`, com filtro por loja quando disponível. Mutações locais recarregam as assinaturas após confirmação; canais, retorno à aba, reconexão e consultas periódicas a cada 15 segundos cobrem atualizações feitas em outros aparelhos. Assinaturas são removidas ao sair da tela e as credenciais do Realtime acompanham os ID tokens do login.

`eu_apply_changes` aplica alterações em uma transação PostgreSQL, mantendo RLS ativo. Vendas e pagamentos relêem os saldos atuais; revisões detectam alterações concorrentes e a transação refaz a leitura. Uma venda sem saldo não registra itens/venda nem altera estoque. Entradas/exclusões de compras também rejeitam revisões desatualizadas sem gravar parcialmente. Identificadores de confirmação evitam repetir o mesmo lote. O navegador não mantém uma fila de gravação offline: erros são apresentados e gravações não confirmadas não são anunciadas como sucesso.

O `localStorage` conserva preferências pessoais de interface, seleção do operador e a data da última verificação de backup. Ele não é fonte de produtos, clientes, saldo ou cadastro da loja. Os backups completos são gerados a partir do Supabase e baixados explicitamente; o aplicativo não mantém novas cópias de dados comerciais no localStorage. Categorias e setor são hidratados da loja, e configurações compartilhadas são salvas em patches para não sobrescrever campos diferentes alterados em outro aparelho.

O endpoint e a ativação do Google Sheets também vêm das configurações da loja. Não há mais um webhook global padrão. Os envios opcionais só usam a configuração confirmada da loja; logs de diagnóstico são temporários e separados ao trocar de loja.

## Verificação local

- `npm run lint`
- `node --import tsx --test --test-concurrency=1 tests/*.test.mjs`
- `npm run build`

Os testes de banco executam a migração em PostgreSQL/PGlite e verificam RLS, transações, concorrência, recibos e convites. Os testes do SDK usam um servidor HTTP local e verificam autorização, consultas, atualização de duas assinaturas e cálculos do Caixa. Os testes de abertura e migração cobrem navegador novo, erros de conexão e cópia sem sobrescrever dados já ativos. Esses testes não comprovam a configuração do projeto de produção nem acessam dados reais.
