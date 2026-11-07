/**
 * ============================================================
 *  OS STATUS DA CONSULTA — UMA RÉGUA SÓ
 *
 *  O ícone, o rótulo e a classe de cor de cada status moram
 *  aqui, num lugar só, e tudo na tela lê daqui.
 *
 *  ------------------------------------------------------------
 *  POR QUE ISTO É UM ARQUIVO E NÃO UM `switch` EM CADA TELA
 *
 *  No sistema de hoje o mapa está escrito dentro do
 *  `getStatusInfoConsulta`, no meio do JS_Admin — e o card do
 *  exame tinha o seu próprio, parecido mas diferente. Foi assim
 *  que os rótulos da fila de exames precisaram ser "corrigidos"
 *  em setembro: duas listas da mesma coisa, andando separadas.
 *
 *  É o mesmo padrão que produziu o almoço oferecido ao paciente
 *  e a faixa bloqueada que ninguém enxergava: duas
 *  implementações da mesma pergunta, discordando em silêncio.
 *
 *  Consulta e exame leem ESTE arquivo. Não há segundo lugar.
 * ============================================================
 */

export type Situacao =
  | 'AGENDADO'
  | 'CONFIRMADO'
  | 'COMPARECEU'
  | 'FALTOU'
  | 'CANCELADO';

export interface InfoStatus {
  icone: string;
  rotulo: string;
  /** o sufixo da classe de CSS: `.ag-card.status-<classe>` */
  classe: string;
}

const MAPA: Record<Situacao, InfoStatus> = {
  // AGENDADO é o que o Apps Script chamava de CONFIRMADO. O
  // rótulo na tela é o mesmo de sempre: "Aguardando".
  AGENDADO:   { icone: '⏳',  rotulo: 'Aguardando', classe: 'agendado' },
  CONFIRMADO: { icone: '✅',  rotulo: 'Confirmado', classe: 'confirmado' },
  COMPARECEU: { icone: '✔️',  rotulo: 'Compareceu', classe: 'compareceu' },
  FALTOU:     { icone: '❌',  rotulo: 'Faltou',     classe: 'faltou' },
  CANCELADO:  { icone: '⛔',  rotulo: 'Cancelado',  classe: 'cancelado' }
};

export function infoStatus(situacao: string): InfoStatus {
  return MAPA[situacao as Situacao]
    // Status desconhecido não some da tela e não finge ser outro:
    // aparece com o nome cru e um ponto de interrogação. Se um dia
    // o banco ganhar um status novo e alguém esquecer deste
    // arquivo, a recepção vê — em vez de ver um card em branco.
    ?? { icone: '❓', rotulo: situacao, classe: 'cancelado' };
}

/** Os status em que a consulta ainda vai acontecer. */
export function estaEmAberto(situacao: string): boolean {
  return situacao === 'AGENDADO' || situacao === 'CONFIRMADO';
}

/** As opções do filtro de status, na ordem da tela de hoje. */
export const FILTRO_STATUS: { valor: Situacao; texto: string }[] = [
  { valor: 'AGENDADO',   texto: '🟡 Aguardando confirmação' },
  { valor: 'CONFIRMADO', texto: '🟢 Confirmado' },
  { valor: 'COMPARECEU', texto: '✅ Compareceu' },
  { valor: 'FALTOU',     texto: '❌ Faltou' },
  { valor: 'CANCELADO',  texto: '⛔ Cancelado' }
];
