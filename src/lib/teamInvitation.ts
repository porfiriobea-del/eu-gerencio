export interface InvitationTextData {name:string;storeName?:string;role:string;email:string;pin?:string;url:string;}
export const invitationStoreName=(name?:string)=>name?.trim() || 'nossa loja';
/** Shared by email and copied WhatsApp text. Names are never translated. */
export function formatTeamInvitation(data:InvitationTextData,channel:'email'|'whatsapp'='email') {
 const store=invitationStoreName(data.storeName);
 const bold=(value:string)=>channel==='whatsapp'?`*${value}*`:value;
 const body=`Olá, ${data.name.trim()}!\n\n${bold(store)} tem alegria em convidar você para a nossa equipe na função de ${bold(data.role)}. Vamos trabalhar juntos no Eu Gerencio!\n\n1. Toque no link abaixo.\n2. Entre com o Google usando exatamente este e-mail: ${bold(data.email.trim().toLowerCase())}.\n3. Veja as vendas, o estoque e o fiado da loja.\n\n${channel==='whatsapp'?'🔗 ':''}${data.url}\n\n${channel==='whatsapp'?'🔑 ':''}Senha do Caixa: ${bold(data.pin?.trim() || 'Crie sua senha no primeiro acesso')}.\nNão compartilhe esta senha. No primeiro acesso, troque por uma senha só sua.\n\nEstamos felizes em ter você por aqui!\nEquipe ${store}`;
 return {subject:`Convite para a equipe da ${store} no Eu Gerencio`,body};
}
export function isObviousEmployeePin(pin:string) {
 const value=pin.trim().toLowerCase();
 if(value.length<4 || value.length>64 || /^(.{1,4})\1+$/.test(value)) return true;
 if(['1234','0000','1111','123123','112233','1212','123123123','password','senha','senha123','admin','qwerty','abcd'].includes(value))return true;
 return ['01234567890123456789','98765432109876543210','abcdefghijklmnopqrstuvwxyz','zyxwvutsrqponmlkjihgfedcba','qwertyuiop','asdfghjkl','zxcvbnm'].some(sequence=>sequence.includes(value));
}
export function assertEmployeePin(pin:string) {if(isObviousEmployeePin(pin))throw new Error('Escolha uma senha com 4 a 64 caracteres, sem repetições ou sequências como 1234.');}

// Store owners may choose a simple temporary password; the employee's personal password remains strict.
export const isInvalidTemporaryPin=(pin:string)=>pin.trim().length<4 || pin.trim().length>64;
export function assertTemporaryEmployeePin(pin:string) {if(isInvalidTemporaryPin(pin))throw new Error('A senha provisória deve ter de 4 a 64 caracteres.');}
