import type { Consulta } from './dados';
import { infoStatus, estaEmAberto } from './status';
import { formatarTelefone, horaNoFuso, porExtensoNoFuso, quandoNoFuso }
  from '../../nucleo/formato';

/**
 * ============================================================
 *  O CARD DA CONSULTA NA LISTA
 *
 *  Reconstruído do `renderAgendamentos` do JS_Admin, com as
 *  mesmas classes de CSS, a mesma ordem de botões e as mesmas
 *  quatro tarjas.
 *
 *  ------------------------------------------------------------
 *  AS TARJAS, E POR QUE ELAS NÃO SÃO STATUS
 *
 *  Uma consulta pode ser várias ao mesmo tempo: um encaixe que
 *  compareceu e já gerou retorno são três fatos sobre a mesma
 *  linha. Se "retorno agendado" fosse status, ele apagaria o
 *  "compareceu" — e a recepção perderia a informação de que o
 *  paciente foi atendido.
 *
 *  O sistema de hoje já tinha acertado isso. O comentário
 *  original diz, com todas as letras: *"'atendido' e 'retorno
 *  agendado' são dois fatos diferentes sobre a mesma consulta, e
 *  transformar um em status apagaria o outro."*
 * ============================================================
 */

/**
 * Hora, data e "quando" — SEMPRE no relógio do hospital.
 *
 * Estas três eram `new Date(iso).getHours()`, que usa o fuso de
 * quem está olhando. Foi o que fez a agenda das 08:00 abrir
 * mostrando 05:00 em 01/10/2026.
 *
 * As de verdade moram em `nucleo/formato.ts`, com teste rodando
 * de propósito num fuso a doze horas daqui.
 */
export const horaDe = horaNoFuso;
export const dataPorExtenso = porExtensoNoFuso;
export const quandoBR = quandoNoFuso;

export interface AcoesConsulta {
  aoAbrir: (c: Consulta) => void;
  aoWhatsApp: (c: Consulta) => void;
  aoCorrigir: (c: Consulta) => void;
  aoReagendar: (c: Consulta) => void;
  aoConfirmarPorTelefone: (c: Consulta) => void;
  aoMudarStatus: (c: Consulta, novo: string) => void;
  aoRetorno: (c: Consulta) => void;
}

/* ---------- as tarjas ---------- */

function Tarjas({ c }: { c: Consulta }) {
  return (
    <>
      {/* 🟦 REAGENDADO — cancelada, mas o paciente foi para outro dia.
          Azul e não vermelho porque é um fato diferente de desistência. */}
      {c.reagendado_para_quando && (
        <div className="tarja tarja-reagendado">
          <i className="fas fa-calendar-alt" /> REAGENDADO — o paciente foi para{' '}
          {quandoBR(c.reagendado_para_quando, c.fuso)}
        </div>
      )}

      {/* 🟥 CONFLITO — larga e vermelha de propósito: quem passa o olho
          na agenda do dia tem que ver sem abrir nada. */}
      {c.conflito_com && (
        <div className="tarja tarja-conflito">
          <strong>⛔ Mesmo horário de {c.conflito_com}</strong>
          <br />
          <span style={{ fontWeight: 400 }}>
            Ligue para um dos dois e remarque no{' '}
            <i className="fas fa-calendar-alt" /> aqui do lado.
          </span>
        </div>
      )}

      {/* ⭐⭐⭐ 🟪 DIVIDE O HORÁRIO, E ESTÁ TUDO BEM — 31/10/2026
        *
        *  O Tom, vendo as 317 sobreposições do relatório:
        *  *"Se trata de encaixe."*
        *
        *  A tarja vermelha acima manda LIGAR E REMARCAR. Para um
        *  encaixe isso é instrução errada — ninguém vai desmarcar
        *  um paciente que foi encaixado de propósito. E tarja
        *  vermelha que pede o que ninguém vai fazer é tarja que a
        *  recepção aprende a não ler.
        *
        *  ⚠️ Mas sumir com ela não pode virar silêncio: três
        *     pacientes em meia hora é coisa que se precisa saber.
        *     Então a informação fica, em roxo, sem o pedido de ação.
        *
        *  Quem separa os dois é o banco (`divide_horario_com` ×
        *  `conflito_com`, no `062`), não esta tela. Tela que
        *  decide isso sozinha é a segunda resposta para a mesma
        *  pergunta — e já sabemos como isso termina. */}
      {c.divide_horario_com && (
        <div className="tarja tarja-roxa" data-tarja="divide-horario">
          <i className="fas fa-user-group" /> Divide o horário com{' '}
          {c.divide_horario_com}
          <br />
          <span style={{ fontWeight: 400 }}>
            Encaixe — não precisa remarcar.
          </span>
        </div>
      )}

      {/* 🟪 RETORNO */}
      {c.tem_retorno && (
        <div className="tarja tarja-roxa">
          <i className="fas fa-calendar-check" /> Retorno agendado
          {c.retorno_em ? ` para ${quandoBR(c.retorno_em, c.fuso)}` : ''}
        </div>
      )}

      {/* 🟪 ENCAIXE */}
      {c.eh_encaixe && (
        <div className="tarja tarja-roxa">
          <i className="fas fa-plus" /> ENCAIXE — vaga aberta fora da grade
        </div>
      )}
    </>
  );
}

/* ---------- o card ---------- */

