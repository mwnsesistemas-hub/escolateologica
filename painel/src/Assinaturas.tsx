import { useEffect, useMemo, useState } from 'react';
import {
  assinaturasDaPlataforma, cobrancasDoCliente, salvarAssinatura,
  gerarCobrancas, baixarCobranca,
  type AssinaturaNaPlataforma, type CobrancaDoCliente
} from './dados';

/**
 * ============================================================
 *  ASSINATURAS E MENSALIDADES
 *
 *  11/10/2026, o Tom: *"controlar as assinaturas, mensalidades
 *  etc."* — e, perguntado, escolheu **controle + cobrança
 *  automática**, pelo Asaas.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ ESTA TELA NÃO COBRA NINGUÉM
 *
 *  Ela registra o combinado e mostra o que está em aberto. Quem
 *  emite boleto é o Asaas, pelo servidor, com a chave que mora
 *  em `core.segredos` — nunca daqui.
 *
 *  Botão de cobrar no navegador exigiria a chave no navegador,
 *  e a chave no navegador é a chave de quem abrir a aba Rede.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ "GERAR COBRANÇAS" NÃO GERA DUAS VEZES
 *
 *  A trava é do banco: `unique (cliente_id, competencia)`. O
 *  botão pode ser clicado três vezes seguidas num dedo nervoso
 *  — na segunda ele diz "0 geradas", e nenhum cliente recebe
 *  dois boletos do mesmo mês.
 *
 *  Uma confirmação na tela não substituiria isso: ela protege
 *  de um clique distraído, não de duas abas abertas.
 *
 *  ------------------------------------------------------------
 *  ⭐ CORTESIA E DEMONSTRAÇÃO NÃO ENTRAM NA GERAÇÃO
 *
 *  Também no banco. Um boleto para o cliente de demonstração
 *  seria constrangedor de um jeito muito específico: ele existe
 *  justamente para ser mostrado a quem ainda não é cliente.
 * ============================================================
 */

function reais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '—';
  return (centavos / 100).toLocaleString('pt-BR',
    { style: 'currency', currency: 'BRL' });
}

function mes(competencia: string | null): string {
  if (!competencia) return '—';
  const [a, m] = competencia.split('-');
  return `${m}/${a}`;
}

function dia(d: string | null): string {
  if (!d) return '—';
  const [a, m, x] = d.split('-');
  return `${x}/${m}/${a}`;
}

const SITUACOES = [
  { v: 'ativa',     r: 'Ativa' },
  { v: 'cortesia',  r: 'Cortesia' },
  { v: 'suspensa',  r: 'Suspensa' },
  { v: 'cancelada', r: 'Cancelada' }
];

