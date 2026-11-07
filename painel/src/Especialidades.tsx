import { useEffect, useMemo, useState } from 'react';
import {
  especialidadesDoCliente, salvarEspecialidade, type Especialidade
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  ESPECIALIDADES E SUBESPECIALIDADES
 *
 *  Ortopedia, e dentro dela Ombro, Joelho, Coluna.
 *
 *  ------------------------------------------------------------
 *  ⭐ POR QUE A SUBÁREA NÃO É DETALHE DE CADASTRO
 *
 *  O paciente com dor na coluna que marca com o ortopedista de
 *  ombro gasta a vaga, gasta a consulta do convênio, viaja até
 *  o hospital — e sai com um pedido de encaminhamento.
 *
 *  A vaga foi vendida. O paciente não foi atendido. E os dois
 *  números do relatório dizem que deu tudo certo: uma consulta
 *  marcada, uma consulta realizada.
 *
 *  É o tipo de perda que não aparece em lugar nenhum.
 *
 *  ------------------------------------------------------------
 *  DOIS NÍVEIS, E A TELA MOSTRA ISSO
 *
 *  A lista é uma árvore de dois andares: a especialidade, e
 *  embaixo dela as subáreas, recuadas. Uma lista plana com
 *  "Ortopedia", "Ombro", "Joelho" em ordem alfabética esconderia
 *  justamente a informação que importa — de quem o Joelho é
 *  filho.
 *
 *  O banco recusa um terceiro nível. A tela nem oferece: o
 *  seletor de "pertence a" só lista quem não tem pai.
 * ============================================================
 */

export function Especialidades({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [lista, setLista] = useState<Especialidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  // O formulário. `editando` guarda o id, ou '' para novo.
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState('');
  const [nome, setNome] = useState('');
  const [pai, setPai] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    especialidadesDoCliente(clienteId)
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  /** As especialidades-pai, com as subáreas penduradas. */
  const arvore = useMemo(() => {
    const pais = lista.filter(e => !e.pai_id);
    return pais.map(p => ({
      pai: p,
      filhos: lista.filter(f => f.pai_id === p.id)
    }));
  }, [lista]);

  // Órfã é subárea cujo pai não veio na lista — não acontece
  // hoje, mas uma lista filtrada no futuro faria a subárea
  // desaparecer sem ninguém notar.
  const orfas = useMemo(
    () => lista.filter(e => e.pai_id && !lista.some(p => p.id === e.pai_id)),
    [lista]);

  function abrirNovo(paiId = '') {
    setEditando(''); setNome(''); setPai(paiId); setAtivo(true); setAberto(true);
  }

  function abrirEdicao(e: Especialidade) {
    setEditando(e.id); setNome(e.nome);
    setPai(e.pai_id ?? ''); setAtivo(e.ativo); setAberto(true);
  }

  async function salvar() {
    if (indo || nome.trim().length < 3) return;
    setIndo(true);
    try {
      const r = await salvarEspecialidade({
        clienteId, nome: nome.trim(),
        id: editando || null, ativo, pai: pai || null
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAberto(false); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function virar(e: Especialidade) {
    try {
      const r = await salvarEspecialidade({
        clienteId, nome: e.nome, id: e.id, ativo: !e.ativo, pai: e.pai_id
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (x) {
      avisar((x as Error).message ?? String(x), false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Especialidades</h2>
        <button className="btn-primary" data-acao="nova-especialidade"
                onClick={() => abrirNovo()}>
          <i className="fas fa-plus" /> Nova especialidade
        </button>
      </div>

      <div className="cad-nota">
        <i className="fas fa-sitemap" />
        <div>
          <strong>Ortopedia → Ombro, Joelho, Coluna.</strong>
          <p>
            A subespecialidade é o que impede o paciente de coluna de marcar com
            o ortopedista de ombro — gastar a vaga, a consulta do convênio e a
            viagem para sair com um encaminhamento.
          </p>
          <p>
            Médico ligado só à especialidade é o <strong>geral</strong>: ele
            aparece em todas as subáreas. Quem tem subárea aparece só na dele.
            Por isso nada muda nos cadastros de hoje até você começar a
            preencher.
          </p>
        </div>
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-stethoscope" />
          <h3>Nenhuma especialidade cadastrada</h3>
          <p>Comece por uma — Ortopedia, Oftalmologia — e depois crie as subáreas dela.</p>
        </div>
      )}

      {!carregando && arvore.map(({ pai: p, filhos }) => (
        <div key={p.id} className={'cad-grupo' + (p.ativo ? '' : ' inativo')}
             data-especialidade={p.id}>
          <div className="cad-linha pai">
            <span className="cad-nome">{p.nome}</span>
            <span className="cad-tags">
              {!p.ativo && <em className="cad-tag off">desativada</em>}
              <em className="cad-tag">{p.medicos} médico(s)</em>
              {!!filhos.length && <em className="cad-tag sub">{filhos.length} subárea(s)</em>}
            </span>
            <div className="cad-botoes">
              <button className="btn-secondary btn-sm" data-acao="nova-sub"
                      onClick={() => abrirNovo(p.id)}>
                <i className="fas fa-plus" /> Subárea
              </button>
              <button className="btn-secondary btn-sm" data-acao="editar"
                      onClick={() => abrirEdicao(p)}>
                <i className="fas fa-pen" />
              </button>
              <button className="btn-secondary btn-sm" data-acao="virar"
                      title={p.ativo ? 'Desativar' : 'Reativar'}
                      onClick={() => virar(p)}>
                <i className={p.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
              </button>
            </div>
          </div>

          {filhos.map(f => (
            <div key={f.id} className={'cad-linha filho' + (f.ativo ? '' : ' inativo')}
                 data-especialidade={f.id}>
              <span className="cad-nome">
                <i className="fas fa-turn-up fa-rotate-90" /> {f.nome}
              </span>
              <span className="cad-tags">
                {!f.ativo && <em className="cad-tag off">desativada</em>}
                <em className="cad-tag">{f.medicos} médico(s)</em>
              </span>
              <div className="cad-botoes">
                <button className="btn-secondary btn-sm" data-acao="editar"
                        onClick={() => abrirEdicao(f)}>
                  <i className="fas fa-pen" />
                </button>
                <button className="btn-secondary btn-sm" data-acao="virar"
                        onClick={() => virar(f)}>
                  <i className={f.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {!!orfas.length && (
        <div className="dia-nota amarela" style={{ marginTop: 14 }}>
          <strong>{orfas.length} subárea(s) sem especialidade visível</strong>
          <p>
            {orfas.map(o => o.nome).join(', ')} — a especialidade principal delas
            não está nesta lista. Recarregue; se continuar, me avise.
          </p>
        </div>
      )}

      {/* ---------------- o formulário ---------------- */}
      {aberto && (
        <div className="modal" data-modal="especialidade">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>
                {editando ? 'Editar' : pai ? 'Nova subespecialidade' : 'Nova especialidade'}
              </h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome *</label>
                <input type="text" autoFocus maxLength={80} value={nome}
                       data-campo="nome"
                       onChange={e => setNome(e.target.value)}
                       placeholder="Ortopedia, Coluna, Oftalmologia…" />
                {nome.trim().length > 0 && nome.trim().length < 3 && (
                  <small style={{ color: 'var(--danger)' }}>
                    Precisa de pelo menos 3 letras.
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Pertence a</label>
                <select value={pai} data-campo="pai"
                        onChange={e => setPai(e.target.value)}>
                  <option value="">— é uma especialidade principal —</option>
                  {/* Só quem NÃO tem pai aparece aqui. É assim que
                      a tela não oferece o terceiro nível que o
                      banco recusaria. */}
                  {lista.filter(e => !e.pai_id && e.id !== editando).map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
                <small className="wiz-dica">
                  Deixe em branco para criar uma especialidade. Escolha uma para
                  criar uma subárea dela — o cadastro tem dois níveis.
                </small>
              </div>

              <label className="dia-check">
                <input type="checkbox" checked={ativo} data-campo="ativo"
                       onChange={e => setAtivo(e.target.checked)} />
                Ativa
              </label>

              <div className="form-actions">
                <button className="btn-secondary" onClick={() => setAberto(false)}
                        disabled={indo}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-especialidade"
                        disabled={indo || nome.trim().length < 3} onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
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
