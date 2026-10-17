import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTeamInvitation,isObviousEmployeePin,assertEmployeePin,assertTemporaryEmployeePin} from '../src/lib/teamInvitation.ts';
test('email and WhatsApp share invitation details, preserve names and distinguish formatting',()=>{
 const data={name:'  José ',storeName:'Banca da Lu',role:'Operador de Caixa',email:'JOSE@EXAMPLE.COM',pin:'5739',url:'https://app.test/?invite=test'};
 const mail=formatTeamInvitation(data,'email'),whats=formatTeamInvitation(data,'whatsapp');
 assert.equal(mail.subject,'Convite para a equipe da Banca da Lu no Eu Gerencio');
 for(const text of [mail.body,whats.body]){
  assert.match(text,/Olá, José!/);assert.match(text,/Banca da Lu/);assert.match(text,/1\. Toque no link/);assert.match(text,/2\. Entre com o Google usando exatamente este e-mail/);assert.match(text,/3\. Veja as vendas, o estoque e o fiado/);
  assert.match(text,/jose@example.com/);assert.match(text,/5739/);assert.match(text,/Não compartilhe/);assert.match(text,/primeiro acesso/);assert.ok(text.endsWith('Equipe Banca da Lu'));assert.ok(text.includes(data.url));assert.doesNotMatch(text,/do estabelecimento/);
 }
 assert.doesNotMatch(mail.body,/\*/);assert.match(whats.body,/\*Banca da Lu\*/);
 assert.match(formatTeamInvitation({...data,storeName:'  '}).subject,/nossa loja/);
 assert.match(formatTeamInvitation({...data,pin:undefined}).body,/Crie sua senha no primeiro acesso/);
});
test('obvious passwords including repetitions and ascending/descending sequences are blocked',()=>{
 for(const pin of ['1234','0000','1111','4321','4567','9876','0123','123456','12341234','1212','abcd','qwerty','senha','123']){
  assert.equal(isObviousEmployeePin(pin),true,pin);assert.throws(()=>assertEmployeePin(pin));
 }
 for(const pin of ['5739','6248','Caixa!73'])assert.doesNotThrow(()=>assertEmployeePin(pin));
});

test('temporary passwords allow simple defaults but personal passwords still reject them',()=>{
 for(const pin of ['1234','1111','0000']){
  assert.doesNotThrow(()=>assertTemporaryEmployeePin(pin));
  assert.throws(()=>assertEmployeePin(pin));
 }
 for(const pin of ['', '123', 'x'.repeat(65)])assert.throws(()=>assertTemporaryEmployeePin(pin));
});
