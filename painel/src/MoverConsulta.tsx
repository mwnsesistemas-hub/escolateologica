import { useEffect, useMemo, useState } from 'react';
import {
  gradeDoPeriodo, primeiraDataPossivel, reagendarConsulta, marcarRetorno,
  type Consulta, type Grade
} from './dados';
import { vagasDoDiaDaGrade, vagasPorDia, comoHora, instanteNoFuso } from './grade';
import { somarDias, comoISO, hojeNoFuso, horaNoFuso, porExtensoNoFuso }
  from '../../nucleo/formato';

/**
 * ============================================================
 *  MOVER UMA CONSULTA — reagendar, ou marcar o retorno
 *
 *  Um componente só para os dois, porque a pergunta é a mesma:
 *  **para quando?** O calendário, a lista de horários e o jeito
 *  de escolher não mudam.
 *
 *  O que muda é o fim, e o modo diz qual:
 *
 *    reagendar → cancela a antiga apontando para a nova
 *                (`reagendado_para`, a tarja AZUL)
 *    retorno   → cria uma nova ligada à que já aconteceu
 *                (`retorno_de`, a tarja ROXA) — e a origem
 *                continua COMPARECEU
 *
 *  Fazer dois componentes quase iguais seria criar duas
 *  implementações da mesma tela, e dentro de um mês uma teria
 *  um conserto que a outra não teve.
 *
 *  ------------------------------------------------------------
 *  A REGRA DOS 30 DIAS VALE NOS DOIS
 *
 *  No reagendamento era óbvio: senão ele vira o atalho para
 *  furá-la — marca em qualquer dia e reagenda para o proibido.
 *
 *  No retorno eu tinha decidido que NÃO valia, e estava errado.
 *  O Tom corrigiu em 08/10/2026: sem o piso, o botão roxo é
 *  que vira o atalho. Marca, clica em retorno, pronto.
 *
 *  Então os dois pedem o piso, e o calendário abre na data em
 *  que a agenda libera. O dia proibido não aparece — a tela não
 *  oferece o que o banco vai recusar.
 * ============================================================
 */

