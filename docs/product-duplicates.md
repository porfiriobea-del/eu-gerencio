# Duplicados de produtos

O cadastro manual, a edição e a confirmação da foto consultam os produtos atuais da loja no Supabase. A comparação ignora diferenças de maiúsculas, acentos e espaços no nome; também considera códigos de barras não vazios, removendo espaços e preservando zeros iniciais. O próprio produto é excluído ao editar.

O aviso permite abrir o existente, somar ao seu estoque ou cadastrar mesmo assim. A soma usa uma quantidade informada pelo comerciante e o saldo atual do banco. Na edição, somar transfere o estoque do registro atual por mesclagem; o aviso informa que os dados do destino serão mantidos. Tipos com medidas diferentes não são somados.

A importação marca e desmarca duplicados, incluindo repetições dentro do arquivo. Para cadastrar uma cópia é necessário escolher explicitamente **Cadastrar mesmo assim**. O catálogo permite informar/revisar códigos de barras, e a IA só extrai códigos visíveis. Itens importados continuam com estoque zero; a ação separada de somar estoque requer quantidade informada.

**Verificar duplicados**, na tela de Estoque, lista grupos suspeitos e permite mesclar pares. O primeiro produto da lista é o destino: conserva cadastro, preços e custos, recebe o estoque e o estoque inicial do segundo. A transação relê revisões e recupera conflitos antes de confirmar.

O segundo registro não é apagado: fica com `mergedIntoId`, `mergedAt` e estoque zero, e sai das listas ativas de Estoque/Caixa. Isso preserva IDs usados por vendas e compras antigas. A reversão de uma compra ligada ao registro arquivado segue a cadeia de mesclagem até o destino atual. Carrinhos desatualizados com produtos mesclados são rejeitados para evitar vender o saldo antigo.

Os campos de mesclagem ficam no JSONB existente; não há nova migração SQL. Recarregue todos os aparelhos após o deploy para utilizarem a nova filtragem. A escolha de cadastrar mesmo assim é intencionalmente permitida; a verificação é um aviso, não uma restrição única no banco. Cadastros simultâneos em aparelhos diferentes ainda podem ser identificados posteriormente por **Verificar duplicados**.
