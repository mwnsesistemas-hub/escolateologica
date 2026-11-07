import { diaDeTrabalho, type Expediente, type Bloqueio, type DiaDeTrabalho }
  from '../../nucleo/expediente';
import {
  vagasDoDia, vagasDoOperador, vagasDoPedido, reguaDoDia,
  type Vaga, type VagaDoOperador, type VagaDoPedido,
  type Ocupado, type OcupadoComDono,
  type Encaixe, type LinhaDoDia
} from '../../nucleo/vagas';
import { hojeNoFuso, horaNoFuso, diaNoFuso } from '../../nucleo/formato';
import type { Grade, Consulta } from './dados';

/**
 * ============================================================
 *  A COLA ENTRE A GRADE DO BANCO E O NÚCLEO
 *
 *  O banco devolve três listas cruas. O núcleo sabe transformar
 *  isso em horários. Este arquivo só junta as pontas — e é de
 *  propósito que ele não decide nada.
 *
 *  Se um dia alguém precisar mudar a regra de "quais horários
 *  dá para vender", o lugar é `nucleo/vagas.ts`, onde há 29
 *  testes e 5 mutantes esperando. Aqui não há regra para mudar.
 * ============================================================
 */

export type { Vaga, VagaDoOperador, VagaDoPedido, LinhaDoDia };