export type Modo = 'reagendar' | 'retorno';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function MoverConsulta({
  c, modo, aoPronto, aoFechar
}: {
  c: Consulta;
  modo: Modo;
  /** Chamado com a mensagem do banco quando deu certo. */
  aoPronto: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [grade, setGrade] = useState<Grade | null>(null);
  const [mes, setMes] = useState('');
  const [dia, setDia] = useState('');
  const [horario, setHorario] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [avisoPiso, setAvisoPiso] = useState('');

  const ehRetorno = modo === 'retorno';

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    setErro('');

    (async () => {
      try {
        // Os DOIS pedem o piso. Se o calendário do retorno
        // abrisse em qualquer dia, ele ofereceria datas que o
        // banco recusa — e botão que só serve para receber
        // "não" ensina a equipe a ignorar botão.
        let inicio = hojeNoFuso(c.fuso);
        const m = await primeiraDataPossivel(c.recurso_id, c.paciente_id);
        if (m?.data_minima) {
          inicio = m.data_minima;
          if (m.ultima_em) {
            setAvisoPiso(
              ehRetorno
                ? `O retorno vale a partir de ` +
                  `${m.data_minima.split('-').reverse().join('/')} — ` +
                  `${m.dias_retorno} dias depois da consulta de ` +
                  `${new Date(m.ultima_em).toLocaleDateString('pt-BR')}. ` +
                  `Antes disso o convênio ainda conta como a mesma consulta.`
                : `${c.paciente} consultou com ${c.recurso} em ` +
                  `${new Date(m.ultima_em).toLocaleDateString('pt-BR')}. Pela regra dos ` +
                  `${m.dias_retorno} dias, a agenda abre em ` +
                  `${m.data_minima.split('-').reverse().join('/')}.`
            );
          }
        }
        if (!valido) return;
        setMes(inicio.slice(0, 7));
        const g = await gradeDoPeriodo(c.recurso_id, inicio, somarDias(inicio, 60));
        if (!valido) return;
        if (g?.erro) setErro(g.erro); else setGrade(g);
        setCarregando(false);
      } catch (e) {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      }
    })();

    return () => { valido = false; };
  }, [c.recurso_id, c.paciente_id, c.fuso, c.paciente, c.recurso, ehRetorno]);

  const porDia = useMemo(() => grade ? vagasPorDia(grade) : new Map<string, number>(),
                         [grade]);
  const vagas = useMemo(() => (grade && dia) ? vagasDoDiaDaGrade(grade, dia) : [],
                        [grade, dia]);

  const casinhas = useMemo(() => {
    if (!mes) return [];
    const [ano, m] = mes.split('-').map(Number);
    const primeiro = new Date(ano, m - 1, 1);
    const ultimo = new Date(ano, m, 0).getDate();
    const fora: ({ iso: string; dia: number; vagas: number } | null)[] = [];
    for (let i = 0; i < primeiro.getDay(); i++) fora.push(null);
    for (let d = 1; d <= ultimo; d++) {
      const iso = comoISO(new Date(ano, m - 1, d));
      fora.push({ iso, dia: d, vagas: porDia.get(iso) ?? 0 });
    }
    return fora;
  }, [mes, porDia]);

  function andarMes(passos: number) {
    const [ano, m] = mes.split('-').map(Number);
    const d = new Date(ano, m - 1 + passos, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  async function confirmar() {
    if (!grade || !dia || horario === null || indo) return;
    setIndo(true);
    setErro('');
    try {
      const quando = instanteNoFuso(dia, horario, grade.fuso);
      const r = ehRetorno
        ? await marcarRetorno(c.id, quando)
        : await reagendarConsulta(c.id, quando, motivo);

      if (!r.ok) {
        setErro(r.mensagem);
        // Horário tomado no meio do caminho: recarrega a grade,
        // senão a pessoa clica de novo no que não existe mais.
        if (/ocupado/i.test(r.mensagem)) {
          setHorario(null);
          const g = await gradeDoPeriodo(c.recurso_id, dia, somarDias(dia, 60));
          setGrade(g);
        }
        setIndo(false);
        return;
      }
      aoPronto(r.mensagem);
    } catch (e) {
      setErro((e as Error).message ?? String(e));
      setIndo(false);
    }
  }

  const pode = !!dia && horario !== null && !indo;

  return (
    <div className="modal" data-modal={ehRetorno ? 'retorno' : 'reagendar'}>
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content" style={{ maxWidth: 820 }}>

        <div className="modal-header">
          <h3>{ehRetorno ? 'Agendar retorno' : 'Reagendar'}</h3>
          <button onClick={aoFechar} aria-label="Fechar"><i className="fas fa-times" /></button>
        </div>

        <div className="modal-body">

          {/* De onde o paciente está saindo. Sem isto, quem abre
              o modal de uma lista de 40 cards não tem certeza de
              qual consulta está mexendo. */}
          <div className="mover-origem">
            <strong>{c.paciente}</strong>
            <span>
              {ehRetorno ? 'atendido em ' : 'hoje em '}
              {porExtensoNoFuso(c.inicio, c.fuso)} às {horaNoFuso(c.inicio, c.fuso)}
              {' · '}{c.recurso}
            </span>
          </div>

          {avisoPiso && <div className="wiz-aviso-azul">{avisoPiso}</div>}

          {ehRetorno && (
            <div className="wiz-aviso-azul">
              A consulta de origem <strong>continua como "compareceu"</strong> —
              o retorno é um fato novo, não troca o status do atendimento
              que já aconteceu.
            </div>
          )}

          {carregando && (
            <div className="loading-placeholder">
              <div className="spinner" /><p>Montando a agenda…</p>
            </div>
          )}

          {!carregando && grade && (
            <div className="wiz-horario">
              <div className="wiz-calendario">
                <div className="wiz-cal-topo">
                  <button onClick={() => andarMes(-1)} aria-label="Mês anterior">
                    <i className="fas fa-chevron-left" />
                  </button>
                  <span>{MESES[Number(mes.split('-')[1]) - 1]} de {mes.split('-')[0]}</span>
                  <button onClick={() => andarMes(1)} aria-label="Próximo mês">
                    <i className="fas fa-chevron-right" />
                  </button>
                </div>
                <div className="wiz-cal-grade">
                  {DIAS_CURTOS.map((d, i) => <div key={i} className="wiz-cal-cab">{d}</div>)}
                  {casinhas.map((x, i) => x === null
                    ? <div key={`v${i}`} />
                    : (
                      <button key={x.iso}
                              className={'wiz-cal-dia' + (x.vagas ? ' tem' : ' sem') +
                                         (dia === x.iso ? ' escolhido' : '')}
                              disabled={!x.vagas}
                              onClick={() => { setDia(x.iso); setHorario(null); }}>
                        <span>{x.dia}</span>
                        {!!x.vagas && <em>{x.vagas}</em>}
                      </button>
                    ))}
                </div>
              </div>

              <div className="wiz-horarios">
                {!dia && <p className="wiz-dica">Escolha um dia ao lado.</p>}
                {dia && !vagas.length && (
                  <p className="wiz-dica">Nenhum horário livre neste dia.</p>
                )}
                {dia && vagas.map(v => (
                  <button key={v.ini}
                          className={'wiz-hora' + (horario === v.ini ? ' escolhido' : '')}
                          onClick={() => setHorario(v.ini)}>
                    {comoHora(v.ini)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!ehRetorno && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>Por que está remarcando?</label>
              <input type="text" maxLength={200} value={motivo}
                     onChange={e => setMotivo(e.target.value)}
                     placeholder="opcional — fica nas observações e na auditoria" />
            </div>
          )}

          {!ehRetorno && dia && horario !== null && (
            <div className="wiz-aviso-amarelo">
              A consulta de hoje vai ficar <strong>cancelada</strong>, apontando para
              a nova — é o que faz a tarja azul aparecer no card.{' '}
              <strong>O paciente não é avisado automaticamente.</strong>
            </div>
          )}

          {erro && <div className="erro" style={{ marginTop: 14 }}>{erro}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={aoFechar} disabled={indo}>
              Voltar
            </button>
            <button type="button" className="btn-primary" data-acao="confirmar-mover"
                    onClick={confirmar} disabled={!pode}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Gravando…</>
                : <><i className="fas fa-calendar-check" />{' '}
                    {ehRetorno ? 'Marcar retorno' : 'Confirmar remarcação'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
