# Relatório anônimo para Apps Script

Supabase continua como banco principal. `/api/relatorio` envia uma cópia de feedback e eventos de uso ao Apps Script; falhas ou configuração ausente não travam o app nem mostram erro ao usuário. O histórico continua no Supabase. A antiga rota `/api/feedback/export` encaminha para o novo formato, sem enviar nome da loja ou e-mail.

Configure somente no projeto **eu-gerencio**, em Vercel → Settings → Environment Variables:

- `APPS_SCRIPT_URL`: URL de produção `/exec` fornecida nesta conversa.
- `APPS_SCRIPT_SECRET`: segredo escolhido pelo administrador, igual à propriedade de mesmo nome no Apps Script. Não coloque seu valor no GitHub, em variáveis `VITE_`, no navegador ou no chat.

Integre `integrations/feedback-apps-script.gs` ao script vinculado à planilha e preserve outros handlers existentes. Em Configurações do projeto → Propriedades do script, cadastre `APPS_SCRIPT_SECRET` com o mesmo valor. Atualize a implantação para uma nova versão preservando a URL `/exec`. Depois faça Redeploy no projeto eu-gerencio da Vercel.

O POST do servidor usa `Content-Type: text/plain` e JSON. Feedback: categoria `feedback`, nota, tipo, mensagem, contato voluntário quando preenchido, loja e usuário anônimos. Uso: categoria `uso`, evento (`venda`, `produto_cadastrado`, `foto_ia`, `fiado_lancado`, `compra_registrada`), valor e IDs anônimos. Nenhum nome, e-mail ou telefone é colocado em loja/usuário. O texto livre da mensagem e o contato fornecido voluntariamente continuam sendo enviados conforme solicitado.

Os códigos são SHA-256 com prefixos separados para loja e usuário. O servidor confirma a identidade via Supabase, lê o feedback persistido e seleciona apenas campos permitidos; ignora conteúdo/segredo arbitrário vindo do navegador. Nenhum token de login é enviado ao Apps Script.

O Apps Script grava na aba **Feedback** (ID anônimo, data UTC, loja anônima, usuário anônimo, nota, tipo, mensagem, contato) e na aba **Uso** (data, loja anônima, usuário anônimo, evento, valor). Bloqueio evita gravações concorrentes; IDs de feedback evitam duplicação ao reenviar o histórico. O segredo não é gravado nas abas. Apps Script não vinculado deve usar `SpreadsheetApp.openById` com o ID real da planilha.

Para confirmar produção, envie um feedback real pelo app após o deploy e confira a linha na aba Feedback. Resposta HTML, configuração ausente ou erro do serviço não contam como confirmação. Os testes locais usam transporte simulado e não provam gravação em produção. O acesso administrativo à Vercel, ao Apps Script e uma sessão Google autenticada são necessários para concluir essa verificação.

O Apps Script confirma a gravação com JSON `{ "ok": true }` (o formato anterior `{ "success": true }` também é aceito). Sem confirmação, o servidor registra `EXPORT_NOT_CONFIRMED`, status HTTP, tipo de conteúdo e os primeiros 320 caracteres da resposta, com segredo e valores pessoais conhecidos removidos. O app não exibe erro nem perde o feedback salvo.

O handler compartilhado fica em `server/relatorio.ts`, fora das funções da Vercel. As duas rotas importam `server/relatorio.js`, preservando os caminhos do JavaScript ESM emitido. O frontend mantém o tsconfig de Vite; `tsconfig.server.json` usa `NodeNext`, emite em `build/server` e reescreve imports TypeScript restantes para `.js`. `package.json` permanece com `type: module`. `npm run build` compila frontend e servidor; `npm start` executa o servidor JavaScript compilado, sem resolução especial de arquivos TypeScript.

## Validação dos cálculos do Resumo

Datas são gravadas como datas nativas do Sheets (a exibição depende do fuso horário da planilha); notas e valores são números, não texto. Atualize a implantação do Apps Script com a versão corrigida para aplicar essa regra a novos envios. A alteração não converte linhas antigas automaticamente.