/** As horas de agora, no relógio do hospital. */
function agoraEmMinutos(fuso: string): number {
  const hhmm = horaNoFuso(new Date().toISOString(), fuso);
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Os horários livres de UM dia da grade.
 *
 * `diaISO` no formato aaaa-mm-dd.
 *
 * O `Date` é montado ao MEIO-DIA de propósito. `new Date('2026-10-13')`
 * sozinho é lido como UTC; em UTC-3 vira 21:00 do dia anterior, e o
 * dia da semana sai errado — o que faria a terça usar o expediente
 * da segunda. Meio-dia tem doze horas de folga para cada lado.
 */
export function diaDaGrade(g: Grade, diaISO: string): DiaDeTrabalho {
  const data = new Date(`${diaISO}T12:00:00`);

  const expedientes: Expediente[] = (g.expedientes ?? []).map(e => ({
    dia_semana: e.dia_semana,
    inicio_min: e.inicio_min,
    fim_min: e.fim_min,
    intervalo_inicio: e.intervalo_inicio,
    intervalo_fim: e.intervalo_fim,
    semanas_do_mes: e.semanas_do_mes,
    ativo: e.ativo
  }));

  const bloqueios: Bloqueio[] = (g.bloqueios ?? [])
    .filter(b => b.dia === diaISO)
    .map(b => ({ hora_inicio_min: b.hora_inicio_min, hora_fim_min: b.hora_fim_min }));

  // A agenda extra DESTE dia entra como mais um bloco de
  // expediente. Quem a soma é o núcleo, no mesmo lugar em que
  // o expediente normal é montado — e por isso o bloqueio, que
  // é descontado depois, vence ela.
  const extras = (g.extras ?? [])
    .filter(e => e.dia === diaISO)
    .map(e => ({ ini: e.inicio_min, fim: e.fim_min }));

  return diaDeTrabalho(expedientes, data, bloqueios, extras);
}

/** Os encaixes de UM dia, no formato do núcleo. */
export function encaixesDoDia(g: Grade, diaISO: string): Encaixe[] {
  return (g?.encaixes ?? [])
    .filter(e => e.dia === diaISO)
    .map(e => ({ id: e.id, ini: e.inicio_min, fim: e.fim_min, motivo: e.motivo }));
}

/**
 * Só corta por horário se o dia for HOJE — e hoje no relógio do
 * hospital, não no de quem está olhando. Quem abre o painel de
 * outro fuso veria o dia errado, e o erro seria de um dia
 * inteiro.
 */
function agoraSeForHoje(g: Grade, diaISO: string): number | null {
  return diaISO === hojeNoFuso(g.fuso) ? agoraEmMinutos(g.fuso) : null;
}

export function vagasDoDiaDaGrade(g: Grade, diaISO: string): Vaga[] {
  if (!g || g.erro) return [];

  const ocupados: Ocupado[] = (g.ocupados ?? [])
    .filter(o => o.dia === diaISO)
    .map(o => ({ inicio_min: o.inicio_min, fim_min: o.fim_min }));

  return vagasDoDia(diaDaGrade(g, diaISO).blocos, g.duracao_min, ocupados,
                    { agoraMin: agoraSeForHoje(g, diaISO) });
}

/**
 * ------------------------------------------------------------
 *  A RÉGUA DE UM DIA, PARA A TELA DO MÉDICO
 *
 *  Repare no segundo parâmetro: `marcados` vem de FORA, da
 *  lista de consultas que a tela já carregou — e não de
 *  `g.ocupados`.
 *
 *  É de propósito, e é o ponto mais delicado da tela do médico.
 *
 *  `g.ocupados` e a lista de consultas descrevem a MESMA coisa:
 *  o que está marcado para este médico. Mas `g.ocupados` não
 *  traz nome de paciente, e a tela precisa escrever o nome em
 *  cima do horário.
 *
 *  Se eu usasse as duas — `g.ocupados` para calcular o que
 *  sobra, a lista de consultas para escrever os nomes — seriam
 *  duas respostas para "quem está marcado". No dia em que uma
 *  delas mudasse de regra (um status novo que não deve ocupar
 *  horário, por exemplo), a tela mostraria quatro pacientes e
 *  contaria três vagas a menos. Calada.
 *
 *  Então a tela do médico usa UMA: a lista de consultas, que é
 *  a que tem nome. `g.ocupados` continua servindo ao assistente
 *  de marcação, que não precisa de nome nenhum.
 * ------------------------------------------------------------
 */
export function reguaDoDiaDaGrade(
  g: Grade, diaISO: string, marcados: OcupadoComDono[]
): LinhaDoDia[] {
  if (!g || g.erro) return [];
  return reguaDoDia(diaDaGrade(g, diaISO), g.duracao_min, marcados,
                    { agoraMin: agoraSeForHoje(g, diaISO) },
                    encaixesDoDia(g, diaISO));
}

/**
 * ------------------------------------------------------------
 *  OS HORÁRIOS DO CAMINHO MANUAL
 *
 *  `vagasDoDiaDaGrade`, acima, é o que o paciente enxerga: o
 *  expediente, a agenda extra, menos o bloqueio e o que já está
 *  marcado. Nenhum encaixe.
 *
 *  Esta soma os encaixes por cima. Quem a chama é o assistente
 *  de Novo Agendamento, que é a recepção marcando à mão — a
 *  mesma regra da tela de hoje: *"só aparece aqui e no
 *  agendamento manual, nunca no chat."*
 *
 *  O reagendamento continua na de cima, de propósito: mover um
 *  paciente para um encaixe aberto para outro é dar a vaga de
 *  alguém a quem não foi convidado.
 * ------------------------------------------------------------
 */
export function vagasManuaisDoDia(g: Grade, diaISO: string): VagaDoOperador[] {
  if (!g || g.erro) return [];

  const ocupados: Ocupado[] = (g.ocupados ?? [])
    .filter(o => o.dia === diaISO)
    .map(o => ({ inicio_min: o.inicio_min, fim_min: o.fim_min }));

  return vagasDoOperador(diaDaGrade(g, diaISO).blocos, g.duracao_min, ocupados,
                         encaixesDoDia(g, diaISO),
                         { agoraMin: agoraSeForHoje(g, diaISO) });
}

/**
 * ⭐⭐⭐ OS HORÁRIOS SABENDO O TAMANHO DO PEDIDO.  (09/10/2026)
 *
 * `vagasManuaisDoDia` responde "cabe UM atendimento aqui?" —
 * que é a pergunta certa para consulta e para exame avulso.
 *
 * O pedido de vários subtipos faz outra pergunta, e usar a
 * primeira no lugar da segunda foi o defeito que o Tom
 * desenterrou: a tela oferecia 11:40 num aparelho que trabalha
 * até as 12:00, e o pedido de três exames andava até 12:40.
 *
 * As durações vêm na ordem em que o pedido vai ser marcado,
 * porque é nessa ordem que o laço do `marcar_exame` anda. Uma
 * soma só não bastaria: com uma consulta ocupando o meio, o que
 * decide é ONDE cada exame cai, não quanto somam.
 */
export function vagasDoPedidoNoDia(
  g: Grade, diaISO: string, duracoes: number[]
): VagaDoPedido[] {
  if (!g || g.erro) return [];

  const ocupados: Ocupado[] = (g.ocupados ?? [])
    .filter(o => o.dia === diaISO)
    .map(o => ({ inicio_min: o.inicio_min, fim_min: o.fim_min }));

  return vagasDoPedido(diaDaGrade(g, diaISO).blocos, duracoes, ocupados,
                       encaixesDoDia(g, diaISO),
                       { agoraMin: agoraSeForHoje(g, diaISO) });
}

/**
 * As consultas, no formato que a régua entende: minutos desde a
 * meia-noite, no relógio do hospital.
 *
 * Uma passada só sobre a lista inteira, devolvendo um mapa por
 * dia. Filtrar a lista dentro do laço das casinhas do mês seriam
 * 31 varreduras da mesma lista.
 */
export function marcadosPorDia(
  consultas: Consulta[], fuso: string
): Map<string, OcupadoComDono[]> {
  const fora = new Map<string, OcupadoComDono[]>();

  for (const c of consultas ?? []) {
    // Cancelada não ocupa horário — ele já voltou para a
    // prateleira. É a mesma regra do `grade_do_periodo` e da
    // trava `recurso_sem_conflito`, que também ignoram
    // cancelado.
    if (c.situacao === 'CANCELADO') continue;

    const dia = diaNoFuso(c.inicio, fuso);
    const emMin = (iso: string) => {
      const [h, m] = horaNoFuso(iso, fuso).split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const ini = emMin(c.inicio);
    let fim = emMin(c.fim);
    // Consulta que atravessa a meia-noite: o fim volta para
    // antes do começo. Não existe hoje (nenhum serviço passa de
    // 240 min), mas um 23:50 + 30 min daria um bloco negativo e
    // a régua esconderia a consulta inteira.
    if (fim <= ini) fim = 1440;

    const lista = fora.get(dia) ?? [];
    lista.push({
      id: c.id, inicio_min: ini, fim_min: fim,
      quem: c.paciente, situacao: c.situacao, encaixe: c.eh_encaixe
    });
    fora.set(dia, lista);
  }

  return fora;
}

/**
 * Quantas vagas cada dia do período tem.
 *
 * Para o calendário pintar as casinhas sem montar 31 listas de
 * horários. Uma passada só sobre a grade que já está na memória
 * — nenhuma ida a mais ao banco.
 */
export function vagasPorDia(g: Grade): Map<string, number> {
  const fora = new Map<string, number>();
  if (!g || g.erro || !g.de || !g.ate) return fora;

  const fim = new Date(`${g.ate}T12:00:00`);
  for (let d = new Date(`${g.de}T12:00:00`); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fora.set(iso, vagasDoDiaDaGrade(g, iso).length);
  }
  return fora;
}

/** 480 → "08:00" */
export function comoHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * O instante absoluto que vai para o banco.
 *
 * Mora no núcleo, com teste rodando num navegador em Tóquio —
 * é lógica de tempo, e lógica de tempo errada não dá erro, dá
 * a hora errada.
 */
export { instanteNoFuso } from '../../nucleo/formato';
