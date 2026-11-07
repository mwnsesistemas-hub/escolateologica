import { useCallback, useEffect, useState } from 'react';
import {
  fornecedoresOpme, salvarFornecedorCirurgia, definirTiposDoFornecedor, tiposDeCirurgia,
  type FornecedorOpme, type TipoDeCirurgia
} from './dados';
import { Aviso, useAviso } from './Aviso';
import { formatarTelefone } from '../../nucleo/formato';

/**
 * ============================================================
 *  FORNECEDORES DE OPME                            (06/11/2026)
 *  O banco é o `079_fornecedores_opme.sql` (e o salvar do 064).
 *
 *  O Tom: *"não há cadastro de fornecedores de OPME no sistema.
 *  Lembre que eles precisam estar associados a Tipos de Cirurgias."*
 *
 *  Cada fornecedor diz para QUAIS TIPOS de cirurgia ele fornece. Na
 *  cotação, os ligados ao tipo da cirurgia aparecem primeiro, já
 *  marcados — mas dá para escolher qualquer outro (decisão do Tom).
 *
 *  ⭐ "Respondeu X de Y" mostra quem nunca responde: é o dado que
 *     decide se vale continuar pedindo cotação a alguém.
 * ============================================================
 */
const VAZIO = { id: null as string | null, nome: '', cnpj: '', telefone: '', email: '', ativo: true, tipos: [] as string[] };

export function FornecedoresOpme({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [lista, setLista] = useState<FornecedorOpme[]>([]);
  const [tipos, setTipos] = useState<TipoDeCirurgia[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [ocupado, setOcupado] = useState(false);
  const [carregou, setCarregou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([fornecedoresOpme(clienteId), tiposDeCirurgia(clienteId)]);
      setLista(f); setTipos(t.filter(x => x.ativo));
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setCarregou(true); }
  }, [clienteId, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar() {
    setOcupado(true);
    try {
      const r = await salvarFornecedorCirurgia({
        clienteId, id: form.id, nome: form.nome, cnpj: form.cnpj || null,
        telefone: form.telefone || null, email: form.email || null, ativo: form.ativo
      });
      if (!r.ok || !r.id) { avisar(r.motivo, false); return; }
      const t = await definirTiposDoFornecedor(r.id, form.tipos);
      avisar(t.ok ? 'Fornecedor salvo.' : t.motivo, t.ok);
      if (t.ok) { setForm(VAZIO); await carregar(); }
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setOcupado(false); }
  }

  const editar = (f: FornecedorOpme) => setForm({
    id: f.id, nome: f.nome, cnpj: f.cnpj ?? '', telefone: f.telefone ?? '', email: f.email ?? '',
    ativo: f.ativo, tipos: f.tipos.map(t => t.id)
  });
  const alternarTipo = (id: string) =>
    setForm(x => ({ ...x, tipos: x.tipos.includes(id) ? x.tipos.filter(t => t !== id) : [...x.tipos, id] }));

  return (
    <div className="card" data-tela="fornecedoresopme">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-truck-medical" /> Fornecedores de OPME</h3>
          <p className="cad-sub">Para quais tipos de cirurgia cada um fornece. Na cotação, os ligados ao tipo aparecem primeiro.</p>
        </div>
      </div>

      <section className="for-form" data-bloco="form-fornecedor">
        <h4>{form.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h4>
        <div className="cus-form">
          <label className="cad-campo"><span>nome</span>
            <input value={form.nome} data-campo="for-nome" onChange={e => setForm({ ...form, nome: e.target.value })} /></label>
          <label className="cad-campo"><span>CNPJ</span>
            <input value={form.cnpj} inputMode="numeric" onChange={e => setForm({ ...form, cnpj: e.target.value })} /></label>
          <label className="cad-campo"><span>WhatsApp</span>
            <input value={form.telefone} inputMode="tel" data-campo="for-telefone" placeholder="(11) 99999-9999"
                   onChange={e => setForm({ ...form, telefone: e.target.value })} /></label>
          <label className="cad-campo"><span>e-mail</span>
            <input value={form.email} type="email" onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label className="cad-check"><input type="checkbox" checked={form.ativo}
                 onChange={e => setForm({ ...form, ativo: e.target.checked })} /> ativo</label>
        </div>
        <div className="for-tipos" data-bloco="tipos-do-fornecedor">
          <span className="for-tipos-titulo">Fornece para</span>
          {tipos.length === 0 && <p className="viab-nota">Nenhum tipo de cirurgia cadastrado ainda (Cirurgias → Tipos de Cirurgia).</p>}
          {tipos.map(t => (
            <label key={t.id} className={'for-tipo' + (form.tipos.includes(t.id) ? ' marcado' : '')}>
              <input type="checkbox" checked={form.tipos.includes(t.id)} onChange={() => alternarTipo(t.id)} />
              {t.nome}
            </label>
          ))}
        </div>
        <div className="cad-botoes">
          <button className="btn-primary" disabled={ocupado || !form.nome.trim()} data-acao="salvar-fornecedor"
                  onClick={() => void salvar()}><i className="fas fa-check" /> Salvar fornecedor</button>
          {form.id && <button className="cot-mini fantasma" onClick={() => setForm(VAZIO)}>Cancelar</button>}
        </div>
      </section>

      {carregou && lista.length === 0 && (
        <div className="porvir" data-aviso="sem-fornecedores"><p>Nenhum fornecedor de OPME cadastrado ainda.</p></div>
      )}
      {lista.length > 0 && (
        <div className="cus-tabela-caixa">
          <table className="cus-tabela" data-tabela="fornecedores">
            <thead><tr><th>Fornecedor</th><th>Contato</th><th>Fornece para</th><th>Cotações</th><th /></tr></thead>
            <tbody>{lista.map(f => (
              <tr key={f.id} data-fornecedor={f.nome} className={f.ativo ? '' : 'for-inativo'}>
                <td><strong>{f.nome}</strong>{!f.ativo && <em className="cad-tag off">inativo</em>}</td>
                <td>{f.telefone ? formatarTelefone(f.telefone) : <em className="cot-sem-tel">sem WhatsApp</em>}
                    {f.email && <small className="for-email">{f.email}</small>}</td>
                <td>{f.tipos.length === 0
                      ? <em className="cad-tag off" data-sem-tipo="1">nenhum tipo</em>
                      : f.tipos.map(t => <span key={t.id} className="ldt-chip fixo for-chip">{t.nome}</span>)}</td>
                <td>{f.cotacoes === 0 ? '—' : <>respondeu {f.respondidas} de {f.cotacoes}{f.escolhidas > 0 && <small> · {f.escolhidas} escolhida(s)</small>}</>}</td>
                <td><button className="cot-mini" onClick={() => editar(f)}>Editar</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
