import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cotacoesDaCirurgia, enviarCotacaoOpme, escolherCotacaoOpme,
  fornecedoresParaCotacao, salvarFornecedorCirurgia, verAnexo,
  type FornecedorCirurgia
} from './dados';
import { formatarTelefone } from '../../nucleo/formato';

/**
 * ============================================================
 *  A COTAÇÃO DE OPME, DENTRO DA GAVETA DA CIRURGIA
 *
 *  31/10/2026. É a coluna "Cotação OPME" do quadro ganhando
 *  tela: escolher fornecedores, mandar o link pelo WhatsApp,
 *  ver as propostas lado a lado e escolher uma.
 *
 *  ------------------------------------------------------------
 *  ⭐ A TELA RESPONDE UMA PERGUNTA SÓ: QUAL SAI MAIS BARATO?
 *
 *  Por isso a comparação é por ITEM, e não por proposta: três
 *  empresas, o mesmo parafuso, os três preços na mesma linha.
 *  Uma lista de três PDFs lado a lado seria a mesma coisa que o
 *  hospital já faz hoje no e-mail.
 *
 *  ⚠️ O menor preço de cada linha fica marcado — mas quem
 *     escolhe é a pessoa, e a proposta inteira. Fornecedor não
 *     entrega meia cotação.
 * ============================================================
 */

const dinheiro = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR',
    { style: 'currency', currency: 'BRL' });

const CHIP: Record<string, { texto: string; cor: string }> = {
  ENVIADA:    { texto: 'aguardando',  cor: 'var(--warning)' },
  RESPONDIDA: { texto: 'respondida',  cor: 'var(--info)' },
  ESCOLHIDA:  { texto: 'escolhida',   cor: 'var(--success)' },
  RECUSADA:   { texto: 'recusada',    cor: 'var(--gray-400)' },
  CANCELADA:  { texto: 'cancelada',   cor: 'var(--gray-400)' }
};

