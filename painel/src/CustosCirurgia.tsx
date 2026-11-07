import { useCallback, useEffect, useState } from 'react';
import {
  cadastrosDaViabilidade, salvarCustoCirurgia, salvarOpmeDoConvenio, salvarPacoteConvenio,
  salvarPrecoItem, salvarLimitesViabilidade, salvarAnestesista, viabilidadeDosDias,
  type CadastrosDaViabilidade, type CustoDeCirurgia, type NaturezaDoCusto, type Anestesista,
  type ViabilidadeDoDia
} from './dados';
import { hojeNoFuso, somarDias } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  CUSTOS DE CIRURGIA — os cadastros da viabilidade (05/11/2026)
 *  O banco é o `074_viabilidade.sql`.
 *
 *  Cinco cadastros, e a viabilidade é a soma deles:
 *
 *    Custos        quanto o hospital GASTA por código (variável e fixo)
 *    Preços        quanto o convênio PAGA por código que não é serviço
 *                  (diária, taxa, MatMed). O que é serviço tem preço na
 *                  tabela do convênio, e só lá — o banco recusa o resto.
 *    Pacotes       convênio × tipo de cirurgia: quando existe, a receita
 *                  É o pacote
 *    OPME          a regra de cada convênio: custo + taxa, ou tabela
 *    Semáforo      os limites do verde e do amarelo, sobre o resultado
 *    Anestesistas  (PARTE B) valor por dia, dias da semana, um PADRÃO
 *    Viab. do dia  (PARTE B) o relatório: cada dia, quantas cirurgias,
 *                  quanto de anestesia cabe a cada uma, e se o mínimo
 *                  que a diretoria exigiu foi cumprido
 *
 *  ⚠️ Preço e pacote têm VIGÊNCIA: salvar com outra data cria uma
 *     linha nova, e a cirurgia usa a que valia na data dela. Custo
 *     não tem: a viabilidade guardada já congela o número da época.
 *
 *  ⚠️ Custo se DESATIVA, não se apaga.
 * ============================================================
 */

const GRUPOS: Record<NaturezaDoCusto, { valor: string; rotulo: string }[]> = {
  variavel: [
    { valor: 'materiais', rotulo: 'Materiais de consumo' },
    { valor: 'medicamentos', rotulo: 'Medicamentos e gases' },
    { valor: 'honorarios', rotulo: 'Honorários (equipe contratada)' },
    { valor: 'opme', rotulo: 'OPME' }
    /* ⚠️ 05/11 (Parte B): o anestesista saiu daqui — o custo dele vem SÓ
       da aba Anestesistas (decisão do Tom). Duas fontes = anestesia
       contada duas vezes. */
  ],
  fixo: [
    { valor: 'equipe', rotulo: 'Equipe permanente (rateio)' },
    { valor: 'energia', rotulo: 'Energia (rateio)' },
    { valor: 'manutencao', rotulo: 'Manutenção e depreciação' },
    { valor: 'cme', rotulo: 'CME (esterilização)' }
  ]
};
const rotuloDoGrupo = (g: string) =>
  [...GRUPOS.variavel, ...GRUPOS.fixo].find(x => x.valor === g)?.rotulo ?? g;
const reais = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');

type Aba = 'custos' | 'precos' | 'pacotes' | 'opme' | 'semaforo' | 'anestesistas' | 'dias';
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FUSO = 'America/Sao_Paulo';
const ANEST_NOVO = { id: null as string | null, nome: '', valor_dia: 0, dias_semana: [] as number[], padrao: false, ativo: true };
const CUSTO_NOVO = { id: null as string | null, codigo: '', descricao: '', natureza: 'variavel' as NaturezaDoCusto,
                     grupo: 'materiais', valor: 0, unidade: '', ativo: true };