A aba Feedback recebe Nota na coluna E e Tipo na F; os tipos enviados são `suggestion`, `praise`, `bug`, `question` e `other`. A aba Uso recebe Evento na D e Valor na E. Para contar dias de uso, agrupe a parte inteira da data da coluna A, pois horários distintos do mesmo dia representam um único dia. Fórmulas mostrando zero numa planilha vazia não comprovam recebimento: confirme linhas reais nas duas abas e os resultados correspondentes no Resumo.

Ao revisar o XLSX do administrador, os cabeçalhos de Feedback estavam deslocados (Data em A, Nota em D, Tipo em E), incompatíveis com o ID em A enviado pelo script. As abas Feedback e Uso estavam vazias; seis linhas incompletas permaneciam na aba Página1. Os critérios de tipo no Resumo eram apenas portugueses e não contavam os códigos ingleses enviados pelo app.

Antes de publicar o script atualizado, alinhe os cabeçalhos das abas ao formato descrito acima e ajuste o Resumo (Nota em E, Tipo em F, Loja em C para Feedback). Use `SPREADSHEET_ID` nas Propriedades do Apps Script com `13oh-mdCTnX-8aBAd8oVdBarglzaMYTZXrd7FRqsX4Ck` para selecionar explicitamente a planilha desejada; quando ausente, permanece o vínculo atual do script. Cabeçalhos incompatíveis agora retornam `SHEET_SCHEMA_MISMATCH` em vez de gravar em colunas erradas. Não preencha colunas auxiliares com fórmulas em milhares de linhas das abas de entrada: isso interfere com appendRow; mantenha esses cálculos no Resumo.

### Corrigir a planilha original sem baixar ou substituir o XLSX

O script agora aceita tanto o layout original (`Data`, `Loja (código)`, `Usuário (código)`, `Nota`, `Tipo`, `Mensagem`, `Contato (opcional)`, `Dados brutos`) quanto o layout com ID em A. No original, H recebe somente JSON com o ID anônimo para impedir feedbacks repetidos; nenhum segredo ou payload bruto é gravado. As abas e os registros existentes não são apagados.

Cole a versão atual de `integrations/feedback-apps-script.gs` no projeto Apps Script vinculado à planilha original, preservando outros handlers. Execute uma vez `corrigirPlanilhaOriginal` no editor e autorize o acesso à planilha. Essa função usa SPREADSHEET_ID, ou o ID da planilha original fornecida quando a propriedade estiver ausente. Ela corrige apenas as células conhecidas do Resumo; mantém formatação e dados. Depois atualize a implantação `/exec` para a nova versão. Novos POSTs confirmados também atualizam essas fórmulas automaticamente. Não é necessário alterar tabelas do Supabase, que permanece como banco principal. Reenvie feedbacks pelo botão “Enviar histórico à planilha” do app após publicar; os envios de uso anteriores não são recuperados automaticamente.

O Resumo passa a contar os tipos em inglês e português, usar as colunas do layout detectado e contar dias únicos sem descontar um dia válido quando não houver células vazias. Fórmulas são fornecidas em inglês via API do Apps Script, independentemente do idioma exibido no Sheets.

### Correção de #ERROR! no Resumo

A implementação atual substitui as fórmulas das 14 células conhecidas por valores numéricos calculados no Apps Script. Isso elimina dependência do idioma e do separador de argumentos da planilha. Substitui a orientação anterior sobre fórmulas em inglês. A média considera somente notas válidas de 1 a 5; dias de uso são agrupados no fuso horário da planilha, e registros vazios são ignorados. Os cálculos aceitam os dois layouts de Feedback e os tipos em português ou inglês.

Depois de atualizar o código no editor, execute `corrigirPlanilhaOriginal` para remover os erros já existentes e publique nova versão da implantação. O Resumo atualiza a cada novo registro recebido via doPost; edições manuais nas abas exigem executar a função novamente. Não há necessidade de trocar o idioma da planilha ou alterar o Supabase. Testes usam execução simulada do Apps Script e não comprovam publicação na conta Google.

