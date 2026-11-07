import { useEffect, useMemo, useState } from 'react';
import {
  examesParaGestao, salvarExame, type ExameDaGestao,
  type BlocoDeOrientacao,
  conveniosDoCliente, conveniosDosExames, salvarConveniosDoExame, type Convenio,
  avisosDosExames, salvarAvisoDoExame
} from './dados';
import { Aviso, useAviso } from './Aviso';
import { Entrevista } from './Entrevista';

/**
 * ============================================================
 *  GESTÃO DE EXAMES — a tela de hoje, com o TUSS dentro
 *
 *  09/10/2026, o Tom: *"já manda com a tela de cadastro de
 *  exames, aquela gestão de exames"*, e depois: *"é melhor fazer
 *  conforme a tela que temos no sistema atual. Coloque no
 *  cadastro o código tuss também."*
 *
 *  ------------------------------------------------------------
 *  A TELA DE HOJE ESTÁ NA PLANILHA DELE
 *
 *  A aba `Exames_Config` da `base.xlsx` É o cadastro de hoje:
 *  dezessete exames, dezessete colunas, uma coluna por campo que
 *  alguém preenche. Fui ler em vez de inventar.
 *
 *  Os campos aqui são os de lá, com três diferenças, e cada uma
 *  tem motivo:
 *
 *  ⭐ O TUSS ENTROU. Hoje ele mora em outra aba (`TUSS_Exames`),
 *     ligada por `Exame_ID` + nome do subtipo em TEXTO LIVRE.
 *     Renomear "Abdômen Total" para "Abdome Total" deixa o
 *     código órfão, calado — e a guia sai sem TUSS e volta
 *     glosada semanas depois. Com o código na linha do exame,
 *     renomear deixa de ter efeito colateral.
 *
 *  ⚠️ O HORÁRIO DE FUNCIONAMENTO **NÃO** VIROU CAMPO. Na
 *     planilha ele é texto livre ("Seg a Sex: 07:00 - 16:00").
 *     Aqui o horário existe de verdade, em `agenda.expedientes`,
 *     e é ele que decide se cabe marcar. Guardar os dois seria
 *     criar a segunda resposta para "quando este exame é feito"
 *     — e as duas divergem no dia em que alguém muda uma e
 *     esquece a outra.
 *
 *     A tela MOSTRA o expediente real e manda editar onde ele
 *     mora. Mostrar é diferente de guardar duas vezes.
 *
 *  ⏳ LEMBRETE E ARQUIVAMENTO ficaram de fora. Eles pertencem a
 *     pacotes que ainda não existem, e campo sem quem o leia é
 *     promessa que a tela faz e ninguém cumpre.
 * ============================================================
 */

/** Os emojis que o St James já usa, para não digitar na mão. */
const ICONES = ['🔴', '📡', '🧪', '🔵', '☢️', '🦴', '📈', '🩺', '💤', '🫀', '🧠', '👁️'];

interface Form {
  id: string | null;
  nome: string;
  pai: string;
  icone: string;
  duracao: string;
  tuss: string;
  preparo: string;
  horasPreparo: string;
  autorizacao: boolean;
  entrevista: boolean;
  /* ⚠️ `unknown[]`, e não `string`.
     Até 10/10/2026 isto era `string` e a tela lia as perguntas
     com `.join('\n')`. As do St James são OBJETOS com tipo, e o
     `.join` sobre objetos escreve "[object Object]" — salvar
     trocaria as 21 perguntas por três palavras sem sentido.
     Agora elas passam inteiras por aqui e só o editor mexe. */
  perguntas: unknown[];
  setor: string;
  telefone: string;
  email: string;
  ativo: boolean;
  /* ⭐⭐⭐ 26/10: O CARTAZ DO EXAME.
     O Tom mandou a arte impressa do Laboratório e pediu que o
     chat a mostrasse. Blocos, e não um textão: é a estrutura
     que faz o paciente achar o horário sem ler o resto. */
  orientacoes: BlocoDeOrientacao[];
  /** Este exame só orienta: não agenda, não pede guia. */
  soOrientacao: boolean;
  /** ⭐ 20/10, noite: os convênios que cobrem. Vazio = TODOS. */
  convenios: string[];
  /** ⭐ 22/10: quantas horas antes sai a confirmação. Vazio = padrão. */
  avisoHoras: string;
}

