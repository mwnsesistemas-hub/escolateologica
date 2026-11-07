import { useCallback, useEffect, useState } from 'react';
import { contaDaCirurgia, salvarContaCirurgia, type ContaDaCirurgia } from './dados';
import { hojeNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  A CONTA DA CIRURGIA E O PREVISTO × REALIZADO    (05/11/2026)
 *  Entrega 4, Parte B. O banco é o `077_conta_e_relatorios.sql`.
 *
 *  O faturamento lança o faturado, a glosa e (quando o convênio
 *  paga) o recebido. A margem realizada é o banco que calcula:
 *  receita = recebido, ou faturado − glosa enquanto não pagou;
 *  custos = os da viabilidade aprovada, com a anestesia do dia real.
 *
 *  ⚠️ Só aparece para quem vê o faturamento ou é da diretoria — e
 *     só se lança com a cirurgia REALIZADA.
 * ============================================================
 */
const reais = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ContaCirurgia({ solicitacaoId, chave, mostrar }: {
  solicitacaoId: string; chave: string; mostrar: (texto: string, bom?: boolean) => void;
}) {
  const [c, setC] = useState<ContaDaCirurgia | null>(null);
  const [form, setForm] = useState({ faturado: '', faturado_em: '', glosa: '0', recebido: '', recebido_em: '', observacao: '' });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await contaDaCirurgia(solicitacaoId);
      setC(r);
      const k = r?.conta;
      setForm({ faturado: k ? String(k.valor_faturado) : '', faturado_em: k?.faturado_em ?? hojeNoFuso('America/Sao_Paulo'),
                glosa: k ? String(k.glosa) : '0', recebido: k?.recebido != null ? String(k.recebido) : '',
                recebido_em: k?.recebido_em ?? '', observacao: k?.observacao ?? '' });
    } catch (e: any) { mostrar(e?.message ?? 'Não consegui abrir a conta.', false); }
  }, [solicitacaoId, mostrar]);
  useEffect(() => { void carregar(); }, [carregar, chave]);

  if (!c || !c.realizada_a_cirurgia) return null;

  async function salvar() {
    setOcupado(true);
    try {
      const r = await salvarContaCirurgia(solicitacaoId, {
        faturado: Number(form.faturado), faturado_em: form.faturado_em, glosa: Number(form.glosa || 0),
        recebido: form.recebido === '' ? null : Number(form.recebido),
        recebido_em: form.recebido_em || null, observacao: form.observacao || null });
      mostrar(r.mensagem, r.ok);
      if (r.ok) await carregar();
    } catch (e: any) { mostrar(e?.message ?? 'Não consegui salvar.', false); }
    finally { setOcupado(false); }
  }

  const p = c.prevista, z = c.realizada;
  return (
    <section className="cir-bloco" data-bloco="conta-cirurgia">
      <h4><i className="fas fa-file-invoice-dollar" /> Conta da cirurgia</h4>
      {!c.tem_conta && <p className="viab-nota" data-aviso="sem-conta">O faturamento ainda não lançou a conta desta cirurgia.</p>}
      {(p || z) && (
        <div className="viab-itens-caixa">
          <table className="viab-itens" data-tabela="previsto-realizado">
            <thead><tr><th /><th>Previsto</th><th>Realizado</th></tr></thead>
            <tbody>
              <tr><td>Receita</td><td>{reais(p?.receita)}</td>
                  <td>{reais(z?.receita)}{z && <small> ({z.fonte})</small>}</td></tr>
              <tr><td>Custos diretos</td><td>{reais(p?.diretos)}</td><td>{reais(z?.diretos)}</td></tr>
              <tr><td>· dos quais anestesia</td><td>{reais(p?.anestesia)}</td>
                  <td>{reais(z?.anestesia)}{z?.cirurgias_no_dia && <small> ({z.cirurgias_no_dia} no dia)</small>}</td></tr>
              <tr><td>Custos fixos</td><td>{reais(p?.fixos)}</td><td>{reais(z?.fixos)}</td></tr>
              <tr className="viab-linha-pacote"><td>Resultado</td><td>{reais(p?.resultado)}</td>
                  <td data-valor="resultado-realizado" className={(z?.resultado ?? 0) < 0 ? 'falta' : ''}>{reais(z?.resultado)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {c.diferenca != null && (
        <p className={'viab-ponto-eq' + (c.diferenca < 0 ? ' ruim' : '')} data-diferenca={c.diferenca < 0 ? 'abaixo' : 'acima'}>
          {c.diferenca < 0 ? 'Abaixo' : 'Acima'} do previsto em {reais(Math.abs(c.diferenca))}.
        </p>
      )}
      {!c.tem_viabilidade && <p className="viab-nota">Esta cirurgia não tem viabilidade aprovada para comparar.</p>}

      {c.pode_lancar && (
        <div className="cus-form" data-bloco="lancar-conta">
          <label className="cad-campo"><span>faturado (R$)</span>
            <input type="number" min={0} step="0.01" value={form.faturado} data-campo="faturado"
                   onChange={e => setForm({ ...form, faturado: e.target.value })} /></label>
          <label className="cad-campo"><span>faturado em</span>
            <input type="date" value={form.faturado_em} onChange={e => setForm({ ...form, faturado_em: e.target.value })} /></label>
          <label className="cad-campo"><span>glosa (R$)</span>
            <input type="number" min={0} step="0.01" value={form.glosa} data-campo="glosa"
                   onChange={e => setForm({ ...form, glosa: e.target.value })} /></label>
          <label className="cad-campo"><span>recebido (R$)</span>
            <input type="number" min={0} step="0.01" value={form.recebido} data-campo="recebido"
                   onChange={e => setForm({ ...form, recebido: e.target.value })} /></label>
          <label className="cad-campo"><span>recebido em</span>
            <input type="date" value={form.recebido_em} data-campo="recebido-em"
                   onChange={e => setForm({ ...form, recebido_em: e.target.value })} /></label>
          <button className="btn-primary btn-sm" disabled={ocupado || form.faturado === ''} data-acao="salvar-conta"
                  onClick={() => void salvar()}><i className="fas fa-check" /> Salvar conta</button>
        </div>
      )}
    </section>
  );
}
