import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  etapasDeCirurgia, cirurgiasDoQuadro, detalheDaCirurgia,
  moverCirurgia, marcarPendenciaCirurgia,
  prazosDasCirurgias, tipoEPrazosDaCirurgia, definirTipoDaCirurgia,
  type PrazoDaCirurgia, type TipoEPrazos,
  type EtapaCirurgia, type CartaoCirurgia
} from './dados';
import { formatarTelefone, formatarCPF } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';
import { CotacaoOpme } from './CotacaoOpme';
import { GuiaImpressa } from './GuiaImpressa';
import { ViabilidadeCirurgia } from './ViabilidadeCirurgia';
import { LinhaDoTempo } from './LinhaDoTempo';
import { ContaCirurgia } from './ContaCirurgia';

/**
 * ============================================================
 *  O QUADRO DE CIRURGIAS
 *
 *  31/10/2026. O Tom, mandando o sistema que roda hoje no Apps
 *  Script: *"Gosto da minha ideia de Kanban."*
 *
 *  ------------------------------------------------------------
 *  ⚠️ NO PROTÓTIPO O KANBAN NUNCA CARREGOU
 *
 *  O `index.html` chamava `google.script.run.getKanbanData()` —
 *  e essa função **não existe** no `código.gs`. A tela abria e
 *  dizia "Erro ao carregar o Kanban".
 *
 *  E mesmo que existisse, ela não mostraria nada novo: as
 *  colunas do quadro eram
 *
 *      'Aguardando Análise', 'Em Análise', 'Aguardando Cotação'…
 *
 *  e o `criarCirurgia` gravava a etapa `'Pedido Médico'` — que
 *  não é coluna nenhuma. **Todo pedido novo nasceria invisível.**
 *
 *  ⭐⭐⭐ Duas listas de etapas, discordando em silêncio. Por isso
 *     aqui as colunas vêm do BANCO (`cirurgia.etapas`), e a
 *     coluna onde um pedido cai é a marcada como `entrada` — não
 *     uma string escrita em dois arquivos diferentes.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O CPF E O TELEFONE PODEM VIR NULOS, E ISSO NÃO É ERRO
 *
 *  Quando quem abre a tela é médico, o banco CALA as duas
 *  colunas (decisão do Tom, 27/10) e devolve só as cirurgias
 *  dele. A tela não precisa saber quem está olhando: ela desenha
 *  o que veio. ⭐ Tela que decide sozinha o que esconder é a
 *  segunda resposta para a mesma pergunta.
 * ============================================================
 */

const TETO = 400;