const VAZIO: Form = {
  id: null, nome: '', pai: '', icone: '', duracao: '', tuss: '',
  preparo: '', horasPreparo: '', autorizacao: false, entrevista: false,
  perguntas: [], setor: '', telefone: '', email: '', ativo: true,
  orientacoes: [], soOrientacao: false,
  convenios: [], avisoHoras: ''
};

export function Exames({ clienteId, atendeConvenios = true }: {
  clienteId: string; atendeConvenios?: boolean;
}) {
  const [lista, setLista] = useState<ExameDaGestao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<Form>(VAZIO);
  const [indo, setIndo] = useState(false);
  const [editandoEntrevista, setEditandoEntrevista] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const { recado, avisar, fechar } = useAviso();
  const [convs, setConvs] = useState<Convenio[]>([]);
  const [convsDoExame, setConvsDoExame] = useState<Map<string, string[]>>(new Map());
  const [avisoDoExame, setAvisoDoExame] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let valido = true;
    Promise.all([conveniosDoCliente(clienteId), conveniosDosExames(clienteId), avisosDosExames(clienteId)])
      .then(([c, m, av]) => { if (valido) { setConvs(c); setConvsDoExame(m); setAvisoDoExame(av); } })
      .catch(e => { if (valido) avisar(e.message ?? String(e), false); });
    return () => { valido = false; };
  }, [clienteId, recarga, avisar]);

  /** A etiqueta da lista: "todos os convênios" ou "só Unimed, Amil". */
  function etiquetaDeConvenios(id: string, paiId: string | null) {
    const proprios = convsDoExame.get(id) ?? [];
    if (!proprios.length) {
      if (paiId && (convsDoExame.get(paiId) ?? []).length)
        return <em className="cad-tag" data-convs="herda">convênios do exame</em>;
      return null;
    }
    const nomes = proprios.map(c => convs.find(x => x.id === c)?.nome).filter(Boolean);
    return (
      <em className="cad-tag conv" data-convs={proprios.length}
          title={nomes.join(', ')}>
        só {proprios.length === 1 ? nomes[0] ?? '1 convênio' : `${proprios.length} convênios`}
      </em>
    );
  }

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    examesParaGestao(clienteId)
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { avisar(e.message ?? String(e), false); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, recarga, avisar]);

  /** Pai e filhos, já na ordem de desenhar. */
  const arvore = useMemo(() => {
    const pais = lista.filter(e => !e.pai_id);
    return pais.map(p => ({
      pai: p,
      filhos: lista.filter(x => x.pai_id === p.id)
    }));
  }, [lista]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return arvore;
    return arvore.filter(({ pai, filhos }) =>
      pai.nome.toLowerCase().includes(q) ||
      (pai.codigo_tuss ?? '').includes(q) ||
      filhos.some(x => x.nome.toLowerCase().includes(q) ||
                       (x.codigo_tuss ?? '').includes(q)));
  }, [arvore, busca]);

  /* ⭐ OS EXAMES QUE NÃO VÃO APARECER PARA MARCAR, E POR QUÊ.
   *
   *  Achado real na planilha do St James: Ultrassonografia sem
   *  nenhum profissional ativo, Exames Laboratoriais e
   *  Papanicolau sem ninguém. Eles existem no cadastro e somem
   *  no agendamento — e ninguém sabe disso até um paciente
   *  pedir.
   *
   *  ⚠️ Só conta quem está ATIVO: um exame desativado não
   *     aparecer é o que ele pediu para fazer. */
  const semNinguem = useMemo(
    () => lista.filter(e => e.ativo && e.subtipos === 0 && e.quem_faz === 0),
    [lista]);

  function abrirNovo(paiId?: string) {
    setF({ ...VAZIO, pai: paiId ?? '', convenios: [] });
    setAberto(true);
  }

  function abrirEdicao(e: ExameDaGestao) {
    setF({
      id: e.id,
      nome: e.nome,
      pai: e.pai_id ?? '',
      icone: e.icone ?? '',
      // ⭐ Vazio quando a duração é HERDADA, e a dica embaixo
      //    diz de quem. Preencher com a do pai faria quem edita
      //    "confirmar" um número que ele nunca escolheu — e o
      //    subtipo deixaria de seguir o pai sem ninguém querer.
      duracao: e.duracao_min != null ? String(e.duracao_min) : '',
      tuss: e.codigo_tuss ?? '',
      preparo: e.preparo ?? '',
      horasPreparo: e.horas_preparo != null ? String(e.horas_preparo) : '',
      autorizacao: e.exige_autorizacao,
      entrevista: e.requer_entrevista,
      perguntas: (e.perguntas ?? []) as unknown[],
      setor: e.setor ?? '',
      telefone: e.telefone_setor ?? '',
      email: e.email_setor ?? '',
      ativo: e.ativo,
      orientacoes: (e.orientacoes ?? []) as BlocoDeOrientacao[],
      soOrientacao: e.so_orientacao,
      convenios: convsDoExame.get(e.id) ?? [],
      avisoHoras: avisoDoExame.has(e.id) ? String(avisoDoExame.get(e.id)) : ''
    });
    setAberto(true);
  }

  const mexer = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));

  const perguntasLimpas = f.perguntas ?? [];

  /** O que trava o salvar, e a frase de cada trava. */
  const erro = (() => {
    if (f.nome.trim().length < 3) return 'O nome precisa de pelo menos 3 letras.';
    if (f.entrevista && !perguntasLimpas.length)
      return 'Quem passa por entrevista precisa de pelo menos uma pergunta — '
           + 'senão a equipe recebe a solicitação sem nada para avaliar. '
           + 'Clique em "Editar perguntas".';
    const d = Number(f.duracao);
    if (f.duracao.trim() && (!Number.isFinite(d) || d < 5 || d > 240))
      return 'A duração tem que ficar entre 5 e 240 minutos.';
    // Sem duração própria E sem pai é exame que ninguém sabe
    // quanto tempo leva — e o banco recusa na hora de marcar,
    // com uma frase que a recepção não entende.
    if (!f.duracao.trim() && !f.pai)
      return 'Um exame principal precisa de duração. O subtipo pode herdar a dele.';
    return '';
  })();

  async function salvar() {
    setIndo(true);
    try {
      const r = await salvarExame({
        clienteId,
        id: f.id,
        nome: f.nome.trim(),
        pai: f.pai || null,
        icone: f.icone || null,
        duracaoMin: f.duracao.trim() ? Number(f.duracao) : null,
        codigoTuss: f.tuss.trim() || null,
        preparo: f.preparo.trim() || null,
        horasPreparo: f.horasPreparo.trim() ? Number(f.horasPreparo) : null,
        exigeAutorizacao: f.autorizacao,
        requerEntrevista: f.entrevista,
        perguntas: f.entrevista ? (perguntasLimpas as string[]) : null,
        setor: f.setor.trim() || null,
        telefoneSetor: f.telefone.trim() || null,
        emailSetor: f.email.trim() || null,
        ativo: f.ativo,
        /* ⭐ Manda SEMPRE a lista, inclusive vazia: aqui `[]` é
           "apaguei o cartaz", e é alguém clicando de propósito.
           O `null` que não mexe fica para as telas que não têm
           este campo. */
        orientacoes: f.orientacoes.filter(
          b => (b.titulo ?? '').trim() || (b.texto ?? '').trim()),
        soOrientacao: f.soOrientacao
      });
      if (!r.ok) { avisar(r.mensagem, false); setIndo(false); return; }

      /* ⭐ Os convênios vão DEPOIS, porque o exame novo só tem id
         depois de salvo. Só grava se a lista mudou: abrir e salvar
         um exame não deixa um registro de "mudou os convênios"
         no log para cada exame tocado. */
      const id = r.id ?? f.id;
      const antes = [...(f.id ? convsDoExame.get(f.id) ?? [] : [])].sort().join(',');
      const agora = [...f.convenios].sort().join(',');
      if (id && antes !== agora) {
        const c = await salvarConveniosDoExame(clienteId, id, f.convenios);
        if (!c.ok) {
          avisar('O exame foi salvo, mas os convênios não: ' + c.mensagem, false);
          setIndo(false); setAberto(false); setRecarga(n => n + 1);
          return;
        }
      }
      // ⭐ 22/10: o tempo próprio do aviso, só se mudou.
      const avAntes = f.id && avisoDoExame.has(f.id) ? String(avisoDoExame.get(f.id)) : '';
      if (id && f.avisoHoras.trim() !== avAntes) {
        const a = await salvarAvisoDoExame(clienteId, id, f.avisoHoras.trim() ? Number(f.avisoHoras) : null);
        if (!a.ok) {
          avisar('O exame foi salvo, mas o tempo do aviso não: ' + a.mensagem, false);
          setIndo(false); setAberto(false); setRecarga(n => n + 1);
          return;
        }
      }
      avisar(f.id ? 'Exame atualizado.' : 'Exame criado.', true);
      setAberto(false);
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
    setIndo(false);
  }

  async function virar(e: ExameDaGestao) {
    try {
      // ⭐ Só `ativo` e o nome. Todo o resto vai NULO, e nulo não
      //    mexe — é o que impede um clique no interruptor de
      //    apagar o preparo e o TUSS do exame.
      const r = await salvarExame({
        clienteId, id: e.id, nome: e.nome, pai: e.pai_id, ativo: !e.ativo
      });
      if (!r.ok) { avisar(r.mensagem, false); return; }
      avisar(e.ativo ? 'Exame desativado.' : 'Exame reativado.', true);
      setRecarga(n => n + 1);
    } catch (err) {
      avisar((err as Error).message ?? String(err), false);
    }
  }

  const paiEscolhido = lista.find(x => x.id === f.pai);

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Gestão de Exames</h2>
          <p>
            Os exames que a recepção pode marcar, com o preparo, o código TUSS
            e quem faz cada um.
          </p>
        </div>
        <button className="btn-primary" data-acao="novo-exame"
                onClick={() => abrirNovo()}>
          <i className="fas fa-plus" /> Novo exame
        </button>
      </div>

      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-exame"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar por nome ou código TUSS…" />
      </div>

      {/* ⭐⭐ O AVISO QUE A PLANILHA DO ST JAMES PEDIU.
          ───────────────────────────────────────────
          Na base real: Ultrassonografia sem nenhum profissional
          ativo, Exames Laboratoriais e Papanicolau sem ninguém.
          Eles estão no cadastro e somem no agendamento, e isso
          só aparece quando um paciente pede. */}
      {!carregando && !!semNinguem.length && (
        <div className="dia-nota amarela" data-aviso="exame-sem-ninguem">
          <strong>
            {semNinguem.length === 1
              ? '1 exame ativo não tem ninguém que o faça'
              : `${semNinguem.length} exames ativos não têm ninguém que os faça`}
          </strong>
          <p>
            {semNinguem.map(e => e.nome).join(', ')} — {semNinguem.length === 1
              ? 'ele aparece aqui e NÃO aparece'
              : 'eles aparecem aqui e NÃO aparecem'}{' '}
            no Novo Agendamento. Ligue um médico ou aparelho pelo cadastro do
            médico, em <strong>Médicos → Faz exame</strong>.
          </p>
        </div>
      )}

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-microscope" />
          <h3>Nenhum exame cadastrado</h3>
          <p>
            Crie o primeiro — Ultrassonografia, Holter, Endoscopia — e depois
            os subtipos dele. Ou importe a planilha, em Configurações.
          </p>
        </div>
      )}

      {!carregando && filtrada.map(({ pai: p, filhos }) => (
        <div key={p.id} className={'cad-grupo' + (p.ativo ? '' : ' inativo')}
             data-exame={p.id}>
          <div className="cad-linha pai">
            <span className="cad-nome">
              {p.icone && <span className="ex-icone">{p.icone}</span>}
              {p.nome}
            </span>
            <span className="cad-tags">
              {!p.ativo && <em className="cad-tag off">desativado</em>}
              {p.codigo_tuss &&
                <em className="cad-tag tuss" data-tuss={p.codigo_tuss}>
                  TUSS {p.codigo_tuss}
                </em>}
              {!!p.duracao_efetiva && <em className="cad-tag">{p.duracao_efetiva} min</em>}
              {p.requer_entrevista &&
                <em className="cad-tag sub" data-marca="entrevista">entrevista</em>}
              {!!filhos.length && <em className="cad-tag sub">{filhos.length} subtipo(s)</em>}
              {etiquetaDeConvenios(p.id, null)}
              <em className={'cad-tag' + (p.quem_faz ? '' : ' off')}
                  data-marca="quem-faz">
                {p.quem_faz} fazem
              </em>
            </span>
            <div className="cad-botoes">
              <button className="btn-secondary btn-sm" data-acao="novo-subtipo"
                      onClick={() => abrirNovo(p.id)}>
                <i className="fas fa-plus" /> Subtipo
              </button>
              <button className="btn-secondary btn-sm" data-acao="editar-exame"
                      onClick={() => abrirEdicao(p)}>
                <i className="fas fa-pen" />
              </button>
              <button className="btn-secondary btn-sm" data-acao="virar-exame"
                      title={p.ativo ? 'Desativar' : 'Reativar'}
                      onClick={() => virar(p)}>
                <i className={p.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
              </button>
            </div>
          </div>

          {/* ⭐ O expediente de quem faz, só para MOSTRAR. */}
          {p.expediente && (
            <p className="ex-expediente" data-marca="expediente">
              <i className="fas fa-clock" /> {p.expediente}
              <em> — para mudar, é em Agenda do Médico</em>
            </p>
          )}

          {filhos.map(x => (
            <div key={x.id} className={'cad-linha filho' + (x.ativo ? '' : ' inativo')}
                 data-exame={x.id} data-subtipo="1">
              <span className="cad-nome">
                <i className="fas fa-turn-up fa-rotate-90" /> {x.nome}
              </span>
              <span className="cad-tags">
                {!x.ativo && <em className="cad-tag off">desativado</em>}
                {etiquetaDeConvenios(x.id, x.pai_id)}
                {x.codigo_tuss &&
                  <em className="cad-tag tuss" data-tuss={x.codigo_tuss}>
                    TUSS {x.codigo_tuss}
                  </em>}
                {/* ⭐ A duração HERDADA aparece dizendo que é herdada.
                    Um número sem essa marca faria quem edita achar
                    que o subtipo tem duração própria — e mudar a do
                    pai sem entender por que o filho não mudou. */}
                {!!x.duracao_efetiva && (
                  <em className="cad-tag" data-marca={x.duracao_min == null ? 'herdada' : 'propria'}>
                    {x.duracao_efetiva} min{x.duracao_min == null ? ' (do pai)' : ''}
                  </em>
                )}
                <em className={'cad-tag' + (x.quem_faz ? '' : ' off')}>
                  {x.quem_faz} fazem
                </em>
              </span>
              <div className="cad-botoes">
                <button className="btn-secondary btn-sm" data-acao="editar-exame"
                        onClick={() => abrirEdicao(x)}>
                  <i className="fas fa-pen" />
                </button>
                <button className="btn-secondary btn-sm" data-acao="virar-exame"
                        onClick={() => virar(x)}>
                  <i className={x.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ---------------- o formulário ---------------- */}
      {aberto && (
        <div className="modal" data-modal="exame">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>
                {f.id ? 'Editar exame' : f.pai ? 'Novo subtipo' : 'Novo exame'}
              </h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">

              <div className="cad-dupla">
                <div className="form-group" style={{ flex: '0 0 92px' }}>
                  <label>Ícone</label>
                  <select value={f.icone} data-campo="icone"
                          onChange={e => mexer({ icone: e.target.value })}>
                    <option value="">—</option>
                    {ICONES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Nome *</label>
                  <input type="text" autoFocus maxLength={80} value={f.nome}
                         data-campo="nome"
                         onChange={e => mexer({ nome: e.target.value })}
                         placeholder="Ultrassonografia, Holter, Doppler…" />
                </div>
              </div>

              <div className="form-group">
                <label>É subtipo de</label>
                <select value={f.pai} data-campo="pai"
                        onChange={e => mexer({ pai: e.target.value })}>
                  <option value="">— é um exame principal —</option>
                  {/* Só quem NÃO é subtipo aparece: é assim que a
                      tela não oferece o terceiro nível, que o
                      banco recusaria. E nunca ele mesmo. */}
                  {lista.filter(x => !x.pai_id && x.id !== f.id).map(x => (
                    <option key={x.id} value={x.id}>{x.nome}</option>
                  ))}
                </select>
                <small className="wiz-dica">
                  É aqui que nascem o <strong>Doppler</strong> e o{' '}
                  <strong>Vascular</strong>: escolha Ultrassonografia, e o
                  ultrassonografista que só faz esses dois passa a poder ser
                  ligado a eles, em Médicos.
                </small>
              </div>

              <div className="cad-dupla">
                <div className="form-group">
                  <label>Duração (min)</label>
                  <input type="number" min={5} max={240} value={f.duracao}
                         data-campo="duracao"
                         onChange={e => mexer({ duracao: e.target.value })}
                         placeholder={paiEscolhido?.duracao_efetiva
                           ? `${paiEscolhido.duracao_efetiva} (do pai)` : '30'} />
                  {f.pai && !f.duracao.trim() && (
                    <small className="wiz-dica" data-dica="duracao-herdada">
                      Em branco, vale a do{' '}
                      {paiEscolhido ? <strong>{paiEscolhido.nome}</strong> : 'exame de cima'}
                      {paiEscolhido?.duracao_efetiva
                        ? <> — {paiEscolhido.duracao_efetiva} min</> : null}.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Código TUSS</label>
                  <input type="text" maxLength={20} value={f.tuss}
                         data-campo="tuss"
                         onChange={e => mexer({ tuss: e.target.value.replace(/\D/g, '') })}
                         placeholder="40901122" />
                  <small className="wiz-dica">
                    É o código que vai na guia do convênio. Fica aqui, na linha do
                    exame — não numa lista à parte ligada pelo nome.
                  </small>
                </div>
              </div>

              <div className="form-group">
                <label>Orientações de preparo</label>
                <textarea rows={4} value={f.preparo} data-campo="preparo"
                          onChange={e => mexer({ preparo: e.target.value })}
                          placeholder={'Jejum de 8 horas.\nBexiga cheia: beber de 4 a 6 copos de água 2 horas antes.'} />
                <small className="wiz-dica">
                  Uma orientação por linha. Num pedido com vários subtipos elas
                  são juntadas numa mensagem só — e um{' '}
                  <em>"não exige jejum"</em> nunca apaga o jejum de outro exame
                  do mesmo pedido.
                </small>
              </div>

              <div className="cad-dupla">
                <div className="form-group">
                  <label>Setor</label>
                  <input type="text" maxLength={60} value={f.setor}
                         data-campo="setor"
                         onChange={e => mexer({ setor: e.target.value })}
                         placeholder="Endoscopia - 1º Andar" />
                </div>
                <div className="form-group">
                  <label>Telefone do setor</label>
                  <input type="text" maxLength={20} value={f.telefone}
                         data-campo="telefone-setor"
                         onChange={e => mexer({ telefone: e.target.value })}
                         placeholder="(11) 4016-0000" />
                </div>
              </div>

              <div className="form-group">
                <label>E-mail do setor</label>
                <input type="email" maxLength={120} value={f.email}
                       data-campo="email-setor"
                       onChange={e => mexer({ email: e.target.value })}
                       placeholder="cardiologia@hospital.com.br" />
              </div>

              <label className="dia-check">
                <input type="checkbox" checked={f.autorizacao} data-campo="autorizacao"
                       onChange={e => mexer({ autorizacao: e.target.checked })} />
                Exige autorização prévia do convênio
              </label>

              <label className="dia-check">
                <input type="checkbox" checked={f.entrevista} data-campo="entrevista"
                       onChange={e => mexer({ entrevista: e.target.checked })} />
                Passa por entrevista antes de ganhar horário
              </label>

              {/* ⭐⭐ A ENTREVISTA PRECISA DO QUE PERGUNTAR.
                  ────────────────────────────────────────
                  Endoscopia e colonoscopia são feitas com sedação,
                  e as perguntas são triagem de risco anestésico.
                  Marcar a caixinha sem perguntas poria na fila um
                  paciente que a equipe não tem como avaliar — por
                  isso o banco recusa, e a tela avisa antes. */}
              {/* ⚠️ AQUI MORAVA UM `textarea`, E ELE DESTRUÍA DADO.
                  ────────────────────────────────────────────────
                  Ele lia as perguntas com `.join('\n')`. As do St
                  James são objetos com tipo, e o `.join` sobre
                  objetos escreve "[object Object]" — salvar
                  trocaria as 11 perguntas da endoscopia e as 10 da
                  colonoscopia por três palavras sem sentido.

                  O editor de verdade abre num botão, com os quatro
                  tipos. O texto nunca mais passa por aqui. */}
              {f.entrevista && (
                <div className="form-group" data-bloco="perguntas">
                  <label>Perguntas da entrevista *</label>
                  <div className="ent-resumo">
                    <span data-contagem="perguntas">
                      <strong>{perguntasLimpas.length}</strong>{' '}
                      {perguntasLimpas.length === 1 ? 'pergunta' : 'perguntas'}
                    </span>
                    <button type="button" className="btn-secondary btn-sm"
                            data-acao="editar-entrevista"
                            onClick={() => setEditandoEntrevista(true)}>
                      <i className="fas fa-clipboard-list" /> Editar perguntas
                    </button>
                  </div>
                  <small className="wiz-dica">
                    A equipe lê as respostas antes de dar horário. Na endoscopia
                    e na colonoscopia elas são triagem de risco anestésico.
                  </small>
                </div>
              )}

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ O CARTAZ DO EXAME   (26/10/2026)

                  O Tom mandou a arte impressa do Laboratório
                  Clínico — horários de coleta, entrega da guia,
                  senha por ordem de chegada — e pediu que o chat
                  a mostrasse. E, na mesma mensagem, a regra que
                  manda em tudo:

                  > *"criar um sistema para mais de um cliente
                  >  precisa deixar disponível e personalizável
                  >  para qualquer hospital."*

                  Então é CADASTRO. Nada do St James está escrito
                  no código: o hospital escreve os blocos dele
                  aqui, e o chat desenha.
                  ════════════════════════════════════════════ */}
              <div className="cad-bloco" data-bloco="orientacoes">
                <h4><i className="fas fa-circle-info" /> Orientações no chat</h4>

                <label className="dia-check">
                  <input type="checkbox" checked={f.soOrientacao}
                         data-campo="so-orientacao"
                         onChange={e => mexer({ soOrientacao: e.target.checked })} />
                  Este exame <strong>não marca horário</strong> pelo chat
                </label>
                <small className="wiz-dica">
                  Marque para exames por ordem de chegada, como o laboratório.
                  O chat mostra as orientações e encerra: não pede a foto do
                  pedido, não abre o calendário e não cria solicitação.
                </small>

                {!f.orientacoes.length ? (
                  <small className="wiz-dica" data-aviso="sem-orientacoes">
                    Sem orientações. O chat vai direto ao pedido do médico.
                  </small>
                ) : (
                  <div className="ori-blocos">
                    {f.orientacoes.map((b, i) => (
                      <div key={i} className="ori-bloco" data-orientacao={i}>
                        <input className="ori-icone" maxLength={4}
                               data-campo={`ori-icone-${i}`}
                               value={b.icone ?? ''}
                               placeholder="🕐"
                               onChange={ev => mexer({
                                 orientacoes: f.orientacoes.map((x, j) =>
                                   j === i ? { ...x, icone: ev.target.value } : x)
                               })} />
                        <div className="ori-campos">
                          <input data-campo={`ori-titulo-${i}`}
                                 value={b.titulo ?? ''}
                                 placeholder="Título (ex.: Horário de atendimento)"
                                 onChange={ev => mexer({
                                   orientacoes: f.orientacoes.map((x, j) =>
                                     j === i ? { ...x, titulo: ev.target.value } : x)
                                 })} />
                          <textarea rows={2} data-campo={`ori-texto-${i}`}
                                    value={b.texto ?? ''}
                                    placeholder="O que o paciente precisa saber"
                                    onChange={ev => mexer({
                                      orientacoes: f.orientacoes.map((x, j) =>
                                        j === i ? { ...x, texto: ev.target.value } : x)
                                    })} />
                        </div>
                        <button type="button" className="ori-tirar"
                                data-acao={`tirar-orientacao-${i}`}
                                aria-label={`Tirar o bloco ${i + 1}`}
                                onClick={() => mexer({
                                  orientacoes: f.orientacoes.filter((_, j) => j !== i)
                                })}>
                          <i className="fas fa-times" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" className="btn-secondary btn-sm"
                        data-acao="novo-bloco-orientacao"
                        onClick={() => mexer({
                          orientacoes: [...f.orientacoes,
                                        { icone: '', titulo: '', texto: '' }]
                        })}>
                  <i className="fas fa-plus" /> Acrescentar orientação
                </button>
              </div>

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ OS CONVÊNIOS QUE COBREM ESTE EXAME
                  O Tom, 20/10: "colocar aquela seleção de
                  convênios dentro de cada exame". A mesma regra
                  e as mesmas frases do cadastro do médico — o
                  texto diz o RESULTADO, nunca "restringir"
                  (09/10: a palavra fazia ler ao contrário).
                  ════════════════════════════════════════════ */}
              {atendeConvenios && <div className="cad-bloco" data-bloco="convenios-do-exame">
                <h4><i className="fas fa-id-card" /> Convênios que cobrem</h4>
                {!convs.length ? (
                  <small className="wiz-dica">
                    Nenhum convênio cadastrado. Sem eles, o exame vale para todos.
                  </small>
                ) : (
                  <>
                    {!f.convenios.length ? (
                      <div className="dia-nota azul" data-aviso="todos-convenios">
                        <strong>
                          {f.pai && paiEscolhido
                            ? `Segue o exame ${paiEscolhido.nome}.`
                            : `Coberto por TODOS os ${convs.length} convênios.`}
                        </strong>
                        <p>
                          {f.pai
                            ? 'Marque abaixo só se este subtipo tiver convênios diferentes do exame.'
                            : <>É o que vale quando nenhum está marcado. Marque abaixo{' '}
                                <strong>só se apenas alguns cobrirem</strong>.</>}
                        </p>
                      </div>
                    ) : (
                      <div className="dia-nota azul" data-aviso="alguns-convenios">
                        <strong>
                          Coberto SÓ por {f.convenios.length === 1
                            ? 'este 1 convênio'
                            : `estes ${f.convenios.length} convênios`}.
                        </strong>
                        <p>
                          {convs.length - f.convenios.length === 1
                            ? 'Com o outro convênio'
                            : `Com os outros ${convs.length - f.convenios.length}`}, o
                          agendamento recusa e pede outro convênio.
                          {convs.some(c => /particular/i.test(c.nome))
                            && !f.convenios.some(id => /particular/i.test(
                                 convs.find(c => c.id === id)?.nome ?? '')) && (
                            <strong data-aviso="particular-de-fora">
                              {' '}O Particular também fica de fora — marque-o se
                              ele puder fazer este exame.
                            </strong>
                          )}{' '}
                          <button type="button" className="link-botao"
                                  data-acao="todos-convenios-exame"
                                  onClick={() => mexer({ convenios: [] })}>
                            desmarcar tudo e voltar a aceitar todos
                          </button>
                        </p>
                      </div>
                    )}
                    <div className="cad-convs" data-lista="convenios-do-exame">
                      {convs.map(c => {
                        const marcado = f.convenios.includes(c.id);
                        return (
                          <div key={c.id} className={'cad-conv' + (marcado ? ' escolhido' : '')}>
                            <label className="cad-escolha">
                              <input type="checkbox" checked={marcado}
                                     data-conv-exame={c.id}
                                     onChange={() => mexer({
                                       convenios: marcado
                                         ? f.convenios.filter(x => x !== c.id)
                                         : [...f.convenios, c.id]
                                     })} />
                              <span>{c.nome}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>}

              {/* ⭐⭐⭐ 22/10 — o Tom: "cada exame precisa de um tempo de
                  envio próprio". Vazio = o padrão do hospital (tela
                  Avisos). O subtipo vazio segue o exame. */}
              <div className="form-group" data-bloco="aviso-do-exame">
                <label>Confirmação por WhatsApp: quantas horas antes</label>
                <input type="number" min={2} max={168} data-campo="aviso-horas"
                       value={f.avisoHoras} placeholder={f.pai ? 'vazio = segue o exame' : 'vazio = padrão do hospital'}
                       onChange={e => mexer({ avisoHoras: e.target.value })} />
                <small className="wiz-dica">
                  Quem confirma recebe "exame confirmado" com o botão <strong>Ver preparo</strong>.
                  Exame com preparo longo (colonoscopia, por exemplo) pede mais horas.
                </small>
              </div>

              <label className="dia-check">
                <input type="checkbox" checked={f.ativo} data-campo="ativo"
                       onChange={e => mexer({ ativo: e.target.checked })} />
                Ativo
              </label>

              {!!erro && (
                <div className="dia-nota amarela" data-erro="exame">
                  {erro}
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" onClick={() => setAberto(false)}
                        disabled={indo}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-exame"
                        disabled={indo || !!erro} onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : <><i className="fas fa-check" /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ O editor fica DENTRO do formulário do exame, e salva
          na memória — só o Salvar do exame grava no banco. Dois
          salvamentos para a mesma tela seriam duas chances de a
          pessoa sair achando que gravou. */}
      {aberto && editandoEntrevista && (
        <Entrevista
          nome={f.nome || 'novo exame'}
          perguntasBrutas={f.perguntas}
          aoFechar={() => setEditandoEntrevista(false)}
          aoSalvar={p => { mexer({ perguntas: p }); setEditandoEntrevista(false); }}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
