import { useEffect, useMemo, useState } from 'react';
import {
  solicitacoesDoCliente, contagemDaFila, recusarSolicitacao, verAnexo,
  type SolicitacaoDaFila
} from './dados';
import { lerPerguntas, respostasParaLer } from '../../nucleo/entrevista';
import { formatarTelefone, diaNoFuso, horaNoFuso } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';
import { AgendarDaFila } from './AgendarDaFila';

/**
 * ============================================================
 *  A FILA DE SOLICITAÇÕES
 *
 *  10/10/2026, o Tom: *"acho melhor o setor receber a
 *  solicitação e providenciar a agenda."*
 *
 *  Ninguém marca endoscopia sozinho. A recepção monta o pedido
 *  com a entrevista respondida; o setor lê e decide a agenda.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ O SELO DE ATENÇÃO É O QUE FAZ A FILA VALER A PENA
 *
 *  A marca "pede atenção da equipe" existia no cadastro desde o
 *  sistema antigo e **nunca serviu para nada** — porque nenhuma
 *  tela mostrava que ela tinha acendido.
 *
 *  Aqui ela vira um selo na linha. O setor varre vinte pedidos e
 *  vê, sem abrir nenhum, quais três precisam de leitura.
 *
 *  ------------------------------------------------------------
 *  ⭐ O MAIS ANTIGO PRIMEIRO
 *
 *  Numa fila, quem espera há seis dias tem que aparecer antes de
 *  quem chegou hoje. A ordem vem do banco, e a tela mostra os
 *  dias de espera — fila sem idade vira fila por quem grita
 *  mais.
 * ============================================================
 */

const FUSO = 'America/Sao_Paulo';

const ABAS: { valor: string; rotulo: string; icone: string }[] = [
  { valor: 'PENDENTE',  rotulo: 'Na fila',    icone: 'fa-hourglass-half' },
  { valor: 'AGENDADA',  rotulo: 'Agendadas',  icone: 'fa-calendar-check' },
  { valor: 'RECUSADA',  rotulo: 'Recusadas',  icone: 'fa-ban' },
  { valor: 'CANCELADA', rotulo: 'Canceladas', icone: 'fa-xmark' }
];

