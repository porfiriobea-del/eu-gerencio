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
