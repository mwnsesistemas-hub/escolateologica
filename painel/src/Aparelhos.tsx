import { useEffect, useMemo, useState } from 'react';
import {
  aparelhosDoCliente, salvarAparelho, examesDoRecurso, arvoreDeExames,
  type AparelhoDoCliente, type ExameDaArvore
} from './dados';
import { ExpedienteDoMedico } from './ExpedienteDoMedico';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  APARELHOS E SALAS
 *
 *  11/10/2026. O Tom pediu "o que falta para o cliente", e isto
 *  foi o que eu achei de pior:
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ OS OITO APARELHOS DO ST JAMES NÃO TINHAM TELA NENHUMA
 *
 *  Holter, Mapa, Eletrocardiograma, Espirometria, Teste
 *  Ergométrico, Polissonografia, Eletroencefalograma.
 *
 *  Eles existem no banco, marcam exame, aparecem no Novo
 *  Agendamento — e não havia uma única tela que os mostrasse. A
 *  de Médicos lê `public.medicos`, que filtra
 *  `tipo = 'profissional'`.
 *
 *  Resultado: pelo painel ninguém conseguia criar um aparelho,
 *  mudar a duração, desativar um que quebrou, nem dar horário a
 *  ele. **Só o importador da planilha os criava.**
 *
 *  E isso não dava erro nenhum. O aparelho simplesmente não
 *  estava em lugar nenhum.
 *
 *  ------------------------------------------------------------
 *  DUAS MANEIRAS DE EXISTIR E NUNCA APARECER
 *
 *  Um aparelho só entra no Novo Agendamento se tiver **exame** e
 *  **horário**. Faltando qualquer um dos dois ele some da busca
 *  — sem erro, sem aviso.
 *
 *  A lista mostra os dois números, e o Salvar diz qual está
 *  faltando. É o mesmo cuidado do "exame sem ninguém que faça"
 *  da Gestão de Exames.
 * ============================================================
 */

const TIPOS: { valor: string; rotulo: string; ajuda: string }[] = [
  { valor: 'equipamento', rotulo: 'Aparelho',
    ajuda: 'Holter, Mapa, Eletrocardiograma, Espirometria…' },
  { valor: 'sala', rotulo: 'Sala',
    ajuda: 'Sala de endoscopia, sala de pequenos procedimentos…' }
];

interface Form {
  id: string | null;
  nome: string;
  tipo: string;
  duracao: string;
  ativo: boolean;
  exames: string[];
}

const VAZIO: Form = {
  id: null, nome: '', tipo: 'equipamento', duracao: '20', ativo: true, exames: []
};