/**
 * `ocupado` = este card está esperando a resposta do banco.
 *
 * Sem isso, dois cliques rápidos em "Compareceu" mandam duas
 * chamadas. A segunda é recusada pelo banco (`de = para` não é
 * mudança válida) — e a recepção vê um aviso de recusa logo
 * depois de um aviso de sucesso, para a mesma ação, sem entender
 * por quê.
 */
export function CardConsulta({ c, acoes, ocupado = false }: {
  c: Consulta;
  acoes: AcoesConsulta;
  ocupado?: boolean;
}) {
  const st = infoStatus(c.situacao);
  const aberto = estaEmAberto(c.situacao);

  // Cancelada que virou outra consulta não é cancelamento: é
  // remarcação. Selo e cor diferentes, porque são fatos
  // diferentes.
  const foiRemarcada = c.situacao === 'CANCELADO' && !!c.reagendado_para_quando;
  const selo = foiRemarcada ? { icone: '🔄', rotulo: 'Reagendado' } : st;

  const parar = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className={`ag-card status-${st.classe}`} onClick={() => acoes.aoAbrir(c)}>
      <div className="ag-card-time">
        <div className="ag-card-hora">{horaDe(c.inicio, c.fuso)}</div>
        <div className="ag-card-duracao">
          {c.tipo === 'exame' ? 'Exame' : 'Consulta'}
        </div>
      </div>

      <div className="ag-card-info">
        <div className="ag-card-header">
          <span className="ag-card-paciente">{c.paciente}</span>
          <span
            className={`ag-card-status-badge status-${st.classe}`}
            style={foiRemarcada ? { background: '#EFF6FF', color: '#1E40AF' } : undefined}
          >
            {selo.icone} {selo.rotulo}
          </span>
          <span className="ag-card-origem">
            {c.origem === 'chat'
              ? <><i className="fas fa-robot" /> Chat</>
              : <><i className="fas fa-user-tie" /> Operador</>}
          </span>
        </div>

        <div className="ag-card-details">
          <span><i className="fas fa-user-md" /> {c.recurso}</span>
          <span><i className="fas fa-stethoscope" /> {c.servico}</span>
          <span><i className="fas fa-id-card" /> {c.convenio ?? 'Particular'}</span>
          <span><i className="fas fa-phone" /> {formatarTelefone(c.paciente_telefone) || '—'}</span>
        </div>

        <Tarjas c={c} />
      </div>

      <div className="ag-card-actions"
           style={ocupado ? { opacity: .4, pointerEvents: 'none' } : undefined}
           aria-busy={ocupado || undefined}>
        <button className="ag-action-btn detalhes" title="Detalhes"
                onClick={parar(() => acoes.aoAbrir(c))}>
          <i className="fas fa-eye" />
        </button>

        <button className="ag-action-btn whatsapp" title="WhatsApp"
                onClick={parar(() => acoes.aoWhatsApp(c))}>
          <i className="fab fa-whatsapp" />
        </button>

        {/* O lápis aparece em TODAS, inclusive nas canceladas:
            corrigir um nome errado continua valendo depois do
            cancelamento. */}
        <button className="ag-action-btn detalhes"
                title="Corrigir nome, telefone ou convênio"
                onClick={parar(() => acoes.aoCorrigir(c))}>
          <i className="fas fa-pen" />
        </button>

        {/* Retorno só faz sentido depois do atendimento. Antes
            disso o paciente ainda não foi visto pelo médico, e não
            há retorno do que marcar. */}
        {c.situacao === 'COMPARECEU' && !c.tem_retorno && (
          <button className="ag-action-btn" style={{ background: '#7C3AED', color: '#fff' }}
                  title="Agendar retorno"
                  onClick={parar(() => acoes.aoRetorno(c))}>
            <i className="fas fa-rotate-left" />
          </button>
        )}

        {aberto && (
          <>
            {/* CONFIRMEI POR TELEFONE

                Só aparece enquanto o paciente NÃO confirmou.
                Depois o botão some sozinho — senão viraria um
                botão que não faz nada, e botão que não faz nada
                ensina a equipe a ignorar botão.

                Existe por causa dos importados: telefone errado,
                o paciente nunca recebe a mensagem, e a
                confirmação dele nunca chega sozinha. */}
            {c.situacao === 'AGENDADO' && (
              <button className="ag-action-btn" style={{ background: '#ECFDF5', color: '#065F46' }}
                      title="Confirmei por telefone"
                      onClick={parar(() => acoes.aoConfirmarPorTelefone(c))}>
                <i className="fas fa-phone-volume" />
              </button>
            )}

            {/* Reagendar vem antes de cancelar, e não só quando há
                conflito: quem liga para o paciente para remarcar
                precisa do botão ali, sem ter que cancelar e criar
                de novo. */}
            <button className="ag-action-btn" title="Reagendar"
                    style={c.conflito_com ? { background: 'var(--danger)', color: '#fff' } : undefined}
                    onClick={parar(() => acoes.aoReagendar(c))}>
              <i className="fas fa-calendar-alt" />
            </button>

            <button className="ag-action-btn compareceu" title="Compareceu"
                    onClick={parar(() => acoes.aoMudarStatus(c, 'COMPARECEU'))}>
              <i className="fas fa-check" />
            </button>

            <button className="ag-action-btn faltou" title="Faltou"
                    onClick={parar(() => acoes.aoMudarStatus(c, 'FALTOU'))}>
              <i className="fas fa-user-times" />
            </button>

            <button className="ag-action-btn cancelar" title="Cancelar"
                    onClick={parar(() => acoes.aoMudarStatus(c, 'CANCELADO'))}>
              <i className="fas fa-ban" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
