import { useEffect, useMemo, useState } from 'react';
import {
  mensagensDoPainel, contadoresDasMensagens, assumirMensagem,
  devolverMensagem, fecharProtocolo, setoresDoCliente,
  type MensagemDoPainel, type ContadoresDasMensagens,
  type AbaDasMensagens, type OrdemDasMensagens, type SetorDoCliente
} from './dados';
import { Aviso, useAviso } from './Aviso';
import { textoDaResposta, linkDaResposta } from '../../nucleo/whatsapp';

/**
 * ============================================================
 *  MENSAGENS DOS PACIENTES
 *
 *  20/10/2026, o Tom, mandando a foto da tela do Apps Script:
 *
 *  > *"Cria a tela conversas do painel, lembrando que cada
 *  >  usuário só enxerga as mensagens do seu setor, assume a
 *  >  que quiser. Otimize a tela que tem no Apps Script."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O QUE ESTA TELA É, E O QUE ELA NÃO É
 *
 *  Ela NÃO é a lista de conversas do WhatsApp — essa é a tela
 *  de Conversas, e mostra tudo que chega, inclusive o que o
 *  robô já respondeu sozinho.
 *
 *  Esta aqui é a FILA DE TRABALHO: só o que precisa de uma
 *  pessoa. Um recado por paciente, com dono, com setor e com
 *  um fim.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ O QUE MUDOU EM RELAÇÃO AO APPS SCRIPT
 *
 *   · os cinco cartões do topo FILTRAM ao serem tocados — lá
 *     eles eram enfeite, e quem via "0 ESPERANDO +24H" tinha
 *     que procurar na lista para confirmar;
 *   · ordem por mais antigo ou mais recente, que ele pediu;
 *   · urgência vai ao topo nas DUAS ordens;
 *   · quem está atendendo aparece com nome, e dá para devolver
 *     à fila;
 *   · a espera aparece em horas, e passa a vermelho depois de
 *     24h — a mesma informação do cartão, na linha.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE A TELA NÃO DECIDE
 *
 *  Quem enxerga o quê é decisão do BANCO
 *  (`core.vejo_o_setor`). Esta tela desenha o que vier. Um
 *  filtro só de tela seria uma tranca de papel: bastaria
 *  chamar a função direto para ver a fila inteira.
 * ============================================================
 */

const ABAS: { chave: AbaDasMensagens; rotulo: string; icone: string }[] = [
  { chave: 'atender',   rotulo: 'A Atender',      icone: 'fa-inbox' },
  { chave: 'atendendo', rotulo: 'Em Atendimento', icone: 'fa-headset' },
  { chave: 'comigo',    rotulo: 'Comigo',         icone: 'fa-user-check' },
  { chave: 'atendidos', rotulo: 'Atendidos',      icone: 'fa-circle-check' },
  { chave: 'todos',     rotulo: 'Todos',          icone: 'fa-list' }
];

