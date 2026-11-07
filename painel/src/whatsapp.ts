import type { Consulta } from './dados';
import { horaNoFuso, porExtensoNoFuso } from '../../nucleo/formato';
import { paraWhatsApp as paraNumero, primeiroNome } from '../../nucleo/whatsapp';

/**
 * ============================================================
 *  O BOTÃO VERDE — ENQUANTO A API DA META NÃO CHEGA
 *
 *  O envio automático é a etapa 5: webhook da Meta, janela de
 *  24 horas, modelos aprovados. Tudo isso é trabalho de
 *  verdade, e tem fila na frente.
 *
 *  Mas o botão pode abrir o WhatsApp com a mensagem JÁ ESCRITA.
 *  A recepção confere e aperta enviar.
 *
 *  Isso não é a etapa 5 disfarçada. É menos: não confirma
 *  sozinho, não reenvia em 24h, não sabe se o paciente leu.
 *  Mas tira o "ligue para o paciente" de hoje, e custa um link.
 *
 *  ------------------------------------------------------------
 *  POR QUE `wa.me` E NÃO `api.whatsapp.com`
 *
 *  O `wa.me` é o endereço oficial e curto. Ele abre o
 *  aplicativo no celular e o WhatsApp Web no computador, com a
 *  mesma URL — e a recepção usa os dois.
 *
 *  ------------------------------------------------------------
 *  O TELEFONE PRECISA DO 55
 *
 *  O WhatsApp só entende o número com código do país. Sem o 55,
 *  o link abre uma conversa em branco com um número que não
 *  existe — e quem clicou acha que mandou.
 * ============================================================
 */

// `paraWhatsApp` mora no núcleo, com teste: errar o número
// não dá erro, só perde a mensagem.
export { paraWhatsApp } from '../../nucleo/whatsapp';

/** A mensagem de confirmação, pronta para a recepção revisar. */
export function textoConfirmacao(c: Consulta, hospital: string): string {
  const quando = porExtensoNoFuso(c.inicio, c.fuso);
  const hora = horaNoFuso(c.inicio, c.fuso);
  const primeiro = primeiroNome(c.paciente);

  return [
    `Olá, ${primeiro}! Aqui é do ${hospital}.`,
    '',
    `Sua consulta está marcada para ${quando} às ${hora}, com ${c.recurso}.`,
    c.servico ? `Atendimento: ${c.servico}.` : '',
    '',
    'Pode confirmar sua presença, por favor? Se precisar remarcar, é só responder esta mensagem.'
  ].filter(l => l !== '').join('\n');
}

/**
 * O link que abre o WhatsApp com a mensagem escrita.
 *
 * `null` quando o telefone não serve — a tela usa isso para
 * desligar o botão em vez de abrir uma aba inútil.
 */
export function linkWhatsApp(c: Consulta, hospital: string): string | null {
  const numero = paraNumero(c.paciente_telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(textoConfirmacao(c, hospital))}`;
}

/**
 * ============================================================
 *  AS VARIÁVEIS DA CONFIRMAÇÃO, NA ORDEM DA META
 *  13/10/2026
 *
 *  ⭐⭐⭐ A ORDEM É O CONTRATO
 *
 *  O modelo aprovado na Meta tem `{{1}}`, `{{2}}`, `{{3}}`…
 *  Números, não nomes. Trocar duas de lugar não dá erro em
 *  lugar nenhum: a mensagem sai com o nome do médico onde
 *  deveria estar a data, e o paciente comparece no dia errado.
 *
 *  Por isso esta função existe e tem teste. Ela é a única que
 *  decide a ordem, e `MODELOS_DO_SISTEMA`, na tela de
 *  configuração, mostra essa mesma ordem para quem for aprovar
 *  o modelo na Meta.
 * ============================================================
 */
export function variaveisDaConfirmacao(c: Consulta): string[] {
  return [
    primeiroNome(c.paciente),
    c.servico ?? '',
    porExtensoNoFuso(c.inicio, c.fuso),
    horaNoFuso(c.inicio, c.fuso),
    c.recurso ?? ''
  ];
}
