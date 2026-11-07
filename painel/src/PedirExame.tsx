import { useMemo, useState } from 'react';
import {
  criarSolicitacao, conveniosDoCliente, perguntasDoExame,
  type Convenio, type Paciente
} from './dados';
import { BuscaPaciente } from './BuscaPaciente';
import { ResponderEntrevista } from './ResponderEntrevista';
import {
  lerPerguntas, faltamRespostas, contarAtencoes,
  type RespostasDaEntrevista
} from '../../nucleo/entrevista';
import { useEffect } from 'react';

/**
 * ============================================================
 *  PEDIR UM EXAME QUE PASSA POR ENTREVISTA
 *
 *  10/10/2026, o Tom: *"acho melhor o setor receber a
 *  solicitação e providenciar a agenda."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE ISTO É UMA TELA SEPARADA, E NÃO UM PASSO A MAIS
 *
 *  O assistente de Novo Agendamento existe para escolher
 *  HORÁRIO. Um exame que passa por entrevista **não tem horário
 *  até a equipe avaliar** — pôr a entrevista no meio do
 *  assistente obrigaria a inventar um passo que não leva a lugar
 *  nenhum, e o botão do fim teria dois significados diferentes
 *  dependendo do exame.
 *
 *  Botão com dois significados é como a confirmação de consulta
 *  virou "Confirmar agendamento" na semana passada.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE ESTA TELA **NÃO** FAZ
 *
 *  Ela não marca nada. Não escolhe médico, não escolhe hora, não
 *  ocupa vaga. Ela monta um PEDIDO e o entrega ao setor.
 *
 *  Endoscopia e colonoscopia são feitas com sedação, e as onze
 *  perguntas são triagem de risco anestésico. Marcar direto
 *  poria na agenda um paciente que a equipe talvez não possa
 *  sedar — e ele descobriria isso em jejum, no dia, no balcão.
 * ============================================================
 */

export function PedirExame({
  clienteId, servicoId, nomeDoExame, aoFechar, aoAvisar
}: {
  clienteId: string;
  servicoId: string;
  nomeDoExame: string;
  aoFechar: (enviou: boolean) => void;
  aoAvisar: (mensagem: string, bom: boolean) => void;
}) {
  const [perguntas, setPerguntas] = useState<unknown[] | null>(null);
  const [termo, setTermo] = useState('');
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [respostas, setRespostas] = useState<RespostasDaEntrevista>({});
  const [preferencia, setPreferencia] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [convenioId, setConvenioId] = useState('');
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    let valido = true;
    perguntasDoExame(clienteId, servicoId)
      .then(p => { if (valido) setPerguntas(p); })
      .catch(e => aoAvisar((e as Error).message ?? String(e), false));
    return () => { valido = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, servicoId]);

  useEffect(() => {
    let valido = true;
    conveniosDoCliente(clienteId)
      .then(l => { if (valido) setConvenios(l); })
      .catch(() => { /* convênio é opcional: particular existe */ });
    return () => { valido = false; };
  }, [clienteId]);

  const lista = useMemo(
    () => lerPerguntas(perguntas ?? []).perguntas, [perguntas]);
  const faltam = useMemo(
    () => faltamRespostas(lista, respostas), [lista, respostas]);
  const atencoes = useMemo(
    () => contarAtencoes(lista, respostas), [lista, respostas]);

  const podeEnviar = !!paciente && !faltam.length && !indo;

  async function enviar() {
    if (!podeEnviar || !paciente) return;
    setIndo(true);
    try {
      const r = await criarSolicitacao({
        clienteId, servicoId, respostas,
        pacienteId: paciente.id,
        convenioId: convenioId || null,
        observacoes: observacoes.trim() || null,
        preferencia: preferencia.trim() || null
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
    <div className="modal" data-modal="pedir-exame">
      <div className="modal-overlay" onClick={() => aoFechar(false)} />
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>Pedido de {nomeDoExame}</h3>
          <button onClick={() => aoFechar(false)} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="modal-body">
          {/* ⚠️ Dito logo no alto, antes de qualquer campo: esta
              tela não marca horário. Sem isso, quem preenche
              espera ver um calendário no fim e fica procurando. */}
          <div className="dia-nota azul" data-aviso="nao-marca-horario">
            <strong>Isto não marca horário.</strong>
            <p>
              O pedido vai para a fila do setor com as respostas. Eles avaliam
              o risco e agendam — é assim porque {nomeDoExame.toLowerCase()} é
              feita com sedação.
            </p>
          </div>

          <h4 className="cli-secao">Quem</h4>
          <BuscaPaciente
            clienteId={clienteId}
            termo={termo} aoTermo={setTermo}
            escolhido={paciente} aoEscolher={setPaciente}
            aoFalhar={m => aoAvisar(m, false)}
            foco
          />

          {!!convenios.length && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Convênio</label>
              <select value={convenioId} data-campo="convenio-pedido"
                      onChange={e => setConvenioId(e.target.value)}>
                <option value="">Particular</option>
                {convenios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          )}

          <h4 className="cli-secao">A entrevista</h4>
          <ResponderEntrevista
            perguntas={perguntas}
            respostas={respostas}
            aoMudar={setRespostas}
          />

          {/* ⭐ Quem responde vê, no momento do clique, que aquela
              resposta vai acender um sinal para o setor. É o que
              transforma a marca em conversa ("o senhor toma
              anticoagulante desde quando?") em vez de uma
              surpresa para quem lê depois. */}
          {atencoes > 0 && (
            <div className="dia-nota amarela" data-aviso="atencoes-no-pedido">
              <strong>
                {atencoes === 1
                  ? '1 resposta pede atenção da equipe.'
                  : `${atencoes} respostas pedem atenção da equipe.`}
              </strong>
              <p>
                O pedido vai assim mesmo — o setor é quem decide. Se o paciente
                tiver detalhes, escreva abaixo.
              </p>
            </div>
          )}

          <h4 className="cli-secao">Para o setor</h4>

          <div className="form-group">
            <label>Preferência de horário</label>
            <input type="text" value={preferencia} maxLength={80}
                   data-campo="preferencia"
                   onChange={e => setPreferencia(e.target.value)}
                   placeholder="manhã · depois do dia 20 · não pode às segundas" />
          </div>

          <div className="form-group">
            <label>Observações</label>
            <textarea rows={2} value={observacoes} maxLength={500}
                      data-campo="observacoes-pedido"
                      onChange={e => setObservacoes(e.target.value)}
                      placeholder="O que o paciente contou e não cabe nas perguntas…" />
          </div>

          <div className="form-actions">
            <button className="btn-secondary" disabled={indo}
                    onClick={() => aoFechar(false)}>Voltar</button>
            <button className="btn-primary" data-acao="enviar-pedido"
                    disabled={!podeEnviar} onClick={enviar}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Enviando…</>
                : <><i className="fas fa-paper-plane" /> Enviar para o setor</>}
            </button>
          </div>

          {!paciente && (
            <small className="form-dica" data-aviso="falta-paciente">
              Escolha o paciente para poder enviar.
            </small>
          )}
        </div>
      </div>
    </div>
  );
}