/** "há 3 h", "ontem", "há 4 dias" — espera é o que importa aqui. */
function espera(horas: number): string {
  if (horas < 1) return 'agora há pouco';
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR',
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * ⭐⭐ A aba do WhatsApp Web tem NOME, e é sempre a mesma.
 *
 *  O WhatsApp Web não aceita duas abas abertas: a segunda mostra
 *  "o WhatsApp está aberto em outra janela" e a primeira para de
 *  funcionar. Com `_blank`, cada resposta abriria uma aba nova e
 *  derrubaria a anterior. Com um nome fixo, o navegador reaproveita
 *  a mesma aba — responder o terceiro paciente não estraga a
 *  conversa do segundo.
 */
const ABA_DO_WHATSAPP = 'medcalendar-whatsapp';

export function Mensagens({ clienteId, nomeDoHospital = '' }: {
  clienteId: string;
  /** Vai na apresentação da resposta: "da equipe de 📣 Ouvidoria do …". */
  nomeDoHospital?: string;
}) {
  const { recado, avisar, fechar } = useAviso();

  const [aba, setAba] = useState<AbaDasMensagens>('atender');
  const [ordem, setOrdem] = useState<OrdemDasMensagens>('antigos');
  const [setor, setSetor] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<MensagemDoPainel[]>([]);
  const [setores, setSetores] = useState<SetorDoCliente[]>([]);
  const [contas, setContas] = useState<ContadoresDasMensagens>({
    a_atender: 0, em_atendimento: 0, comigo: 0,
    esperando_24h: 0, concluidas_hoje: 0
  });
  /** Só as que esperam +24h — é o que o cartão vermelho filtra. */
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [indo, setIndo] = useState('');
  /** A mensagem que está sendo concluída, e a nota. */
  const [concluindo, setConcluindo] = useState<MensagemDoPainel | null>(null);
  const [nota, setNota] = useState('');

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    Promise.all([
      mensagensDoPainel({
        clienteId, aba, ordem,
        setor: setor || null,
        busca: busca.trim() || null
      }),
      contadoresDasMensagens(clienteId),
      setoresDoCliente(clienteId)
    ])
      .then(([m, c, st]) => {
        if (!valido) return;
        setLista(m); setContas(c); setSetores(st); setCarregando(false);
      })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, aba, ordem, setor, busca, recarga]);

  const vistas = useMemo(
    () => soAtrasadas ? lista.filter(m => m.horas >= 24) : lista,
    [lista, soAtrasadas]);

  /** O link pronto da resposta, ou `null` se o telefone não serve. */
  function linkDaRespostaDe(m: MensagemDoPainel): string | null {
    return linkDaResposta(m.telefone, textoDaResposta({
      paciente: m.paciente, atendente: m.quem_atende,
      setor: m.setor, icone: m.icone, hospital: nomeDoHospital,
      protocolo: m.protocolo, texto: m.texto
    }));
  }

  function responder(m: MensagemDoPainel) {
    const url = linkDaRespostaDe(m);
    if (!url) {
      avisar('O telefone deste recado está incompleto (precisa de DDD + número). ' +
             'Não dá para abrir o WhatsApp sem adivinhar o número.', false);
      return;
    }
    window.open(url, ABA_DO_WHATSAPP);
  }

  async function assumir(m: MensagemDoPainel) {
    if (indo) return;
    setIndo(m.id);
    try {
      const r = await assumirMensagem(clienteId, m.id);
      avisar(r.mensagem, r.ok);
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally { setIndo(''); }
  }

  async function devolver(m: MensagemDoPainel) {
    if (indo) return;
    setIndo(m.id);
    try {
      const r = await devolverMensagem(clienteId, m.id);
      avisar(r.mensagem, r.ok);
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally { setIndo(''); }
  }

  async function concluir() {
    if (!concluindo || indo) return;
    setIndo(concluindo.id);
    try {
      const r = await fecharProtocolo({ id: concluindo.id, nota: nota.trim() || null });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setConcluindo(null); setNota(''); }
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally { setIndo(''); }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  /** Tocar num cartão leva à aba que ele conta. */
  function irPara(destino: AbaDasMensagens, atrasadas = false) {
    setAba(destino); setSoAtrasadas(atrasadas);
  }

  const CARTOES: {
    chave: string; n: number; rotulo: string; icone: string;
    cor: string; vai: () => void;
  }[] = [
    { chave: 'a-atender', n: contas.a_atender, rotulo: 'A atender',
      icone: 'fa-inbox', cor: 'laranja', vai: () => irPara('atender') },
    { chave: 'em-atendimento', n: contas.em_atendimento, rotulo: 'Em atendimento',
      icone: 'fa-headset', cor: 'azul', vai: () => irPara('atendendo') },
    { chave: 'comigo', n: contas.comigo, rotulo: 'Comigo',
      icone: 'fa-user-check', cor: 'roxo', vai: () => irPara('comigo') },
    { chave: 'atrasadas', n: contas.esperando_24h, rotulo: 'Esperando +24h',
      icone: 'fa-clock', cor: 'vermelho', vai: () => irPara('atender', true) },
    { chave: 'concluidas', n: contas.concluidas_hoje, rotulo: 'Concluídas hoje',
      icone: 'fa-circle-check', cor: 'verde', vai: () => irPara('atendidos') }
  ];

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Mensagens dos Pacientes</h2>
          <p>
            O que o paciente deixou pelo chat e pelo WhatsApp e precisa de uma
            pessoa. Você vê os setores em que está marcado.
          </p>
        </div>
        <button className="btn-secondary" data-acao="atualizar-mensagens"
                onClick={() => setRecarga(n => n + 1)}>
          <i className="fas fa-sync-alt" /> Atualizar
        </button>
      </div>

      {/* ⭐⭐⭐ Os cinco cartões FILTRAM. No Apps Script eles eram
          enfeite: quem lia "3 esperando +24h" tinha que procurar
          na lista quais eram. Número que não leva a lugar nenhum
          é número que ninguém confere. */}
      <div className="stats-grid cinco" data-bloco="contadores">
        {CARTOES.map(c => (
          <button key={c.chave} className={'stat-card msg-cartao ' + c.cor}
                  data-cartao={c.chave} onClick={c.vai}>
            <div className="stat-icon"><i className={`fas ${c.icone}`} /></div>
            <div className="stat-info">
              <h3>{c.n}</h3>
              <p>{c.rotulo}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="ag-tipo-switch" data-bloco="abas-mensagens">
        {ABAS.map(a => (
          <button key={a.chave} className={aba === a.chave ? 'ativo' : ''}
                  data-aba={a.chave}
                  onClick={() => { setAba(a.chave); setSoAtrasadas(false); }}>
            <i className={`fas ${a.icone}`} /> {a.rotulo}
          </button>
        ))}
      </div>

      <div className="msg-filtros">
        <div className="cad-busca" style={{ flex: 1, marginBottom: 0 }}>
          <i className="fas fa-search" />
          <input type="text" value={busca} data-campo="busca-mensagem"
                 onChange={e => setBusca(e.target.value)}
                 placeholder="Buscar por paciente, telefone ou texto…" />
        </div>

        <select value={setor} data-campo="filtro-setor"
                onChange={e => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {setores.map(s => (
            <option key={s.id} value={s.id}>
              {(s.icone ?? '') + ' ' + s.nome}
            </option>
          ))}
        </select>

        {/* ⭐ A ordem que o Tom pediu. Fila de verdade começa
            pelo mais antigo — quem esperou mais é atendido
            primeiro — então é esse o começo. */}
        <select value={ordem} data-campo="ordem"
                onChange={e => setOrdem(e.target.value as OrdemDasMensagens)}>
          <option value="antigos">Mais antigas primeiro</option>
          <option value="recentes">Mais recentes primeiro</option>
        </select>
      </div>

      {soAtrasadas && (
        <div className="dia-nota vermelha" data-aviso="so-atrasadas">
          <strong>Mostrando só quem espera há mais de 24 horas.</strong>
          <p>
            <button className="btn-linha-texto" data-acao="ver-todas"
                    onClick={() => setSoAtrasadas(false)}>
              Ver todas da fila
            </button>
          </p>
        </div>
      )}

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {/* ⚠️ Lista vazia tem MOTIVO, e o motivo muda por aba.
          "Nenhuma mensagem" numa aba filtrada faria alguém
          concluir que o sistema parou de receber. */}
      {!carregando && !vistas.length && (
        <div className="porvir" data-vazio={aba}>
          <i className="fas fa-inbox" />
          <h3>
            {aba === 'atender'   ? 'Nenhuma mensagem esperando'
             : aba === 'comigo'  ? 'Você não está com nenhuma'
             : aba === 'atendendo' ? 'Ninguém está atendendo nada agora'
             : aba === 'atendidos' ? 'Nada concluído ainda'
             : 'Nenhuma mensagem'}
          </h3>
          <p>
            {busca.trim() || setor
              ? 'Pode ser o filtro: limpe a busca ou escolha "Todos os setores".'
              : 'Quando um paciente deixar um recado pelo chat ou pelo WhatsApp, ele aparece aqui.'}
          </p>
        </div>
      )}

      {!carregando && vistas.map(m => (
        <div key={m.id}
             className={'msg-linha'
               + (m.urgente ? ' urgente' : '')
               + (m.meu ? ' minha' : '')
               + (m.horas >= 24 && m.situacao === 'ABERTO' ? ' atrasada' : '')}
             data-mensagem={m.id} data-situacao={m.situacao}
             data-meu={m.meu ? 'sim' : 'nao'}>

          <div className="msg-cabeca">
            <span className="msg-quem">
              <strong>{m.paciente ?? 'Paciente não identificado'}</strong>
              <small>
                {m.icone ? m.icone + ' ' : ''}{m.setor ?? 'Sem setor'}
                {' · '}{m.telefone_curto}
                {' · '}{quando(m.aberto_em)}
              </small>
            </span>

            <span className="msg-selos">
              {m.urgente && (
                <em className="cad-tag forte" data-tag="urgente">urgência</em>
              )}
              {m.quantas > 1 && (
                <em className="cad-tag sub" data-tag="quantas">
                  {m.quantas} mensagens
                </em>
              )}
              <em className="cad-tag neutro" data-tag="protocolo">{m.protocolo}</em>
              <em className={'msg-espera' + (m.horas >= 24 ? ' tarde' : '')}
                  data-espera={m.horas}>
                {espera(m.horas)}
              </em>
            </span>
          </div>

          <p className="msg-texto">{m.texto ?? '(sem texto)'}</p>

          <div className="msg-pe">
            {/* ⭐ Quem está atendendo aparece com NOME. "Em
                atendimento" sem dizer com quem obriga a
                perguntar na sala ao lado. */}
            {!!m.assumido_por && (
              <span className={'msg-dono' + (m.meu ? ' eu' : '')}
                    data-dono={m.meu ? 'eu' : 'outro'}>
                <i className="fas fa-user-check" />
                {m.meu ? 'Está com você' : `Com ${m.quem_atende}`}
              </span>
            )}

            <div className="cad-botoes">
              {/* ⭐⭐⭐ RESPONDER — só na mensagem que está COMIGO.

                  Quem responde é quem assumiu: a resposta sai assinada
                  com o nome de quem está atendendo. Responder um
                  recado que está na fila, sem assumir, faria dois
                  atendentes escreverem para o mesmo paciente. */}
              {m.situacao === 'ABERTO' && m.meu && (() => {
                const url = linkDaRespostaDe(m);
                return (
                  <button className="btn-whatsapp btn-sm" data-acao="responder-whatsapp"
                          data-link={url ?? ''}
                          title={url ? 'Abre o WhatsApp Web com a resposta começada'
                                     : 'Telefone incompleto: precisa de DDD + número'}
                          disabled={!url} onClick={() => responder(m)}>
                    <i className="fab fa-whatsapp" /> Responder no WhatsApp
                  </button>
                );
              })()}
              {m.situacao === 'ABERTO' && !m.assumido_por && (
                <button className="btn-primary btn-sm" data-acao="assumir"
                        disabled={indo === m.id} onClick={() => assumir(m)}>
                  <i className="fas fa-hand" /> Assumir
                </button>
              )}
              {/* ⚠️ Os botões só aparecem para quem PODE. Quem
                  decide é o banco (`posso_mexer`), e não esta
                  tela — ela não conhece as permissões de quem
                  está olhando. Um botão que recusa depois do
                  clique é pior que um botão que não existe. */}
              {m.situacao === 'ABERTO' && !!m.assumido_por && m.posso_mexer && (
                <>
                  <button className="btn-secondary btn-sm" data-acao="devolver"
                          disabled={indo === m.id} onClick={() => devolver(m)}>
                    <i className="fas fa-rotate-left" /> Devolver à fila
                  </button>
                  <button className="btn-primary btn-sm" data-acao="concluir"
                          disabled={indo === m.id}
                          onClick={() => { setConcluindo(m); setNota(''); }}>
                    <i className="fas fa-check" /> Concluir
                  </button>
                </>
              )}
              {m.situacao === 'ABERTO' && !!m.assumido_por && !m.posso_mexer && (
                <em className="msg-so-dono" data-aviso="nao-e-minha">
                  só {m.quem_atende} pode concluir
                </em>
              )}
              {m.situacao !== 'ABERTO' && (
                <em className="cad-tag" data-tag="concluida">concluída</em>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* ---------------- concluir ---------------- */}
      {concluindo && (
        <div className="modal" data-modal="concluir">
          <div className="modal-overlay" onClick={() => setConcluindo(null)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Concluir o atendimento</h3>
              <button onClick={() => setConcluindo(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <div className="dia-nota" data-nota="o-que-foi">
                <strong>{concluindo.paciente ?? 'Paciente não identificado'}</strong>
                <p>{concluindo.texto}</p>
              </div>
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>O que foi feito (opcional)</label>
                <input type="text" value={nota} data-campo="nota"
                       maxLength={200}
                       placeholder="Liguei e remarquei para quinta"
                       onChange={e => setNota(e.target.value)} />
                <p className="dica">
                  Fica guardado no protocolo. É o que a próxima pessoa vai ler
                  se o paciente voltar a escrever.
                </p>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" disabled={!!indo}
                      onClick={() => setConcluindo(null)}>Voltar</button>
              <button className="btn-primary" data-acao="confirmar-concluir"
                      disabled={!!indo} onClick={concluir}>
                <i className="fas fa-check" /> Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
