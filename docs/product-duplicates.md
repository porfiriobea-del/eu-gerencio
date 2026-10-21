# Revisão de possíveis duplicados

Cadastro, edição, foto e catálogo usam o mesmo detector de suspeitas. A comparação ignora maiúsculas, acentos, pontuação, espaços e ordem das palavras. Usa distância de edição até 2 ou similaridade estritamente acima de 85%, com nomes muito curtos limitados à correspondência exata. Códigos de barras não vazios também indicam suspeita; espaços são removidos, mas zeros iniciais são preservados. O próprio registro é excluído na edição.

“Long” e “long neck” são apresentações equivalentes. Latão, lata, long neck, garrafa e PET conhecidos, quando conflitantes entre os nomes, impedem o aviso por nome. Números e medidas explicitamente diferentes também são preservados. Isso reduz falsos positivos; não é uma identificação garantida do produto. Nomes originais nunca são alterados para executar a comparação. A normalização básica usada nos IDs estáveis de catálogo não recebe a ordenação de palavras ou aliases.

Casos de aceite:

| Par | Suspeita |
| --- | --- |
| Brahma (LATAO) / Bhrama Latão | Sim |
| Budwiser latao / Budweiser Latão | Sim |
| Budweiser (long) / Budweiser Long Neck | Sim |
| Brahma Latão / Brahma Long Neck | Não |

A tela mostra abrir o existente, somar ao estoque dele ou cadastrar mesmo assim. Nenhuma comparação grava, soma ou junta automaticamente. Na foto, o nome reconhecido mostra aviso e o salvamento consulta os registros atuais do Supabase. Na edição, a união de registros existentes exige o dono e uma confirmação adicional. Cadastrar uma cópia continua permitido; isto não é um índice único do banco.

O catálogo marca linhas suspeitas e as deixa desmarcadas por padrão, inclusive repetições dentro do arquivo. Para cadastrar uma cópia é necessário escolher **Cadastrar mesmo assim**. Somar usa uma quantidade informada e o saldo atual do banco, sem cadastrar a linha de novo. O estoque inicial continua opcional, informado manualmente.

**Revisar duplicados**, em Estoque, só aparece para o dono. A lista contém pares diretamente comparados: não cria correspondências transitivas entre A e C apenas porque ambos parecem com B. Juntar abre uma conferência e exige confirmação. O primeiro registro mantém nome, preços e medidas, recebe estoque e estoque inicial do segundo e pondera o custo pelos valores dos dois saldos. A eventual sugestão de preço exige confirmação separada. Tipos de estoque incompatíveis não podem ser unidos.

A transação relê os saldos e revisões; conflitos são tratados pelo fluxo existente. O segundo produto permanece arquivado com `mergedIntoId`, `mergedAt` e estoque zero. Vendas, compras e seus IDs históricos são preservados. O destino guarda `mergedProductIds` para incluir as vendas anteriores na média da Reposição. Compras antigas são resolvidas até o produto ativo ao estornar. Carrinhos desatualizados com produtos arquivados são recusados.

## Proteção no Supabase

Aplicar `supabase/migrations/20261021_owner_product_merges.sql` após a migração de permissões e turnos. Não cria tabela nem reescreve dados; adiciona um trigger que exige identidade de dono ao alterar os metadados de união, inclusive via REST/RPC direto. Gerentes mantêm suas permissões normais de estoque, mas não podem arquivar cadastros como mesclados ou alterar os vínculos históricos. A API do aplicativo também exige dono. A publicação do frontend não executa SQL: sem acesso administrativo ao Supabase, essa aplicação fica pendente.

Depois do deploy, recarregue os aparelhos para usar o detector e as permissões atualizados. Os textos dos novos avisos contemplam os três modos de linguagem, com português como fallback. Nomes e códigos originais não são traduzidos.
