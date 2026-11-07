import { useEffect, useMemo, useState } from 'react';
import {
  resumoDoDia, pendenciasDoDia,
  type ResumoDoDia, type PendenciaDoDia
} from './dados';
import { hojeNoFuso, somarDias } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';
import { Rankings } from './Rankings';

/**
 * ============================================================
 *  O DASHBOARD
 *
 *  É o primeiro item do menu desde o primeiro dia, e estava
 *  vazio. Quem abria o painel de manhã caía numa tela que dizia
 *  "por construir".
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O QUE ESTA TELA ESCOLHEU **NÃO** MOSTRAR
 *
 *  A tentação de um dashboard é o número bonito: atendimentos no
 *  mês, crescimento, média por médico. Isso não ajuda ninguém às
 *  7h40.
 *
 *  O que ajuda é o que **precisa de alguém hoje**. E, de tudo
 *  isso, o que mais importa são os três buracos que **não dão
 *  erro em lugar nenhum**:
 *
 *    · o médico com paciente marcado e sem expediente aberto;
 *    · o exame ativo que ninguém faz;
 *    · o aparelho que faz exame e não tem horário.
 *
 *  Cada um deles só aparece sozinho quando tem um paciente na
 *  recepção. Esta tela existe para antecipá-los — e por isso
 *  eles vêm ANTES dos números, e não depois.
 * ============================================================
 */

const FUSO = 'America/Sao_Paulo';

const TITULO_DA_PENDENCIA: Record<string, string> = {
  medico_sem_expediente: 'Com paciente marcado e sem expediente aberto',
  exame_sem_quem_faca:   'Exames que ninguém faz',
  aparelho_sem_horario:  'Aparelhos sem horário'
};

const ONDE_RESOLVER: Record<string, string> = {
  medico_sem_expediente: 'Agenda do Médico → Expediente',
  exame_sem_quem_faca:   'Gestão de Exames, ou Médicos',
  aparelho_sem_horario:  'Aparelhos e Salas → Horários'
};