function quandoCurto(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function diasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function Cirurgias({ clienteId }: { clienteId: string }) {
  const { recado, avisar: mostrar, fechar } = useAviso();

  const [etapas, setEtapas]   = useState<EtapaCirurgia[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCirurgia[]>([]);
  const [busca, setBusca]     = useState('');
  const [carregando, setCarregando] = useState(true);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [soUrgentes, setSoUrgentes] = useState(false);
  /* ⭐ 04/11: os 20 dias de cada cirurgia (073). */
  const [prazos, setPrazos] = useState<Map<string, PrazoDaCirurgia>>(new Map());

  /* ⭐ O cartão sendo arrastado mora numa ref, e não no estado:
     mudar estado a cada `dragover` redesenharia o quadro inteiro
     sessenta vezes por segundo. */
  const arrastando = useRef<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const carregar = useCallback(async (termo: string) => {
    setCarregando(true);
    try {
      const [es, cs, pz] = await Promise.all([
        etapasDeCirurgia(clienteId),
        cirurgiasDoQuadro(clienteId, termo.trim() || null, TETO),
        prazosDasCirurgias(clienteId)
      ]);
      setEtapas(es);
      setCartoes(cs);
      setPrazos(new Map(pz.map(p => [p.solicitacao_id, p])));
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui carregar o quadro.', false);
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mostrar]);

  useEffect(() => { void carregar(''); }, [carregar]);

  /* A busca vai ao BANCO, e não peneira o que está na tela: o
     quadro tem teto, e peneirar aqui acharia só dentro do teto.
     Mesma lição da aba Todos, em 28/10. */
  useEffect(() => {
    const t = setTimeout(() => { void carregar(busca); }, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  const visiveis = useMemo(
    () => soUrgentes ? cartoes.filter(c => c.urgente) : cartoes,
    [cartoes, soUrgentes]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, CartaoCirurgia[]>();
    for (const e of etapas) m.set(e.id, []);
    for (const c of visiveis) {
      if (!m.has(c.etapa_id)) m.set(c.etapa_id, []);
      m.get(c.etapa_id)!.push(c);
    }
    return m;
  }, [etapas, visiveis]);

  const cortou = cartoes.length >= TETO;

  async function soltar(etapaId: string) {
    const id = arrastando.current;
    arrastando.current = null;
    setAlvo(null);
    if (!id) return;
    const card = cartoes.find(c => c.id === id);
    if (!card || card.etapa_id === etapaId) return;

    /* ⭐ Move na tela ANTES da resposta e desfaz se o banco
       recusar. Arrastar um cartão e ele voltar meio segundo
       depois é o que faz quadro parecer quebrado. */
    const antes = card.etapa_id;
    setCartoes(cs => cs.map(c => c.id === id ? { ...c, etapa_id: etapaId } : c));
    try {
      const r = await moverCirurgia(id, etapaId);
      if (!r.ok) {
        setCartoes(cs => cs.map(c => c.id === id ? { ...c, etapa_id: antes } : c));
        mostrar(r.motivo, false);
      } else {
        mostrar(`${card.numero} → ${r.etapa}`, true);
        void carregar(busca);
      }
    } catch (e: any) {
      setCartoes(cs => cs.map(c => c.id === id ? { ...c, etapa_id: antes } : c));
      mostrar(e?.message ?? 'Não consegui mover.', false);
    }
  }

  return (
    <div className="cir-tela">
      <div className="cir-cabeca">
        <div>
          <h2 className="cir-titulo">Quadro de Cirurgias</h2>
          <p className="cir-sub">
            {cartoes.length} solicitaç{cartoes.length === 1 ? 'ão' : 'ões'}
            {soUrgentes && ' · só urgências'}
          </p>
        </div>

        <div className="cir-ferramentas">
          <div className="cir-busca">
            <i className="fas fa-search" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Paciente, número da guia, médico ou procedimento…"
              aria-label="Buscar no quadro"
            />
            {busca && (
              <button className="cir-limpa" onClick={() => setBusca('')}
                      aria-label="Limpar busca">✕</button>
            )}
          </div>

          <button
            className={'cir-filtro' + (soUrgentes ? ' ligado' : '')}
            onClick={() => setSoUrgentes(v => !v)}
            title="Mostrar só as urgências"
          >
            <i className="fas fa-triangle-exclamation" /> Urgências
          </button>

          <button className="cir-filtro" onClick={() => void carregar(busca)}
                  title="Recarregar">
            <i className={'fas fa-rotate' + (carregando ? ' fa-spin' : '')} />
          </button>
        </div>
      </div>

      {/* ⭐ O teto AVISA. Teto que corta em silêncio é pior que
          tela lenta — a lição de 30/10. */}
      {cortou && (
        <div className="cir-recorte">
          <i className="fas fa-circle-info" /> Mostrando as {TETO} mais recentes.
          Use a busca para achar uma cirurgia mais antiga — ela procura no banco inteiro.
        </div>
      )}

      {carregando && cartoes.length === 0 ? (
        <div className="cir-vazio"><i className="fas fa-spinner fa-spin" /> Carregando o quadro…</div>
      ) : etapas.length === 0 ? (
        <div className="cir-vazio">
          <i className="fas fa-diagram-project" />
          <p>Este hospital ainda não tem as etapas do quadro.</p>
        </div>
      ) : (
        <div className="cir-quadro">
          {etapas.map(e => {
            const lista = porEtapa.get(e.id) ?? [];
            return (
              <section
                key={e.id}
                className={'cir-coluna' + (alvo === e.id ? ' alvo' : '')}
                style={{ ['--etapa' as any]: e.cor }}
                onDragOver={ev => { ev.preventDefault(); setAlvo(e.id); }}
                onDragLeave={() => setAlvo(a => a === e.id ? null : a)}
                onDrop={ev => { ev.preventDefault(); void soltar(e.id); }}
              >
                <header className="cir-coluna-topo">
                  <span className="cir-coluna-nome">{e.nome}</span>
                  <span className="cir-coluna-conta">{lista.length}</span>
                </header>

                <div className="cir-coluna-corpo">
                  {lista.length === 0 && (
                    <p className="cir-coluna-vazia">
                      {e.natureza === 'entrada' ? 'Nenhum pedido novo' : '—'}
                    </p>
                  )}

                  {lista.map(c => (
                    <article
                      key={c.id}
                      className={'cir-cartao' + (c.urgente ? ' urgente' : '')}
                      draggable
                      onDragStart={() => { arrastando.current = c.id; }}
                      onDragEnd={() => { arrastando.current = null; setAlvo(null); }}
                      onClick={() => setAbertoId(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={ev => { if (ev.key === 'Enter') setAbertoId(c.id); }}
                    >
                      <div className="cir-cartao-topo">
                        <span className="cir-numero">{c.numero}</span>
                        {c.urgente && <span className="cir-urgente">URGÊNCIA</span>}
                        {c.assinada && (
                          <i className="fas fa-certificate cir-selo"
                             title="Guia assinada eletronicamente" />
                        )}
                      </div>

                      <p className="cir-paciente">{c.paciente}</p>
                      <p className="cir-procedimento">
                        {c.procedimento}
                        {c.procedimentos > 1 && (
                          <span className="cir-mais">+{c.procedimentos - 1}</span>
                        )}
                      </p>

                      <div className="cir-meta">
                        <span><i className="fas fa-user-doctor" /> {c.medico}</span>
                        {c.convenio && <span><i className="fas fa-id-card" /> {c.convenio}</span>}
                        <span><i className="fas fa-notes-medical" /> {c.cid}</span>
                      </div>

                      {c.pendencias > 0 && (
                        <>
                          <div className="cir-barra">
                            <div className="cir-barra-dentro"
                                 style={{ width: `${c.percentual}%` }} />
                          </div>
                          <div className="cir-barra-texto">
                            {c.pendencias_ok}/{c.pendencias} pendências · {c.percentual}%
                          </div>
                        </>
                      )}

                      <footer className="cir-cartao-pe">
                        <span title="Dias desde o pedido">
                          <i className="fas fa-clock" /> {diasDesde(c.criado_em)}d
                        </span>
                        {/* ⭐ 04/11: os 20 dias, do pedido até Agendada. */}
                        {prazos.get(c.id) && (() => {
                          const p = prazos.get(c.id)!;
                          return (
                            <span className={'cir-prazo' + (p.em_atraso ? ' atraso' : p.etapa_atrasada || p.pendencias_atrasadas > 0 ? ' alerta' : '')}
                                  data-prazo={p.em_atraso ? 'atraso' : p.etapa_atrasada || p.pendencias_atrasadas > 0 ? 'alerta' : 'ok'}
                                  title={`Prazo: até ${quandoCurto(p.limite_final)}`}>
                              <i className="fas fa-hourglass-half" />{' '}
                              {p.em_atraso ? `ATRASADA ${-p.dias_restantes}d`
                                : p.dias_restantes === 0 ? 'vence hoje' : `faltam ${p.dias_restantes}d`}
                              {p.pendencias_atrasadas > 0 && ` · ${p.pendencias_atrasadas} pend. atrasada${p.pendencias_atrasadas === 1 ? '' : 's'}`}
                            </span>
                          );
                        })()}
                        {c.data_prevista && (
                          <span title="Data prevista">
                            <i className="fas fa-calendar-day" /> {quandoCurto(c.data_prevista)}
                          </span>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {abertoId && (
        <PainelDaCirurgia
          id={abertoId}
          clienteId={clienteId}
          etapas={etapas}
          aoFechar={() => setAbertoId(null)}
          aoMudar={() => void carregar(busca)}
          mostrar={mostrar}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}


/**
 * ------------------------------------------------------------
 *  A GAVETA DE UMA SOLICITAÇÃO
 *
 *  ⚠️ Ela pede o detalhe ao abrir, e não guarda o que o quadro já
 *     tinha: o quadro traz o resumo do cartão, não a guia. Montar
 *     a gaveta com o resumo faria a tela mostrar meia guia e
 *     parecer que o resto não foi preenchido.
 * ------------------------------------------------------------
 */
function PainelDaCirurgia({
  id, clienteId, etapas, aoFechar, aoMudar, mostrar
}: {
  id: string;
  clienteId: string;
  etapas: EtapaCirurgia[];
  aoFechar: () => void;
  aoMudar: () => void;
  mostrar: (texto: string, bom?: boolean) => void;
}) {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisar, setAvisar] = useState(false);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /* ⭐ 04/11: o tipo de cirurgia e o prazo de cada pendência (073). */
  const [tp, setTp] = useState<TipoEPrazos | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setD(await detalheDaCirurgia(id));
      setTp(await tipoEPrazosDaCirurgia(id));
    }
    catch (e: any) { setErro(e?.message ?? 'Não consegui abrir a solicitação.'); }
  }, [id]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /** A guia impressa, por cima da gaveta. */
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);

  async function mover(etapaId: string) {
    setOcupado(true);
    try {
      const r = await moverCirurgia(id, etapaId, obs.trim() || null, avisar);
      mostrar(r.motivo, r.ok);
      if (r.ok) { setObs(''); await recarregar(); aoMudar(); }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui mover.', false);
    } finally { setOcupado(false); }
  }

  async function pendencia(pid: string, marcar: boolean) {
    try {
      const r = await marcarPendenciaCirurgia(pid, marcar);
      if (!r.ok) { mostrar(r.motivo, false); return; }
      await recarregar(); aoMudar();
    } catch (e: any) { mostrar(e?.message ?? 'Não consegui marcar.', false); }
  }

  return (
    <div className="cir-fundo" onClick={aoFechar}>
      <aside className="cir-gaveta" onClick={e => e.stopPropagation()}
             role="dialog" aria-label="Detalhes da solicitação">
        <header className="cir-gaveta-topo">
          <div>
            <span className="cir-numero grande">{d?.numero ?? '…'}</span>
            {d?.etapa && (
              <span className="cir-etapa-chip" style={{ background: d.etapa_cor }}>
                {d.etapa}
              </span>
            )}
          </div>
          <div className="cir-gaveta-acoes">
            {/* ⭐ 31/10: a guia TISS em papel.
                Ela é montada do MESMO objeto desta gaveta — por
                isso o botão mora aqui, e não numa tela à parte
                que montaria a guia de novo, por conta própria. */}
            <button className="btn-secondary btn-sm" data-acao="imprimir"
                    title="Imprimir a guia TISS / salvar em PDF"
                    onClick={() => setImprimindo(true)}>
              <i className="fas fa-print" /> Guia
            </button>
            <button className="cir-fechar" onClick={aoFechar} aria-label="Fechar">✕</button>
          </div>
        </header>

        {erro && <div className="cir-erro">{erro}</div>}
        {!d && !erro && <div className="cir-vazio"><i className="fas fa-spinner fa-spin" /></div>}

        {d && (
          <div className="cir-gaveta-corpo">
            <Bloco titulo="Paciente" icone="fa-user">
              <Linha rotulo="Nome" valor={d.paciente?.nome} forte />
              {/* ⚠️ Nulo para o médico, e isso é a REGRA, não falta
                  de dado. A tela diz isso em vez de mostrar vazio. */}
              <Linha rotulo="CPF"
                     valor={d.paciente?.cpf ? formatarCPF(d.paciente.cpf) : null}
                     calado="não disponível para o médico" />
              <Linha rotulo="Telefone"
                     valor={d.paciente?.telefone ? formatarTelefone(d.paciente.telefone) : null}
                     calado="não disponível para o médico" />
              <Linha rotulo="Carteirinha" valor={d.paciente?.carteirinha} />
              <Linha rotulo="Plano" valor={d.paciente?.plano} />
              <Linha rotulo="CNS" valor={d.paciente?.cns} />
            </Bloco>

            <Bloco titulo="Solicitante" icone="fa-user-doctor">
              <Linha rotulo="Médico" valor={d.medico?.nome} forte />
              <Linha rotulo="Conselho" valor={[d.medico?.crm, d.medico?.uf].filter(Boolean).join(' / ')} />
              <Linha rotulo="CBO-S" valor={d.medico?.cbos} />
              <Linha rotulo="Especialidade" valor={d.medico?.especialidade} />
            </Bloco>

            <Bloco titulo="Internação" icone="fa-hospital">
              <Linha rotulo="Caráter"
                     valor={d.internacao?.carater === 'urgencia' ? 'Urgência / Emergência' : 'Eletiva'} />
              <Linha rotulo="Tipo" valor={d.internacao?.tipo} />
              <Linha rotulo="Regime" valor={d.internacao?.regime} />
              <Linha rotulo="Diárias" valor={d.internacao?.diarias} />
              <Linha rotulo="Acomodação" valor={d.internacao?.acomodacao} />
              <Linha rotulo="Data prevista" valor={d.internacao?.data_prevista} />
              <Linha rotulo="Convênio"
                     valor={[d.convenio?.nome, d.convenio?.registro_ans && `ANS ${d.convenio.registro_ans}`]
                              .filter(Boolean).join(' · ')} />
              <p className="cir-texto">{d.internacao?.indicacao}</p>
            </Bloco>

            <Bloco titulo="Diagnóstico" icone="fa-notes-medical">
              <Linha rotulo="CID-10"
                     valor={[d.diagnostico?.cid_principal, d.diagnostico?.cid_2, d.diagnostico?.cid_3]
                              .filter(Boolean).join(' · ')} forte />
              {d.diagnostico?.hipotese && <p className="cir-texto">{d.diagnostico.hipotese}</p>}
            </Bloco>

            <Bloco titulo={`Procedimentos TUSS (${d.procedimentos?.length ?? 0})`} icone="fa-list-check">
              {(d.procedimentos ?? []).map((p: any) => (
                <div className="cir-item" key={p.ordem}>
                  <code className="cir-tuss">{p.codigo}</code>
                  <span>{p.descricao}</span>
                  <b>{p.quantidade}x</b>
                </div>
              ))}
            </Bloco>

            {(d.opme ?? []).length > 0 && (
              <Bloco titulo={`OPME (${d.opme.length})`} icone="fa-box-open">
                {d.opme.map((o: any) => (
                  <div className="cir-item" key={o.ordem}>
                    <span>{o.descricao}</span>
                    <small>{o.fabricante ?? '—'}</small>
                    <b>{o.quantidade}x</b>
                  </div>
                ))}
              </Bloco>
            )}

            {d.assinatura && (
              <div className="cir-selo-caixa">
                <div className="cir-selo-topo">
                  <i className="fas fa-certificate" />
                  <div>
                    <strong>Guia assinada eletronicamente</strong>
                    <small>{d.assinatura.medico_nome} · {d.assinatura.medico_crm}</small>
                  </div>
                </div>
                <div className="cir-selo-codigo">{d.assinatura.codigo}</div>
                <code className="cir-hash">{d.assinatura.hash}</code>
              </div>
            )}

            {/* ⭐ 31/10: a esteira de cotação. Fica logo abaixo do
                OPME porque é a continuação dele — o que foi pedido
                e por quanto sai. */}
            <CotacaoOpme clienteId={clienteId} solicitacaoId={id}
                         mostrar={mostrar} aoMudar={aoMudar} />

            {/* ⭐⭐ 04/11: o TIPO, escolhido pela equipe na análise — as
                pendências dele nascem sozinhas, com o prazo contado do
                pedido (073). */}
            <Bloco titulo="Tipo de cirurgia" icone="fa-tags">
              {tp && tp.tipos.length === 0 && (
                <p className="cir-calado" data-aviso="sem-tipos">
                  Nenhum tipo cadastrado ainda. Cadastre em <strong>Tipos de Cirurgia</strong>, no menu.
                </p>
              )}
              {tp && tp.tipos.length > 0 && (
                <select className="cir-campo" data-campo="tipo-cirurgia" value={tp.tipo_id ?? ''}
                        disabled={ocupado}
                        onChange={async e => {
                          if (!e.target.value) return;
                          setOcupado(true);
                          try {
                            const r = await definirTipoDaCirurgia(id, e.target.value);
                            mostrar(r.mensagem, r.ok);
                            await recarregar(); aoMudar();
                          } catch (x: any) { mostrar(x?.message ?? String(x), false); }
                          finally { setOcupado(false); }
                        }}>
                  <option value="">Escolha o tipo…</option>
                  {tp.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              )}
            </Bloco>

            <Bloco titulo={`Pendências (${(d.pendencias ?? []).filter((p: any) => p.concluida).length}/${(d.pendencias ?? []).length})`}
                   icone="fa-clipboard-check">
              {(d.pendencias ?? []).map((p: any) => {
                const pz = tp?.pendencias.find(x => x.id === p.id);
                return (
                  <label className={'cir-pendencia' + (p.concluida ? ' feita' : '') + (pz?.atrasada ? ' atrasada' : '')}
                         key={p.id} data-pendencia-atrasada={pz?.atrasada ? 'sim' : 'nao'}>
                    <input type="checkbox" checked={p.concluida}
                           onChange={e => void pendencia(p.id, e.target.checked)} />
                    <span>{p.descricao}</span>
                    {p.setor && <em>{p.setor}</em>}
                    {pz?.prazo && (
                      <small className={pz.atrasada ? 'atraso' : ''}>
                        {pz.atrasada ? 'ATRASADA · ' : 'até '}{quandoCurto(pz.prazo)}
                      </small>
                    )}
                  </label>
                );
              })}
            </Bloco>

            {/* ⭐⭐⭐ 05/11: a viabilidade econômica (074). Fica antes de
                "Mover no quadro" porque é ela que abre (ou não) a passagem
                para a autorização do convênio. */}
            <ViabilidadeCirurgia solicitacaoId={id} chave={`${d.etapa_id}|${tp?.tipo_id ?? ''}`}
                                 mostrar={mostrar}
                                 aoMudar={() => { void recarregar(); aoMudar(); }} />

            <Bloco titulo="Mover no quadro" icone="fa-arrow-right-arrow-left">
              <input className="cir-campo" value={obs} placeholder="Observação (opcional)"
                     onChange={e => setObs(e.target.value)} />
              {/* ⭐ Avisar é ESCOLHA, e nasce desligada. Avisar a cada
                  movimento interno vira spam — e paciente que bloqueia
                  o número do hospital perde também o lembrete da
                  consulta. */}
              <label className="cir-avisar">
                <input type="checkbox" checked={avisar}
                       onChange={e => setAvisar(e.target.checked)} />
                <span><i className="fab fa-whatsapp" /> Avisar o paciente por WhatsApp</span>
              </label>
              <div className="cir-etapas-botoes">
                {etapas.filter(e => e.id !== d.etapa_id).map(e => (
                  <button key={e.id} disabled={ocupado}
                          className="cir-etapa-botao"
                          style={{ ['--etapa' as any]: e.cor }}
                          onClick={() => void mover(e.id)}>
                    {e.nome}
                  </button>
                ))}
              </div>
            </Bloco>

            {/* ⭐ 05/11 (077): a conta da cirurgia REALIZADA e o previsto × realizado. */}
            <ContaCirurgia solicitacaoId={id} chave={d.etapa_id} mostrar={mostrar} />

            {/* ⭐ 05/11 (076): a linha do tempo inteira — etapas, pendências,
                comentários com @setor/@pessoa, viabilidade, cotações, avisos. */}
            <LinhaDoTempo solicitacaoId={id} clienteId={clienteId} mostrar={mostrar}
                          chave={`${d.etapa_id}|${(d.pendencias ?? []).filter((p: any) => p.concluida).length}`} />

            {d.observacoes && (
              <Bloco titulo="Observações do médico" icone="fa-comment">
                <p className="cir-texto">{d.observacoes}</p>
              </Bloco>
            )}
          </div>
        )}
      </aside>

      {imprimindo && (
        <GuiaImpressa id={id} aoFechar={() => setImprimindo(false)} />
      )}
    </div>
  );
}

function Bloco({ titulo, icone, children }: {
  titulo: string; icone: string; children: React.ReactNode;
}) {
  return (
    <section className="cir-bloco">
      <h4><i className={'fas ' + icone} /> {titulo}</h4>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor, forte, calado }: {
  rotulo: string; valor?: any; forte?: boolean; calado?: string;
}) {
  const vazio = valor === null || valor === undefined || valor === '';
  if (vazio && !calado) return null;
  return (
    <div className="cir-linha">
      <span>{rotulo}</span>
      {vazio
        ? <em className="cir-calado">{calado}</em>
        : <b className={forte ? 'forte' : undefined}>{String(valor)}</b>}
    </div>
  );
}
