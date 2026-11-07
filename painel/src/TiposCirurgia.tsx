import { useCallback, useEffect, useState } from 'react';
import {
  tiposDeCirurgia, salvarTipoCirurgia, etapasDeCirurgia, itensDosTipos, salvarItensDoTipo,
  type TipoDeCirurgia, type PendenciaDoTipo, type ItemDoTipo
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  TIPOS DE CIRURGIA                                (04/11/2026)
 *
 *  O Tom: *"Preciso que as pendências sejam cadastradas por tipo
 *  de cirurgia."* Cada tipo tem as SUAS pendências — setor, até
 *  qual dia (contado do pedido, dentro dos 20) e antes de qual
 *  etapa. As marcadas "antes da aprovação" seguram a entrada
 *  automática na aprovação da diretoria (`073`).
 *
 *  A equipe escolhe o tipo no detalhe da cirurgia, na análise, e
 *  as pendências nascem sozinhas.
 * ============================================================
 */
const NOVA: PendenciaDoTipo = { descricao: '', setor: '', dia_limite: 5, antes_de: 'aprovacao' };
/* ⭐ 05/11: os itens padrão do tipo (diárias, sala, taxas) entram na
   viabilidade (074). A diária marcada usa as diárias do PEDIDO quando
   a guia as traz — o fato da cirurgia vence o padrão do cadastro. */
const ITEM_NOVO: ItemDoTipo = { codigo: '', descricao: '', quantidade: 1, eh_diaria: false };
type TipoEditando = TipoDeCirurgia & { itens: ItemDoTipo[] };

export function TiposCirurgia({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [tipos, setTipos] = useState<TipoDeCirurgia[]>([]);
  const [etapas, setEtapas] = useState<{ chave: string; nome: string }[]>([]);
  const [editando, setEditando] = useState<TipoEditando | null>(null);
  const [itens, setItens] = useState<Map<string, ItemDoTipo[]>>(new Map());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [ts, es, its] = await Promise.all([tiposDeCirurgia(clienteId), etapasDeCirurgia(clienteId),
                                               itensDosTipos(clienteId)]);
      setTipos(ts);
      setItens(new Map(its.map(x => [x.tipo_id, x.itens])));
      setEtapas((es as any[]).filter(e => e.natureza !== 'entrada' && !String(e.natureza).startsWith('fim'))
                              .map(e => ({ chave: e.chave, nome: e.nome })));
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
  }, [clienteId, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  function mudar(i: number, campo: keyof PendenciaDoTipo, valor: string) {
    if (!editando) return;
    const ps = editando.pendencias.map((p, j) => j !== i ? p
      : { ...p, [campo]: campo === 'dia_limite' ? Number(valor) : valor });
    setEditando({ ...editando, pendencias: ps });
  }

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    try {
      const r = await salvarTipoCirurgia(clienteId, editando.id || null, editando.nome, editando.ativo,
        editando.pendencias.filter(p => p.descricao.trim()));
      if (!r.ok || !r.id) { avisar(r.mensagem, false); return; }
      // Os itens vão numa segunda chamada; se ela recusar, o tipo já
      // está salvo e a frase diz o que faltou.
      const ri = await salvarItensDoTipo(r.id, editando.itens.filter(i => i.codigo.trim() || i.descricao.trim()));
      avisar(ri.ok ? r.mensagem : `Tipo salvo, mas os itens não: ${ri.mensagem}`, ri.ok);
      if (ri.ok) { setEditando(null); }
      await carregar();
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setSalvando(false); }
  }

  return (
    <div className="card" data-tela="tiposcirurgia">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-tags" /> Tipos de Cirurgia</h3>
          <p className="cad-sub">
            Cada tipo tem as suas pendências, com o setor e até qual dia — contado do pedido, dentro
            do prazo de 20 dias até a cirurgia agendada.
          </p>
        </div>
        {!editando && (
          <button className="btn-primary" data-acao="novo-tipo"
                  onClick={() => setEditando({ id: '', nome: '', ativo: true, pendencias: [{ ...NOVA }], itens: [] })}>
            <i className="fas fa-plus" /> Novo tipo
          </button>
        )}
      </div>

      {!editando && tipos.length === 0 && (
        <div className="porvir" data-aviso="sem-tipos">
          <i className="fas fa-circle-info" />
          <p>Nenhum tipo cadastrado. Comece pelos mais comuns (por exemplo, "Artroscopia de Joelho").</p>
        </div>
      )}

      {!editando && tipos.length > 0 && (
        <div className="cad-lista" data-lista="tipos">
          {tipos.map(t => (
            <div key={t.id} className={'cad-linha' + (t.ativo ? '' : ' desligado')} data-tipo={t.nome}>
              <div>
                <strong>{t.nome}</strong>{!t.ativo && <em className="cad-tag">desativado</em>}
                <small style={{ display: 'block' }}>
                  {t.pendencias.length} pendência{t.pendencias.length === 1 ? '' : 's'}
                  {t.pendencias.length > 0 && ' · ' + t.pendencias.map(p => `${p.descricao} (dia ${p.dia_limite})`).join(', ')}
                  {' · '}<span data-itens-do-tipo={(itens.get(t.id) ?? []).length}>
                    {(itens.get(t.id) ?? []).length} item(ns) padrão</span>
                </small>
              </div>
              <div className="cad-botoes">
                <button className="btn-secondary btn-sm" data-acao="editar-tipo"
                        onClick={() => setEditando({ ...t, pendencias: t.pendencias.map(p => ({ ...p })),
                                                     itens: (itens.get(t.id) ?? []).map(i => ({ ...i })) })}>
                  <i className="fas fa-pen" /> Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div className="cad-form" data-bloco="form-tipo">
          <label className="cad-campo">
            <span>Nome do tipo</span>
            <input data-campo="nome-tipo" value={editando.nome}
                   onChange={e => setEditando({ ...editando, nome: e.target.value })} />
          </label>
          <label className="cad-escolha">
            <input type="checkbox" checked={editando.ativo}
                   onChange={e => setEditando({ ...editando, ativo: e.target.checked })} />
            <span>Ativo (aparece para escolher no detalhe da cirurgia)</span>
          </label>

          <h4>Pendências deste tipo</h4>
          {editando.pendencias.map((p, i) => (
            <div className="cad-dupla" key={i} data-pendencia-tipo={i}>
              <input placeholder="Descrição (ex.: Risco cirúrgico)" value={p.descricao}
                     data-campo="pend-descricao" onChange={e => mudar(i, 'descricao', e.target.value)} />
              <input placeholder="Setor" value={p.setor ?? ''}
                     data-campo="pend-setor" onChange={e => mudar(i, 'setor', e.target.value)} />
              <label className="cad-campo">
                <span>até o dia</span>
                <input type="number" min={0} max={20} value={p.dia_limite}
                       data-campo="pend-dia" onChange={e => mudar(i, 'dia_limite', e.target.value)} />
              </label>
              <select value={p.antes_de} data-campo="pend-antes"
                      onChange={e => mudar(i, 'antes_de', e.target.value)}>
                {etapas.map(e => <option key={e.chave} value={e.chave}>antes de: {e.nome}</option>)}
              </select>
              <button className="btn-secondary btn-sm" title="Tirar"
                      onClick={() => setEditando({ ...editando, pendencias: editando.pendencias.filter((_, j) => j !== i) })}>
                <i className="fas fa-trash" />
              </button>
            </div>
          ))}
          <button className="btn-secondary btn-sm" data-acao="mais-pendencia"
                  onClick={() => setEditando({ ...editando, pendencias: [...editando.pendencias, { ...NOVA }] })}>
            <i className="fas fa-plus" /> Mais uma pendência
          </button>
          <h4>Itens padrão (entram na viabilidade)</h4>
          <p className="cad-rodape">
            Diárias, taxa de sala, taxas — por <strong>código</strong>, com quantidade. O custo de cada código vem
            de <strong>Custos de Cirurgia</strong>; o preço, do convênio.
          </p>
          {editando.itens.map((it, i) => (
            <div className="cad-dupla" key={'i' + i} data-item-tipo={i}>
              <input placeholder="Código" value={it.codigo} data-campo="item-codigo"
                     onChange={e => setEditando({ ...editando, itens: editando.itens.map((x, j) => j === i ? { ...x, codigo: e.target.value } : x) })} />
              <input placeholder="Descrição (ex.: Diária de apartamento)" value={it.descricao} data-campo="item-descricao"
                     onChange={e => setEditando({ ...editando, itens: editando.itens.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x) })} />
              <label className="cad-campo">
                <span>qtd.</span>
                <input type="number" min={0.5} step="0.5" value={it.quantidade} data-campo="item-qtd"
                       onChange={e => setEditando({ ...editando, itens: editando.itens.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x) })} />
              </label>
              <label className="cad-escolha" title="Usa as diárias pedidas na guia, quando houver">
                <input type="checkbox" checked={it.eh_diaria} data-campo="item-diaria"
                       onChange={e => setEditando({ ...editando, itens: editando.itens.map((x, j) => j === i ? { ...x, eh_diaria: e.target.checked } : x) })} />
                <span>é diária</span>
              </label>
              <button className="btn-secondary btn-sm" title="Tirar"
                      onClick={() => setEditando({ ...editando, itens: editando.itens.filter((_, j) => j !== i) })}>
                <i className="fas fa-trash" />
              </button>
            </div>
          ))}
          <button className="btn-secondary btn-sm" data-acao="mais-item"
                  onClick={() => setEditando({ ...editando, itens: [...editando.itens, { ...ITEM_NOVO }] })}>
            <i className="fas fa-plus" /> Mais um item padrão
          </button>

          <p className="cad-rodape">
            As pendências <strong>antes da aprovação</strong> seguram a entrada automática em
            "Aguardando Aprovação da Diretoria": a cirurgia entra sozinha quando elas e a cotação de
            OPME estão concluídas.
          </p>
          <div className="cad-botoes">
            <button className="btn-primary" data-acao="salvar-tipo" disabled={salvando} onClick={() => void salvar()}>
              <i className="fas fa-check" /> Salvar
            </button>
            <button className="btn-secondary" onClick={() => setEditando(null)}>Voltar</button>
          </div>
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