export function FilaDeSolicitacoes({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [aba, setAba] = useState('PENDENTE');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<SolicitacaoDaFila[]>([]);
  const [contagem, setContagem] = useState<
    { situacao: string; quantas: number; mais_antiga_dias: number }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  const [aberta, setAberta] = useState<SolicitacaoDaFila | null>(null);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [desistiu, setDesistiu] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const [indo, setIndo] = useState(false);

  /* ⭐ 26/10: a foto do pedido médico. A URL vale 5 MINUTOS e
     é pedida só quando alguém clica — guardar uma lista delas
     ao abrir a tela seria distribuir chaves que ninguém usou. */
  /* ⭐ 26/10, à tarde: a guia tem FOLHAS. Abrir só a apontada na
     fila mostraria a frente e esconderia o verso — que é onde
     mora metade dos exames pedidos. */
  const [guia, setGuia] = useState<
    { url: string; tipo: string; pagina: number }[] | null>(null);
  const [abrindoGuia, setAbrindoGuia] = useState(false);
  const [faltaramFolhas, setFaltaramFolhas] = useState(0);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    Promise.all([
      solicitacoesDoCliente({ clienteId, situacao: aba, busca }),
      contagemDaFila(clienteId)
    ])
      .then(([l, c]) => {
        if (!valido) return;
        setLista(l); setContagem(c); setCarregando(false);
      })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, aba, busca, recarga]);

  function quantas(s: string) {
    return contagem.find(c => c.situacao === s)?.quantas ?? 0;
  }

  const maisAntiga = contagem.find(c => c.situacao === 'PENDENTE')?.mais_antiga_dias ?? 0;

  /** As respostas prontas para ler, com o IMC calculado. */
  const respostasLidas = useMemo(() => {
    if (!aberta) return [];
    const { perguntas } = lerPerguntas(aberta.perguntas ?? []);
    return respostasParaLer(perguntas, aberta.respostas ?? {});
  }, [aberta]);

  function abrir(s: SolicitacaoDaFila) {
    setAberta(s); setRecusando(false); setMotivo(''); setDesistiu(false);
    setAgendando(false);
    /* ⚠️ Zera a guia: sem isto, abrir o pedido do José mostraria
       a guia da Maria, que ficou do clique anterior. */
    setGuia(null); setAbrindoGuia(false); setFaltaramFolhas(0);
  }

  /** ⭐ Quem decide se pode ver é o BANCO, com o login de quem
   *  clicou — a Edge Function só assina o que ele liberou. */
  async function abrirGuia(id: string) {
    if (abrindoGuia) return;
    setAbrindoGuia(true);
    try {
      const r = await verAnexo(id);
      /* ⚠️ `paginas` é o caminho de hoje; o `url` solto é a
         resposta de uma Edge Function antiga ainda publicada. A
         tela aguenta as duas, em vez de ficar em branco no dia
         em que alguém esquecer de republicar. */
      const folhas = r.paginas?.length
        ? r.paginas
        : (r.ok && r.url ? [{ url: r.url, tipo: r.tipo ?? '', pagina: 1 }] : []);
      if (!r.ok || !folhas.length) {
        avisar(r.mensagem || 'Não consegui abrir o pedido.', false);
        return;
      }
      setGuia(folhas);
      setFaltaramFolhas(r.faltaram ?? 0);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setAbrindoGuia(false);
    }
  }

  async function recusar() {
    if (!aberta || indo) return;
    setIndo(true);
    try {
      const r = await recusarSolicitacao({
        clienteId, id: aberta.id, motivo: motivo.trim(), desistiu
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAberta(null); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Fila de solicitações</h2>
          <p>
            Os pedidos de exame que passam pelo setor antes de virar agenda —
            com a entrevista respondida.
          </p>
        </div>
      </div>

      <div className="ag-tipo-switch" data-bloco="abas-fila">
        {ABAS.map(a => (
          <button key={a.valor} className={aba === a.valor ? 'ativo' : ''}
                  data-aba={a.valor} onClick={() => setAba(a.valor)}>
            <i className={`fas ${a.icone}`} /> {a.rotulo}
            <em className="aba-conta">{quantas(a.valor)}</em>
          </button>
        ))}
      </div>

      {/* ⚠️ Fila que envelhece calada vira fila por quem grita
          mais. O número mais velho fica no alto. */}
      {aba === 'PENDENTE' && maisAntiga >= 3 && (
        <div className="dia-nota amarela" data-aviso="fila-parada">
          <strong>
            O pedido mais antigo está esperando há {maisAntiga} dias.
          </strong>
          <p>
            Pedido parado é paciente sem resposta — e normalmente ele liga antes
            de alguém notar.
          </p>
        </div>
      )}

      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-solicitacao"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar por paciente, exame ou CPF…" />
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Lendo…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-list-check" />
          <h3>
            {aba === 'PENDENTE' ? 'Nenhum pedido na fila' : 'Nada por aqui'}
          </h3>
          <p>
            {aba === 'PENDENTE'
              ? 'Os pedidos aparecem aqui quando a recepção marca um exame que pede entrevista, em Novo Agendamento.'
              : 'Troque de aba para ver os outros.'}
          </p>
        </div>
      )}

      {!carregando && lista.map(s => (
        <button key={s.id} className="sol-linha" data-solicitacao={s.id}
                data-atencoes={s.atencoes} onClick={() => abrir(s)}>
          <span className="sol-espera" data-espera={s.espera_dias}>
            {s.espera_dias === 0 ? 'hoje' : `${s.espera_dias}d`}
          </span>

          <span className="sol-quem">
            <strong>{s.paciente}</strong>
            <small>{s.servico}</small>
          </span>

          <span className="cad-tags">
            {/* ⭐⭐⭐ "SEM PEDIDO" EM PRIMEIRO, antes de tudo.
                ─────────────────────────────────────────────
                O Tom: *"os exames sem anexo viram solicitação e
                vão para a fila, recepção entra em contato e
                conclui o agendamento."*

                Então esta linha não é informação: é TRABALHO
                para alguém. Quem abre a fila precisa ver, sem
                abrir pedido nenhum, quais três exigem um
                telefonema — do mesmo jeito que já vê quais
                pedem atenção clínica.

                ⚠️ O selo lê `sem_pedido`, e não `anexo_id ===
                   null`. São coisas diferentes: a guia pode
                   chegar depois, pelo balcão, e o fato de ela
                   não ter vindo pelo chat continua sendo
                   verdade. Regra sobre o FATO, não sobre o
                   mensageiro. */}
            {s.sem_pedido && (
              <em className="cad-tag atencao" data-tag="sem-pedido">
                <i className="fas fa-file-circle-xmark" /> sem pedido
              </em>
            )}
            {!!s.anexo_id && (
              <em className="cad-tag sub" data-tag="tem-pedido">
                <i className="fas fa-paperclip" /> guia
              </em>
            )}
            {s.atencoes > 0 && (
              <em className="cad-tag atencao" data-tag="atencao">
                <i className="fas fa-triangle-exclamation" /> {s.atencoes} pede(m) atenção
              </em>
            )}
            {!!s.convenio && <em className="cad-tag neutro">{s.convenio}</em>}
            {!!s.setor && <em className="cad-tag sub">{s.setor}</em>}
            {!!s.preferencia && (
              <em className="cad-tag" data-tag="preferencia">{s.preferencia}</em>
            )}
          </span>

          <i className="fas fa-chevron-right sol-seta" />
        </button>
      ))}

      {/* ──────────────────── o pedido aberto ──────────────────── */}
      {aberta && (
        <div className="modal" data-modal="solicitacao">
          <div className="modal-overlay" onClick={() => setAberta(null)} />
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>{aberta.paciente}</h3>
              <button onClick={() => setAberta(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="wiz-resumo">
                <div className="wiz-resumo-linha">
                  <span>Exame</span><strong>{aberta.servico}</strong>
                </div>
                {!!aberta.setor && (
                  <div className="wiz-resumo-linha">
                    <span>Setor</span>
                    <strong>
                      {aberta.setor}
                      {!!aberta.telefone_setor && ` · ${aberta.telefone_setor}`}
                    </strong>
                  </div>
                )}
                {!!aberta.telefone && (
                  <div className="wiz-resumo-linha">
                    <span>Telefone do paciente</span>
                    <strong>{formatarTelefone(aberta.telefone)}</strong>
                  </div>
                )}
                {!!aberta.convenio && (
                  <div className="wiz-resumo-linha">
                    <span>Convênio</span><strong>{aberta.convenio}</strong>
                  </div>
                )}
                <div className="wiz-resumo-linha">
                  <span>Pedido em</span>
                  <strong>
                    {diaNoFuso(aberta.criado_em, FUSO).split('-').reverse().join('/')}
                    {' às '}{horaNoFuso(aberta.criado_em, FUSO)}
                    {aberta.quem_abriu ? ` · ${aberta.quem_abriu}` : ''}
                  </strong>
                </div>
                {!!aberta.preferencia && (
                  <div className="wiz-resumo-linha">
                    <span>Preferência</span><strong>{aberta.preferencia}</strong>
                  </div>
                )}
              </div>

              {!!aberta.observacoes && (
                <div className="dia-nota azul" data-bloco="observacoes">
                  <strong>O que a recepção anotou</strong>
                  <p>{aberta.observacoes}</p>
                </div>
              )}

              {/* ⭐⭐ As respostas, com o que pede atenção em
                  destaque e o IMC já calculado. É a tela inteira
                  do ponto de vista de quem decide. */}
              {!!respostasLidas.length && (
                <>
                  <h4 className="cli-secao">A entrevista</h4>
                  <div className="sol-respostas" data-bloco="respostas">
                    {respostasLidas.map(r => (
                      <div key={r.id}
                           className={'sol-resposta' + (r.atencao ? ' acende' : '')}
                           data-resposta={r.id}
                           data-atencao={r.atencao ? '1' : '0'}>
                        <span className="sol-pergunta">{r.pergunta}</span>
                        <strong>
                          {r.atencao && <i className="fas fa-triangle-exclamation" />}
                          {r.texto}
                        </strong>
                        {r.calculado && <em className="sol-calc">calculado</em>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ O PEDIDO MÉDICO   (26/10/2026)

                  Três estados, e os três dizem o que fazer:

                    tem guia      → abre (URL de 5 minutos)
                    veio sem guia → LIGAR para o paciente
                    nenhum dos dois → pedido antigo, do painel

                  ⚠️ O terceiro caso existe porque a fila é mais
                     velha que a guia: todo pedido aberto antes
                     de hoje tem `anexo_id` nulo e `sem_pedido`
                     falso. Mostrar "sem pedido" neles seria
                     inventar trabalho que não existe.
                  ════════════════════════════════════════════ */}
              {!!aberta.anexo_id && (
                <div className="dia-nota azul" data-bloco="pedido-medico">
                  <strong>
                    <i className="fas fa-paperclip" /> O pedido do médico
                  </strong>
                  {guia ? (
                    <>
                      {guia.length > 1 && (
                        <p className="form-dica" data-aviso="folhas">
                          {guia.length} folhas neste pedido.
                        </p>
                      )}
                      {guia.map(f => (
                        f.tipo === 'application/pdf' ? (
                          <p key={f.pagina}>
                            <a href={f.url} target="_blank" rel="noreferrer"
                               data-acao="guia-pdf" data-pagina={f.pagina}>
                              {guia.length > 1
                                ? `Abrir a folha ${f.pagina} (PDF)`
                                : 'Abrir o PDF numa aba nova'}
                            </a>{' '}
                            <small>(o link vale 5 minutos)</small>
                          </p>
                        ) : (
                          <a key={f.pagina} href={f.url} target="_blank"
                             rel="noreferrer" data-acao="guia-imagem"
                             data-pagina={f.pagina}>
                            <img src={f.url} alt={`Pedido médico — folha ${f.pagina}`}
                                 className="sol-guia" data-imagem="guia" />
                          </a>
                        )
                      ))}
                      {faltaramFolhas > 0 && (
                        <p className="form-dica ruim" data-aviso="folha-sumiu">
                          {faltaramFolhas === 1
                            ? '1 folha não está mais disponível no arquivo.'
                            : `${faltaramFolhas} folhas não estão mais disponíveis.`}
                        </p>
                      )}
                    </>
                  ) : (
                    <p>
                      <button className="btn-secondary" data-acao="ver-guia"
                              disabled={abrindoGuia}
                              onClick={() => { void abrirGuia(aberta.anexo_id!); }}>
                        <i className={abrindoGuia
                          ? 'fas fa-circle-notch fa-spin' : 'fas fa-eye'} />{' '}
                        {abrindoGuia ? 'Abrindo…' : 'Ver o pedido'}
                      </button>
                    </p>
                  )}
                </div>
              )}

              {aberta.sem_pedido && !aberta.anexo_id && (
                <div className="dia-nota amarela" data-bloco="sem-pedido">
                  <strong>
                    <i className="fas fa-file-circle-xmark" /> Veio sem o pedido médico
                  </strong>
                  <p>
                    O paciente pediu pelo chat e não estava com a guia na
                    mão. Entre em contato
                    {aberta.telefone
                      ? ` pelo ${formatarTelefone(aberta.telefone)}`
                      : ''}
                    {' '}para conferir o pedido antes de marcar.
                  </p>
                </div>
              )}

              {!!aberta.preparo && (
                <div className="dia-nota amarela" data-bloco="preparo">
                  <strong>Preparo deste exame</strong>
                  <p>{aberta.preparo}</p>
                </div>
              )}

              {/* ---------------- resolvida ---------------- */}
              {aberta.situacao !== 'PENDENTE' && (
                <div className={'dia-nota ' +
                      (aberta.situacao === 'AGENDADA' ? 'verde' : 'vermelha')}
                     data-bloco="resolucao">
                  <strong>
                    {aberta.situacao === 'AGENDADA' ? 'Agendada'
                      : aberta.situacao === 'RECUSADA' ? 'Recusada pelo setor'
                      : 'Cancelada'}
                    {aberta.quem_resolveu ? ` por ${aberta.quem_resolveu}` : ''}
                  </strong>
                  {!!aberta.motivo && <p>{aberta.motivo}</p>}
                </div>
              )}

              {/* ---------------- o que fazer ---------------- */}
              {aberta.situacao === 'PENDENTE' && !recusando && (
                <>
                  {/* ⭐⭐⭐ AGENDAR DAQUI, E NÃO PELO ASSISTENTE.
                      ─────────────────────────────────────────
                      Mandar o setor para o Novo Agendamento
                      seria menos código e uma porta por onde o
                      pedido se perde: o assistente não sabe que
                      veio da fila, marcaria o exame, e a
                      solicitação ficaria PENDENTE para sempre —
                      com o paciente já agendado.

                      Na semana seguinte alguém marcaria de novo,
                      e ele apareceria duas vezes no mesmo dia. */}
                  <div className="form-actions">
                    <button className="btn-secondary" data-acao="recusar"
                            onClick={() => { setRecusando(true); setDesistiu(false); }}>
                      <i className="fas fa-ban" /> Recusar
                    </button>
                    <button className="btn-secondary" data-acao="desistiu"
                            onClick={() => { setRecusando(true); setDesistiu(true); }}>
                      <i className="fas fa-xmark" /> Paciente desistiu
                    </button>
                    <button className="btn-primary" data-acao="agendar-da-fila"
                            onClick={() => setAgendando(true)}>
                      <i className="fas fa-calendar-check" /> Agendar
                    </button>
                  </div>
                </>
              )}

              {recusando && (
                <div className="sol-recusa" data-bloco="recusa">
                  <div className="form-group">
                    <label>
                      {desistiu ? 'O que o paciente disse' : 'Motivo da recusa'} *
                    </label>
                    <textarea rows={3} value={motivo} autoFocus
                              data-campo="motivo"
                              onChange={e => setMotivo(e.target.value)}
                              placeholder={desistiu
                                ? 'Vai fazer em outro serviço, não quis remarcar…'
                                : 'Usa anticoagulante, precisa de avaliação antes…'} />
                    {/* ⭐⭐ O motivo é obrigatório, e o banco tem a
                        mesma trava. Daqui a três meses alguém vai
                        perguntar por que este exame não foi feito,
                        e a resposta tem que estar aqui. */}
                    <small className="form-dica">
                      Daqui a três meses alguém vai perguntar por que este exame
                      não foi feito. Escreva para essa pessoa.
                    </small>
                  </div>
                  <div className="form-actions">
                    <button className="btn-secondary" disabled={indo}
                            onClick={() => setRecusando(false)}>Voltar</button>
                    <button className="btn-danger" data-acao="confirmar-recusa"
                            disabled={indo || motivo.trim().length < 3}
                            onClick={recusar}>
                      {indo
                        ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                        : <><i className="fas fa-check" /> Confirmar</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {agendando && aberta && (
        <AgendarDaFila
          clienteId={clienteId}
          solicitacao={aberta}
          aoAvisar={avisar}
          aoFechar={marcou => {
            setAgendando(false);
            if (marcou) { setAberta(null); setRecarga(n => n + 1); }
          }}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
