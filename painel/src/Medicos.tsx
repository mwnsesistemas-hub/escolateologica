import { useEffect, useMemo, useState } from 'react';
import {
  medicosDoCliente, especialidadesDoCliente, conveniosDoCliente,
  arvoreDeExames, type ExameDaArvore,
  medicoPorId, salvarMedico,
  type Medico, type Especialidade, type MedicoNoFormulario,
  type Convenio, type ConvenioDoMedico,
  /* ⭐ 26/10: ligar o médico ao login. */
  loginsParaMedico, ligarMedicoAoLogin, type LoginParaMedico
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  MÉDICOS
 *
 *  O cadastro que falta para o St James existir dentro do
 *  MedCalendar — hoje os médicos das telas vêm do cliente de
 *  demonstração.
 *
 *  ------------------------------------------------------------
 *  O FORMULÁRIO LÊ DE NOVO AO ABRIR
 *
 *  Ele não usa a linha que já está na lista. A lista pode estar
 *  velha, e salvar por cima de dado velho apaga o que outra
 *  pessoa acabou de gravar — a mesma lição do modal de corrigir
 *  paciente, que também relê.
 *
 *  ------------------------------------------------------------
 *  ⭐ DESATIVAR MÉDICO COM CONSULTA FUTURA PERGUNTA ANTES
 *
 *  As telas listam só médico ativo. Desativar faz ele
 *  desaparecer do painel — e as consultas futuras dele ficam na
 *  agenda sem dono visível.
 *
 *  É a mesma família do expediente apagado de 07/10: uma ação de
 *  cadastro que estraga a agenda respondendo sucesso. Aqui o
 *  banco conta quantas são, a tela mostra, e só então deixa
 *  confirmar.
 *
 *  ------------------------------------------------------------
 *  ⭐ CONVÊNIOS ATENDIDOS, COM LIMITE POR DIA
 *
 *  Veio do formulário do sistema de hoje, e com duas decisões
 *  dele preservadas:
 *
 *   · **nenhum marcado quer dizer TODOS.** No print do Tom todos
 *     estão marcados, então na prática nada muda quando isto
 *     subir — e num médico que ninguém configurou, ele continua
 *     aparecendo para todo paciente. Pela regra contrária, no dia
 *     do envio nenhum médico apareceria para nenhum paciente com
 *     plano.
 *
 *   · **o limite aceita `0`, e `0` quer dizer sem limite.** É o
 *     que está digitado nos campos do Apps Script hoje. Aqui o
 *     campo nasce VAZIO com a dica "sem limite" — melhor
 *     affordance — mas quem digitar 0 é atendido, e a tradução
 *     acontece no banco, num lugar só, para o importador da
 *     planilha cair na mesma regra.
 *
 *  ------------------------------------------------------------
 *  ⭐ FAIXA ETÁRIA — A IDADE É A DA CONSULTA
 *
 *  Em branco nos dois lados = atende todas as idades.
 *
 *  A frase "a idade é calculada na data da consulta, não na de
 *  hoje" está na tela de propósito: ela é contraintuitiva e vai
 *  ser questionada no balcão. A criança de 13 anos e 11 meses que
 *  marca para dentro de dois meses CHEGA com 14 — e o pediatra
 *  que atende até 14 está certo em recebê-la.
 *
 *  ------------------------------------------------------------
 *  A LISTA MOSTRA OS DESATIVADOS
 *
 *  De propósito, apagados e com um selo. Esconder quem foi
 *  desativado tornaria o engano irreversível pela tela: a pessoa
 *  desativa sem querer e o médico simplesmente não existe mais
 *  em lugar nenhum onde ela possa mexer.
 * ============================================================
 */

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
             'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function Medicos({ clienteId, atendeConvenios = true }: {
  clienteId: string; atendeConvenios?: boolean;
}) {
  const { recado, avisar, fechar } = useAviso();

  const [lista, setLista] = useState<Medico[]>([]);
  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [convs, setConvs] = useState<Convenio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [busca, setBusca] = useState('');

  const [aberto, setAberto] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [exames, setExames] = useState<ExameDaArvore[]>([]);
  const [f, setF] = useState<MedicoNoFormulario | null>(null);
  const [indo, setIndo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [avisoFuturas, setAvisoFuturas] = useState('');

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    // As duas de uma vez: são independentes, e esperar uma para
    // começar a outra seria somar as esperas sem motivo.
    Promise.all([
      medicosDoCliente(clienteId, false),
      especialidadesDoCliente(clienteId, true),
      conveniosDoCliente(clienteId, true),
      // ⭐ A árvore de exames vem junto: o formulário precisa
      //    dela no instante em que abre, e uma consulta a mais
      //    por abertura de formulário aparece quando a recepção
      //    tem 40 médicos para cadastrar.
      arvoreDeExames(clienteId)
    ])
      .then(([m, e, c, x]) => {
        if (valido) {
          setLista(m); setEsps(e); setConvs(c); setExames(x);
          setCarregando(false);
        }
      })
      .catch(x => { if (valido) { setErro(x.message ?? String(x)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(m =>
      m.nome.toLowerCase().includes(t) ||
      (m.especialidades ?? '').toLowerCase().includes(t));
  }, [lista, busca]);

  /** As especialidades em dois níveis, para as caixinhas. */
  const arvore = useMemo(() => {
    const pais = esps.filter(e => !e.pai_id);
    return pais.map(p => ({ pai: p, filhos: esps.filter(x => x.pai_id === p.id) }));
  }, [esps]);

  /* ⭐ A ÁRVORE DE EXAMES, do mesmo jeito: pai e filhos.
   *
   *  A estrutura é a mesma da especialidade porque a ideia é a
   *  mesma — subtipo é serviço com pai. Foi o Tom quem apontou
   *  isso, em 09/10: *"Tipo especialidades."* */
  const arvoreEx = useMemo(() => {
    const pais = exames.filter(e => !e.pai_id && e.ativo);
    return pais.map(p => ({
      pai: p,
      filhos: exames.filter(x => x.pai_id === p.id && x.ativo),
    }));
  }, [exames]);

  const marcado = (id: string) => (f?.exames ?? []).includes(id);

  /* ⭐⭐ MARCAR O EXAME DE CIMA QUER DIZER "FAZ TODOS".
   *
   *  É a regra do banco (`quem_faz_o_que`: vínculo no pai cobre
   *  os filhos), e a tela tem que DIZER isso — senão alguém
   *  marca o pai e os três subtipos, e depois não entende por
   *  que desmarcar um subtipo não tirou nada.
   *
   *  Então: marcar o pai LIMPA os filhos e os mostra como
   *  incluídos. Desmarcar o pai devolve a escolha um a um.
   */
  function mexerExame(id: string, filhos: string[], ligar: boolean) {
    if (!f) return;
    const atual = new Set(f.exames ?? []);
    if (ligar) {
      atual.add(id);
      // marcar o pai torna os filhos redundantes
      for (const x of filhos) atual.delete(x);
    } else {
      atual.delete(id);
    }
    mexer({ exames: [...atual] });
  }

  function vazio(): MedicoNoFormulario {
    return {
      id: '', nome: '', duracao_min: 30, ativo: true,
      conselho: '', conselho_uf: '', cbos: '',
      especialidades: [], faz_consulta: true, faz_exame: false,
      consultas_futuras: 0,
      convenios: [], idade_min: null, idade_max: null, idade_obs: '',
      exames: []
    };
  }

  /* ⭐ 26/10: quem pode entrar como este médico. */
  const [logins, setLogins] = useState<LoginParaMedico[]>([]);
  const [loginEscolhido, setLoginEscolhido] = useState('');
  const [ligando, setLigando] = useState(false);

  async function carregarLogins(recursoId: string | null) {
    setLogins([]); setLoginEscolhido('');
    if (!recursoId) return;
    try {
      const l = await loginsParaMedico(clienteId, recursoId);
      setLogins(l);
      setLoginEscolhido(l.find(x => x.eh_este)?.usuario_id ?? '');
    } catch {
      /* ⚠️ Sem permissão para mexer em usuários, a lista vem
         vazia e o bloco não aparece. Não é erro, é a porta
         fechada — e um aviso vermelho aqui assustaria quem só
         queria corrigir um nome. */
    }
  }

  async function salvarAcesso() {
    if (!f?.id || ligando) return;
    setLigando(true);
    try {
      const r = await ligarMedicoAoLogin(clienteId, f.id, loginEscolhido || null);
      avisar(r.mensagem, r.ok);
      if (r.ok) await carregarLogins(f.id);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setLigando(false);
    }
  }

  function novo() {
    setF(vazio()); setConfirmar(false); setAvisoFuturas(''); setAberto(true);
    setLogins([]); setLoginEscolhido('');
  }

  async function editar(m: Medico) {
    setAbrindo(true); setConfirmar(false); setAvisoFuturas('');
    try {
      const atual = await medicoPorId(m.id);
      if (!atual) { avisar('Médico não encontrado. Recarregue a tela.', false); return; }
      setF(atual);
      setAberto(true);
      void carregarLogins(atual.id ?? null);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setAbrindo(false);
    }
  }

  function mexer(campo: Partial<MedicoNoFormulario>) {
    setF(a => a ? { ...a, ...campo } : a);
    // Mexer em qualquer coisa invalida a confirmação anterior:
    // ela era sobre OUTRO estado do formulário.
    setConfirmar(false);
    setAvisoFuturas('');
  }

  function virarEspecialidade(id: string) {
    if (!f) return;
    const tem = f.especialidades.includes(id);
    mexer({ especialidades: tem
      ? f.especialidades.filter(x => x !== id)
      : [...f.especialidades, id] });
  }

  /* ---------------- os convênios ---------------- */

  const vinculo = (id: string): ConvenioDoMedico | undefined =>
    (f?.convenios ?? []).find(c => c.convenio_id === id);

  function virarConvenio(id: string) {
    if (!f) return;
    const lista = f.convenios ?? [];
    mexer({ convenios: vinculo(id)
      ? lista.filter(c => c.convenio_id !== id)
      // Entra sem limite. Pôr um número por padrão seria inventar
      // um acerto comercial que ninguém fez.
      : [...lista, { convenio_id: id, limite_dia: null }] });
  }

  function mexerLimite(id: string, texto: string) {
    if (!f) return;
    // Vazio e `0` dizem a mesma coisa — sem limite — e os dois
    // viram nulo aqui. O `0` existe porque é o que está digitado
    // no formulário de hoje; quem traduz de verdade é o banco, e
    // esta linha só evita mandar um zero que ele já sabe tratar.
    const n = texto.trim() === '' ? null : Math.trunc(Number(texto));
    const limpo = n === null || !Number.isFinite(n) || n <= 0 ? null : n;
    mexer({
      convenios: (f.convenios ?? []).map(c =>
        c.convenio_id === id ? { ...c, limite_dia: limpo } : c)
    });
  }

  function todosConvenios() {
    if (!f) return;
    mexer({ convenios: convs.map(c => ({
      convenio_id: c.id,
      limite_dia: vinculo(c.id)?.limite_dia ?? null
    })) });
  }

  /* ---------------- a faixa etária ---------------- */

  function mexerIdade(qual: 'min' | 'max', texto: string) {
    const n = texto.trim() === '' ? null : Math.trunc(Number(texto));
    const limpo = n === null || !Number.isFinite(n) || n < 0 || n > 120 ? null : n;
    mexer(qual === 'min' ? { idade_min: limpo } : { idade_max: limpo });
  }

  const faixaInvertida = !!f && f.idade_min !== null && f.idade_max !== null
                         && f.idade_min > f.idade_max;

  const nomeOk = (f?.nome ?? '').trim().length >= 3;
  const tipoOk = !!(f?.faz_consulta || f?.faz_exame);
  const duracaoOk = !!f && f.duracao_min >= 5 && f.duracao_min <= 240;
  const pode = !!f && nomeOk && tipoOk && duracaoOk && !faixaInvertida && !indo;

  async function salvar() {
    if (!pode || !f) return;
    setIndo(true);
    try {
      const r = await salvarMedico({
        clienteId,
        nome: f.nome.trim(),
        duracaoMin: f.duracao_min,
        id: f.id || null,
        ativo: f.ativo,
        especialidades: f.especialidades,
        conselho: f.conselho ?? undefined,
        conselhoUf: f.conselho_uf ?? undefined,
        cbos: f.cbos ?? undefined,
        fazConsulta: f.faz_consulta,
        fazExame: f.faz_exame,
        confirmar,
        // Sempre mandados, porque este formulário CONHECE os dois
        // campos. É a tela que não os conhece — o importador da
        // planilha — que vai omiti-los, e aí o banco preserva o
        // que estava gravado.
        convenios: f.convenios ?? [],
        // ⭐ Sempre mandado, porque este formulário CONHECE o
        //    campo. Quem não conhece — o importador — omite, e
        //    o banco preserva o que está gravado.
        exames: f.exames ?? [],
        idade: {
          min: f.idade_min,
          max: f.idade_max,
          obs: (f.idade_obs ?? '').trim() || null
        }
      });

      if (!r.ok) {
        // O banco recusou porque desativar deixaria consultas
        // futuras penduradas. A próxima tentativa vai confirmada,
        // e o botão muda de texto — o segundo clique é outra
        // coisa, e tem que parecer outra coisa.
        if ((r.consultas_futuras ?? 0) > 0) {
          setConfirmar(true);
          setAvisoFuturas(r.mensagem);
        } else {
          avisar(r.mensagem, false);
        }
        setIndo(false);
        return;
      }
      avisar(r.mensagem, true);
      setAberto(false);
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Médicos</h2>
        <button className="btn-primary" data-acao="novo-medico" onClick={novo}>
          <i className="fas fa-plus" /> Novo médico
        </button>
      </div>

      {!carregando && !esps.length && (
        <div className="dia-nota amarela" style={{ marginBottom: 14 }}>
          <strong>Nenhuma especialidade cadastrada ainda</strong>
          <p>
            Dá para cadastrar o médico sem especialidade, mas aí o chat não tem
            como filtrar por área. Cadastre as especialidades primeiro — e as
            subáreas, se houver.
          </p>
        </div>
      )}

      <div className="ag-search-box" style={{ maxWidth: 420, marginBottom: 14 }}>
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca"
               onChange={e => setBusca(e.target.value)}
               placeholder="Procurar por nome ou especialidade" />
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !filtrada.length && (
        <div className="porvir">
          <i className="fas fa-user-md" />
          <h3>{busca ? 'Nenhum médico com esse nome' : 'Nenhum médico cadastrado'}</h3>
          <p>{busca ? 'Tente outro termo.' : 'Comece pelo primeiro.'}</p>
        </div>
      )}

      {!carregando && filtrada.map(m => (
        <div key={m.id} className={'cad-linha medico' + (m.ativo ? '' : ' inativo')}
             data-medico={m.id}>
          <span className="cad-nome">{m.nome}</span>
          <span className="cad-tags">
            {!m.ativo && <em className="cad-tag off">desativado</em>}
            {m.faz_consulta && <em className="cad-tag">consulta</em>}
            {m.faz_exame && <em className="cad-tag exame">exame</em>}
            <em className="cad-tag neutro">{m.duracao_min} min</em>
            {m.especialidades
              ? <em className="cad-tag sub">{m.especialidades}</em>
              : <em className="cad-tag off">sem especialidade</em>}
            {/* ⭐ "todos" dito com palavra, não com célula vazia.
                Em branco, quem lê a lista entende "nenhum" — que é
                o contrário da verdade. */}
            {m.todos_convenios
              ? <em className="cad-tag neutro" data-conv="todos">
                  todos os convênios
                </em>
              : <em className="cad-tag conv" data-conv="alguns">{m.convenios}</em>}
            {(m.idade_min !== null || m.idade_max !== null) && (
              <em className="cad-tag idade" data-idade="faixa">
                <i className="fas fa-child" />{' '}
                {m.idade_min !== null && m.idade_max !== null
                  ? `${m.idade_min}–${m.idade_max} anos`
                  : m.idade_min !== null
                    ? `${m.idade_min}+ anos`
                    : `até ${m.idade_max} anos`}
              </em>
            )}
          </span>
          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="editar-medico"
                    disabled={abrindo} onClick={() => editar(m)}>
              <i className="fas fa-pen" /> Editar
            </button>
          </div>
        </div>
      ))}

      {/* ---------------- o formulário ---------------- */}
      {aberto && f && (
        <div className="modal" data-modal="medico">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>{f.id ? 'Editar médico' : 'Novo médico'}</h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Nome *</label>
                <input type="text" autoFocus maxLength={120} value={f.nome}
                       data-campo="nome"
                       onChange={e => mexer({ nome: e.target.value })}
                       placeholder="Dra. Ana Beatriz Lima" />
                {!!f.nome && !nomeOk && (
                  <small style={{ color: 'var(--danger)' }}>
                    Precisa de pelo menos 3 letras.
                  </small>
                )}
              </div>

              {/* ---------- consulta, exame, ou os dois ---------- */}
              <div className="form-group">
                <label>O que ele atende *</label>
                <div className="cad-escolhas">
                  <label className="cad-escolha">
                    <input type="checkbox" checked={f.faz_consulta}
                           data-campo="faz-consulta"
                           onChange={e => mexer({ faz_consulta: e.target.checked })} />
                    <span><i className="fas fa-stethoscope" /> Consultas</span>
                  </label>
                  <label className="cad-escolha">
                    <input type="checkbox" checked={f.faz_exame}
                           data-campo="faz-exame"
                           onChange={e => mexer({ faz_exame: e.target.checked })} />
                    <span><i className="fas fa-microscope" /> Exames</span>
                  </label>
                </div>
                {!tipoOk && (
                  <small style={{ color: 'var(--danger)' }}>
                    Marque pelo menos um. Sem nenhum dos dois ele não aparece
                    para o paciente em lugar nenhum.
                  </small>
                )}
                <small className="wiz-dica">
                  É a primeira pergunta do chat. No sistema antigo isso eram
                  duas telas separadas — "Médicos" e "Médicos de Exames".
                </small>
              </div>

              <div className="form-row" style={{ display: 'flex', gap: 14 }}>
                <div className="form-group" style={{ width: 160 }}>
                  <label>Minutos por consulta *</label>
                  <input type="number" min={5} max={240} step={5}
                         value={f.duracao_min} data-campo="duracao"
                         onChange={e => mexer({ duracao_min: Number(e.target.value) })} />
                  {!duracaoOk && (
                    <small style={{ color: 'var(--danger)' }}>Entre 5 e 240.</small>
                  )}
                  <small className="wiz-dica">
                    O serviço manda, quando for maior.
                  </small>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Conselho</label>
                  <input type="text" maxLength={30} value={f.conselho ?? ''}
                         data-campo="conselho"
                         onChange={e => mexer({ conselho: e.target.value })}
                         placeholder="CRM 123456" />
                </div>
                <div className="form-group" style={{ width: 100 }}>
                  <label>UF</label>
                  <select value={f.conselho_uf ?? ''} data-campo="uf"
                          onChange={e => mexer({ conselho_uf: e.target.value })}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* ---------- especialidades e subáreas ---------- */}
              <div className="form-group">
                <label>Especialidades</label>
                {!arvore.length && (
                  <small className="wiz-dica">
                    Nenhuma cadastrada. Vá em Especialidades primeiro.
                  </small>
                )}
                <div className="cad-esps" data-lista="especialidades">
                  {arvore.map(({ pai: p, filhos }) => (
                    <div key={p.id} className="cad-esp-grupo">
                      <label className="cad-escolha pai">
                        <input type="checkbox"
                               checked={f.especialidades.includes(p.id)}
                               data-esp={p.id}
                               onChange={() => virarEspecialidade(p.id)} />
                        <span>{p.nome}</span>
                      </label>
                      {!!filhos.length && (
                        <div className="cad-esp-filhos">
                          {filhos.map(x => (
                            <label key={x.id} className="cad-escolha filho">
                              <input type="checkbox"
                                     checked={f.especialidades.includes(x.id)}
                                     data-esp={x.id}
                                     onChange={() => virarEspecialidade(x.id)} />
                              <span>{x.nome}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* A regra de herança, dita onde ela é decidida. */}
                {arvore.some(({ pai: p, filhos }) =>
                  filhos.length > 0 && f.especialidades.includes(p.id)
                  && !filhos.some(x => f.especialidades.includes(x.id))) && (
                  <div className="dia-nota azul" style={{ marginTop: 10 }}>
                    Marcado só na especialidade e em nenhuma subárea, ele entra
                    como <strong>geral</strong> — e aparece em{' '}
                    <strong>todas</strong> as subáreas dela. Marque as subáreas
                    para restringir.
                  </div>
                )}
              </div>

              {/* ---------- ⭐ a faixa etária ---------- */}
              <div className="cad-bloco" data-bloco="faixa-etaria">
                <h4><i className="fas fa-child" /> Faixa etária atendida</h4>
                <small className="wiz-dica">
                  Deixe em branco para <strong>atender todas as idades</strong>.
                  A idade é calculada <strong>na data da consulta</strong>, não
                  na de hoje — quem faz 18 antes do dia já conta como maior.
                </small>

                <div className="cad-duas">
                  <div className="form-group">
                    <label>Idade mínima (anos)</label>
                    <input type="number" min={0} max={120}
                           value={f.idade_min ?? ''} data-campo="idade-min"
                           onChange={e => mexerIdade('min', e.target.value)}
                           placeholder="sem mínimo" />
                  </div>
                  <div className="form-group">
                    <label>Idade máxima (anos)</label>
                    <input type="number" min={0} max={120}
                           value={f.idade_max ?? ''} data-campo="idade-max"
                           onChange={e => mexerIdade('max', e.target.value)}
                           placeholder="sem máximo" />
                  </div>
                </div>

                {faixaInvertida && (
                  <small style={{ color: 'var(--danger)' }} data-erro="faixa">
                    A faixa está invertida: de {f.idade_min} até {f.idade_max} anos
                    não atende ninguém.
                  </small>
                )}

                <div className="form-group" style={{ marginTop: 6 }}>
                  <label>Observação (aparece para o paciente no chat)</label>
                  <input type="text" maxLength={120} value={f.idade_obs ?? ''}
                         data-campo="idade-obs"
                         onChange={e => mexer({ idade_obs: e.target.value })}
                         placeholder="Ex: atende apenas adultos" />
                </div>
              </div>

              {/* ════════════════════════════════════════════
                  ⭐⭐ OS EXAMES QUE ELE FAZ

                  09/10/2026, o Tom: *"dentro do cadastro médico
                  precisa ter como vincular os médicos aos
                  exames. Quando seleciona exames abre a seleção
                  dos tipos e subtipos."*

                  Só aparece quando "faz exame" está marcado —
                  um bloco de 17 exames aberto para um
                  oftalmologista que nunca fez exame é ruído que
                  faz alguém marcar por engano.
                 ════════════════════════════════════════════ */}
              {f.faz_exame && (
                <div className="cad-bloco" data-bloco="exames">
                  <h4><i className="fas fa-microscope" /> Exames que ele faz</h4>

                  {!arvoreEx.length ? (
                    <div className="dia-nota amarela" data-aviso="sem-exames">
                      <strong>Nenhum exame cadastrado ainda.</strong>
                      <p>
                        Importe a planilha em <strong>Configurações →
                        Importar planilha</strong>. Enquanto não houver exame,
                        este médico não aparece para marcar exame.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* ⭐ Zero marcados NÃO quer dizer "faz todos".
                          Em exame, lista vazia é lista vazia — e
                          dizer isso aqui evita o cadastro que
                          parece pronto e não aparece em lugar
                          nenhum. */}
                      {!(f.exames ?? []).length && (
                        <div className="dia-nota amarela"
                             data-aviso="nenhum-exame-marcado">
                          <strong>Nenhum exame marcado.</strong>
                          <p>
                            Ele <strong>não vai aparecer</strong> para marcar
                            exame. Diferente do convênio, aqui vazio quer dizer{' '}
                            <strong>nenhum</strong>, e não "todos".
                          </p>
                        </div>
                      )}

                      <div className="cad-arvore" data-lista="exames">
                        {arvoreEx.map(({ pai, filhos }) => {
                          const paiMarcado = marcado(pai.id);
                          return (
                            <div key={pai.id} className="cad-ramo"
                                 data-exame={pai.id}>
                              <label className="chk-linha">
                                <input type="checkbox" checked={paiMarcado}
                                       onChange={e => mexerExame(
                                         pai.id, filhos.map(x => x.id),
                                         e.target.checked)} />
                                <span><strong>{pai.nome}</strong></span>
                                {!!filhos.length && (
                                  <em className="wiz-dica">
                                    {paiMarcado
                                      ? `faz os ${filhos.length} subtipos`
                                      : `${filhos.length} subtipos`}
                                  </em>
                                )}
                                {!filhos.length && pai.codigo_tuss && (
                                  <em className="wiz-dica">
                                    TUSS {pai.codigo_tuss}
                                  </em>
                                )}
                              </label>

                              {/* ⭐⭐ Os subtipos. Com o pai marcado
                                  eles ficam travados e marcados —
                                  mostrar as caixas soltas faria
                                  alguém desmarcar um e não
                                  entender por que nada mudou. */}
                              {!!filhos.length && (
                                <div className="cad-filhos">
                                  {filhos.map(ff => (
                                    <label key={ff.id}
                                           className="chk-linha"
                                           data-subtipo={ff.id}
                                           title={paiMarcado
                                             ? 'Incluído porque o exame inteiro está marcado'
                                             : undefined}>
                                      <input type="checkbox"
                                             checked={paiMarcado || marcado(ff.id)}
                                             disabled={paiMarcado}
                                             onChange={e => mexerExame(
                                               ff.id, [], e.target.checked)} />
                                      <span>{ff.nome}</span>
                                      {ff.codigo_tuss && (
                                        <em className="wiz-dica">
                                          TUSS {ff.codigo_tuss}
                                        </em>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <small className="wiz-dica" data-contagem="exames">
                        Marcados <strong>{(f.exames ?? []).length}</strong>.
                        {' '}Marcar o exame de cima quer dizer que ele{' '}
                        <strong>faz todos os subtipos</strong> — é a mesma
                        regra do ortopedista geral.
                      </small>
                    </>
                  )}
                </div>
              )}

              {/* ---------- ⭐ os convênios ---------- */}
              {atendeConvenios && <div className="cad-bloco" data-bloco="convenios">
                <h4><i className="fas fa-id-card" /> Convênios atendidos</h4>

                {!convs.length ? (
                  <small className="wiz-dica">
                    Nenhum convênio cadastrado. Vá em Convênios primeiro — sem
                    eles o médico atende todos, que é o padrão.
                  </small>
                ) : (
                  <>
                    {/* ════════════════════════════════════════
                        ⚠️ O TEXTO DIZ O QUE ACONTECE, NÃO O QUE
                           A LISTA "SIGNIFICA"

                        09/10/2026, o Tom: *"está invertido. diz
                        marcar para restringir e voltar a atender
                        todos, mas está ao contrário. quando
                        marca, atende aquele convênio marcado."*

                        O comportamento sempre esteve certo — a
                        PALAVRA é que estava errada. "Restringir"
                        soa como *bloquear*: quem lê entende que
                        marcar a Unimed é dizer que ele NÃO
                        atende Unimed.

                        Agora cada estado diz o resultado, com o
                        nome do convênio quando dá:

                          nenhum marcado → atende TODOS
                          3 marcados     → atende SÓ esses 3

                        Nenhuma das duas frases usa "restringir".
                       ════════════════════════════════════════ */}
                    {!(f.convenios ?? []).length ? (
                      <div className="dia-nota azul" data-aviso="todos-convenios">
                        <strong>Ele atende TODOS os {convs.length} convênios.</strong>
                        <p>
                          É o que vale quando nenhum está marcado — e é assim
                          que o cadastro de hoje funciona. Marque abaixo{' '}
                          <strong>só se ele atender apenas alguns</strong>.
                        </p>
                      </div>
                    ) : (
                      <div className="dia-nota azul" data-aviso="alguns-convenios">
                        <strong>
                          Ele atende SÓ {(f.convenios ?? []).length === 1
                            ? 'este 1 convênio'
                            : `estes ${(f.convenios ?? []).length} convênios`}.
                        </strong>
                        <p>
                          Os outros {convs.length - (f.convenios ?? []).length} não
                          aparecem para ele no agendamento.{' '}
                          <button type="button" className="link-botao"
                                  data-acao="marcar-todos-convenios"
                                  onClick={() => mexer({ convenios: [] })}>
                            desmarcar tudo e voltar a atender todos
                          </button>
                        </p>
                      </div>
                    )}

                    <div className="cad-convs" data-lista="convenios">
                      {convs.map(c => {
                        const v = vinculo(c.id);
                        return (
                          <div key={c.id}
                               className={'cad-conv' + (v ? ' escolhido' : '')}>
                            <label className="cad-escolha">
                              <input type="checkbox" checked={!!v}
                                     data-conv-id={c.id}
                                     onChange={() => virarConvenio(c.id)} />
                              <span>{c.nome}</span>
                            </label>
                            <span className="cad-conv-limite">
                              <label htmlFor={'lim-' + c.id}>Limite/dia</label>
                              <input id={'lim-' + c.id} type="number" min={0} max={999}
                                     disabled={!v}
                                     value={v?.limite_dia ?? ''}
                                     data-limite={c.id}
                                     onChange={e => mexerLimite(c.id, e.target.value)}
                                     placeholder="sem limite" />
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <small className="wiz-dica">
                      <strong>Limite em branco = sem limite.</strong> Se você
                      digitar <code>0</code>, vale o mesmo — é o que está no
                      sistema de hoje. Cheio o limite do dia, a recepção é
                      avisada e pode furar confirmando, e o furo fica
                      registrado.{' '}
                      {/* ⚠️ ESTE BOTÃO NÃO É "ATENDE TODOS", E O NOME
                          DELE DIZIA QUE ERA.

                          Marcar os 18 um a um PARECE o mesmo que
                          não marcar nenhum — hoje. Amanhã não: um
                          convênio novo entra sozinho na lista de
                          quem não marcou nada, e NÃO entra na de
                          quem marcou os 18.

                          Ele existe para um uso legítimo: marcar
                          todos para poder pôr limite por dia em
                          cada um. O nome agora diz isso. */}
                      <button type="button" className="link-botao"
                              data-acao="marcar-todos"
                              title={'Marca os ' + convs.length + ' um a um, para ' +
                                     'você poder pôr limite em cada. Diferente de ' +
                                     '"atende todos": convênio novo não entra sozinho.'}
                              onClick={todosConvenios}>
                        marcar os {convs.length} para pôr limite em cada
                      </button>
                    </small>
                  </>
                )}
              </div>}

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ ACESSO AO PAINEL   (26/10/2026)

                  É o que liga o LOGIN de uma pessoa ao CADASTRO
                  deste profissional. Sem isso a tela "Meu Dia"
                  não tem como saber de quem é a agenda.

                  ⚠️ Salva SOZINHO, e não junto com o resto do
                     formulário. Mudar a duração da consulta de
                     alguém e dar a essa pessoa acesso à agenda
                     de pacientes são decisões de pesos muito
                     diferentes — e o botão separado é o que
                     impede a segunda de acontecer de carona na
                     primeira.

                  O banco pede a permissão `core.usuarios` para
                  isto. Quem não a tem recebe a lista vazia, e o
                  bloco nem aparece.
                  ════════════════════════════════════════════ */}
              {!!f.id && !!logins.length && (
                <div className="cad-bloco" data-bloco="acesso-ao-painel">
                  <h4><i className="fas fa-key" /> Acesso ao painel</h4>
                  <small className="wiz-dica">
                    Qual login é esta pessoa. É por ele que ela vê a própria
                    agenda em <strong>Meu Dia</strong>, e só a dela.
                  </small>
                  <div className="form-row" style={{ display: 'flex', gap: 10,
                                                     alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                      <label htmlFor="med-login">Entra como</label>
                      <select id="med-login" data-campo="login-do-medico"
                              value={loginEscolhido}
                              onChange={e => setLoginEscolhido(e.target.value)}>
                        <option value="">— sem acesso ao painel —</option>
                        {logins.map(l => (
                          <option key={l.usuario_id} value={l.usuario_id}>
                            {l.nome} ({l.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn-secondary"
                            data-acao="salvar-acesso" disabled={ligando}
                            onClick={() => { void salvarAcesso(); }}>
                      <i className={ligando ? 'fas fa-circle-notch fa-spin'
                                            : 'fas fa-link'} />{' '}
                      {ligando ? 'Salvando…' : 'Salvar acesso'}
                    </button>
                  </div>
                </div>
              )}

              <label className="dia-check">
                <input type="checkbox" checked={f.ativo} data-campo="ativo"
                       onChange={e => mexer({ ativo: e.target.checked })} />
                Ativo
              </label>
              {f.id && f.consultas_futuras > 0 && (
                <small className="wiz-dica">
                  Ele tem <strong>{f.consultas_futuras}</strong> consulta(s)
                  futura(s) marcada(s).
                </small>
              )}

              {/* ---------- ⭐ o aviso de desativar ---------- */}
              {avisoFuturas && (
                <div className="dia-nota amarela" data-aviso="futuras"
                     style={{ marginTop: 12 }}>
                  <strong>
                    <i className="fas fa-triangle-exclamation" /> Espere
                  </strong>
                  <p>{avisoFuturas}</p>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" data-acao="fechar-medico"
                        onClick={() => setAberto(false)}
                        disabled={indo}>Voltar</button>
                <button className={confirmar ? 'btn-danger' : 'btn-primary'}
                        data-acao="salvar-medico"
                        disabled={!pode} onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : confirmar
                      ? <><i className="fas fa-user-slash" /> Desativar mesmo assim</>
                      : <><i className="fas fa-check" /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
