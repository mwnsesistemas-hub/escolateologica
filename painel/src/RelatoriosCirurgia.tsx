import { useCallback, useEffect, useState } from 'react';
import { relatorioDeCirurgias, type RelatorioDeCirurgias } from './dados';
import { Aviso, useAviso } from './Aviso';
import { hojeNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  RELATÓRIOS DE CIRURGIA                          (05/11/2026)
 *  Entrega 4, Parte B. O banco é o `077_conta_e_relatorios.sql`.
 *
 *  Seis respostas para um período (pela data do PEDIDO): o funil,
 *  os prazos e o gargalo, a margem prevista × realizada (pelo dia em
 *  que a cirurgia foi REALIZADA — dinheiro se conta quando acontece),
 *  a OPME, os convênios e os atrasos por setor.
 *
 *  ⚠️ A tela não soma nada: os números vêm prontos do banco. Um
 *     total feito aqui seria a segunda resposta.
 * ============================================================
 */
const reais = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function RelatoriosCirurgia({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const hoje = hojeNoFuso('America/Sao_Paulo');
  const [periodo, setPeriodo] = useState({ de: hoje.slice(0, 8) + '01', ate: hoje });
  const [r, setR] = useState<RelatorioDeCirurgias | null>(null);
  const [carregou, setCarregou] = useState(false);

  const carregar = useCallback(async () => {
    try { setR(await relatorioDeCirurgias(clienteId, periodo.de, periodo.ate)); }
    catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setCarregou(true); }
  }, [clienteId, periodo, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (carregou && !r) {
    return (
      <div className="card" data-tela="relatorioscirurgia">
        <div className="porvir"><i className="fas fa-lock" /><p>Os relatórios de cirurgia são da diretoria.</p></div>
      </div>
    );
  }
  const maxFunil = Math.max(1, ...(r?.funil?.etapas ?? []).map(e => e.chegaram));
  const gargalo = (r?.prazos?.etapas ?? []).reduce<RelatorioDeCirurgias['prazos']['etapas'][number] | null>(
    (m, e) => (!m || e.dias_medios > m.dias_medios ? e : m), null);

  return (
    <div className="card" data-tela="relatorioscirurgia">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-chart-column" /> Relatórios de Cirurgia</h3>
          <p className="cad-sub">Pelo dia do pedido. A margem é pelo dia em que a cirurgia foi realizada.</p>
        </div>
      </div>
      <div className="cus-form">
        <label className="cad-campo"><span>de</span>
          <input type="date" value={periodo.de} data-campo="rel-de" onChange={e => setPeriodo({ ...periodo, de: e.target.value })} /></label>
        <label className="cad-campo"><span>até</span>
          <input type="date" value={periodo.ate} onChange={e => setPeriodo({ ...periodo, ate: e.target.value })} /></label>
      </div>
      {r?.erro && <div className="viab-faltando"><strong>{r.erro}</strong></div>}

      {r && !r.erro && (
        <div className="rel-grade">
          <section className="rel-bloco" data-relatorio="funil">
            <h4>Funil</h4>
            <p className="viab-nota">{r.funil.total} pedido(s) no período · {r.funil.negadas} negada(s) · {r.funil.canceladas} cancelada(s)</p>
            {r.funil.etapas.map(e => (
              <div key={e.chave} className="rel-barra" data-etapa-funil={e.chave}>
                <span className="rel-rotulo">{e.etapa}</span>
                <div className="rel-trilho"><div className="rel-cheio" style={{ width: `${(e.chegaram / maxFunil) * 100}%`, background: e.cor }} /></div>
                <b>{e.chegaram}</b>
              </div>
            ))}
          </section>

          <section className="rel-bloco" data-relatorio="prazos">
            <h4>Prazos e gargalo</h4>
            <div className="rel-numeros">
              <div><b data-valor="no-prazo">{pct(r.prazos.agendadas_no_prazo, r.prazos.agendadas)}%</b>
                   <span>agendadas em até {r.prazos.prazo_total} dias ({r.prazos.agendadas_no_prazo} de {r.prazos.agendadas})</span></div>
              <div className={r.prazos.abertas_fora_do_prazo > 0 ? 'ruim' : ''}><b data-valor="fora-do-prazo">{r.prazos.abertas_fora_do_prazo}</b>
                   <span>abertas e já fora do prazo</span></div>
            </div>
            <div className="cus-tabela-caixa">
              <table className="cus-tabela">
                <thead><tr><th>Etapa</th><th>Dias em média</th><th>Passagens</th><th>Depois do dia-limite</th></tr></thead>
                <tbody>{r.prazos.etapas.map(e => (
                  <tr key={e.chave} className={gargalo?.chave === e.chave ? 'rel-gargalo' : ''} data-etapa-prazo={e.chave}>
                    <td>{e.etapa}{gargalo?.chave === e.chave && <em className="cad-tag off">gargalo</em>}</td>
                    <td>{Number(e.dias_medios).toLocaleString('pt-BR')}</td><td>{e.passagens}</td><td>{e.fora_do_limite}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </section>

          {r.margem && (
            <section className="rel-bloco largo" data-relatorio="margem">
              <h4>Margem prevista × realizada</h4>
              <div className="rel-numeros">
                <div><b>{reais(r.margem.prevista_total)}</b><span>previsto (das que têm conta)</span></div>
                <div className={r.margem.realizada_total < r.margem.prevista_total ? 'ruim' : 'bom'}>
                  <b data-valor="realizado-total">{reais(r.margem.realizada_total)}</b><span>realizado</span></div>
                <div className={r.margem.sem_conta > 0 ? 'ruim' : ''}><b data-valor="sem-conta">{r.margem.sem_conta}</b>
                  <span>realizada(s) sem conta lançada</span></div>
              </div>
              <div className="cus-tabela-caixa">
                <table className="cus-tabela">
                  <thead><tr><th>Cirurgia</th><th>Convênio</th><th>Realizada</th><th>Previsto</th><th>Realizado</th><th>Diferença</th></tr></thead>
                  <tbody>{r.margem.cirurgias.map(m => (
                    <tr key={m.solicitacao_id} data-margem={m.numero}>
                      <td>{m.numero}<small> · {m.paciente}</small></td><td>{m.convenio ?? '—'}</td><td>{dia(m.realizada_em)}</td>
                      <td>{reais(m.prevista)}</td>
                      <td>{m.tem_conta ? <>{reais(m.realizada)} <small>({m.fonte})</small></> : <em className="cad-tag off">sem conta</em>}</td>
                      <td className={(m.diferenca ?? 0) < 0 ? 'cus-negativo' : ''}>{reais(m.diferenca)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rel-bloco" data-relatorio="opme">
            <h4>OPME</h4>
            <div className="rel-numeros">
              <div><b data-valor="com-3">{pct(r.opme.com_3_propostas, r.opme.escolhidas)}%</b>
                   <span>com 3 propostas ({r.opme.com_3_propostas} de {r.opme.escolhidas})</span></div>
              <div><b>{r.opme.com_motivo}</b><span>escolhida(s) com menos, com motivo</span></div>
              <div><b>{reais(r.opme.total_escolhido)}</b><span>total escolhido</span></div>
              <div className="bom"><b data-valor="economia">{reais(r.opme.economia_sobre_a_maior)}</b><span>abaixo da proposta mais cara</span></div>
            </div>
          </section>

          <section className="rel-bloco largo" data-relatorio="convenios">
            <h4>Convênios</h4>
            <div className="cus-tabela-caixa">
              <table className="cus-tabela">
                <thead><tr><th>Convênio</th><th>Cirurgias</th><th>Negadas</th><th>Dias p/ autorizar</th>
                  {r.financeiro && <><th>Faturado</th><th>Glosa</th><th>Recebido</th></>}</tr></thead>
                <tbody>{r.convenios.map(k => (
                  <tr key={k.convenio} data-convenio-rel={k.convenio}>
                    <td>{k.convenio}</td><td>{k.cirurgias}</td><td>{k.negadas}</td>
                    <td>{k.dias_autorizacao == null ? '—' : Number(k.dias_autorizacao).toLocaleString('pt-BR')}</td>
                    {r.financeiro && <><td>{reais(k.faturado)}</td>
                      <td>{reais(k.glosa)}{k.glosa_percentual != null && <small> ({Number(k.glosa_percentual).toLocaleString('pt-BR')}%)</small>}</td>
                      <td>{reais(k.recebido)}</td></>}
                  </tr>))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rel-bloco" data-relatorio="atrasos">
            <h4>Atrasos por setor</h4>
            {r.atrasos.length === 0 && <p className="viab-nota">Nenhuma pendência com prazo no período.</p>}
            {r.atrasos.length > 0 && (
              <div className="cus-tabela-caixa">
                <table className="cus-tabela">
                  <thead><tr><th>Setor</th><th>Abertas atrasadas</th><th>Feitas depois do prazo</th><th>Feitas no prazo</th></tr></thead>
                  <tbody>{r.atrasos.map(a => (
                    <tr key={a.setor} data-atraso-setor={a.setor} className={a.abertas_atrasadas > 0 ? 'cus-nao-cumpre' : ''}>
                      <td>{a.setor}</td><td>{a.abertas_atrasadas}</td><td>{a.concluidas_depois_do_prazo}</td><td>{a.concluidas_no_prazo}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