export function CustosCirurgia({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [c, setC] = useState<CadastrosDaViabilidade | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [aba, setAba] = useState<Aba>('custos');
  const [ocupado, setOcupado] = useState(false);

  const [custo, setCusto] = useState<typeof CUSTO_NOVO | null>(null);
  const [preco, setPreco] = useState({ convenio: '', codigo: '', descricao: '', valor: '', desde: '' });
  const [pacote, setPacote] = useState({ convenio: '', tipo: '', valor: '', diarias: '1', opme: true, desde: '' });
  const [limites, setLimites] = useState({ verde: '20', amarelo: '10' });
  const [anest, setAnest] = useState<typeof ANEST_NOVO | null>(null);
  const [periodo, setPeriodo] = useState(() => {
    const hoje = hojeNoFuso(FUSO);
    return { de: hoje, ate: somarDias(hoje, 30) };
  });
  const [dias, setDias] = useState<ViabilidadeDoDia[] | null>(null);

  async function carregarDias() {
    try { setDias(await viabilidadeDosDias(clienteId, periodo.de, periodo.ate)); }
    catch (e) { avisar((e as Error).message ?? String(e), false); }
  }

  const carregar = useCallback(async () => {
    try {
      const r = await cadastrosDaViabilidade(clienteId);
      setC(r);
      if (r) setLimites({ verde: String(r.limites.verde), amarelo: String(r.limites.amarelo) });
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setCarregou(true); }
  }, [clienteId, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function rodar(fn: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) {
    setOcupado(true);
    try {
      const r = await fn();
      avisar(r.mensagem, r.ok);
      if (r.ok) { depois?.(); await carregar(); }
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setOcupado(false); }
  }

  if (carregou && !c) {
    return (
      <div className="card" data-tela="custoscirurgia">
        <div className="porvir"><i className="fas fa-lock" /><p>Os custos de cirurgia são da diretoria.</p></div>
      </div>
    );
  }
  const pode = !!c?.pode_editar;

  return (
    <div className="card" data-tela="custoscirurgia">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-scale-balanced" /> Custos de Cirurgia</h3>
          <p className="cad-sub">
            O que a viabilidade usa: quanto o hospital gasta, quanto o convênio paga e os limites do
            semáforo. Código sem custo ou sem preço aparece na viabilidade como <strong>faltando</strong> —
            nunca como zero.
          </p>
        </div>
      </div>

      <div className="cus-abas" role="tablist">
        {([['custos', 'Custos por código'], ['precos', 'Preços dos itens'], ['pacotes', 'Pacotes'],
           ['opme', 'OPME por convênio'], ['semaforo', 'Semáforo'],
           ['anestesistas', 'Anestesistas'], ['dias', 'Viabilidade do dia']] as [Aba, string][]).map(([k, r]) => (
          <button key={k} className={'cus-aba' + (aba === k ? ' ativa' : '')} data-aba={k}
                  onClick={() => { setAba(k); if (k === 'dias') void carregarDias(); }}>{r}</button>
        ))}
      </div>

      {c && aba === 'custos' && (
        <div className="cus-corpo" data-aba-ativa="custos">
          <p className="cad-ajuda">
            Um código pode ter mais de uma linha: a sala tem o <b>material</b> (variável) e o <b>rateio</b> da
            equipe (fixo). Os variáveis entram na margem de contribuição; os fixos, no resultado.
          </p>
          {pode && !custo && (
            <button className="btn-primary btn-sm" data-acao="novo-custo" onClick={() => setCusto({ ...CUSTO_NOVO })}>
              <i className="fas fa-plus" /> Novo custo
            </button>
          )}
          {custo && (
            <div className="cus-form" data-bloco="form-custo">
              <input placeholder="Código (TUSS, diária, taxa…)" value={custo.codigo} data-campo="custo-codigo"
                     onChange={e => setCusto({ ...custo, codigo: e.target.value })} />
              <input placeholder="Descrição" value={custo.descricao} data-campo="custo-descricao"
                     onChange={e => setCusto({ ...custo, descricao: e.target.value })} />
              <select value={custo.natureza} data-campo="custo-natureza"
                      onChange={e => {
                        const n = e.target.value as NaturezaDoCusto;
                        setCusto({ ...custo, natureza: n, grupo: GRUPOS[n][0].valor });
                      }}>
                <option value="variavel">Variável / direto</option>
                <option value="fixo">Fixo (rateio da estrutura)</option>
              </select>
              <select value={custo.grupo} data-campo="custo-grupo"
                      onChange={e => setCusto({ ...custo, grupo: e.target.value })}>
                {GRUPOS[custo.natureza].map(g => <option key={g.valor} value={g.valor}>{g.rotulo}</option>)}
              </select>
              <input type="number" min={0} step="0.01" placeholder="Valor (R$)" value={custo.valor}
                     data-campo="custo-valor" onChange={e => setCusto({ ...custo, valor: Number(e.target.value) })} />
              <input placeholder="Unidade (ex.: diária)" value={custo.unidade ?? ''}
                     onChange={e => setCusto({ ...custo, unidade: e.target.value })} />
              <label className="cus-check">
                <input type="checkbox" checked={custo.ativo} onChange={e => setCusto({ ...custo, ativo: e.target.checked })} />
                <span>Ativo</span>
              </label>
              <div className="cad-botoes">
                <button className="btn-primary btn-sm" disabled={ocupado} data-acao="salvar-custo"
                        onClick={() => void rodar(() => salvarCustoCirurgia(clienteId, { ...custo, unidade: custo.unidade || null }),
                                                  () => setCusto(null))}>
                  <i className="fas fa-check" /> Salvar
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setCusto(null)}>Voltar</button>
              </div>
            </div>
          )}
          {c.custos.length === 0 && <div className="porvir" data-aviso="sem-custos"><p>Nenhum custo cadastrado ainda.</p></div>}
          {c.custos.length > 0 && (
            <div className="cus-tabela-caixa">
              <table className="cus-tabela" data-lista="custos">
                <thead><tr><th>Código</th><th>Descrição</th><th>Natureza</th><th>Grupo</th><th>Valor</th><th /></tr></thead>
                <tbody>
                  {c.custos.map(x => (
                    <tr key={x.id} data-custo={x.codigo} className={x.ativo ? '' : 'desligado'}>
                      <td><code>{x.codigo}</code></td>
                      <td>{x.descricao}{!x.ativo && <em className="cad-tag off">desativado</em>}</td>
                      <td>{x.natureza === 'fixo' ? 'Fixo' : 'Variável'}</td>
                      <td>{rotuloDoGrupo(x.grupo)}</td>
                      <td>{reais(x.valor)}{x.unidade && <small> / {x.unidade}</small>}</td>
                      <td>{pode && (
                        <button className="btn-secondary btn-sm" data-acao="editar-custo"
                                onClick={() => setCusto({ ...x, unidade: x.unidade ?? '' } as CustoDeCirurgia & typeof CUSTO_NOVO)}>
                          <i className="fas fa-pen" />
                        </button>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {c && aba === 'precos' && (
        <div className="cus-corpo" data-aba-ativa="precos">
          <p className="cad-ajuda">
            Quanto cada convênio paga por <b>diária, taxa de sala, MatMed</b> — códigos que não são serviço da
            agenda. Procedimento que já é serviço tem o preço na <b>tabela do convênio</b> (Faturamento →
            Convênios), e só lá.
          </p>
          {pode && (
            <div className="cus-form" data-bloco="form-preco">
              <select value={preco.convenio} data-campo="preco-convenio" onChange={e => setPreco({ ...preco, convenio: e.target.value })}>
                <option value="">Convênio…</option>
                {c.convenios.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
              <input placeholder="Código" value={preco.codigo} data-campo="preco-codigo" onChange={e => setPreco({ ...preco, codigo: e.target.value })} />
              <input placeholder="Descrição" value={preco.descricao} onChange={e => setPreco({ ...preco, descricao: e.target.value })} />
              <input type="number" min={0} step="0.01" placeholder="Valor (R$)" value={preco.valor} data-campo="preco-valor"
                     onChange={e => setPreco({ ...preco, valor: e.target.value })} />
              <label className="cad-campo"><span>vale a partir de</span>
                <input type="date" value={preco.desde} onChange={e => setPreco({ ...preco, desde: e.target.value })} />
              </label>
              <button className="btn-primary btn-sm" disabled={ocupado || !preco.convenio} data-acao="salvar-preco"
                      onClick={() => void rodar(() => salvarPrecoItem(clienteId, preco.convenio, preco.codigo,
                        preco.descricao || null, Number(preco.valor || -1), preco.desde || null),
                        () => setPreco({ ...preco, codigo: '', descricao: '', valor: '' }))}>
                <i className="fas fa-check" /> Salvar preço
              </button>
            </div>
          )}
          {c.precos_itens.length === 0 && <div className="porvir"><p>Nenhum preço de item cadastrado.</p></div>}
          {c.precos_itens.length > 0 && (
            <div className="cus-tabela-caixa">
              <table className="cus-tabela" data-lista="precos">
                <thead><tr><th>Convênio</th><th>Código</th><th>Descrição</th><th>Valor</th><th>Desde</th></tr></thead>
                <tbody>{c.precos_itens.map(p => (
                  <tr key={p.id} data-preco={p.codigo}>
                    <td>{p.convenio}</td><td><code>{p.codigo}</code></td><td>{p.descricao ?? '—'}</td>
                    <td>{reais(p.valor)}</td><td>{dia(p.vigente_desde)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {c && aba === 'pacotes' && (
        <div className="cus-corpo" data-aba-ativa="pacotes">
          <p className="cad-ajuda">
            Quando o convênio paga a cirurgia por <b>pacote</b>, a receita é o valor do pacote. Diária além das
            incluídas vira custo sem receita, e a viabilidade avisa.
          </p>
          {pode && (
            <div className="cus-form" data-bloco="form-pacote">
              <select value={pacote.convenio} data-campo="pacote-convenio" onChange={e => setPacote({ ...pacote, convenio: e.target.value })}>
                <option value="">Convênio…</option>
                {c.convenios.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
              <select value={pacote.tipo} data-campo="pacote-tipo" onChange={e => setPacote({ ...pacote, tipo: e.target.value })}>
                <option value="">Tipo de cirurgia…</option>
                {c.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <input type="number" min={0} step="0.01" placeholder="Valor do pacote (R$)" value={pacote.valor}
                     data-campo="pacote-valor" onChange={e => setPacote({ ...pacote, valor: e.target.value })} />
              <label className="cad-campo"><span>diárias incluídas</span>
                <input type="number" min={0} value={pacote.diarias} onChange={e => setPacote({ ...pacote, diarias: e.target.value })} />
              </label>
              <label className="cus-check">
                <input type="checkbox" checked={pacote.opme} data-campo="pacote-opme"
                       onChange={e => setPacote({ ...pacote, opme: e.target.checked })} />
                <span>A OPME está incluída no pacote</span>
              </label>
              <label className="cad-campo"><span>vale a partir de</span>
                <input type="date" value={pacote.desde} onChange={e => setPacote({ ...pacote, desde: e.target.value })} />
              </label>
              <button className="btn-primary btn-sm" disabled={ocupado || !pacote.convenio || !pacote.tipo} data-acao="salvar-pacote"
                      onClick={() => void rodar(() => salvarPacoteConvenio(clienteId, pacote.convenio, pacote.tipo,
                        Number(pacote.valor || -1), Number(pacote.diarias || 0), pacote.opme, pacote.desde || null))}>
                <i className="fas fa-check" /> Salvar pacote
              </button>
            </div>
          )}
          {c.pacotes.length === 0 && <div className="porvir"><p>Nenhum pacote cadastrado: as cirurgias usam a conta aberta.</p></div>}
          {c.pacotes.length > 0 && (
            <div className="cus-tabela-caixa">
              <table className="cus-tabela" data-lista="pacotes">
                <thead><tr><th>Convênio</th><th>Tipo</th><th>Valor</th><th>Diárias</th><th>OPME</th><th>Desde</th></tr></thead>
                <tbody>{c.pacotes.map(p => (
                  <tr key={p.id} data-pacote={p.tipo}>
                    <td>{p.convenio}</td><td>{p.tipo}</td><td>{reais(p.valor)}</td><td>{p.diarias_incluidas}</td>
                    <td>{p.opme_incluida ? 'incluída' : 'à parte'}</td><td>{dia(p.vigente_desde)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {c && aba === 'opme' && (
        <div className="cus-corpo" data-aba-ativa="opme">
          <p className="cad-ajuda">
            Como cada convênio paga a OPME na conta aberta: <b>custo + taxa</b> (a cotação escolhida mais a
            porcentagem) ou <b>pela tabela</b> dele (o valor é digitado na cirurgia). Convênio sem regra deixa a
            OPME como faltando.
          </p>
          {c.convenios.map(v => (
            <ConvenioOpme key={v.id} conv={v} pode={pode} ocupado={ocupado}
                          salvar={(modo, taxa) => void rodar(() => salvarOpmeDoConvenio(clienteId, v.id, modo, taxa))} />
          ))}
        </div>
      )}

      {c && aba === 'semaforo' && (
        <div className="cus-corpo" data-aba-ativa="semaforo">
          <p className="cad-ajuda">
            A cor da viabilidade, sobre o <b>resultado</b> (receita − todos os custos) em porcentagem da receita.
            Mudar aqui vale para as próximas viabilidades; as já guardadas não mudam.
          </p>
          <div className="cus-form">
            <label className="cad-campo"><span><span className="viab-ponto viab-verde" /> verde a partir de (%)</span>
              <input type="number" value={limites.verde} data-campo="limite-verde" disabled={!pode}
                     onChange={e => setLimites({ ...limites, verde: e.target.value })} />
            </label>
            <label className="cad-campo"><span><span className="viab-ponto viab-amarelo" /> amarelo a partir de (%)</span>
              <input type="number" value={limites.amarelo} data-campo="limite-amarelo" disabled={!pode}
                     onChange={e => setLimites({ ...limites, amarelo: e.target.value })} />
            </label>
            <p className="cad-ajuda">Abaixo do amarelo é <b>vermelho</b>. Com algo faltando é <b>incompleta</b>.</p>
            {pode && (
              <button className="btn-primary btn-sm" disabled={ocupado} data-acao="salvar-limites"
                      onClick={() => void rodar(() => salvarLimitesViabilidade(clienteId, Number(limites.verde), Number(limites.amarelo)))}>
                <i className="fas fa-check" /> Salvar
              </button>
            )}
          </div>
        </div>
      )}
      {c && aba === 'anestesistas' && (
        <div className="cus-corpo" data-aba-ativa="anestesistas">
          <p className="cad-ajuda">
            O custo da anestesia na viabilidade vem <b>só daqui</b>: o valor por dia do anestesista, dividido por
            todas as cirurgias do hospital naquele dia. Cirurgia sem anestesista escolhido usa o <b>padrão</b>.
            Os dias marcados são os que aparecem para quem agenda.
          </p>
          {pode && !anest && (
            <button className="btn-primary btn-sm" data-acao="novo-anestesista" onClick={() => setAnest({ ...ANEST_NOVO })}>
              <i className="fas fa-plus" /> Novo anestesista
            </button>
          )}
          {anest && (
            <div className="cus-form" data-bloco="form-anestesista">
              <input placeholder="Nome" value={anest.nome} data-campo="anest-nome"
                     onChange={e => setAnest({ ...anest, nome: e.target.value })} />
              <label className="cad-campo"><span>valor por dia (R$)</span>
                <input type="number" min={0} step="0.01" value={anest.valor_dia} data-campo="anest-valor"
                       onChange={e => setAnest({ ...anest, valor_dia: Number(e.target.value) })} />
              </label>
              <div className="cus-dias" data-campo="anest-dias">
                {DIAS_SEMANA.map((d, i) => (
                  <label key={i} className={'cus-dia' + (anest.dias_semana.includes(i) ? ' marcado' : '')} data-dia={i}>
                    <input type="checkbox" checked={anest.dias_semana.includes(i)}
                           onChange={e => setAnest({ ...anest, dias_semana: e.target.checked
                             ? [...anest.dias_semana, i].sort() : anest.dias_semana.filter(x => x !== i) })} />
                    {d}
                  </label>
                ))}
              </div>
              <label className="cus-check">
                <input type="checkbox" checked={anest.padrao} data-campo="anest-padrao"
                       onChange={e => setAnest({ ...anest, padrao: e.target.checked })} />
                <span>Padrão do hospital</span>
              </label>
              <label className="cus-check">
                <input type="checkbox" checked={anest.ativo} onChange={e => setAnest({ ...anest, ativo: e.target.checked })} />
                <span>Ativo</span>
              </label>
              <div className="cad-botoes">
                <button className="btn-primary btn-sm" disabled={ocupado} data-acao="salvar-anestesista"
                        onClick={() => void rodar(() => salvarAnestesista(clienteId, anest), () => setAnest(null))}>
                  <i className="fas fa-check" /> Salvar
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setAnest(null)}>Voltar</button>
              </div>
            </div>
          )}
          {c.anestesistas.length === 0 && (
            <div className="porvir" data-aviso="sem-anestesistas">
              <p>Nenhum anestesista cadastrado: a anestesia aparece como <b>faltando</b> em toda viabilidade.</p>
            </div>
          )}
          {c.anestesistas.length > 0 && (
            <div className="cus-tabela-caixa">
              <table className="cus-tabela" data-lista="anestesistas">
                <thead><tr><th>Nome</th><th>Valor/dia</th><th>Dias</th><th /></tr></thead>
                <tbody>{c.anestesistas.map((a: Anestesista) => (
                  <tr key={a.id} data-anestesista={a.nome} className={a.ativo ? '' : 'desligado'}>
                    <td>{a.nome}{a.padrao && <em className="cad-tag forte">padrão</em>}
                        {!a.ativo && <em className="cad-tag off">desativado</em>}</td>
                    <td>{reais(a.valor_dia)}</td>
                    <td>{a.dias_semana.map(d => DIAS_SEMANA[d]).join(', ') || '—'}</td>
                    <td>{pode && (
                      <button className="btn-secondary btn-sm" data-acao="editar-anestesista"
                              onClick={() => setAnest({ ...a })}><i className="fas fa-pen" /></button>)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {c && aba === 'dias' && (
        <div className="cus-corpo" data-aba-ativa="dias">
          <p className="cad-ajuda">
            Cada dia com anestesista de plantão ou com cirurgia marcada: o custo da anestesia do dia dividido pelas
            cirurgias, a soma do resultado previsto e se o <b>mínimo</b> que a diretoria exigiu está cumprido.
          </p>
          <div className="cus-form">
            <label className="cad-campo"><span>de</span>
              <input type="date" value={periodo.de} data-campo="dias-de" onChange={e => setPeriodo({ ...periodo, de: e.target.value })} />
            </label>
            <label className="cad-campo"><span>até (no máximo 62 dias)</span>
              <input type="date" value={periodo.ate} onChange={e => setPeriodo({ ...periodo, ate: e.target.value })} />
            </label>
            <button className="btn-secondary btn-sm" data-acao="ver-dias" onClick={() => void carregarDias()}>
              <i className="fas fa-magnifying-glass" /> Ver
            </button>
          </div>
          {dias && dias.length === 0 && <div className="porvir"><p>Nenhum dia com anestesista ou cirurgia no período.</p></div>}
          {dias && dias.length > 0 && (
            <div className="cus-tabela-caixa">
              <table className="cus-tabela" data-lista="dias">
                <thead><tr><th>Dia</th><th>Anestesista(s)</th><th>Cirurgias</th><th>Anestesia do dia</th>
                           <th>Por cirurgia</th><th>Mínimo exigido</th><th>Resultado previsto</th></tr></thead>
                <tbody>{dias.map(d => (
                  <tr key={d.dia} data-dia={d.dia} className={d.cumpre ? '' : 'cus-nao-cumpre'}>
                    <td><b>{dia(d.dia)}</b> <small>{d.dia_semana}</small></td>
                    <td>{d.anestesistas ?? <em className="cad-tag off">ninguém de plantão</em>}</td>
                    <td>{d.cirurgias}</td>
                    <td>{reais(d.custo_anestesia)}</td>
                    <td>{d.rateio === null ? '—' : reais(d.rateio)}</td>
                    <td data-cumpre={d.cumpre ? 'sim' : 'nao'}>
                      {d.minimo_exigido === null ? '—' : `${d.minimo_exigido} ${d.cumpre ? '✓' : '✗ não cumpre'}`}
                    </td>
                    <td className={d.resultado_previsto < 0 ? 'cus-negativo' : ''}>
                      {reais(d.resultado_previsto)}{d.incompletas > 0 && <small> ({d.incompletas} incompleta[s])</small>}
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}

function ConvenioOpme({ conv, pode, ocupado, salvar }: {
  conv: CadastrosDaViabilidade['convenios'][number];
  pode: boolean; ocupado: boolean;
  salvar: (modo: 'custo_mais_taxa' | 'tabela' | null, taxa: number | null) => void;
}) {
  const [modo, setModo] = useState<string>(conv.opme_modo ?? '');
  const [taxa, setTaxa] = useState<string>(conv.opme_taxa != null ? String(conv.opme_taxa) : '');
  return (
    <div className="cus-linha" data-convenio-opme={conv.nome}>
      <strong>{conv.nome}</strong>
      <select value={modo} disabled={!pode} data-campo="opme-modo" onChange={e => setModo(e.target.value)}>
        <option value="">sem regra (OPME fica faltando)</option>
        <option value="custo_mais_taxa">custo + taxa</option>
        <option value="tabela">pela tabela do convênio</option>
      </select>
      {modo === 'custo_mais_taxa' && (
        <label className="cad-campo"><span>taxa (%)</span>
          <input type="number" min={0} step="0.01" value={taxa} disabled={!pode} data-campo="opme-taxa"
                 onChange={e => setTaxa(e.target.value)} />
        </label>
      )}
      {pode && (
        <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="salvar-opme"
                onClick={() => salvar((modo || null) as 'custo_mais_taxa' | 'tabela' | null, taxa === '' ? null : Number(taxa))}>
          Salvar
        </button>
      )}
    </div>
  );
}
