/**
 * ============================================================
 *  A PONTE ENTRE TELAS                            (21/10/2026)
 *
 *  O Tom, na tela de Conversas do sistema antigo: um botão
 *  "Agendar" que leva ao Novo Agendamento com o paciente já
 *  procurado. Aqui fica o pedido pendurado até a outra tela
 *  pegar — UMA vez: pegou, sumiu, para não reaparecer na próxima
 *  vez que alguém abrir o Novo Agendamento pelo menu.
 * ============================================================
 */
let buscaPendente: string | null = null;

/** Leva ao Novo Agendamento já procurando por `busca`. */
export function irParaNovoAgendamento(busca: string) {
  buscaPendente = busca;
  window.dispatchEvent(new CustomEvent('medcalendar:ir-para', { detail: 'novoagendamento' }));
}

/** O Novo Agendamento pega o pedido (e ele some). */
export function pegarBuscaPendente(): string {
  const b = buscaPendente ?? '';
  buscaPendente = null;
  return b;
}
