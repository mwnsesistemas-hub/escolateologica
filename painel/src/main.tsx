import React from 'react';
import { createRoot } from 'react-dom/client';

/* ============================================================
 *  A FONTE E OS ÍCONES VÊM DE DENTRO, NÃO DE UM CDN
 *
 *  O sistema de hoje busca os dois na internet, com duas linhas
 *  no `<head>`:
 *
 *    fonts.googleapis.com/…/Inter
 *    cdnjs.cloudflare.com/…/font-awesome
 *
 *  Vi o que acontece quando isso falha: tirei uma foto da tela
 *  numa rede que bloqueia o cdnjs, e TODOS os botões de ação
 *  viraram quadradinhos coloridos vazios.
 *
 *  Não é um defeito de enfeite. Os botões da agenda são só
 *  ícone — não têm texto. Sem a fonte de ícones, "Compareceu",
 *  "Faltou" e "Cancelar" viram três quadrados do mesmo tamanho,
 *  lado a lado, e a recepção não tem como saber qual é qual.
 *  Alguém vai clicar em Cancelar achando que é Compareceu.
 *
 *  Um hospital tem rede corporativa, proxy, bloqueio de domínio e
 *  internet que cai. A tela não pode depender de um servidor de
 *  terceiro para os botões dizerem o que fazem.
 *
 *  Agora os dois entram no pacote e são servidos pela Cloudflare
 *  junto com o resto. Se a página abriu, os ícones abriram.
 * ============================================================ */

import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
// ⭐ 06/11: a fonte dos títulos da tela inicial — a Sora da Versão 4 aprovada pelo Tom
// (empacotada, como a Inter: nada de CDN).
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import '@fortawesome/fontawesome-free/css/brands.css';

import './estilo.css';
import './chat.css';
import './landing.css';
import { App } from './App';
import { Chat } from './chat/Chat';
import { Landing } from './Landing';
import { PortaDoMedico } from './PortaDoMedico';
import { CotacaoFornecedor } from './CotacaoFornecedor';
import { MapaTV } from './MapaTV';
import { VerificarAssinatura } from './VerificarAssinatura';

/* ============================================================
 *  ⭐⭐⭐ TRÊS PORTAS NO MESMO PRÉDIO             (14/10/2026)
 *
 *    `/`              a porta da frente — o site do produto
 *    `/chat/<slug>`   o chat do PACIENTE daquele hospital
 *    `/painel`        o painel, onde o hospital entra
 *
 *  O Tom comprou `medcalendar.com.br` e pediu: *"ele podia
 *  abrir uma landing page falando sobre o sistema com um botão
 *  de login onde seria a entrada do painel para as empresas."*
 *
 *  ⭐ Qualquer outro caminho cai no painel, e não num 404. Link
 *     velho de cliente continua abrindo o sistema — que é o que
 *     ele queria quando clicou.
 *
 *  ⚠️ O chat é público: não tem login, não tem sessão, e não
 *     pode nem tentar criar uma.
 *
 *  ------------------------------------------------------------
 *  POR QUE A ESCOLHA É AQUI, ANTES DE TUDO
 *
 *  Porque o `App` começa pedindo a sessão ao Supabase e, sem
 *  ela, desenha a tela de login. Um paciente que clicasse no
 *  link do WhatsApp veria *"Entrar no MedCalendar"* — e
 *  fecharia.
 *
 *  ⚠️ Deixar o `App` montar e só depois trocar de tela seria
 *     pior que feio: o pedido de sessão sai, a tela pisca
 *     login, e por um instante o paciente vê o sistema interno
 *     do hospital.
 *
 *  ⭐ Um `if` antes do `render` é mais barato que um roteador —
 *     e são duas rotas, não vinte.
 * ============================================================ */
const caminho = window.location.pathname.replace(/\/+$/, '');
const noChat = caminho.match(/^\/chat\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])$/i);

const naFrente = caminho === '' || caminho === '/index.html';

/* ⭐⭐⭐ 26/10: A PORTA DO MÉDICO.
 *
 *  O Tom: *"No sistema atual, o acesso do medico não fica no
 *  painel. ele fica em um link separado."* Ele escolheu manter
 *  o link separado — e a MESMA senha do sistema, para não haver
 *  dois lugares guardando a senha de uma pessoa.
 *
 *  `/medico` é o endereço que o médico guarda no celular. */
const naPortaDoMedico = caminho === '/medico';

/* ⭐⭐⭐ 31/10: A PORTA DO FORNECEDOR.
 *
 *  `/cotacao?c=<codigo>` — a empresa de OPME abre pelo link que
 *  chegou no WhatsApp, sem login.
 *
 *  ⚠️ Ela entra AQUI, antes do `App`, pelo mesmo motivo do chat
 *     do paciente: o `App` começa pedindo a sessão ao Supabase
 *     e, sem ela, desenha a tela de login. O fornecedor veria
 *     "Entrar no MedCalendar" e fecharia.
 *
 *  O código vai na QUERY e não no caminho: ele tem 32
 *  caracteres, e endereço longo quebra em linha no WhatsApp —
 *  metade do link vira texto e o fornecedor clica num pedaço. */
/* ⭐⭐⭐ 06/11: A PORTA DA TV DO CENTRO CIRÚRGICO.
 *  `/mapa?c=<codigo>` — o mapa cirúrgico, SEM login (a TV não tem quem
 *  digite senha). Entra antes do `App`, como as outras portas sem login.
 *  ⚠️ Porta nova entra nos DOIS pontos de entrada (conferir_portas). */
const codigoDoMapa = caminho === '/mapa'
  ? new URLSearchParams(window.location.search).get('c')
  : null;

const codigoDaCotacao = caminho === '/cotacao'
  ? new URLSearchParams(window.location.search).get('c')
  : null;

/* ⭐ 31/10: A PORTA DE QUEM CONFERE A GUIA.
 *
 *  `/verificar?c=<codigo>` — o endereço que sai IMPRESSO no
 *  rodapé da guia TISS. Quem abre é o convênio ou a auditoria,
 *  sem login, com o papel na mão.
 *
 *  ⚠️ Porta nova entra nos DOIS pontos de entrada. Foi a quarta
 *     vez que esta linha precisou ser escrita em dois lugares —
 *     e agora o `painel/conferir_portas.mjs` recusa quando eles
 *     divergem. */
const codigoParaVerificar = caminho === '/verificar'
  ? new URLSearchParams(window.location.search).get('c')
  : null;

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    {noChat           ? <Chat slug={noChat[1]!.toLowerCase()} />
   : codigoDaCotacao  ? <CotacaoFornecedor codigo={codigoDaCotacao} />
   : caminho === '/mapa' ? <MapaTV codigo={codigoDoMapa ?? ''} />
   : caminho === '/verificar'
                      ? <VerificarAssinatura codigo={codigoParaVerificar ?? ''} />
   : naPortaDoMedico  ? <PortaDoMedico />
   : naFrente         ? <Landing />
   :                    <App />}
  </React.StrictMode>
);
