# Equipe, permissões, PIN do dono e turnos

Execute `supabase/migrations/20261017_team_permissions_shifts.sql` no SQL Editor do
mesmo Supabase, após as migrações existentes. O código novo exige estas funções:
se faltarem, contas convidadas ficam bloqueadas em vez de receber dados de gestão.
Mantenha a ordem: reexecutar somente migrações antigas pode restaurar permissões
anteriores. Esta migração deve ser a última aplicada.
A migração foi testada com PostgreSQL real via PGlite, inclusive executada duas vezes.

| Conta | Acesso |
| --- | --- |
| Dono (identidade proprietária da loja) | Todas as telas, equipe, convites, PIN de exclusão e quadro Equipe e turnos |
| Gerente (Gerente, Gerente de Loja, Manager) | Gestão operacional, relatórios, ajustes e equipe; não define PIN do dono nem cria convites/vínculos de contas |
| Funcionário (demais funções, inclusive Operador de Caixa e Auxiliar Geral) | Meu turno, Caixa, estoque somente para consulta e recebimento de fiado |

Não é possível virar Dono apenas escolhendo esse nome de função. O nível vem da
identidade verificada, do vínculo de loja e do cadastro ativo do funcionário no
banco. Nome de função desconhecido recebe o nível Funcionário. Alterações ou
desativação do cadastro entram em vigor no banco imediatamente; a interface
revalida ao retomar a janela e a cada 30 segundos. Cada pessoa deve entrar com
sua própria conta Google convidada. Selecionar um operador em uma sessão Google
do dono limita a interface, mas não revoga os privilégios da identidade do dono;
ao encerrar esse turno compartilhado, a conta Google é desconectada.

Custos, taxas, vendas de outras pessoas e PINs de colegas não são entregues às
contas de funcionário. Consultas são projetadas no servidor, além de RLS bloquear
as tabelas brutas. Vendas e recebimentos usam RPCs que verificam identidade, turno,
PIN pessoal definido, preços e saldo; os custos históricos são calculados apenas
no banco. Cartões continuam calculando o total correto por uma cotação do servidor,
sem expor a configuração das taxas ao funcionário.

A primeira exclusão pede ao dono para criar um PIN pessoal (não usar os PINs
provisórios dos colaboradores). O banco guarda somente um hash com salt, em tabela
privada. Cada aprovação é vinculada à conta, à loja e aos registros exatos, dura
2 minutos e é consumida uma única vez. Cinco erros bloqueiam novas tentativas por
15 minutos. Produtos, clientes e exclusão total exigem aprovação, inclusive via
REST direto. Para redefinir um PIN existente, o dono precisa fornecer o anterior
na função `eu_set_owner_pin`; não há senha padrão ou acesso aos hashes pelo app.

Turnos são iniciados no login do colaborador, sem duplicar ao abrir outro aparelho.
O início/fim usa o ID real do cadastro e movimentações `shift_start`/`shift_end`.
O dono vê a entrada, a saída, a duração e os turnos não encerrados. A contagem de
vendas e a meta na tela Meu turno nunca incluem faturamento geral ou lucro.

O fechamento automático segue America/Sao_Paulo. Quando pg_cron está disponível
(como no Supabase), a migração o habilita e agenda `eu-close-overdue-shifts` a cada
minuto. À meia-noite, grava o limite exato como saída e status `not_closed`;
repetições não duplicam o histórico. Também há reconciliação ao entrar, consultar
turnos ou retomar o app. Confirme o agendamento como administrador:

```sql
select jobname, schedule, active from cron.job
where jobname = 'eu-close-overdue-shifts';
```

Se o provedor não disponibilizar pg_cron, agende no servidor uma chamada a
`public.eu_close_overdue_shifts()` a cada minuto. Apenas a reconciliação no app não
substitui esse agendamento quando todos os aparelhos estão fechados.

Os três modos de linguagem e os idiomas existentes são mantidos. A migração não
altera preferências, produtos, dívidas ou vendas anteriores. Campos de PIN antigos
são removidos apenas dos documentos de convite, não dos cadastros de funcionário.
