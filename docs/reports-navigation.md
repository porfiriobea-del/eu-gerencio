# Acesso a Relatórios

A página `/relatorios` reúne os filtros, indicadores e exportações já existentes
(CSV, Excel com gráficos e Google Sheets). Em Ajustes, o cartão no topo abre essa
página, sem precisar procurar a seção entre as configurações.

O botão **Fixar no menu** adiciona Relatórios à barra lateral; **Desafixar do menu**
remove somente o atalho, sem fechar a página ou apagar dados. A opção começa
desativada e fica salva no aparelho em `eu_gerencio_reports_pinned`. No celular,
Relatórios também permanece acessível em **Mais**, sem acrescentar botões à barra
inferior.

Dono e Gerente têm acesso. Funcionário não vê o atalho e não pode abrir a rota.
A página de relatórios não executa o salvamento automático das configurações.
Os três modos de linguagem e os idiomas português, inglês e espanhol contemplam
os novos controles.

## Autorização do Google Sheets

O token de acesso ao Sheets é diferente da sessão de acesso à loja. Ao clicar em
Google Sheets, antes de carregar o relatório, o app verifica um prazo conservador
de 50 minutos e a conta à qual o token pertence. Tokens antigos sem esses dados
exigem nova autorização. A janela do Google usa reautenticação da conta atual,
sem trocar de loja. O navegador precisa permitir pop-ups do aplicativo.

Rejeições HTTP 401/403 descartam o token. O próximo clique permite autorizar
novamente; a aplicação não repete automaticamente a criação de planilhas para
não duplicar exportações parcialmente concluídas. Cancelar ou bloquear a janela
libera o botão e mantém o relatório disponível. Excel/CSV não exigem essa permissão.
