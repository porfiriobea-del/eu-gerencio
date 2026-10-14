# Cópia dos feedbacks para a planilha

Os feedbacks continuam gravados em `eu_feedbacks` no Supabase. Após a confirmação, o aplicativo solicita uma cópia à planilha; uma falha de exportação não apaga o registro nem impede consultar o histórico em outro aparelho. O botão **Enviar histórico à planilha** permite encaminhar feedbacks anteriores e repetir envios não confirmados, um por vez.

O destino padrão é a URL `/exec` informada nesta conversa, configurada em `api/feedback/export.ts`. A variável de servidor `FEEDBACK_SHEETS_WEBHOOK_URL` permite trocar esse destino na Vercel. A rota usa a sessão Firebase verificada pelo Supabase e só exporta registros do próprio usuário. Ela não aceita mensagens ou URLs de destino enviadas pelo navegador.

## Configuração necessária no Apps Script

1. Abra o Apps Script vinculado à planilha de destino. Adapte o código de `integrations/feedback-apps-script.gs`. Se já existe `doPost`, integre a ramificação de feedback e preserve as outras integrações.
2. Esse código cria a aba **Feedbacks**, com ID, data UTC, loja, e-mail, tipo, nota, mensagem e contato. Usa bloqueio para gravações concorrentes e ignora IDs já registrados. Nenhuma informação de feedback deve ser enviada para uma planilha de teste.
3. Atualize a implantação existente em **Implantar → Gerenciar implantações → Editar → Nova versão**, executando como proprietário e permitindo acesso ao App da Web. Preserve a URL `/exec` fornecida. A resposta deve ser JSON `{ "success": true }` depois de confirmar a gravação. HTML ou resposta sem confirmação não será considerado sucesso.
4. Faça o deploy do app e envie um feedback real. Confira a aba e use **Enviar histórico à planilha** para registros anteriores. Mensagens de sucesso do envio de feedback confirmam o Supabase; somente o resultado da exportação confirma a planilha.

Se o projeto Apps Script não está vinculado à planilha, substitua `SpreadsheetApp.getActiveSpreadsheet()` por `SpreadsheetApp.openById('ID_DA_PLANILHA')` no código do Apps Script. Não há ID da planilha informado na URL do App da Web.

A rota do servidor respeita `SUPABASE_URL` / `VITE_SUPABASE_URL` e `SUPABASE_ANON_KEY` / `VITE_SUPABASE_KEY` / `VITE_SUPABASE_ANON_KEY`; utiliza os mesmos valores públicos padrão do app quando ausentes. Nunca utiliza `service_role` ou copia o token do usuário ao Apps Script.

A configuração do código do Apps Script e a confirmação de uma linha real exigem acesso ao projeto Google. Os testes automatizados usam transporte simulado e não gravam feedbacks na planilha de produção.
