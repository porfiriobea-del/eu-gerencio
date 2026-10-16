# Aba Comércios na planilha original

A aba **Comércios** mostra:
- total atual de comércios com cadastro válido no Supabase;
- data e hora da última atualização;
- fonte da contagem.

Não é uma estimativa baseada nas abas Uso ou Feedback. Um proprietário equivale a
um comércio, conforme o modelo atual do aplicativo. Funcionários não contam como
novos comércios. Perfis sem nome, registros auxiliares e cadastros apagados são
excluídos. Lojas cadastradas que ainda não enviaram eventos também contam.

## Ativar

1. No SQL Editor do Supabase, executar
   supabase/migrations/20261016_registered_stores_count.sql.
2. No projeto Apps Script já ligado à planilha original, atualizar o código com
   integrations/feedback-apps-script.gs, preservando outras integrações que
   existirem no projeto. Há apenas um doPost: mesclar handlers, se necessário.
3. Publicar uma nova versão na implantação do App da Web existente. Manter a URL
   /exec, acesso público e as propriedades APPS_SCRIPT_SECRET e SPREADSHEET_ID
   já usadas pelo feedback.
4. Após o deploy do app, abrir uma loja cadastrada. O app envia uma solicitação em
   segundo plano a /api/relatorio com categoria comercios. O servidor consulta a
   função agregada no Supabase e envia somente o número e códigos anônimos.
5. Conferir a aba Comércios: B3 é o total, B4 é a última atualização. Feedback,
   Uso e Resumo não são apagadas ou recriadas por essa operação.

O total é atualizado quando alguém abre uma loja no app, inclusive após concluir
o cadastro inicial. Não é um contador em tempo real nem usa cron. Se houver falha,
o valor anterior e sua data permanecem; nenhuma falha é convertida em zero.
Quando não houver nenhum comércio válido, zero é um resultado legítimo.

A função SQL exige identidade verificada e retorna somente um número agregado;
não concede acesso aos nomes ou dados de outras lojas. O segredo continua apenas
no servidor e no Apps Script.