Se os erros persistirem, `corrigirPlanilhaOriginal` agora abre obrigatoriamente a planilha original, confirma após flush que as 14 células contêm os números esperados e nenhuma fórmula, grava SPREADSHEET_ID correto e mostra toast. Só essa execução registra `RESUMO_CORRIGIDO`. Abas ausentes, cabeçalhos desconhecidos e resultados não confirmados causam erro explícito no editor. Não há mais retorno silencioso quando o texto do título A3 for diferente. Uma implantação nova não executa a função de reparo por si só: selecione-a e execute no editor. Se houver funções antigas de mesmo nome em outros arquivos .gs, remova as duplicatas antes de executar; preserve funções de integrações não relacionadas.

Também é seguro selecionar `corrigirResumo` diretamente no editor: sem argumento, ela chama a mesma rotina de reparo e verifica a planilha original. Isso corrige o erro `Cannot read properties of undefined (reading 'getSheetByName')`. Chamadas internas com a planilha como argumento continuam usando o destino do relatório recebido.

### Pendências de publicação e conferência

- Atualizar o Apps Script com o arquivo atual e publicar nova versão na implantação `/exec` existente. Publicar no GitHub não atualiza o Apps Script.
- Executar `corrigirPlanilhaOriginal` ou `corrigirResumo` pelo editor e confirmar `RESUMO_CORRIGIDO` no registro de execução.
- Conferir um feedback real e um evento real de uso, verificando as linhas e os indicadores do Resumo. Zeros sem novos registros não comprovam recebimento.
- Para a aba Comércios, confirmar separadamente a migração `20261016_registered_stores_count.sql` e abrir uma loja cadastrada. A migração de permissões e turnos não substitui essa migração. O total deve vir do Supabase; não preencher com estimativa ou zero para ocultar falhas.

Essas etapas exigem acesso à conta Google e, para conferir configuração e implantação, à Vercel. Testes locais não confirmam que a planilha original recebeu os dados.

### Diferenciar falha de acesso, segredo e cálculo

Os logs da Vercel mantêm `EXPORT_NOT_CONFIRMED` e incluem `reason`: `APPS_SCRIPT_ACCESS_DENIED` quando Google devolve HTML com 401/403, `APPS_SCRIPT_SECRET_MISMATCH` quando o doPost responde JSON com INVALID_SECRET, ou `SHEET_SCHEMA_MISMATCH` para colunas desconhecidas. Acesso negado pelo Google ocorre antes da validação do segredo do script; não se corrige com alterações no Supabase ou fórmulas. Na implantação do Apps Script, use Executar como Eu e acesso Qualquer pessoa (inclusive sem login), preservando a validação do segredo. Se a organização impedir essa opção, o administrador precisa liberar ou aprovar outra implantação.

Depois de persistir uma linha, falha no cálculo do Resumo não transforma a gravação em erro: doPost confirma `ok:true` e informa `summaryUpdated:false`. Isso evita tratar um evento já salvo como falha e duplicá-lo por reenvio. Execute a função administrativa de reparo para diagnosticar a aba quando necessário.

### Eventos de uso em segundo plano

O app já dispara `reportUsage` após confirmar no Supabase uma venda, cadastro de produto, lançamento de venda fiada e registro de compra. Uma venda fiada envia `venda` e `fiado_lancado`; venda e compra incluem seus respectivos totais. A leitura bem-sucedida de rótulo por câmera ou galeria envia `foto_ia`. Importações em lote enviam um evento `produto_cadastrado` para a operação de cadastro.

`src/lib/usageReporting.ts` mantém os envios em fila na memória e executa no máximo duas requisições simultâneas. A operação da tela não aguarda autenticação, cálculo de hash ou resposta do relatório. Os pedidos usam `/api/relatorio`, categoria `uso`, evento, valor e códigos SHA-256 da loja/usuário, com o mesmo transporte usado pelo feedback. Falhas são absorvidas e a fila continua; não há toast nem falha na venda. Eventos pendentes de uma conta são descartados ao trocar de usuário para evitar envio pela sessão errada. A fila não é persistida: fechar a página pode interromper relatórios pendentes. Isso não altera os registros de negócio no Supabase.
