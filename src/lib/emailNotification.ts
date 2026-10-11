export interface WelcomeEmailData {
  storeName: string;
  email: string;
  cnpj?: string;
  phone?: string;
}

export function generateWelcomeEmailContent(data: WelcomeEmailData) {
  const appUrl = window.location.origin;
  const dateFormatted = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = `🎉 Sua conta no Eu Gerencio foi criada com sucesso! (${data.storeName})`;

  const body = `Olá, equipe ${data.storeName}!

Parabéns! Sua conta no sistema "Eu Gerencio" foi criada com sucesso em ${dateFormatted}.

----------------------------------------
📋 DADOS DO SEU COMÉRCIO:
----------------------------------------
• Nome da Loja: ${data.storeName}
• E-mail da Conta: ${data.email}
${data.cnpj ? `• CNPJ: ${data.cnpj}\n` : ''}${data.phone ? `• Contato: ${data.phone}\n` : ''}
----------------------------------------
🚀 COMO COMEÇAR:
----------------------------------------
1. Acesse seu painel pelo link:
   ${appUrl}

2. Cadastre seus produtos:
   Vá em "Estoque" e registre os produtos com seus preços e custos.

3. Registre suas vendas:
   Abra o "Caixa" e comece a lançar vendas em dinheiro, cartão ou fiado.

4. Convide sua equipe:
   Use o botão "Convidar Equipe" no menu lateral para adicionar colaboradores.

Qualquer dúvida ou suporte, estamos à disposição para ajudar seu comércio a crescer!

Abraços,
Equipe Eu Gerencio
${appUrl}
`;

  return { subject, body };
}

export function openWelcomeEmail(data: WelcomeEmailData, targetEmail?: string) {
  const recipient = targetEmail || data.email;
  const { subject, body } = generateWelcomeEmailContent(data);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  // Try direct mailto
  const mailtoUrl = `mailto:${recipient}?subject=${encodedSubject}&body=${encodedBody}`;
  window.location.href = mailtoUrl;
}

export function getGmailComposeUrl(data: WelcomeEmailData, targetEmail?: string) {
  const recipient = targetEmail || data.email;
  const { subject, body } = generateWelcomeEmailContent(data);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodedSubject}&body=${encodedBody}`;
}