export function Assinaturas({
  aoAvisar
}: {
  aoAvisar: (mensagem: string, bom: boolean) => void;
}) {
  const [lista, setLista] = useState<AssinaturaNaPlataforma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [indo, setIndo] = useState(false);

  const [aberta, setAberta] = useState<AssinaturaNaPlataforma | null>(null);
  const [fPlano, setFPlano] = useState('');
  const [fValor, setFValor] = useState('');
  const [fDia, setFDia] = useState('10');
  const [fSituacao, setFSituacao] = useState('ativa');
  const [fCortesia, setFCortesia] = useState('');
  const [cobrancas, setCobrancas] = useState<CobrancaDoCliente[]>([]);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    assinaturasDaPlataforma()
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [recarga]);

  const total = useMemo(() => {
    const mensal = lista
      .filter(a => a.situacao === 'ativa')
      .reduce((s, a) => s + (a.valor_centavos ?? 0), 0);
    const aberto = lista.reduce((s, a) => s + (a.aberto_centavos ?? 0), 0);
    const atrasados = lista.filter(a => (a.atraso_dias ?? 0) > 0).length;
    return { mensal, aberto, atrasados };
  }, [lista]);

  async function abrir(a: AssinaturaNaPlataforma) {
    setAberta(a);
    setFPlano(a.plano ?? '');
    setFValor(a.valor_centavos ? String(a.valor_centavos / 100) : '');
    setFDia(String(a.dia_vencimento ?? 10));
    setFSituacao(a.situacao ?? 'ativa');
    setFCortesia(a.cortesia_ate ?? '');
    setCobrancas([]);
    try {
      setCobrancas(await cobrancasDoCliente(a.cliente_id));
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    }
  }

  const diaNum = parseInt(fDia, 10);
  const diaBom = diaNum >= 1 && diaNum <= 28;

  async function salvar() {
    if (!aberta || indo || !diaBom) return;
    setIndo(true);
    try {
      const centavos = Math.round(parseFloat(fValor.replace(',', '.')) * 100);
      const r = await salvarAssinatura({
        clienteId: aberta.cliente_id,
        plano: fPlano.trim() || null,
        valorCentavos: Number.isFinite(centavos) ? centavos : null,
        diaVencimento: diaNum,
        situacao: fSituacao,
        cortesiaAte: fSituacao === 'cortesia' ? (fCortesia || null) : null
      });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) { setAberta(null); setRecarga(n => n + 1); }
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function gerar() {
    if (indo) return;
    setIndo(true);
    try {
      const r = await gerarCobrancas(null);
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function baixar(c: CobrancaDoCliente) {
    if (indo || !aberta) return;
    setIndo(true);
    try {
      const r = await baixarCobranca({ id: c.id, origem: 'na mão' });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) {
        setCobrancas(await cobrancasDoCliente(aberta.cliente_id));
        setRecarga(n => n + 1);
      }
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;
  if (carregando) {
    return (
      <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
    );
  }

  return (
    <>
      <div className="ass-resumo" data-bloco="resumo-assinaturas">
        <div className="ass-caixa" data-num="mensal">
          <strong>{reais(total.mensal)}</strong>
          <small>por mês, nas assinaturas ativas</small>
        </div>
        <div className={'ass-caixa' + (total.aberto > 0 ? ' atencao' : '')}
             data-num="aberto">
          <strong>{reais(total.aberto)}</strong>
          <small>em aberto</small>
        </div>
        <div className={'ass-caixa' + (total.atrasados > 0 ? ' ruim' : '')}
             data-num="atrasados">
          <strong>{total.atrasados}</strong>
          <small>{total.atrasados === 1 ? 'cliente atrasado' : 'clientes atrasados'}</small>
        </div>
        <button className="btn-secondary" data-acao="gerar-cobrancas"
                disabled={indo} onClick={gerar}>
          <i className="fas fa-file-invoice-dollar" /> Gerar as deste mês
        </button>
      </div>

      {/* ⭐ O que o botão faz e o que ele NÃO faz, antes do clique. */}
      <p className="cad-rodape" data-aviso="o-que-gerar-faz">
        "Gerar as deste mês" cria a cobrança de cada assinatura <strong>ativa</strong>,
        uma por cliente, com o vencimento no dia combinado. Clicar duas vezes não
        gera duas: a trava é do banco. Cortesia e demonstração ficam de fora.
        Nenhum boleto é emitido aqui — isso é o Asaas, pelo servidor.
      </p>

      {lista.map(a => (
        <div key={a.cliente_id}
             className={'cli-linha' + (a.cliente_ativo ? '' : ' suspenso')}
             data-assinatura={a.cliente_id} data-slug={a.slug}>
          <span className="cli-nome">
            {a.nome}
            <small>{a.plano || 'sem plano definido'} · {a.slug}</small>
          </span>

          <span className="cad-tags">
            {a.situacao && (
              <em className={'cad-tag' + (a.situacao === 'ativa' ? '' : ' off')}
                  data-tag="situacao">{a.situacao}</em>
            )}
            {(a.atraso_dias ?? 0) > 0 && (
              <em className="cad-tag off" data-tag="atraso">
                {a.atraso_dias} dia(s) de atraso
              </em>
            )}
            {a.em_aberto > 0 && (
              <em className="cad-tag exame" data-tag="em-aberto">
                {a.em_aberto} em aberto · {reais(a.aberto_centavos)}
              </em>
            )}
          </span>

          <span className="mon-num" data-num="valor">
            <strong>{reais(a.valor_centavos)}</strong>
            <small>dia {a.dia_vencimento ?? '—'}</small>
          </span>

          <span className="mon-num" data-num="ultima">
            <strong>{mes(a.ultima_competencia)}</strong>
            <small>{a.ultima_situacao ?? 'nenhuma cobrança'}</small>
          </span>

          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="abrir-assinatura"
                    onClick={() => abrir(a)}>
              <i className="fas fa-receipt" /> Assinatura
            </button>
          </div>
        </div>
      ))}

      {aberta && (
        <div className="modal" data-modal="assinatura">
          <div className="modal-overlay" onClick={() => setAberta(null)} />
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>{aberta.nome}</h3>
              <button onClick={() => setAberta(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="cad-dupla">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Plano</label>
                  <input type="text" value={fPlano} data-campo="plano"
                         maxLength={60}
                         onChange={e => setFPlano(e.target.value)}
                         placeholder="Agendamento + Exames" />
                </div>
                <div className="form-group" style={{ flex: '0 0 150px' }}>
                  <label>Valor mensal (R$)</label>
                  <input type="text" value={fValor} data-campo="valor"
                         onChange={e => setFValor(e.target.value)}
                         placeholder="890,00" />
                </div>
              </div>

              <div className="cad-dupla">
                <div className="form-group" style={{ flex: '0 0 150px' }}>
                  <label>Dia do vencimento</label>
                  <input type="number" value={fDia} data-campo="dia-vencimento"
                         min={1} max={28}
                         onChange={e => setFDia(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Situação</label>
                  <select value={fSituacao} data-campo="situacao-assinatura"
                          onChange={e => setFSituacao(e.target.value)}>
                    {SITUACOES.map(s => (
                      <option key={s.v} value={s.v}>{s.r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ⭐⭐ 28 é o teto, e o motivo cabe numa linha. */}
              {!diaBom && (
                <div className="dia-nota amarela" data-erro="dia">
                  <strong>O dia tem que ficar entre 1 e 28.</strong>
                  <p>
                    Porque fevereiro existe. Vencimento no dia 30 cairia num dia
                    que não existe em fevereiro, e a cobrança desse mês não seria
                    gerada — sem erro nenhum.
                  </p>
                </div>
              )}

              {fSituacao === 'cortesia' && (
                <div className="form-group">
                  <label>Cortesia até</label>
                  <input type="date" value={fCortesia} data-campo="cortesia-ate"
                         onChange={e => setFCortesia(e.target.value)} />
                  <small className="form-dica">
                    Enquanto a data não passar, este cliente não entra na geração
                    de cobranças. Vazio = cortesia sem prazo.
                  </small>
                </div>
              )}

              <h4 className="cli-secao">Cobranças</h4>

              {!cobrancas.length && (
                <p className="cad-rodape">Nenhuma cobrança gerada ainda.</p>
              )}

              {cobrancas.map(c => (
                <div key={c.id} className="cob-linha" data-cobranca={c.id}
                     data-situacao={c.situacao}>
                  <span className="cob-mes">{mes(c.competencia)}</span>
                  <span className="cob-valor">{reais(c.valor_centavos)}</span>
                  <span className="cob-venc">vence {dia(c.vencimento)}</span>
                  <span className="cad-tags">
                    <em className={'cad-tag' + (c.situacao === 'PAGA' ? '' : ' off')}
                        data-tag="situacao-cobranca">{c.situacao}</em>
                    {(c.atraso_dias ?? 0) > 0 && (
                      <em className="cad-tag off" data-tag="atraso-cobranca">
                        {c.atraso_dias}d
                      </em>
                    )}
                    {c.origem_baixa && (
                      <em className="cad-tag neutro" data-tag="origem">
                        baixa {c.origem_baixa}
                      </em>
                    )}
                  </span>
                  {c.situacao !== 'PAGA' && c.situacao !== 'CANCELADA' && (
                    <button className="btn-secondary btn-sm"
                            data-acao="baixar-cobranca"
                            disabled={indo} onClick={() => baixar(c)}>
                      <i className="fas fa-check" /> Dar baixa
                    </button>
                  )}
                </div>
              ))}

              <div className="form-actions">
                {/* ⭐ NOME, não classe: "Dar baixa" também é
                    `.btn-secondary`, e a prova não deve depender
                    de qual vem primeiro no DOM. */}
                <button className="btn-secondary" disabled={indo}
                        data-acao="fechar-assinatura"
                        onClick={() => setAberta(null)}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-assinatura"
                        disabled={indo || !diaBom} onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : <><i className="fas fa-check" /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
