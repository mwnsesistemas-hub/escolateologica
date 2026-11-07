import { useCallback, useEffect, useState } from 'react';
import {
  viabilidadeDaCirurgia, aprovarViabilidade, calcularViabilidadeAgora,
  registrarAutorizacaoDoConvenio, salvarOpmeTabela, agendarCirurgia,
  type ViabilidadeDaCirurgia, type ContaDaViabilidade, type Semaforo
} from './dados';

/**
 * ============================================================
 *  A VIABILIDADE ECONÔMICA DA CIRURGIA            (05/11/2026)
 *  Entrega 2, Parte A — o banco é o `074_viabilidade.sql`.
 *
 *  O Tom: *"custos por códigos em cadastro × receita do convênio,
 *  para aprovação da diretoria antes do agendamento."*
 *
 *  ⭐⭐⭐ A TELA NÃO CALCULA NADA. Ela desenha o que o banco
 *     guardou (ou a prévia que o banco calculou). Uma segunda conta
 *     aqui seria a segunda resposta para "quanto esta cirurgia dá"
 *     — e a diretoria aprovaria um número que o banco não tem.
 *
 *  ⚠️ FALTANDO NÃO É ZERO. O que ninguém cadastrou aparece numa
 *     caixa vermelha, com o motivo — nunca como R$ 0,00 na conta.
 *
 *  ⚠️ O médico recebe nulo do banco, e o bloco não aparece. É a
 *     regra (o que o convênio paga não pode nem parecer pesar na
 *     decisão clínica), não falta de dado.
 * ============================================================
 */

const reais = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaBR = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const COR: Record<Semaforo, string> = {
  verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho', incompleta: 'Incompleta'
};
const SITUACAO: Record<string, string> = {
  PENDENTE: 'Aguardando a diretoria',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
  MANTIDA: 'Aprovação mantida'
};

