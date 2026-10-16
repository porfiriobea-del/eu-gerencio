# Fotos dos produtos

Antes de usar os uploads, execute no SQL Editor do Supabase a migração
`supabase/migrations/20261016_product_images_storage.sql`, depois da migração
`20261014_cloud_source_of_truth.sql`. Ela configura o bucket público `produtos`,
aceitando somente WebP de até 30 KB, com gravação restrita à pasta da loja
pelo vínculo autenticado de proprietário ou funcionário.

As fotos enviadas pelo cadastro, câmera e galeria são comprimidas no navegador:
lado maior de até 400 px, qualidade WebP 0,7. Se necessário, as dimensões diminuem
mais até respeitar 30 KB. A foto usada na análise da IA mantém sua resolução de
leitura; somente a cópia persistida é reduzida.

O produto recebe apenas a URL após o upload terminar. Uma falha impede salvar
Base64 como alternativa. Links HTTP(S) já existentes são preservados.

Ao abrir Estoque, as fotos Base64 da loja atual são convertidas em segundo plano,
uma por vez. O campo só é substituído depois do upload, numa transação que verifica
se a foto original ainda é a mesma. Estoque e outros dados não são alterados.
Se houver falha, os originais continuam disponíveis; reabrir Estoque retoma o trabalho.
A rotina requer uma sessão válida e o bucket previamente configurado.

As URLs são públicas, adequadas a imagens de mercadorias; não envie documentos ou
dados pessoais como foto de produto. Os nomes dos arquivos usam hash do conteúdo
comprimido. Arquivos compartilhados ou sem referência não são excluídos
automaticamente. Os cards só recebem o src da imagem ao entrar na área visível.