export function Aparelhos({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [lista, setLista] = useState<AparelhoDoCliente[]>([]);
  const [exames, setExames] = useState<ExameDaArvore[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [busca, setBusca] = useState('');
  const [indo, setIndo] = useState(false);

  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<Form>(VAZIO);
  const [horarios, setHorarios] = useState<AparelhoDoCliente | null>(null);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    Promise.all([aparelhosDoCliente(clienteId), arvoreDeExames(clienteId)])
      .then(([a, e]) => {
        if (!valido) return;
        setLista(a); setExames(e); setCarregando(false);
      })
      .catch(x => {
        if (valido) { setErro((x as Error).message ?? String(x)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  /** Os exames em dois níveis, como na tela de Médicos. */
  const arvore = useMemo(() => {
    const pais = exames.filter(e => !e.pai_id && e.ativo);
    return pais.map(p => ({
      pai: p,
      filhos: exames.filter(x => x.pai_id === p.id && x.ativo)
    }));
  }, [exames]);

  const vistos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(a => a.nome.toLowerCase().includes(t));
  }, [lista, busca]);

  /* ⭐ Os dois buracos silenciosos, contados antes de alguém
     perguntar. Aparelho cadastrado que não aparece para marcar é
     o tipo de coisa que só se descobre com um paciente na
     recepção. */
  const semExame = useMemo(
    () => lista.filter(a => a.ativo && a.exames === 0), [lista]);
  const semHorario = useMemo(
    () => lista.filter(a => a.ativo && a.exames > 0 && a.faixas === 0), [lista]);

  function mexer(p: Partial<Form>) { setF(x => ({ ...x, ...p })); }

  function abrirNovo() { setF(VAZIO); setAberto(true); }

  async function abrirEdicao(a: AparelhoDoCliente) {
    setF({
      id: a.id, nome: a.nome, tipo: a.tipo,
      duracao: String(a.duracao_min), ativo: a.ativo, exames: []
    });
    setAberto(true);
    try {
      const ids = await examesDoRecurso(clienteId, a.id);
      setF(x => (x.id === a.id ? { ...x, exames: ids } : x));
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  function virarExame(id: string) {
    setF(x => ({
      ...x,
      exames: x.exames.includes(id)
        ? x.exames.filter(y => y !== id)
        : [...x.exames, id]
    }));
  }

  const duracaoOk = Number(f.duracao) > 0;
  const nomeOk = f.nome.trim().length >= 3;

  async function salvar() {
    if (indo || !nomeOk || !duracaoOk) return;
    setIndo(true);
    try {
      const r = await salvarAparelho({
        clienteId, nome: f.nome.trim(), duracaoMin: Number(f.duracao),
        id: f.id, ativo: f.ativo, tipo: f.tipo, exames: f.exames
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAberto(false); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function virar(a: AparelhoDoCliente) {
    try {
      const r = await salvarAparelho({
        clienteId, nome: a.nome, duracaoMin: a.duracao_min,
        id: a.id, ativo: !a.ativo, tipo: a.tipo
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Aparelhos e salas</h2>
          <p>
            O Holter, o Mapa, o eletrocardiógrafo, a sala de endoscopia. Eles
            têm agenda própria, como um médico — e até hoje só existiam pela
            planilha.
          </p>
        </div>
        <button className="btn-primary" data-acao="novo-aparelho"
                onClick={abrirNovo}>
          <i className="fas fa-plus" /> Novo aparelho
        </button>
      </div>

      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-aparelho"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar pelo nome…" />
      </div>

      {/* ⚠️ Os dois avisos que evitam a descoberta pela recepção.
          Um aparelho sem exame, ou sem horário, está cadastrado e
          não aparece para marcar — e isso não dá erro em lugar
          nenhum. */}
      {!carregando && !!semExame.length && (
        <div className="dia-nota amarela" data-aviso="aparelho-sem-exame">
          <strong>
            {semExame.length === 1
              ? `${semExame[0].nome} não faz nenhum exame.`
              : `${semExame.length} aparelhos não fazem nenhum exame.`}
          </strong>
          <p>
            Eles estão no cadastro e <strong>não aparecem</strong> no Novo
            Agendamento. Abra e marque quais exames cada um faz.
          </p>
        </div>
      )}

      {!carregando && !!semHorario.length && (
        <div className="dia-nota amarela" data-aviso="aparelho-sem-horario">
          <strong>
            {semHorario.length === 1
              ? `${semHorario[0].nome} não tem horário.`
              : `${semHorario.length} aparelhos não têm horário.`}
          </strong>
          <p>
            Fazem exame, mas sem expediente não há vaga para oferecer. Clique
            em <strong>Horários</strong> e abra os dias.
          </p>
        </div>
      )}

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-wave-square" />
          <h3>Nenhum aparelho cadastrado</h3>
          <p>
            Se você já importou a planilha, eles entraram pela aba
            <strong> Horarios_Exames</strong>. Se não, cadastre o primeiro aqui
            — ele vai precisar de pelo menos um exame e um horário para
            aparecer no Novo Agendamento.
          </p>
        </div>
      )}

      {!carregando && vistos.map(a => (
        <div key={a.id} className={'cad-linha' + (a.ativo ? '' : ' inativo')}
             data-aparelho={a.id}>
          <span className="cad-nome">
            {a.nome}
            {!!a.expediente && <small className="apa-exp">{a.expediente}</small>}
          </span>

          <span className="cad-tags">
            {!a.ativo && <em className="cad-tag off">desativado</em>}
            <em className="cad-tag neutro" data-tag="tipo">
              {a.tipo === 'sala' ? 'sala' : 'aparelho'}
            </em>
            <em className="cad-tag neutro" data-tag="duracao">{a.duracao_min} min</em>
            <em className={'cad-tag' + (a.exames ? '' : ' off')} data-tag="exames">
              {a.exames} {a.exames === 1 ? 'exame' : 'exames'}
            </em>
            <em className={'cad-tag' + (a.faixas ? ' sub' : ' off')} data-tag="faixas">
              {a.faixas ? `${a.faixas} faixa(s)` : 'sem horário'}
            </em>
            {a.futuros > 0 && (
              <em className="cad-tag exame" data-tag="futuros">
                {a.futuros} marcado(s)
              </em>
            )}
          </span>

          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="horarios"
                    onClick={() => setHorarios(a)}>
              <i className="fas fa-business-time" /> Horários
            </button>
            <button className="btn-secondary btn-sm" data-acao="editar-aparelho"
                    onClick={() => abrirEdicao(a)}>
              <i className="fas fa-pen" />
            </button>
            <button className="btn-secondary btn-sm" data-acao="virar-aparelho"
                    title={a.ativo ? 'Desativar' : 'Reativar'}
                    onClick={() => virar(a)}>
              <i className={a.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
            </button>
          </div>
        </div>
      ))}

      {/* ──────────────────── o cadastro ──────────────────── */}
      {aberto && (
        <div className="modal" data-modal="aparelho">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>{f.id ? 'Editar aparelho' : 'Novo aparelho'}</h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">

              <div className="form-group">
                <label>Nome *</label>
                <input type="text" autoFocus maxLength={80} value={f.nome}
                       data-campo="nome-aparelho"
                       onChange={e => mexer({ nome: e.target.value })}
                       placeholder="Holter 24h, Sala de Endoscopia…" />
              </div>

              <div className="cad-dupla">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>O que é</label>
                  <select value={f.tipo} data-campo="tipo-aparelho"
                          onChange={e => mexer({ tipo: e.target.value })}>
                    {TIPOS.map(t => (
                      <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                    ))}
                  </select>
                  <small className="form-dica">
                    {TIPOS.find(t => t.valor === f.tipo)?.ajuda}
                  </small>
                </div>
                <div className="form-group" style={{ flex: '0 0 150px' }}>
                  <label>Duração (min) *</label>
                  <input type="number" min={1} max={480} value={f.duracao}
                         data-campo="duracao-aparelho"
                         onChange={e => mexer({ duracao: e.target.value })} />
                </div>
              </div>

              {!duracaoOk && (
                <div className="dia-nota amarela" data-erro="duracao">
                  A duração precisa ser maior que zero — é dela que saem as
                  vagas do dia.
                </div>
              )}

              {/* ⚠️ Não existe caixinha de "faz consulta".
                  Um Holter não atende consulta de cardiologia, e
                  deixar o campo aberto o poria na lista de quem
                  atende. O banco grava `faz_consulta = false`
                  sempre — não é escolha da tela. */}

              <h4 className="cli-secao">Quais exames este aparelho faz</h4>

              {!arvore.length && (
                <div className="dia-nota amarela">
                  Nenhum exame cadastrado ainda. Crie os exames em
                  <strong> Gestão de Exames</strong> primeiro.
                </div>
              )}

              <div className="cad-esps" data-lista="exames-do-aparelho">
                {arvore.map(({ pai: p, filhos }) => (
                  <div key={p.id} className="cad-esp-grupo">
                    <label className="cad-escolha pai">
                      <input type="checkbox" checked={f.exames.includes(p.id)}
                             data-exame={p.id}
                             onChange={() => virarExame(p.id)} />
                      <span>{p.nome}</span>
                    </label>
                    {!!filhos.length && (
                      <div className="cad-esp-filhos">
                        {filhos.map(x => (
                          <label key={x.id} className="cad-escolha filho">
                            <input type="checkbox" checked={f.exames.includes(x.id)}
                                   data-exame={x.id}
                                   onChange={() => virarExame(x.id)} />
                            <span>{x.nome}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ⭐ O aviso aparece ANTES de salvar. Descobrir que
                  o aparelho não aparece para marcar com um
                  paciente na recepção é tarde. */}
              {!f.exames.length && (
                <div className="dia-nota amarela" data-aviso="sem-exame-no-form">
                  <strong>Sem nenhum exame marcado, ele não aparece para marcar.</strong>
                  <p>Dá para salvar assim e voltar depois — mas até lá ele é invisível.</p>
                </div>
              )}

              <label className="cad-escolha" data-campo="ativo-aparelho">
                <input type="checkbox" checked={f.ativo}
                       onChange={e => mexer({ ativo: e.target.checked })} />
                Ativo
              </label>

              <div className="form-actions">
                <button className="btn-secondary" disabled={indo}
                        onClick={() => setAberto(false)}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-aparelho"
                        disabled={indo || !nomeOk || !duracaoOk}
                        onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : <><i className="fas fa-check" /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────── os horários ────────────────────
          ⭐ É o MESMO componente do expediente do médico. O banco
          nunca distinguiu: `agenda.expedientes` aponta para
          `recurso_id`, e um aparelho é um recurso.

          Uma segunda tela de expediente só para aparelho seria
          uma segunda resposta para "que horas ele atende" — e as
          duas discordariam no primeiro feriado. */}
      {horarios && (
        <div className="modal" data-modal="horarios-aparelho">
          <div className="modal-overlay" onClick={() => setHorarios(null)} />
          <div className="modal-content" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <h3>Horários · {horarios.nome}</h3>
              <button onClick={() => setHorarios(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <ExpedienteDoMedico
                recursoId={horarios.id}
                medico={horarios.nome}
                duracaoMin={horarios.duracao_min}
                aoAvisar={avisar}
                aoMudar={() => setRecarga(n => n + 1)}
              />
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