export function ViabilidadeCirurgia({
  solicitacaoId, chave, mostrar, aoMudar
}: {
  solicitacaoId: string;
  /** Muda quando a gaveta muda (etapa, tipo) — e o bloco recarrega. */
  chave: string;
  mostrar: (texto: string, bom?: boolean) => void;
  aoMudar: () => void;
}) {
  const [v, setV] = useState<ViabilidadeDaCirurgia | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [verItens, setVerItens] = useState(false);
  const [opmeTabela, setOpmeTabela] = useState('');
  /* O corte do convênio: o que ele autorizou, por linha. */
  const [autProc, setAutProc] = useState<Record<string, string>>({});
  const [autOpme, setAutOpme] = useState<Record<string, string>>({});
  const [autDiarias, setAutDiarias] = useState('');
  const [autMotivo, setAutMotivo] = useState('');
  /* PARTE B: a condição da diretoria e o agendamento. */
  const [comCondicao, setComCondicao] = useState(false);
  const [minimo, setMinimo] = useState('2');
  const [dataCir, setDataCir] = useState('');
  const [anest, setAnest] = useState('');
  const [hora, setHora] = useState('');
  const [duracao, setDuracao] = useState('120');
  const [sala, setSala] = useState('');
  const [avisosAgenda, setAvisosAgenda] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    try {
      const r = await viabilidadeDaCirurgia(solicitacaoId);
      setV(r);
      setOpmeTabela(r?.opme_valor_tabela != null ? String(r.opme_valor_tabela) : '');
      setAutProc(Object.fromEntries((r?.procedimentos ?? []).map(p => [p.id, String(p.autorizada ?? p.quantidade)])));
      setAutOpme(Object.fromEntries((r?.opme ?? []).map(o => [o.id, String(o.autorizada ?? o.quantidade)])));
      setAutDiarias(r?.diarias_autorizadas != null ? String(r.diarias_autorizadas)
                    : r?.diarias != null ? String(r.diarias) : '');
      setDataCir(r?.data_cirurgia ?? '');
      setAnest(r?.anestesista_id ?? '');
      setHora(r?.hora_inicio ?? '');
      setDuracao(String(r?.duracao_min ?? 120));
      setSala(r?.sala_id ?? '');
      const pe = (r?.atual ?? r?.previa)?.detalhe?.anestesia?.ponto_de_equilibrio;
      setMinimo(String(pe && pe > 1 ? pe : 2));
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui abrir a viabilidade.', false);
    } finally { setCarregou(true); }
  }, [solicitacaoId, mostrar]);

  useEffect(() => { void carregar(); }, [carregar, chave]);

  if (!carregou || !v) return null;

  const guardada = v.atual;
  const conta: ContaDaViabilidade | null = guardada ?? v.previa;
  const pendente = guardada?.situacao === 'PENDENTE';

  async function rodar(fn: () => Promise<{ ok: boolean; mensagem: string }>) {
    setOcupado(true);
    try {
      const r = await fn();
      mostrar(r.mensagem, r.ok);
      if (r.ok) { setMotivo(''); setAutMotivo(''); await carregar(); aoMudar(); }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui.', false);
    } finally { setOcupado(false); }
  }

  return (
    <section className="cir-bloco viab" data-bloco="viabilidade">
      <h4><i className="fas fa-scale-balanced" /> Viabilidade econômica</h4>

      {!conta && <p className="cir-calado">Sem dados para calcular.</p>}

      {conta && (
        <>
          <div className="viab-topo">
            <span className={'viab-semaforo viab-' + conta.semaforo} data-semaforo={conta.semaforo}>
              {COR[conta.semaforo]}
              {conta.percentual !== null && conta.semaforo !== 'incompleta' &&
                ` · ${Number(conta.percentual).toLocaleString('pt-BR')}%`}
            </span>
            <span className="viab-situacao" data-situacao={guardada?.situacao ?? 'PREVIA'}>
              {guardada
                ? SITUACAO[guardada.situacao] ?? guardada.situacao
                : 'Prévia — ainda não guardada'}
            </span>
          </div>
          {!guardada && (
            <p className="viab-nota">
              A conta é guardada sozinha quando a cirurgia entra em "Aguardando Aprovação da
              Diretoria". Até lá, este é o número de agora.
            </p>
          )}

          <div className="viab-numeros">
            <div><span>Receita ({conta.modelo === 'pacote' ? 'pacote' : 'conta aberta'})</span>
                 <b data-valor="receita">{reais(conta.receita)}</b></div>
            <div><span>− Custos diretos e variáveis</span><b>{reais(conta.diretos)}</b></div>
            <div className="viab-subtotal"><span>= Margem de contribuição</span>
                 <b data-valor="margem">{reais(conta.margem_contribuicao)}</b></div>
            <div><span>− Custos fixos (rateio)</span><b>{reais(conta.fixos)}</b></div>
            <div className="viab-total"><span>= Resultado</span>
                 <b data-valor="resultado" className={conta.resultado < 0 ? 'negativo' : ''}>
                   {reais(conta.resultado)}
                 </b></div>
          </div>
          <p className="viab-nota">
            Preços de {new Date(conta.data_preco + 'T12:00:00').toLocaleDateString('pt-BR')} ·
            semáforo: verde a partir de {conta.detalhe?.limites?.verde}%, amarelo a partir
            de {conta.detalhe?.limites?.amarelo}%, sobre o resultado.
          </p>

          {/* ⭐⭐⭐ PARTE B — a anestesia, os cenários e o ponto de equilíbrio. */}
          {conta.detalhe?.anestesia && (() => {
            const an = conta.detalhe.anestesia!;
            return (
              <div className="viab-anestesia" data-bloco="anestesia">
                <strong><i className="fas fa-syringe" /> Anestesia</strong>
                <p className="viab-nota">
                  {an.anestesista} · {reais(an.valor_dia)} por dia · atende {an.dias_semana.length
                    ? an.dias_semana.map(d => DIA_CURTO[d]).join(', ') : 'nenhum dia cadastrado'}
                </p>
                {an.sozinha
                  ? <p className="viab-nota" data-anestesia="sozinha">
                      Sem dia marcado, a conta considera a cirurgia <b>sozinha no dia</b>: o dia inteiro do
                      anestesista ({reais(an.valor_dia)}) é dela.
                    </p>
                  : <p className="viab-nota" data-anestesia="no-dia">
                      Em {diaBR(an.dia!)}: <b>{an.cirurgias_no_dia}</b> cirurgia(s) no hospital · anestesia do
                      dia {reais(an.custo_do_dia)} · <b>{reais(an.rateio)}</b> nesta.
                    </p>}
                <p className={'viab-ponto-eq' + (an.nunca_empata ? ' ruim' : '')} data-ponto={an.ponto_de_equilibrio ?? 'nunca'}>
                  {an.nunca_empata
                    ? 'Não empata em nenhum cenário: sem a anestesia, o custo já passa da receita.'
                    : an.ponto_de_equilibrio === 1
                      ? 'Dá resultado positivo mesmo sozinha no dia.'
                      : <>Ponto de equilíbrio: só não dá prejuízo com <b>{an.ponto_de_equilibrio} ou mais</b> cirurgias no dia.</>}
                </p>
                <div className="viab-itens-caixa">
                  <table className="viab-itens viab-cenarios">
                    <thead><tr><th>Cirurgias no dia</th><th>Anestesia nesta</th><th>Resultado</th><th>%</th></tr></thead>
                    <tbody>
                      {an.cenarios.map(c => (
                        <tr key={c.cirurgias} data-cenario={c.cirurgias}
                            className={c.cirurgias === an.ponto_de_equilibrio ? 'viab-linha-pe' : ''}>
                          <td>{c.cirurgias === 1 ? 'sozinha' : `com ${c.cirurgias}`}</td>
                          <td>{reais(c.anestesia)}</td>
                          <td className={c.resultado < 0 ? 'falta' : ''}>{reais(c.resultado)}</td>
                          <td>{c.percentual === null ? '—' : `${Number(c.percentual).toLocaleString('pt-BR')}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {conta.faltando.length > 0 && (
            <div className="viab-faltando" data-bloco="faltando">
              <strong><i className="fas fa-triangle-exclamation" /> Faltando — NÃO entrou na conta como zero</strong>
              {conta.faltando.map((f, i) => (
                <div key={i} className="viab-falta" data-falta={f.falta}>
                  {f.codigo && <code>{f.codigo}</code>}
                  <span><b>{f.descricao}</b> · {f.falta}: {f.motivo}</span>
                </div>
              ))}
              <small>Cadastre em <strong>Custos de Cirurgia</strong> (ou no convênio) e calcule de novo.</small>
            </div>
          )}

          {conta.riscos.length > 0 && conta.riscos.map((r, i) => (
            <p key={i} className="viab-risco" data-risco={r.tipo}>
              <i className="fas fa-circle-exclamation" /> {r.texto}
            </p>
          ))}

          {guardada && v.previa && v.previa.resultado !== guardada.resultado && (
            <p className="viab-nota" data-aviso="previa-diferente">
              Com os cadastros de hoje a conta daria {reais(v.previa.resultado)} — o número
              acima é o que foi guardado em {new Date(guardada.calculada_em).toLocaleString('pt-BR')}.
            </p>
          )}

          <button className="btn-secondary btn-sm" data-acao="ver-itens" onClick={() => setVerItens(!verItens)}>
            <i className={'fas ' + (verItens ? 'fa-chevron-up' : 'fa-chevron-down')} /> A conta item a item
          </button>
          {verItens && (
            <div className="viab-itens-caixa">
              <table className="viab-itens" data-tabela="itens">
                <thead>
                  <tr><th>Código</th><th>Item</th><th>Qtd</th><th>Custo var.</th><th>Custo fixo</th><th>Receita</th></tr>
                </thead>
                <tbody>
                  {conta.detalhe.itens.map((it, i) => (
                    <tr key={i}>
                      <td><code>{it.codigo}</code></td>
                      <td>{it.descricao}{it.de_pedido && <small> (qtd. {conta.detalhe.diarias_de})</small>}</td>
                      <td>{it.quantidade}</td>
                      <td className={it.custo_variavel === null ? 'falta' : ''}>{it.custo_variavel === null ? 'faltando' : reais(it.custo_variavel)}</td>
                      <td className={it.custo_fixo === null ? 'falta' : ''}>{it.custo_fixo === null ? 'faltando' : reais(it.custo_fixo)}</td>
                      <td>{conta.modelo === 'pacote' ? 'no pacote' : it.receita === null ? 'faltando' : reais(it.receita)}</td>
                    </tr>
                  ))}
                  {conta.detalhe.opme?.tem && (
                    <tr>
                      <td>—</td><td>OPME (cotação escolhida)</td><td>—</td>
                      <td className={conta.detalhe.opme.custo === null ? 'falta' : ''}>
                        {conta.detalhe.opme.custo === null ? 'faltando' : reais(conta.detalhe.opme.custo)}
                      </td>
                      <td>—</td>
                      <td>{conta.detalhe.opme.no_pacote ? 'no pacote' : reais(conta.detalhe.opme.receita)}</td>
                    </tr>
                  )}
                  {conta.modelo === 'pacote' && conta.detalhe.pacote && (
                    <tr className="viab-linha-pacote">
                      <td>—</td>
                      <td>Pacote do convênio ({conta.detalhe.pacote.diarias_incluidas} diária(s) incluída(s))</td>
                      <td>1</td><td>—</td><td>—</td><td>{reais(conta.detalhe.pacote.valor)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ⭐ OPME "pela tabela do convênio": o valor é DIGITADO aqui. */}
      {v.pode_gerir && v.regra_opme === 'tabela' && (v.opme ?? []).length > 0 && !pendente && (
        <div className="viab-linha-form">
          <label className="cad-campo">
            <span>OPME pela tabela do convênio (R$)</span>
            <input type="number" min={0} step="0.01" value={opmeTabela} data-campo="opme-tabela"
                   onChange={e => setOpmeTabela(e.target.value)} />
          </label>
          <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="salvar-opme-tabela"
                  onClick={() => void rodar(() => salvarOpmeTabela(solicitacaoId, opmeTabela === '' ? null : Number(opmeTabela)))}>
            Salvar valor
          </button>
        </div>
      )}

      {/* ---------- a diretoria decide ---------- */}
      {v.pode_aprovar && pendente && (
        <div className="viab-decisao" data-bloco="decisao">
          <textarea className="cir-campo" rows={2} value={motivo} data-campo="motivo-viab"
                    placeholder={conta?.semaforo === 'incompleta'
                      ? 'Motivo (obrigatório para recusar, e para aprovar com algo faltando)'
                      : 'Motivo (obrigatório para recusar)'}
                    onChange={e => setMotivo(e.target.value)} />
          {/* ⭐ PARTE B: aprovar COM CONDIÇÃO — "só vale com N ou mais no dia". */}
          <label className="viab-condicao-escolha">
            <input type="checkbox" checked={comCondicao} data-campo="com-condicao"
                   onChange={e => setComCondicao(e.target.checked)} />
            <span>Aprovar com condição: mínimo de</span>
            <input type="number" min={1} max={50} value={minimo} disabled={!comCondicao} data-campo="minimo-no-dia"
                   onChange={e => setMinimo(e.target.value)} />
            <span>cirurgias no dia</span>
          </label>
          <div className="cad-botoes">
            <button className="btn-primary" disabled={ocupado} data-acao="aprovar-viab"
                    onClick={() => void rodar(() => aprovarViabilidade(solicitacaoId, true, motivo.trim() || null,
                      comCondicao ? Number(minimo) : null))}>
              <i className="fas fa-check" /> Aprovar
            </button>
            <button className="btn-secondary viab-recusar" disabled={ocupado} data-acao="recusar-viab"
                    onClick={() => void rodar(() => aprovarViabilidade(solicitacaoId, false, motivo.trim() || null))}>
              <i className="fas fa-xmark" /> Recusar
            </button>
          </div>
          <small className="viab-nota">
            Aprovada, a cirurgia vai para "Aguardando Autorização do Convênio". Recusada, volta para
            "Em Análise" com o motivo na linha do tempo.
          </small>
        </div>
      )}
      {v.na_aprovacao && !pendente && !v.pode_aprovar && (
        <p className="viab-nota">Aguardando a diretoria.</p>
      )}
      {v.na_aprovacao && !pendente && v.pode_gerir && (
        <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="calcular-viab"
                onClick={() => void rodar(() => calcularViabilidadeAgora(solicitacaoId))}>
          <i className="fas fa-calculator" /> Calcular agora e mandar para a diretoria
        </button>
      )}
      {pendente && v.pode_gerir && (
        <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="recalcular-viab"
                title="Depois de cadastrar o que faltava"
                onClick={() => void rodar(() => calcularViabilidadeAgora(solicitacaoId))}>
          <i className="fas fa-rotate" /> Calcular de novo
        </button>
      )}

      {/* ⭐ PARTE B: a condição que a diretoria pôs, e se o dia marcado a cumpre. */}
      {v.condicao && (
        <p className={'viab-condicao' + (v.condicao.cirurgias_no_dia !== null && v.condicao.cirurgias_no_dia < v.condicao.minimo ? ' ruim' : '')}
           data-bloco="condicao">
          <i className="fas fa-handshake" /> Aprovada com condição: mínimo de <b>{v.condicao.minimo}</b> cirurgias no
          dia{v.condicao.cirurgias_no_dia === null
            ? ' — ainda sem dia marcado.'
            : <> — no dia marcado são <b>{v.condicao.cirurgias_no_dia}</b>
                {v.condicao.cirurgias_no_dia < v.condicao.minimo ? ': NÃO cumpre.' : ': cumpre.'}</>}
        </p>
      )}

      {/* ⭐ PARTE B: AGENDAR — o dia e o anestesista. Avisa; não recusa. */}
      {v.pode_gerir && !['realizada', 'cancelada', 'negada'].includes(v.etapa) && (
        <div className="viab-agendar" data-bloco="agendar">
          <strong><i className="fas fa-calendar-day" /> Dia da cirurgia</strong>
          {v.proximos_dias.length > 0 && (
            <div className="viab-dias">
              {v.proximos_dias.slice(0, 10).map(d => (
                <button key={d.dia} type="button" data-dia-anestesia={d.dia}
                        className={'viab-dia' + (d.dia === dataCir ? ' ativo' : '')}
                        title={(d.anestesistas ?? []).join(', ')}
                        onClick={() => setDataCir(d.dia)}>
                  <b>{diaBR(d.dia)}</b><small>{d.dia_semana} · {d.cirurgias} cir.</small>
                </button>
              ))}
            </div>
          )}
          {v.proximos_dias.length === 0 && (
            <p className="viab-nota" data-aviso="sem-dias">Nenhum anestesista tem dia cadastrado nas próximas semanas.</p>
          )}
          <div className="viab-linha-form">
            <label className="cad-campo"><span>data</span>
              <input type="date" value={dataCir} data-campo="data-cirurgia" onChange={e => setDataCir(e.target.value)} />
            </label>
            <label className="cad-campo"><span>anestesista</span>
              <select value={anest} data-campo="anestesista" onChange={e => setAnest(e.target.value)}>
                <option value="">o padrão do hospital</option>
                {v.anestesistas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.dias_semana.map(d => DIA_CURTO[d]).join(', ') || 'sem dias'}){a.padrao ? ' · padrão' : ''}
                  </option>
                ))}
              </select>
            </label>
            {/* ⭐ 06/11 (080): a hora, a duração e a sala — o que o calendário e o
                mapa da TV precisam. A mesma sala no mesmo horário o banco recusa. */}
            <label className="cad-campo"><span>hora</span>
              <input type="time" value={hora} data-campo="hora-cirurgia" onChange={e => setHora(e.target.value)} />
            </label>
            <label className="cad-campo"><span>duração (min)</span>
              <input type="number" min={10} max={1440} step={15} value={duracao} data-campo="duracao-cirurgia"
                     onChange={e => setDuracao(e.target.value)} />
            </label>
            <label className="cad-campo"><span>sala</span>
              <select value={sala} data-campo="sala-cirurgia" onChange={e => setSala(e.target.value)}>
                <option value="">sem sala</option>
                {(v.salas ?? []).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="agendar"
                    onClick={async () => {
                      setOcupado(true);
                      try {
                        const r = await agendarCirurgia(solicitacaoId, dataCir || null, anest || null,
                                                        hora || null, hora ? Number(duracao) || 120 : null, sala || null);
                        mostrar(r.mensagem, r.ok && r.avisos.length === 0);
                        setAvisosAgenda(r.avisos ?? []);
                        if (r.ok) { await carregar(); aoMudar(); }
                      } catch (e: any) { mostrar(e?.message ?? 'Não consegui agendar.', false); }
                      finally { setOcupado(false); }
                    }}>
              <i className="fas fa-check" /> Salvar agendamento
            </button>
          </div>
          {avisosAgenda.map((a, i) => (
            <p key={i} className="viab-risco" data-aviso-agenda={i}><i className="fas fa-circle-exclamation" /> {a}</p>
          ))}
          {v.data_prevista && !v.data_cirurgia && (
            <small className="viab-nota">Sem dia marcado, vale a data prevista da guia ({diaBR(v.data_prevista)}).</small>
          )}
        </div>
      )}

      {/* ---------- o corte do convênio (decisão A) ---------- */}
      {v.depois_da_aprovacao && v.pode_gerir && (
        <details className="viab-corte" data-bloco="corte">
          <summary>O que o convênio autorizou</summary>
          <p className="viab-nota">
            Se o convênio autorizou menos, registre aqui. O sistema recalcula e, se o resultado
            cair, a cirurgia volta para a diretoria.
          </p>
          {v.procedimentos.map(p => (
            <label className="viab-aut" key={p.id}>
              <span><code>{p.codigo}</code> {p.descricao} <small>(pedido: {p.quantidade})</small></span>
              <input type="number" min={0} value={autProc[p.id] ?? ''} data-campo="aut-proc"
                     onChange={e => setAutProc({ ...autProc, [p.id]: e.target.value })} />
            </label>
          ))}
          {v.opme.map(o => (
            <label className="viab-aut" key={o.id}>
              <span>OPME: {o.descricao} <small>(pedido: {o.quantidade})</small></span>
              <input type="number" min={0} value={autOpme[o.id] ?? ''} data-campo="aut-opme"
                     onChange={e => setAutOpme({ ...autOpme, [o.id]: e.target.value })} />
            </label>
          ))}
          <label className="viab-aut">
            <span>Diárias <small>(pedidas: {v.diarias ?? '—'})</small></span>
            <input type="number" min={0} value={autDiarias} data-campo="aut-diarias"
                   onChange={e => setAutDiarias(e.target.value)} />
          </label>
          <input className="cir-campo" value={autMotivo} data-campo="aut-motivo"
                 placeholder="O que foi autorizado ou cortado (vai para a linha do tempo)"
                 onChange={e => setAutMotivo(e.target.value)} />
          <button className="btn-primary btn-sm" disabled={ocupado} data-acao="registrar-autorizacao"
                  onClick={() => void rodar(() => registrarAutorizacaoDoConvenio(
                    solicitacaoId,
                    v.procedimentos.filter(p => autProc[p.id] !== '' && Number(autProc[p.id]) !== (p.autorizada ?? p.quantidade))
                                   .map(p => ({ id: p.id, quantidade: Number(autProc[p.id]) })),
                    v.opme.filter(o => autOpme[o.id] !== '' && Number(autOpme[o.id]) !== (o.autorizada ?? o.quantidade))
                          .map(o => ({ id: o.id, quantidade: Number(autOpme[o.id]) })),
                    autDiarias === '' ? null : Number(autDiarias),
                    autMotivo.trim()))}>
            <i className="fas fa-file-signature" /> Registrar e recalcular
          </button>
        </details>
      )}

      {v.historico.length > 0 && (
        <div className="viab-historico" data-bloco="historico-viab">
          {v.historico.map(h => (
            <div key={h.seq} className="viab-passo" data-situacao={h.situacao}>
              <span className={'viab-ponto viab-' + h.semaforo} />
              <div>
                <strong>{SITUACAO[h.situacao] ?? h.situacao}</strong> · {reais(h.resultado)}
                {h.percentual !== null && ` (${Number(h.percentual).toLocaleString('pt-BR')}%)`}
                {h.minimo_no_dia && <em className="viab-tag-condicao"> · mín. {h.minimo_no_dia} no dia</em>}
                <small>
                  {new Date(h.decidida_em ?? h.calculada_em).toLocaleString('pt-BR')}
                  {h.por && ` · ${h.por}`} · {h.origem}
                </small>
                {h.motivo && <p className="cir-texto">{h.motivo}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