export function CotacaoOpme({ clienteId, solicitacaoId, mostrar, aoMudar }: {
  clienteId: string;
  solicitacaoId: string;
  mostrar: (texto: string, bom?: boolean) => void;
  aoMudar: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const [forns, setForns] = useState<(FornecedorCirurgia & { sugerido?: boolean })[]>([]);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [abrindo, setAbrindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState<{ nome: string; telefone: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      /* ⭐ 06/11 (079): os fornecedores ligados ao TIPO desta cirurgia vêm
         primeiro, marcados como sugeridos — e já vêm marcados para envio
         na primeira vez. Sugerir não é restringir: os outros estão logo
         abaixo (decisão do Tom). */
      const [c, f] = await Promise.all([
        cotacoesDaCirurgia(solicitacaoId),
        fornecedoresParaCotacao(solicitacaoId)
      ]);
      setD(c);
      setForns(f);
      setEscolhidos(atual => atual.length ? atual
        : f.filter(x => x.sugerido && x.ativo && !(c?.cotacoes ?? []).some((k: any) => k.fornecedor_id === x.id)).map(x => x.id));
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui carregar as cotações.', false);
    }
  }, [solicitacaoId, clienteId, mostrar]);

  useEffect(() => { void carregar(); }, [carregar]);

  const cotacoes: any[] = d?.cotacoes ?? [];
  const itensPedidos: any[] = d?.itens_pedidos ?? [];
  const respondidas = cotacoes.filter(c => c.itens?.length);

  /* O menor valor de cada item, entre as propostas respondidas.
     Calculado aqui porque é pergunta de TELA — o banco já
     entregou os números. */
  const menorPorItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of respondidas) {
      for (const i of c.itens ?? []) {
        if (i.valor_unitario == null) continue;
        const k = i.opme_id ?? i.descricao;
        const atual = m.get(k);
        if (atual == null || i.valor_unitario < atual) m.set(k, i.valor_unitario);
      }
    }
    return m;
  }, [respondidas]);

  async function enviar() {
    if (!escolhidos.length) { mostrar('Escolha ao menos um fornecedor.', false); return; }
    setOcupado(true);
    try {
      const r = await enviarCotacaoOpme(solicitacaoId, escolhidos);
      mostrar(r.motivo, r.ok);
      if (r.ok) { setEscolhidos([]); setAbrindo(false); await carregar(); aoMudar(); }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui enviar.', false);
    } finally { setOcupado(false); }
  }

  const [justificando, setJustificando] = useState<{ id: string; fornecedor: string } | null>(null);
  const [motivoEscolha, setMotivoEscolha] = useState('');

  async function escolher(id: string, fornecedor: string, justificativa: string | null = null) {
    /* ⭐ 05/11 — o fluxo padrão: 3 propostas. Com menos, a escolha
       pede o MOTIVO por escrito (a caixa logo abaixo da proposta); o
       banco recusa sem ele, então a caixa é conforto, não a regra. */
    if (justificativa === null && cotacoes.filter(x => x.situacao === 'RESPONDIDA').length < 3) {
      setJustificando({ id, fornecedor }); setMotivoEscolha(''); return;
    }
    /* ⚠️ Escolher recusa as outras. Vale confirmar — é a única
       ação desta tela que fecha portas. */
    if (justificativa === null && !window.confirm(
      `Escolher a proposta de ${fornecedor}?\n\n` +
      'As outras propostas desta cirurgia passam a constar como recusadas. ' +
      'Nenhuma é apagada: os preços continuam no histórico.')) return;
    setOcupado(true);
    try {
      const r = await escolherCotacaoOpme(id, justificativa);
      mostrar(r.motivo, r.ok);
      if (r.ok) { setJustificando(null); await carregar(); aoMudar(); }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui escolher.', false);
    } finally { setOcupado(false); }
  }

  async function criarFornecedor() {
    if (!novo?.nome.trim()) { mostrar('O nome do fornecedor é obrigatório.', false); return; }
    try {
      const r = await salvarFornecedorCirurgia({
        clienteId, nome: novo.nome, telefone: novo.telefone || null
      });
      mostrar(r.motivo, r.ok);
      if (r.ok && r.id) {
        setNovo(null);
        await carregar();
        setEscolhidos(l => [...l, r.id!]);
      }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui salvar.', false);
    }
  }

  async function abrirPdf(anexoId: string) {
    try {
      const r = await verAnexo(anexoId);
      if (!r.ok || !r.url) { mostrar(r.mensagem ?? 'Não consegui abrir o PDF.', false); return; }
      window.open(r.url, '_blank', 'noopener');
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui abrir o PDF.', false);
    }
  }

  function copiarLink(codigo: string) {
    const url = `${window.location.origin}/cotacao?c=${codigo}`;
    navigator.clipboard?.writeText(url)
      .then(() => mostrar('Link copiado.', true))
      .catch(() => mostrar(url, true));
  }

  if (!d) {
    return <section className="cir-bloco" data-bloco="cotacao"><h4>
      <i className="fas fa-box-open" /> Cotação OPME</h4>
      <p className="cir-texto"><i className="fas fa-spinner fa-spin" /></p>
    </section>;
  }

  return (
    <section className="cir-bloco" data-bloco="cotacao">
      <h4><i className="fas fa-box-open" /> Cotação OPME
        {cotacoes.length > 0 && (
          <span className="cot-conta">{respondidas.length}/{cotacoes.length}</span>
        )}
      </h4>

      {itensPedidos.length === 0 ? (
        /* ⭐ Em voz alta, e sem botão: pedir cotação de nada é o
           fornecedor abrindo uma tela vazia e ligando para o
           hospital perguntar o que é. */
        <p className="cot-vazio">
          Esta cirurgia não tem OPME pedido. O médico precisa acrescentar os
          materiais na guia antes de pedir cotação.
        </p>
      ) : (
        <>
          {/* ---------- pedir ---------- */}
          {!abrindo ? (
            <button className="cot-botao" onClick={() => setAbrindo(true)}>
              <i className="fab fa-whatsapp" /> Pedir cotação a fornecedores
            </button>
          ) : (
            <div className="cot-escolher">
              <p className="cot-dica">
                O fornecedor recebe um link por WhatsApp, sem login, que vale
                7 dias. Ele <b>não vê</b> nenhum dado do paciente.
              </p>

              {forns.filter(f => f.ativo).map(f => {
                const ja = cotacoes.find(c => c.fornecedor_id === f.id);
                return (
                  <label className={'cot-forn' + (f.sugerido ? ' sugerido' : '')} key={f.id} data-fornecedor-sugerido={f.sugerido ? 'sim' : 'nao'}>
                    <input type="checkbox"
                           checked={escolhidos.includes(f.id)}
                           onChange={e => setEscolhidos(l =>
                             e.target.checked ? [...l, f.id] : l.filter(x => x !== f.id))} />
                    <span className="cot-forn-nome">{f.nome}</span>
                    {f.sugerido && <span className="cot-sugerido">fornece para este tipo</span>}
                    {f.telefone
                      ? <em className="cot-tel">{formatarTelefone(f.telefone)}</em>
                      /* ⚠️ Dito ANTES de mandar, não depois. */
                      : <em className="cot-sem-tel">sem telefone — link à mão</em>}
                    {ja && <span className="cot-ja">já pedido</span>}
                  </label>
                );
              })}

              {forns.filter(f => f.ativo).length === 0 && (
                <p className="cot-vazio">Nenhum fornecedor cadastrado ainda.</p>
              )}

              {novo ? (
                <div className="cot-novo">
                  <input placeholder="Nome do fornecedor" value={novo.nome}
                         onChange={e => setNovo({ ...novo, nome: e.target.value })} />
                  <input placeholder="WhatsApp" value={novo.telefone}
                         onChange={e => setNovo({ ...novo, telefone: e.target.value })} />
                  <button className="cot-mini" onClick={() => void criarFornecedor()}>
                    Salvar
                  </button>
                  <button className="cot-mini fantasma" onClick={() => setNovo(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button className="cot-mais"
                        onClick={() => setNovo({ nome: '', telefone: '' })}>
                  <i className="fas fa-plus" /> Novo fornecedor
                </button>
              )}

              <div className="cot-acoes">
                <button className="cot-botao" disabled={ocupado || !escolhidos.length}
                        onClick={() => void enviar()}>
                  <i className={ocupado ? 'fas fa-spinner fa-spin' : 'fab fa-whatsapp'} />
                  {' '}Enviar a {escolhidos.length} fornecedor
                  {escolhidos.length === 1 ? '' : 'es'}
                </button>
                <button className="cot-mini fantasma" onClick={() => setAbrindo(false)}>
                  Fechar
                </button>
              </div>
            </div>
          )}

          {/* ---------- as propostas ---------- */}
          {cotacoes.map(c => {
            const chip = CHIP[c.situacao] ?? CHIP.ENVIADA;
            return (
              <article className={'cot-proposta' + (c.escolhida ? ' escolhida' : '')}
                       key={c.id}>
                <header>
                  <strong>{c.fornecedor}</strong>
                  <span className="cot-chip" style={{ background: chip.cor }}>
                    {chip.texto}
                  </span>
                  {c.total != null && <b className="cot-total">{dinheiro(c.total)}</b>}
                </header>

                <div className="cot-meta">
                  {c.prazo && <span><i className="fas fa-truck" /> {c.prazo}</span>}
                  {c.validade && (
                    <span><i className="fas fa-calendar-check" /> vale até{' '}
                      {new Date(c.validade + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  {c.anexo_id
                    ? <button className="cot-pdf" onClick={() => void abrirPdf(c.anexo_id)}>
                        <i className="fas fa-file-pdf" /> PDF
                      </button>
                    /* ⭐ Dizer que NÃO veio é informação: no sistema
                       antigo o PDF era exigido e jogado fora, e
                       ninguém sabia que faltava. */
                    : c.situacao === 'RESPONDIDA' && <span className="cot-sem-pdf">sem PDF</span>}
                  {c.situacao === 'ENVIADA' && (
                    <button className="cot-pdf" onClick={() => copiarLink(c.codigo)}>
                      <i className="fas fa-link" /> copiar link
                    </button>
                  )}
                  {c.expirada && c.situacao === 'ENVIADA' && (
                    <span className="cot-sem-pdf">link expirado</span>
                  )}
                </div>

                {c.observacoes && <p className="cir-texto">{c.observacoes}</p>}

                {c.situacao === 'RESPONDIDA' && justificando?.id !== c.id && (
                  <button className="cot-escolher-botao" disabled={ocupado} data-acao="escolher-proposta"
                          onClick={() => void escolher(c.id, c.fornecedor)}>
                    <i className="fas fa-circle-check" /> Escolher esta proposta
                  </button>
                )}
                {justificando?.id === c.id && (
                  <div className="cot-justifica" data-bloco="justificar-escolha">
                    <p>
                      São <b>{cotacoes.filter(x => x.situacao === 'RESPONDIDA').length}</b> proposta(s) respondida(s);
                      o padrão é <b>3</b>. Para escolher a de {c.fornecedor} assim mesmo, escreva o motivo
                      (fornecedor único, urgência…). As outras passam a constar como recusadas.
                    </p>
                    <textarea className="cir-campo" rows={2} value={motivoEscolha} data-campo="motivo-escolha"
                              onChange={e => setMotivoEscolha(e.target.value)} />
                    <div className="cad-botoes">
                      <button className="cot-escolher-botao" disabled={ocupado} data-acao="confirmar-escolha"
                              onClick={() => void escolher(c.id, c.fornecedor, motivoEscolha.trim())}>
                        <i className="fas fa-circle-check" /> Escolher com este motivo
                      </button>
                      <button className="cot-mini fantasma" onClick={() => setJustificando(null)}>Voltar</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {/* ---------- a comparação por item ---------- */}
          {respondidas.length > 1 && (
            <div className="cot-comparacao">
              <h5>Comparação por item</h5>
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    {respondidas.map(c => <th key={c.id}>{c.fornecedor}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {itensPedidos.map(p => (
                    <tr key={p.id}>
                      <td>{p.descricao} <em>×{p.quantidade}</em></td>
                      {respondidas.map(c => {
                        const i = (c.itens ?? []).find((x: any) =>
                          x.opme_id === p.id || x.descricao === p.descricao);
                        const v = i?.valor_unitario ?? null;
                        const menor = menorPorItem.get(p.id) ??
                                      menorPorItem.get(p.descricao);
                        return (
                          <td key={c.id}
                              className={v != null && v === menor ? 'cot-menor' : undefined}>
                            {dinheiro(v)}
                            {i?.fabricante && <em>{i.fabricante}</em>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="cot-soma">
                    <td>Total</td>
                    {respondidas.map(c => <td key={c.id}>{dinheiro(c.total)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
