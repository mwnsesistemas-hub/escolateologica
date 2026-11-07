import { useEffect, useState } from 'react';
import { prestadores, salvarPrestador, apagarPrestador,
         type Prestador } from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  CNPJs FATURADORES
 *
 *  O St James fatura por DOIS CNPJs:
 *
 *    · Hospital Novo Jarinu  02.240.617/0001-00  — Bradesco,
 *      MedService
 *    · Jarimed               01.433.349/0001-80  — Allianz,
 *      Cassi, Cabesp
 *
 *  Quem decide qual CNPJ assina é o CONVÊNIO, não a tela. Foi a
 *  resposta do Tom em 02/11, e é o que os dados do Apps Script
 *  já mostravam.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE ESTA TELA MOSTRA O DÍGITO VERIFICADOR
 *
 *  Em 02/11, lendo a conversa com a Orizon, achei isto:
 *
 *      A Jarimed está cadastrada lá como
 *      01.433.349/0001-**00**
 *
 *  E esse CNPJ **não fecha**. O dígito certo é **80** — o "00"
 *  é o final do CNPJ do Hospital, colado no da Jarimed por
 *  engano em algum cadastro.
 *
 *  ⚠️ E pode ser exatamente por isso que a Jarimed "não consta
 *     na temporária" para habilitação. Um dígito.
 *
 *  Por isso a tela marca o CNPJ que não fecha em vermelho, com
 *  todas as letras. Um erro que só aparece quando o convênio
 *  recusa a guia é um erro que custa meses.
 * ============================================================
 */