export function Dashboard({ clienteId, atendeConvenios = true }: {
  clienteId: string; atendeConvenios?: boolean;
}) {
  const { recado, avisar, fechar } = useAviso();

  const [dia, setDia] = useState(hojeNoFuso(FUSO));
  const [resumo, setResumo] = useState<ResumoDoDia | null>(null);
  const [pend, setPend] = useState<PendenciaDoDia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    Promise.all([resumoDoDia(clienteId, dia), pendenciasDoDia(clienteId, dia)])
      .then(([r, p]) => {
        if (!valido) return;
        setResumo(r); setPend(p); setCarregando(false);
      })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, dia]);

  /** As pendências agrupadas pelo tipo, na ordem de urgência. */
  const grupos = useMemo(() => {
    const ordem = ['medico_sem_expediente', 'exame_sem_quem_faca',
                   'aparelho_sem_horario'];
    return ordem
      .map(t => ({ tipo: t, itens: pend.filter(p => p.tipo === t) }))
      .filter(g => g.itens.length);
  }, [pend]);

  const ehHoje = dia === hojeNoFuso(FUSO);

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>{ehHoje ? 'Hoje no hospital' : 'O dia'}</h2>
          <p>{dia.split('-').reverse().join('/')}</p>
        </div>
        <div className="dash-datas">
          <button className="btn-secondary btn-sm" data-acao="dia-anterior"
                  onClick={() => setDia(d => somarDias(d, -1))}
                  aria-label="Dia anterior">
            <i className="fas fa-chevron-left" />
          </button>
          <input type="date" value={dia} data-campo="dia"
                 onChange={e => setDia(e.target.value || hojeNoFuso(FUSO))} />
          <button className="btn-secondary btn-sm" data-acao="dia-seguinte"
                  onClick={() => setDia(d => somarDias(d, 1))}
                  aria-label="Dia seguinte">
            <i className="fas fa-chevron-right" />
          </button>
          {!ehHoje && (
            <button className="btn-secondary btn-sm" data-acao="voltar-hoje"
                    onClick={() => setDia(hojeNoFuso(FUSO))}>Hoje</button>
          )}
        </div>
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && resumo && (
        <>
          {/* ════════════════════════════════════════════════
              ⭐⭐⭐ O QUE PRECISA DE ALGUÉM VEM PRIMEIRO

              Números em cima e problemas embaixo é a ordem que
              faz ninguém rolar a tela. Estes três buracos não
              dão erro em lugar nenhum: eles só aparecem com um
              paciente na recepção.
              ════════════════════════════════════════════════ */}
          {!!grupos.length && (
            <div className="dash-pendencias" data-bloco="pendencias">
              {grupos.map(g => (
                <div key={g.tipo} className="dash-pend" data-pendencia={g.tipo}>
                  <div className="dash-pend-cab">
                    <i className="fas fa-triangle-exclamation" />
                    <strong>{TITULO_DA_PENDENCIA[g.tipo] ?? g.tipo}</strong>
                    <em>{g.itens.length}</em>
                  </div>
                  <ul>
                    {g.itens.slice(0, 6).map(i => (
                      <li key={i.id} data-item={i.id}>
                        <strong>{i.nome}</strong>
                        <small>{i.detalhe}</small>
                      </li>
                    ))}
                  </ul>
                  {g.itens.length > 6 && (
                    <small className="dash-mais">
                      e mais {g.itens.length - 6}…
                    </small>
                  )}
                  <small className="dash-onde">
                    Resolve em: <strong>{ONDE_RESOLVER[g.tipo]}</strong>
                  </small>
                </div>
              ))}
            </div>
          )}

          {!grupos.length && (
            <div className="dia-nota verde" data-aviso="sem-pendencias">
              <strong>Nenhum buraco silencioso neste dia.</strong>
              <p>
                Todo médico com paciente tem expediente aberto, todo exame ativo
                tem quem faça, e todo aparelho tem horário.
              </p>
            </div>
          )}

          {/* ---------------- a fila ---------------- */}
          {resumo.fila_pendente > 0 && (
            <div className={'dia-nota ' +
                  (resumo.fila_mais_antiga >= 3 ? 'amarela' : 'azul')}
                 data-aviso="fila-no-dashboard">
              <strong>
                {resumo.fila_pendente}{' '}
                {resumo.fila_pendente === 1 ? 'pedido de exame esperando'
                                            : 'pedidos de exame esperando'}
                {resumo.fila_atencao > 0 &&
                  ` · ${resumo.fila_atencao} com resposta que pede atenção`}
              </strong>
              <p>
                O mais antigo está há {resumo.fila_mais_antiga}{' '}
                {resumo.fila_mais_antiga === 1 ? 'dia' : 'dias'} na fila.
                Veja em <strong>Fila de Solicitações</strong>.
              </p>
            </div>
          )}

          {/* ---------------- os números ---------------- */}
          <div className="dash-numeros" data-bloco="numeros">
            <div className="dash-cartao grande" data-numero="marcados">
              <span className="dash-valor">{resumo.marcados}</span>
              <span className="dash-rotulo">
                {resumo.marcados === 1 ? 'atendimento' : 'atendimentos'}
              </span>
              <small>
                {resumo.consultas} consulta{resumo.consultas === 1 ? '' : 's'}
                {' · '}{resumo.exames} exame{resumo.exames === 1 ? '' : 's'}
              </small>
            </div>

            <div className="dash-cartao" data-numero="confirmados">
              <span className="dash-valor">{resumo.confirmados}</span>
              <span className="dash-rotulo">confirmados</span>
            </div>
            <div className="dash-cartao" data-numero="compareceram">
              <span className="dash-valor">{resumo.compareceram}</span>
              <span className="dash-rotulo">compareceram</span>
            </div>
            <div className="dash-cartao ruim" data-numero="faltaram">
              <span className="dash-valor">{resumo.faltaram}</span>
              <span className="dash-rotulo">faltaram</span>
            </div>
            <div className="dash-cartao" data-numero="cancelados">
              <span className="dash-valor">{resumo.cancelados}</span>
              <span className="dash-rotulo">cancelados</span>
            </div>
            <div className="dash-cartao" data-numero="encaixes">
              <span className="dash-valor">{resumo.encaixes}</span>
              <span className="dash-rotulo">
                {resumo.encaixes === 1 ? 'encaixe' : 'encaixes'}
              </span>
            </div>
            <div className="dash-cartao" data-numero="amanha">
              <span className="dash-valor">{resumo.amanha}</span>
              <span className="dash-rotulo">amanhã</span>
            </div>
          </div>

          {/* ---------------- as tarjas do dia ----------------
              ⚠️ Conflito, limite e faixa etária são decisões que
              ALGUÉM tomou conscientemente — a tela de marcar pede
              confirmação para as três. Mostrá-las aqui não é
              acusar: é lembrar que elas existem naquele dia, para
              quem for atender não ser pego de surpresa. */}
          {(resumo.conflitos > 0 || resumo.acima_do_limite > 0
            || resumo.fora_da_faixa > 0) && (
            <div className="dia-nota amarela" data-aviso="tarjas-do-dia">
              <strong>Atendimentos marcados com exceção, neste dia:</strong>
              <p>
                {[
                  resumo.conflitos > 0 && `${resumo.conflitos} em conflito de horário`,
                  resumo.acima_do_limite > 0 && `${resumo.acima_do_limite} acima do limite do convênio`,
                  resumo.fora_da_faixa > 0 && `${resumo.fora_da_faixa} fora da faixa etária do médico`
                ].filter(Boolean).join(' · ')}.
              </p>
              <p>
                Alguém confirmou cada um deles na hora de marcar. Estão aqui só
                para quem for atender não ser pego de surpresa.
              </p>
            </div>
          )}
        </>
      )}

      {/* ⭐ Os rankings ficam ABAIXO do dia, e não acima.
          O dashboard responde primeiro "o que preciso resolver
          hoje"; "quem move a agenda" é a pergunta do mês, e ela
          não pode empurrar as pendências do dia para baixo da
          dobra. */}
      <Rankings clienteId={clienteId} atendeConvenios={atendeConvenios} />

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
