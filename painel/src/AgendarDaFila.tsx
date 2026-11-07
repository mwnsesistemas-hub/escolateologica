import { useEffect, useMemo, useState } from 'react';
import {
  recursosQueFazem, gradeDoPeriodo, marcarExame,
  type QuemFaz, type Grade, type SolicitacaoDaFila
} from './dados';
import { vagasManuaisDoDia, comoHora, type VagaDoOperador } from './grade';
import { hojeNoFuso, somarDias, instanteNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  AGENDAR A PARTIR DA FILA
 *
 *  O setor leu a entrevista, decidiu que dá, e agora marca.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE NÃO MANDAR ELE PARA O NOVO AGENDAMENTO
 *
 *  Seria menos código: um link que abre o assistente com o
 *  paciente e o exame prontos.
 *
 *  E seria uma porta por onde o pedido se perde. O assistente
 *  não sabe que veio da fila — ele marcaria o exame e a
 *  solicitação ficaria **PENDENTE para sempre**, com o paciente
 *  já agendado. Na semana seguinte alguém marcaria de novo, e o
 *  paciente apareceria duas vezes na agenda do mesmo dia.
 *
 *  `marcar_exame` tem `p_solicitacao` no fim da assinatura
 *  justamente para fechar esse laço: o exame nasce e a
 *  solicitação vira AGENDADA no mesmo comando.
 *
 *  ------------------------------------------------------------
 *  O QUE ESTA TELA NÃO PERGUNTA
 *
 *  Paciente, exame e convênio vêm do pedido. Perguntar de novo
 *  seria convidar a digitar diferente — e aí a entrevista ficaria
 *  pendurada num paciente e o agendamento em outro.
 * ============================================================
 */

const FUSO = 'America/Sao_Paulo';

export function AgendarDaFila({
  clienteId, solicitacao, aoFechar, aoAvisar
}: {
  clienteId: string;
  solicitacao: SolicitacaoDaFila;
  aoFechar: (marcou: boolean) => void;
  aoAvisar: (mensagem: string, bom: boolean) => void;
}) {
  const [quemFaz, setQuemFaz] = useState<QuemFaz[]>([]);
  const [recursoId, setRecursoId] = useState('');
  const [dia, setDia] = useState(somarDias(hojeNoFuso(FUSO), 1));
  const [grade, setGrade] = useState<Grade | null>(null);
  const [buscando, setBuscando] = useState(true);
  /** O minuto escolhido. -1 = nenhum ainda. */
  const [hora, setHora] = useState(-1);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  /* Quem pode fazer ESTE exame, respeitando o convênio do pedido
     e a faixa etária do paciente — as mesmas regras do Novo
     Agendamento, pela mesma função. Duas respostas para "quem
     faz este exame" acabariam discordando. */
  useEffect(() => {
    let valido = true;
    setBuscando(true);
    recursosQueFazem({
      clienteId, servicos: [solicitacao.servico_id],
      convenio: null, nascimento: solicitacao.nascimento,
      dia, ate: dia
    })
      .then(l => {
        if (!valido) return;
        setQuemFaz(l);
        setRecursoId(a => (a && l.some(x => x.id === a)) ? a : (l[0]?.id ?? ''));
        setBuscando(false);
      })
      .catch(e => { if (valido) { setErro((e as Error).message ?? String(e)); setBuscando(false); } });
    return () => { valido = false; };
  }, [clienteId, solicitacao.servico_id, solicitacao.nascimento, dia]);

  useEffect(() => {
    let valido = true;
    if (!recursoId) { setGrade(null); return; }
    gradeDoPeriodo(recursoId, dia, dia)
      .then(g => { if (valido) { setGrade(g); setHora(-1); } })
      .catch(() => { if (valido) setGrade(null); });
    return () => { valido = false; };
  }, [clienteId, recursoId, dia]);

  const vagas = useMemo<VagaDoOperador[]>(() => {
    if (!grade) return [];
    return vagasManuaisDoDia(grade, dia);
  }, [grade, dia]);

  async function marcar() {
    if (!recursoId || hora < 0 || indo) return;
    setIndo(true);
    try {
      const r = await marcarExame({
        clienteId,
        recursoId,
        servicos: [solicitacao.servico_id],
        inicio: instanteNoFuso(dia, hora, grade?.fuso ?? FUSO),
        pacienteId: solicitacao.paciente_id,
        // ⭐ A solicitação vai junto. É ela que fecha o laço: o
        //   exame nasce e o pedido sai da fila no mesmo comando.
        solicitacao: solicitacao.id
      });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) aoFechar(true);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  return (
    <div className="modal" data-modal="agendar-da-fila">
      <div className="modal-overlay" onClick={() => aoFechar(false)} />
      <div className="modal-content" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3>Agendar · {solicitacao.paciente}</h3>
          <button onClick={() => aoFechar(false)} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="modal-body">
          <div className="wiz-resumo">
            <div className="wiz-resumo-linha">
              <span>Exame</span><strong>{solicitacao.servico}</strong>
            </div>
            {!!solicitacao.convenio && (
              <div className="wiz-resumo-linha">
                <span>Convênio</span><strong>{solicitacao.convenio}</strong>
              </div>
            )}
            {!!solicitacao.preferencia && (
              <div className="wiz-resumo-linha">
                <span>Preferência do paciente</span>
                <strong>{solicitacao.preferencia}</strong>
              </div>
            )}
          </div>

          {erro && <div className="dia-nota vermelha">{erro}</div>}

          <div className="cad-dupla" style={{ marginTop: 14 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Onde · com quem *</label>
              <select value={recursoId} data-campo="quem-faz"
                      onChange={e => setRecursoId(e.target.value)}>
                {!quemFaz.length && <option value="">—</option>}
                {quemFaz.map(q => (
                  <option key={q.id} value={q.id}>{q.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 170px' }}>
              <label>Dia *</label>
              <input type="date" value={dia} data-campo="dia-fila"
                     min={hojeNoFuso(FUSO)}
                     onChange={e => setDia(e.target.value || dia)} />
            </div>
          </div>

          {/* ⚠️ Exame sem ninguém que faça é o defeito que a
              Gestão de Exames acusa desde 09/10. Aqui ele
              reaparece pelo outro lado: o setor leu a entrevista,
              decidiu agendar, e não tem com quem. */}
          {!buscando && !quemFaz.length && (
            <div className="dia-nota amarela" data-aviso="ninguem-faz">
              <strong>Ninguém ativo faz {solicitacao.servico}.</strong>
              <p>
                Ligue um profissional ou aparelho a este exame em
                <strong> Gestão de Exames</strong> ou em
                <strong> Aparelhos e Salas</strong>, e volte aqui.
              </p>
            </div>
          )}

          {!!recursoId && !vagas.length && !buscando && (
            <div className="dia-nota amarela" data-aviso="sem-vaga">
              <strong>Nenhum horário livre neste dia.</strong>
              <p>Escolha outro dia, ou abra um encaixe na Agenda do Médico.</p>
            </div>
          )}

          {!!vagas.length && (
            <>
              <h4 className="cli-secao">Horário</h4>
              <div className="fila-horas" data-bloco="horas">
                {vagas.map(v => (
                  <button key={v.ini}
                          className={'fila-hora'
                            + (hora === v.ini ? ' escolhida' : '')
                            + (v.encaixe ? ' encaixe' : '')}
                          data-hora={comoHora(v.ini)}
                          onClick={() => setHora(v.ini)}>
                    {comoHora(v.ini)}
                    {v.encaixe && <em>encaixe</em>}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn-secondary" disabled={indo}
                    onClick={() => aoFechar(false)}>Voltar</button>
            <button className="btn-primary" data-acao="confirmar-agendamento-fila"
                    disabled={indo || !recursoId || hora < 0}
                    onClick={marcar}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Marcando…</>
                : <><i className="fas fa-check" /> Confirmar agendamento</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