function comMascara(cnpj: string): string {
  const d = (cnpj ?? '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}`
       + `/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * ⚠️ A MESMA conta do banco (`core.cnpj_fecha`), e isso é uma
 *    SEGUNDA resposta para a mesma pergunta — o defeito que este
 *    projeto caça desde o começo.
 *
 * ⭐ Ela só existe aqui para AVISAR enquanto a pessoa digita.
 *    Quem recusa de verdade é o banco. Se as duas discordarem,
 *    a que vale é a do banco, e a tela só terá avisado à toa.
 *    Guarda na tela nunca substitui a guarda no banco: a tela
 *    pode ser pulada pelo console do navegador.
 */
function cnpjFecha(cnpj: string): boolean {
  const d = (cnpj ?? '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(d[i]) * p1[i];
  const d1 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  const base = d.slice(0, 12) + String(d1);
  soma = 0;
  for (let i = 0; i < 13; i++) soma += Number(base[i]) * p2[i];
  const d2 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return d.slice(12) === `${d1}${d2}`;
}

export function Prestadores({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<Prestador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const { recado, avisar, fechar } = useAviso();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [razao, setRazao] = useState('');
  const [curto, setCurto] = useState('');
  const [cnes, setCnes] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    prestadores(clienteId)
      .then(l => { if (valido) { setLista(l); setErro(''); } })
      .catch(e => { if (valido) setErro(e.message ?? String(e)); })
      .finally(() => { if (valido) setCarregando(false); });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  function novo() {
    setEditando(''); setCnpj(''); setRazao(''); setCurto(''); setCnes('');
    setAtivo(true); setAberto(true);
  }

  function editar(p: Prestador) {
    setEditando(p.id); setCnpj(p.cnpj); setRazao(p.razao_social);
    setCurto(p.nome_curto); setCnes(p.cnes ?? ''); setAtivo(p.ativo);
    setAberto(true);
  }

  async function salvar() {
    if (indo) return;
    setIndo(true);
    try {
      const r = await salvarPrestador({
        clienteId, cnpj, razaoSocial: razao, nomeCurto: curto,
        cnes, id: editando || null, ativo
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAberto(false); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally { setIndo(false); }
  }

  async function desativar(p: Prestador) {
    try {
      const r = await apagarPrestador(clienteId, p.id);
      avisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  const quebrados = lista.filter(p => !cnpjFecha(p.cnpj));

  return (
    <>
      <Aviso recado={recado} aoFechar={fechar} />

      <div className="page-header">
        <h2><i className="fas fa-building-columns" /> CNPJs faturadores</h2>
        <button className="btn-primary" data-acao="novo-prestador" onClick={novo}>
          <i className="fas fa-plus" /> Novo CNPJ
        </button>
      </div>

      <p className="cad-sub">
        Quem assina cada guia é o <strong>convênio</strong> que decide:
        o CNPJ fica no cadastro do convênio, na tela de Convênios.
        Aqui ficam as empresas e os dados que vão no cabeçalho.
      </p>

      {quebrados.length > 0 && (
        <div className="erro-caixa" data-aviso="cnpj-nao-fecha">
          <strong>
            {quebrados.length === 1
              ? '1 CNPJ não fecha o dígito verificador.'
              : `${quebrados.length} CNPJs não fecham o dígito verificador.`}
          </strong>{' '}
          Um CNPJ com o dígito errado é aceito no cadastro da operadora e
          recusado na hora de faturar — e a recusa chega semanas depois,
          como glosa.
        </div>
      )}

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && lista.length === 0 && (
        <div className="porvir">
          <i className="fas fa-building-columns" />
          <p>Nenhum CNPJ faturador cadastrado ainda.</p>
        </div>
      )}

      {lista.map(p => (
        <div className="cad-linha" key={p.id} data-prestador={p.id}>
          <span className="cad-nome">{p.nome_curto}</span>
          <span className="cad-tags">
            <em className={cnpjFecha(p.cnpj) ? 'cad-tag neutro' : 'cad-tag off'}>
              {comMascara(p.cnpj)}
              {!cnpjFecha(p.cnpj) && ' — o dígito não fecha'}
            </em>
            {p.cnes
              ? <em className="cad-tag neutro">CNES {p.cnes}</em>
              : <em className="cad-tag off">sem CNES</em>}
            {!p.ativo && <em className="cad-tag off">desativado</em>}
          </span>
          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="copiar-cnpj"
              onClick={() => {
                navigator.clipboard?.writeText(p.cnpj.replace(/\D/g, ''));
                avisar('CNPJ copiado só com dígitos.');
              }}>
              <i className="fas fa-copy" /> Copiar
            </button>
            <button className="btn-secondary btn-sm" data-acao="editar-prestador"
              onClick={() => editar(p)}>
              <i className="fas fa-pen" />
            </button>
            {p.ativo && (
              <button className="btn-secondary btn-sm" data-acao="desativar-prestador"
                title="Desativar" onClick={() => desativar(p)}>
                <i className="fas fa-toggle-on" />
              </button>
            )}
          </div>
          <div className="cad-sub">{p.razao_social}</div>
        </div>
      ))}
      {aberto && (
        <div className="modal" data-modal="prestador">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editando ? 'Editar CNPJ faturador' : 'Novo CNPJ faturador'}</h3>
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>CNPJ *</label>
                <input type="text" autoFocus maxLength={20} value={cnpj}
                       data-campo="cnpj"
                       onChange={e => setCnpj(e.target.value)}
                       placeholder="02.240.617/0001-00" />
                {/* ⭐⭐⭐ O aviso aparece ENQUANTO digita, e a recusa
                    de verdade mora no banco. A tela avisa; o banco
                    decide. Tela pode ser pulada pelo console. */}
                {cnpj.replace(/\D/g, '').length === 14 && !cnpjFecha(cnpj) && (
                  <small className="erro-inline" data-aviso="digito-nao-fecha">
                    ⚠️ Esse CNPJ não fecha o dígito verificador. Um CNPJ errado
                    é aceito no cadastro da operadora e recusado na hora de
                    faturar — e a recusa chega semanas depois, como glosa.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Razão social *</label>
                <input type="text" maxLength={120} value={razao}
                       data-campo="razao-social"
                       onChange={e => setRazao(e.target.value)}
                       placeholder="HOSPITAL NOVO JARINU LTDA" />
                <small className="wiz-dica">
                  É o nome que sai no cabeçalho da guia, como está no cartão
                  CNPJ.
                </small>
              </div>
              <div className="form-group">
                <label>Nome curto *</label>
                <input type="text" maxLength={40} value={curto}
                       data-campo="nome-curto"
                       onChange={e => setCurto(e.target.value)}
                       placeholder="Hospital" />
                <small className="wiz-dica">
                  O que aparece nas telas e no seletor do convênio.
                </small>
              </div>
              <div className="form-group">
                <label>CNES</label>
                <input type="text" maxLength={20} value={cnes}
                       data-campo="cnes"
                       onChange={e => setCnes(e.target.value)}
                       placeholder="só números" />
              </div>
              <label className="dia-check">
                <input type="checkbox" checked={ativo} data-campo="ativo-prestador"
                       onChange={e => setAtivo(e.target.checked)} />
                Ativo
              </label>
              <div className="modal-acoes">
                <button className="btn-secondary"
                        data-acao="cancelar-prestador"
                        onClick={() => setAberto(false)}>Cancelar</button>
                <button className="btn-primary" data-acao="salvar-prestador"
                        onClick={salvar} disabled={indo}>
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
