import { useEffect, useMemo, useState } from 'react';
import { irParaNovoAgendamento } from './ponte';
import {
  conversasDoCliente, conversaCompleta,
  possoResponderWhatsapp, assumirConversa, responderWhatsapp,
  devolverMensagem, fecharProtocolo,
  indicadoresDasConversas, paraQuemTransferir, transferirConversa,
  finalizarJanelasFechadas, type IndicadoresDasConversas,
  type ConversaNaLista, type EventoDaConversa
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  CONVERSAS — O QUE CHEGA PELO WHATSAPP
 *
 *  13/10/2026. O Tom: *"No WhatsApp não quero tela de texto.
 *  Toda interação com paciente vai ser via chat."*
 *
 *  Então esta tela **não tem campo de resposta**. Ela é a
 *  janela por onde o hospital vê o que está chegando, e o que
 *  o robô respondeu.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O BURACO QUE ELA FECHA
 *
 *  Em 21/08 o Tom escreveu: *"Eu não consigo ver as mensagens
 *  que estão chegando."* A planilha registrava tudo que SAÍA e
 *  nada do que ENTRAVA. Pacientes escreviam e ninguém via.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ A JANELA DE 24 HORAS MANDA NA TELA
 *
 *  Ela aparece em cada conversa porque é a diferença entre
 *  responder de graça e ter que ligar. Conta a partir da última
 *  mensagem DO PACIENTE — resposta nossa não renova nada.
 *
 *  Menos de 4 horas fica vermelho.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ POR QUE O SILÊNCIO APARECE
 *
 *  Quando o robô NÃO respondeu, a linha mostra o motivo em
 *  itálico: "rajada: outra mensagem há 12s".
 *
 *  Sem isso, quem abre a conversa vê um vão e conclui que o
 *  sistema falhou. Com isso, vê um freio funcionando — e sabe
 *  que o freio existe quando for testar.
 * ============================================================
 */

const ROTULO_INTENCAO: Record<string, string> = {
  urgencia: 'urgência', saudacao: 'saudação', agendar: 'agendar',
  exame: 'exame', preparo: 'preparo', resultado: 'resultado',
  cancelar: 'cancelar', confirmar: 'confirmar', convenio: 'convênio',
  endereco: 'endereço', horario: 'horário', atendente: 'atendente',
  agradecimento: 'agradecimento', desconhecido: 'não entendi'
};

function hora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR',
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function janelaTexto(c: ConversaNaLista): string {
  if (!c.janela_aberta) return 'janela fechada';
  const h = Math.floor(c.janela_minutos / 60);
  return h >= 1 ? `${h}h de janela` : `${c.janela_minutos} min de janela`;
}

export function Conversas({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [lista, setLista] = useState<ConversaNaLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<ConversaNaLista | null>(null);
  const [thread, setThread] = useState<EventoDaConversa[]>([]);
  const [recarga, setRecarga] = useState(0);
  /* ⭐⭐⭐ 21/10: responder pelo número oficial. Só quem tem o
     privilégio INDIVIDUAL vê o Assumir e a caixa de resposta. */
  const [possoResponder, setPossoResponder] = useState(false);
  /* ⭐⭐⭐ 21/10: os indicadores do topo, o transferir e o finalizar
     em massa — o que faltava do print da tela antiga do Tom. */
  const [ind, setInd] = useState<IndicadoresDasConversas | null>(null);
  const [colegas, setColegas] = useState<{ usuario_id: string; nome: string }[]>([]);
  const [paraQuem, setParaQuem] = useState('');
  const [confirmandoMassa, setConfirmandoMassa] = useState(false);
  useEffect(() => {
    let valido = true;
    indicadoresDasConversas(clienteId).then(x => { if (valido) setInd(x); }).catch(() => {});
    paraQuemTransferir(clienteId).then(x => { if (valido) setColegas(x); }).catch(() => {});
    return () => { valido = false; };
  }, [clienteId, recarga]);
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let valido = true;
    possoResponderWhatsapp(clienteId).then(v => { if (valido) setPossoResponder(v); });
    return () => { valido = false; };
  }, [clienteId]);

  /** Relê a lista e a conversa aberta (depois de assumir, responder…). */
  async function reler(telefone: string) {
    const l = await conversasDoCliente(clienteId);
    setLista(l);
    const atual = l.find(x => x.telefone === telefone) ?? null;
    setAberta(atual);
    setThread(await conversaCompleta(clienteId, telefone));
  }

  async function assumir() {
    if (!aberta) return;
    setEnviando(true);
    try {
      const r = await assumirConversa(clienteId, aberta.telefone);
      avisar(r.ok ? 'Conversa assumida: o robô fica quieto enquanto você atende.' : r.mensagem, r.ok);
      await reler(aberta.telefone);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    setEnviando(false);
  }

  async function devolver() {
    if (!aberta?.protocolo_id) return;
    setEnviando(true);
    try {
      const r = await devolverMensagem(clienteId, aberta.protocolo_id);
      avisar(r.ok ? 'Devolvida: o robô volta a responder este paciente.' : r.mensagem, r.ok);
      await reler(aberta.telefone);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    setEnviando(false);
  }

  async function finalizar() {
    if (!aberta?.protocolo_id) return;
    setEnviando(true);
    try {
      const r = await fecharProtocolo({ id: aberta.protocolo_id });
      avisar(r.ok ? 'Conversa finalizada: o robô volta a responder.' : r.mensagem, r.ok);
      await reler(aberta.telefone);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    setEnviando(false);
  }

  async function transferir() {
    if (!aberta?.protocolo_id || !paraQuem) return;
    setEnviando(true);
    try {
      const r = await transferirConversa(clienteId, aberta.protocolo_id, paraQuem);
      avisar(r.mensagem, r.ok);
      if (r.ok) setParaQuem('');
      await reler(aberta.telefone);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    setEnviando(false);
  }

  async function finalizarEmMassa() {
    if (!confirmandoMassa) { setConfirmandoMassa(true); return; }
    setConfirmandoMassa(false);
    try {
      const r = await finalizarJanelasFechadas(clienteId);
      avisar(r.mensagem, r.ok);
      setRecarga(n => n + 1);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
  }

  async function enviar() {
    if (!aberta || !rascunho.trim()) return;
    setEnviando(true);
    try {
      const r = await responderWhatsapp(clienteId, aberta.telefone, rascunho.trim());
      if (r.ok) setRascunho('');
      else avisar(r.mensagem, false);
      await reler(aberta.telefone);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    setEnviando(false);
  }
  /* ⭐⭐⭐ 20/10: O FILTRO POR SETOR.
     ⚠️ Começa em "todas" de propósito. Se começasse em "meus",
        quem não está marcado em setor nenhum abriria a tela
        VAZIA — e tela vazia não dá erro, ela só parece
        quebrada. */
  const [fila, setFila] = useState<'todas' | 'meus' | 'sem-setor'>('todas');

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    conversasDoCliente(clienteId)
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  const vistas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter(c => {
      if (fila === 'meus' && !c.do_meu_setor) return false;
      if (fila === 'sem-setor' && c.setor_id) return false;
      if (!t) return true;
      return `${c.paciente ?? ''} ${c.telefone_curto} ${c.ultima_texto ?? ''}`
        .toLowerCase().includes(t);
    });
  }, [lista, busca, fila]);

  /** Quantas são de setor, e quantas são minhas. */
  const meus = lista.filter(c => c.do_meu_setor).length;
  const comSetor = lista.filter(c => c.setor_id).length;

  const urgentes = lista.filter(c => c.urgente).length;
  const semResposta = lista.reduce((s, c) => s + c.sem_resposta, 0);

  async function abrir(c: ConversaNaLista) {
    setAberta(c);
    setThread([]);
    try {
      setThread(await conversaCompleta(clienteId, c.telefone));
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Conversas</h2>
          <p>
            O que chega pelo WhatsApp e o que o robô respondeu.
            {' '}{lista.length} conversa(s).
          </p>
        </div>
        <div className="cad-botoes">
          <button className="btn-secondary" data-acao="atualizar-conversas"
                  onClick={() => setRecarga(n => n + 1)}>
            <i className="fas fa-sync-alt" /> Atualizar
          </button>
          {/* ⚠️ Duas etapas: fechar em massa não pode ser um clique sem querer. */}
          <button className={confirmandoMassa ? 'btn-primary' : 'btn-secondary'}
                  data-acao="finalizar-janelas-fechadas"
                  onClick={() => void finalizarEmMassa()}
                  onBlur={() => setConfirmandoMassa(false)}>
            <i className="fas fa-broom" />{' '}
            {confirmandoMassa ? 'Confirmar: finalizar as de janela fechada' : 'Finalizar janelas fechadas'}
          </button>
        </div>
      </div>

      {confirmandoMassa && (
        <div className="dia-nota amarela" data-aviso="finalizar-em-massa">
          <strong>Finaliza as conversas com a janela de 24h fechada.</strong>
          <p>As <strong>assumidas</strong> ficam (tem gente cuidando delas), e as
             <strong> urgentes</strong> também. Clique de novo para confirmar.</p>
        </div>
      )}

      {/* ⭐⭐⭐ Os indicadores — a conta é do banco, numa regra só. */}
      {ind && (
        <div className="conv-indicadores" data-bloco="indicadores-conversas">
          {([
            ['aguardando', ind.aguardando, 'Aguardando resposta', 'fa-inbox'],
            ['paradas', ind.paradas_2h, 'Paradas há +2h', 'fa-person-walking'],
            ['janela', ind.janela_acabando, 'Janela acabando', 'fa-hourglass-half'],
            ['sem-atendente', ind.sem_atendente, 'Sem atendente', 'fa-user-slash'],
            ['finalizadas', ind.finalizadas_hoje, 'Finalizadas hoje', 'fa-check-double']
          ] as const).map(([k, n, rotulo, icone]) => (
            <div key={k} className={'conv-indicador ' + k} data-indicador={k}>
              <i className={'fas ' + icone} />
              <strong>{n}</strong>
              <span>{rotulo}</span>
            </div>
          ))}
        </div>
      )}

      {/* ⭐⭐⭐ Urgência no topo, em vermelho. Uma lista ordenada
          só por data poria um "obrigado" acima de um
          "estou sangrando". */}
      {urgentes > 0 && (
        <div className="dia-nota vermelha" data-aviso="conversas-urgentes">
          <strong>
            {urgentes} conversa(s) com urgência aguardando atendimento.
          </strong>
          <p>
            O robô já mandou o Pronto Atendimento e o 192, e abriu protocolo.
            Elas estão no topo da lista.
          </p>
        </div>
      )}

      {/* ⭐⭐ O silêncio tem número, e ele é informação — não
          necessariamente defeito. Freio funcionando também
          conta aqui. */}
      {semResposta > 0 && (
        <div className="dia-nota amarela" data-aviso="sem-resposta">
          <strong>{semResposta} mensagem(ns) ficaram sem resposta.</strong>
          <p>
            Abra a conversa para ver o motivo de cada uma. Quase sempre é
            freio: três "oi" seguidos não geram três menus, de propósito.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          ⭐⭐⭐ A FILA DEIXA DE SER UMA SÓ   (20/10/2026)

          O Tom: *"onde usuários recebem as mensagens do seu
          setor."*

          Os botões só aparecem quando ALGUMA conversa tem
          setor. Numa casa que ainda não usa setor, três filtros
          que não filtram nada seriam só três botões a mais para
          entender.
          ════════════════════════════════════════════════════ */}
      {!carregando && comSetor > 0 && (
        <div className="ag-tipo-switch" data-bloco="fila-por-setor">
          <button className={fila === 'todas' ? 'ativo' : ''} data-fila="todas"
                  onClick={() => setFila('todas')}>
            Todas <em className="aba-conta">{lista.length}</em>
          </button>
          <button className={fila === 'meus' ? 'ativo' : ''} data-fila="meus"
                  onClick={() => setFila('meus')}>
            <i className="fas fa-inbox" /> Meus setores <em className="aba-conta">{meus}</em>
          </button>
          <button className={fila === 'sem-setor' ? 'ativo' : ''} data-fila="sem-setor"
                  onClick={() => setFila('sem-setor')}>
            Sem setor <em className="aba-conta">{lista.length - comSetor}</em>
          </button>
        </div>
      )}

      {/* ⚠️ Lista vazia por FILTRO não é lista vazia. Sem esta
          frase, quem clica em "Meus setores" sem estar marcado
          em nenhum conclui que a tela quebrou. */}
      {!carregando && fila === 'meus' && meus === 0 && comSetor > 0 && (
        <div className="dia-nota amarela" data-aviso="nenhum-setor-meu">
          <strong>Você não está marcado em nenhum setor com recado aberto.</strong>
          <p>
            Quem define isso é <strong>Usuários → Pessoas</strong>, no
            formulário de cada pessoa. Toque em <strong>Todas</strong> para
            ver a fila inteira.
          </p>
        </div>
      )}

      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-conversa"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar por paciente, número ou texto…" />
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fab fa-whatsapp" />
          <h3>Nenhuma mensagem ainda</h3>
          <p>
            Quando um paciente escrever no número do hospital, a conversa
            aparece aqui — com o que ele escreveu, o que o robô entendeu e o
            que respondeu.
          </p>
        </div>
      )}

      {!carregando && vistas.map(c => (
        <div key={c.telefone}
             className={'conv-linha' + (c.urgente ? ' urgente' : '')}
             data-conversa={c.telefone} data-urgente={c.urgente ? '1' : '0'}>
          <span className="conv-quem">
            <strong>{c.paciente ?? 'Paciente não identificado'}</strong>
            <small>{c.telefone_curto}</small>
          </span>

          <span className="conv-ultima">
            <em>{c.ultima_direcao === 'ENTRADA' ? '←' : '→'}</em>
            {(c.ultima_texto ?? '').slice(0, 90)}
          </span>

          <span className="cad-tags">
            {c.urgente && (
              <em className="cad-tag off" data-tag="urgente">urgência</em>
            )}
            {/* ⚠️ "URGÊNCIA URGÊNCIA": a etiqueta de urgência e a
                intenção lida pelo robô diziam a mesma palavra,
                lado a lado. Duas respostas para a mesma
                pergunta — de novo, agora na tela. */}
            {!!c.intencao && !(c.urgente && c.intencao === 'urgencia') && (
              <em className="cad-tag neutro" data-tag="intencao">
                {ROTULO_INTENCAO[c.intencao] ?? c.intencao}
              </em>
            )}
            {c.protocolo_aberto && (
              <em className="cad-tag exame" data-tag="protocolo">protocolo aberto</em>
            )}
            {!!c.setor && (
              <em className={'cad-tag ' + (c.do_meu_setor ? '' : 'neutro')}
                  data-tag="setor" data-meu={c.do_meu_setor ? 'sim' : 'nao'}>
                {c.setor}
              </em>
            )}
            {c.sem_resposta > 0 && (
              <em className="cad-tag neutro" data-tag="silencio">
                {c.sem_resposta} sem resposta
              </em>
            )}
          </span>

          {/* ⭐⭐⭐ A janela de 24h, em cada linha. É a diferença
              entre responder de graça e ter que ligar. */}
          <span className={'conv-janela'
                  + (!c.janela_aberta ? ' fechada'
                     : c.janela_minutos < 240 ? ' pouca' : '')}
                data-janela={c.janela_aberta ? c.janela_minutos : 'fechada'}>
            {janelaTexto(c)}
          </span>

          <span className="conv-quando">{hora(c.ultima_em)}</span>

          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="abrir-conversa"
                    onClick={() => abrir(c)}>
              <i className="fas fa-comments" /> Ver
            </button>
          </div>
        </div>
      ))}

      {aberta && (
        <div className="modal" data-modal="conversa">
          <div className="modal-overlay" onClick={() => setAberta(null)} />
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>
                {aberta.paciente ?? 'Paciente não identificado'}
                {' · '}{aberta.telefone_curto}
                {!!aberta.numero && (
                  <small className="conv-numero" data-campo="numero-da-conversa">
                    {' '}· pelo número {aberta.numero}
                  </small>
                )}
              </h3>
              <button onClick={() => setAberta(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              {/* ⭐⭐ A janela, em letras, antes da conversa.
                  Fechada, o hospital precisa saber que só sai
                  modelo aprovado daqui — e que ligar é o
                  caminho. */}
              <div className={'dia-nota ' + (aberta.janela_aberta
                      ? (aberta.janela_minutos < 240 ? 'amarela' : 'azul')
                      : 'vermelha')}
                   data-aviso="janela-24h">
                {aberta.janela_aberta ? (
                  <>
                    <strong>
                      A janela de 24 horas está aberta por mais{' '}
                      {Math.floor(aberta.janela_minutos / 60)}h
                      {aberta.janela_minutos % 60}min.
                    </strong>
                    <p>
                      Dentro dela o hospital pode responder em texto livre.
                      Desde 1º/10/2026 a Meta cobra também essas respostas,
                      depois de 1.000 grátis por número no mês. Ela conta a
                      partir da última mensagem <strong>do paciente</strong>{' '}
                      — resposta nossa não renova nada.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>A janela de 24 horas está fechada.</strong>
                    <p>
                      Daqui só sai mensagem a partir de um modelo aprovado na
                      Meta, e ela é cobrada. Para falar agora, ligue.
                    </p>
                  </>
                )}
              </div>

              <div className="conv-thread" data-lista="thread">
                {thread.map(e => (
                  <div key={e.id}
                       className={'conv-balao ' + e.direcao.toLowerCase()
                         + (e.nivel === 'forte' ? ' urgente' : '')}
                       data-evento={e.direcao}>
                    <p>{e.texto}</p>
                    <small>
                      {/* ⭐ 21/10: quem respondeu — a recepção ou o robô. */}
                      {e.direcao === 'SAIDA' && (
                        <><strong data-autor={e.autor ? 'pessoa' : 'robo'}>
                          {e.autor ?? 'robô'}</strong> · </>
                      )}
                      {e.pendente && <><em>enviando…</em> · </>}
                      {hora(e.criado_em)}
                      {!!e.intencao && e.direcao === 'ENTRADA' && (
                        <> · <strong>{ROTULO_INTENCAO[e.intencao] ?? e.intencao}</strong></>
                      )}
                      {/* ⭐ POR QUE o robô leu assim. Sem isso,
                          descobrir o motivo de uma resposta
                          errada exigiria reproduzir a frase do
                          paciente — e nem sempre dá para pedir
                          que ele repita. */}
                      {!!e.porque && <> · {e.porque}</>}
                    </small>
                    {!!e.sem_resposta && (
                      <span className="conv-silencio" data-silencio={e.sem_resposta}>
                        <i className="fas fa-ban" /> não respondemos — {e.sem_resposta}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ O ATENDIMENTO DA CONVERSA   (21/10/2026)
                  O Tom, na tela do sistema antigo: "É o Assumir
                  que faz o robô parar de responder." O recado é
                  o MESMO de Mensagens dos Pacientes: assumido
                  aqui, aparece assumido lá.
                  ════════════════════════════════════════════ */}
              {!!aberta.numero_id && (
                <div className="conv-atendimento" data-bloco="atendimento-conversa">
                  <div className="conv-quem">
                    {aberta.atendente
                      ? <><i className="fas fa-headset" /> Com <strong>{aberta.atendente}</strong>
                          {aberta.comigo && ' (você)'} — o robô está quieto.</>
                      : <><i className="fas fa-robot" /> Ninguém atendendo — o robô responde.</>}
                  </div>

                  {aberta.comigo ? (
                    <>
                      <textarea data-campo="resposta" rows={3} maxLength={4096}
                                placeholder="Escreva a resposta ao paciente…"
                                value={rascunho} onChange={e => setRascunho(e.target.value)} />
                      {!aberta.janela_aberta && (
                        <small className="conv-aviso" data-aviso="janela-fechada-resposta">
                          A janela de 24h está fechada: a Meta deve recusar texto livre.
                          Se recusar, a tela diz — e o melhor caminho é ligar.
                        </small>
                      )}
                      {/* ⭐ Transferir: só para quem também tem o privilégio. */}
                      {!!colegas.length && (
                        <div className="cad-dupla" data-bloco="transferir-conversa">
                          <select value={paraQuem} data-campo="transferir-para"
                                  onChange={e => setParaQuem(e.target.value)}>
                            <option value="">Transferir para…</option>
                            {colegas.map(c => <option key={c.usuario_id} value={c.usuario_id}>{c.nome}</option>)}
                          </select>
                          <button className="btn-secondary" data-acao="transferir-conversa"
                                  disabled={enviando || !paraQuem} onClick={() => void transferir()}>
                            <i className="fas fa-share" /> Transferir
                          </button>
                        </div>
                      )}
                      <div className="form-actions">
                        <button className="btn-secondary" data-acao="devolver-conversa"
                                disabled={enviando} onClick={() => void devolver()}>
                          <i className="fas fa-rotate-left" /> Devolver ao robô
                        </button>
                        <button className="btn-secondary" data-acao="finalizar-conversa"
                                disabled={enviando} onClick={() => void finalizar()}>
                          <i className="fas fa-check" /> Finalizar
                        </button>
                        <button className="btn-primary" data-acao="enviar-resposta"
                                disabled={enviando || !rascunho.trim()} onClick={() => void enviar()}>
                          <i className="fas fa-paper-plane" /> Enviar pelo número oficial
                        </button>
                      </div>
                    </>
                  ) : aberta.atendente ? (
                    <small className="conv-aviso">
                      Só quem assumiu responde. Duas pessoas respondendo o mesmo
                      paciente é o mesmo problema do robô falando junto.
                    </small>
                  ) : possoResponder ? (
                    <div className="conv-assumir">
                      <p>
                        <strong>Assuma para poder responder.</strong> É o Assumir que
                        faz o robô parar — sem isso, vocês dois escreveriam ao mesmo
                        tempo.
                      </p>
                      <button className="btn-primary" data-acao="assumir-conversa"
                              disabled={enviando} onClick={() => void assumir()}>
                        <i className="fas fa-headset" /> Assumir e responder
                      </button>
                    </div>
                  ) : (
                    <small className="conv-aviso" data-aviso="sem-privilegio">
                      Responder pelo WhatsApp oficial é um privilégio individual,
                      dado pessoa a pessoa em Usuários.
                    </small>
                  )}
                </div>
              )}

              <div className="form-actions">
                {/* ⭐ Agendar: o Novo Agendamento abre já procurando o paciente. */}
                <button className="btn-secondary" data-acao="agendar-da-conversa"
                        onClick={() => { const c = aberta; setAberta(null);
                          irParaNovoAgendamento(c.paciente ?? c.telefone.slice(-9)); }}>
                  <i className="fas fa-calendar-plus" /> Agendar
                </button>
                <button className="btn-secondary" data-acao="fechar-conversa"
                        onClick={() => setAberta(null)}>Voltar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
