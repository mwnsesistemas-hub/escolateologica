import { useEffect, useState } from 'react';
import {
  conveniosDoCliente, salvarConvenio, prestadores,
  type Convenio, type Prestador
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  CONVÊNIOS
 *
 *  A tela mais simples do pacote, e a que mais depende de um
 *  detalhe: o registro ANS.
 *
 *  ------------------------------------------------------------
 *  O ANS ENTRA SÓ COM DÍGITO
 *
 *  Ele é usado para montar guia e para falar com a Orizon. Um
 *  "301 " com espaço no fim, ou "301-9" com traço, chega ao
 *  convênio como código inválido — e volta como glosa, que é
 *  exame feito e não pago.
 *
 *  Quem limpa é o BANCO, em `salvar_convenio`. A tela só mostra
 *  o que ficou guardado, para a pessoa ver que o traço saiu.
 *
 *  ------------------------------------------------------------
 *  ⭐ 31/10/2026 — A LOGO E OS VALORES
 *
 *  O Tom, pedindo o PDF da guia TISS: *"o ideal é que saísse com
 *  logo do convênio"*, e *"aproveitando que vamos mexer no
 *  cadastro dos convênios... valores pagos pelos convênios de
 *  consulta e todos os exames que forem criados, **nada de valor
 *  no código e sim das tabelas**."*
 *
 *  ⚠️⚠️ E PREÇO TEM DATA. Gravar um valor novo cria uma VIGÊNCIA;
 *     não sobrescreve. Se sobrescrevesse, a consulta de março
 *     passaria a valer o preço de outubro e o relatório do
 *     trimestre passado mudaria sozinho — a mesma doença de
 *     "duas respostas para a mesma pergunta", em forma de tempo.
 *
 *  Por isso a gaveta de valores mostra, ao lado de cada preço,
 *  **desde quando** ele vale, e dá para abrir a história.
 * ============================================================
 */

const TIPOS: Record<string, string> = {
  consulta: 'Consultas',
  exame: 'Exames',
  procedimento: 'Procedimentos'
};

function emReais(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function emData(d: string | null): string {
  if (!d) return '';
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

export function Convenios({ clienteId, aoAbrirValores }: {
  clienteId: string;
  /** Leva para a tela de Valores daquele convênio. */
  aoAbrirValores?: (convenioId: string) => void;
}) {
  const { recado, avisar, fechar } = useAviso();

  const [lista, setLista] = useState<Convenio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState('');
  const [nome, setNome] = useState('');
  const [ans, setAns] = useState('');
  const [logo, setLogo] = useState('');
  const [ativo, setAtivo] = useState(true);

  /* ⭐⭐⭐ 02/11: os três campos que o `068` gravou e a tela
     escondia. Enquanto eles não apareciam aqui, um código
     errado na operadora não tinha como ser corrigido pelo
     painel — e código errado na operadora é a glosa 5060. */
  const [cnpjs, setCnpjs] = useState<Prestador[]>([]);
  const [prestadorId, setPrestadorId] = useState('');
  const [codigoOperadora, setCodigoOperadora] = useState('');
  const [ans2, setAns2] = useState('');
  const [indo, setIndo] = useState(false);


  useEffect(() => {
    let vivo = true;
    prestadores(clienteId)
      .then(l => { if (vivo) setCnpjs(l.filter(p => p.ativo)); })
      .catch(() => { if (vivo) setCnpjs([]); });
    return () => { vivo = false; };
  }, [clienteId]);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    conveniosDoCliente(clienteId, false)
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  function novo() {
    setEditando(''); setNome(''); setAns(''); setLogo(''); setAtivo(true);
    setPrestadorId(''); setCodigoOperadora(''); setAns2('');
    setAberto(true);
  }

  function editar(c: Convenio) {
    setEditando(c.id); setNome(c.nome);
    setAns(c.registro_ans ?? ''); setLogo(c.logo_url ?? '');
    setAtivo(c.ativo);
    setPrestadorId(c.prestador_id ?? '');
    setCodigoOperadora(c.codigo_na_operadora ?? '');
    setAns2(c.registro_ans_2 ?? '');
    setAberto(true);
  }

  async function salvar() {
    if (indo || nome.trim().length < 2) return;
    setIndo(true);
    try {
      const r = await salvarConvenio({
        clienteId, nome: nome.trim(), registroAns: ans,
        id: editando || null, ativo,
        /* ⚠️ Vazio é ' ' de propósito, e não `null`: `null` quer
           dizer "não mexi nisso" e manteria a logo antiga. Quem
           apagou o campo quer TIRAR a logo. */
        logoUrl: logo.trim() === '' ? ' ' : logo.trim(),
        /* ⚠️ A MESMA regra da logo, e ela já existia: vazio é
           ' ' (apaga), nunca `null` — `null` quer dizer "não
           mexi nisso". Mandar null aqui faria esta tela apagar
           calada o que a tela de Integração gravou. */
        codigoNaOperadora: codigoOperadora.trim() === '' ? ' ' : codigoOperadora.trim(),
        registroAns2: ans2.trim() === '' ? ' ' : ans2.trim(),
        /* uuid não tem "em branco": tirar o CNPJ é um pedido
           com nome próprio. */
        prestadorId: prestadorId || null,
        tirarPrestador: prestadorId === ''
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAberto(false); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function virar(c: Convenio) {
    try {
      const r = await salvarConvenio({
        clienteId, nome: c.nome, registroAns: c.registro_ans ?? undefined,
        id: c.id, ativo: !c.ativo
        /* ⭐ Sem `logoUrl`: ligar/desligar não mexe na logo. */
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <>
      <div className="page-header">
        <h2>Convênios</h2>
        <button className="btn-primary" data-acao="novo-convenio" onClick={novo}>
          <i className="fas fa-plus" /> Novo convênio
        </button>
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-id-card" />
          <h3>Nenhum convênio cadastrado</h3>
          <p>Particular também vale como convênio — é o que aparece no card.</p>
        </div>
      )}

      {!carregando && lista.map(c => (
        <div key={c.id} className={'cad-linha' + (c.ativo ? '' : ' inativo')}
             data-convenio={c.id}>
          {c.logo_url
            ? <img className="cnv-logo" src={c.logo_url} alt=""
                   data-campo="logo-na-lista"
                   onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <span className="cnv-logo cnv-logo-vazia" aria-hidden="true">
                <i className="fas fa-image" />
              </span>}
          <span className="cad-nome">{c.nome}</span>
          <span className="cad-tags">
            {!c.ativo && <em className="cad-tag off">desativado</em>}
            {c.registro_ans
              ? <em className="cad-tag neutro">ANS {c.registro_ans}</em>
              : <em className="cad-tag off">sem registro ANS</em>}
          </span>
          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="valores"
                    title="Valores pagos por este convênio"
                    onClick={() => aoAbrirValores?.(c.id)}>
              <i className="fas fa-sack-dollar" /> Valores
            </button>
            <button className="btn-secondary btn-sm" data-acao="editar"
                    onClick={() => editar(c)}>
              <i className="fas fa-pen" />
            </button>
            <button className="btn-secondary btn-sm" data-acao="virar"
                    title={c.ativo ? 'Desativar' : 'Reativar'}
                    onClick={() => virar(c)}>
              <i className={c.ativo ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} />
            </button>
          </div>
        </div>
      ))}

      {aberto && (
        <div className="modal" data-modal="convenio">
          <div className="modal-overlay" onClick={() => setAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editando ? 'Editar convênio' : 'Novo convênio'}</h3>
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
                       placeholder="Unimed, Bradesco Saúde, Particular…" />
              </div>
              <div className="form-group">
                <label>Registro ANS</label>
                <input type="text" maxLength={20} value={ans} data-campo="ans"
                       onChange={e => setAns(e.target.value)}
                       placeholder="só números" />
                <small className="wiz-dica">
                  Ponto, traço e espaço são removidos ao salvar. Um código com
                  traço volta do convênio como glosa.
                </small>
              </div>
              <div className="form-group">
                <label>Logo (endereço da imagem)</label>
                <input type="text" maxLength={400} value={logo} data-campo="logo"
                       onChange={e => setLogo(e.target.value)}
                       placeholder="https://…/unimed.png" />
                <small className="wiz-dica">
                  É a logo que sai no cabeçalho da guia TISS impressa. Precisa
                  começar com <code>https://</code>. Deixe vazio para não usar
                  nenhuma.
                </small>
                {logo.trim() !== '' && (
                  <div className="cnv-previa" data-bloco="previa-da-logo">
                    <img src={logo.trim()} alt="Prévia da logo"
                         onError={e => {
                           (e.target as HTMLImageElement).dataset.quebrou = 'sim';
                         }} />
                    <span>Prévia — é assim que ela sai na guia.</span>
                  </div>
                )}
              </div>
              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ FATURAMENTO

                  Três campos que o banco já guardava desde o
                  `068` e que a tela não mostrava. Enquanto eles
                  estiveram invisíveis, um código errado na
                  operadora não tinha como ser corrigido pelo
                  painel — e código errado na operadora é a
                  glosa 5060.
                  ════════════════════════════════════════════ */}
              <fieldset className="grupo-faturamento" data-bloco="faturamento">
                <legend>Faturamento</legend>

                <div className="form-group">
                  <label>Qual CNPJ assina a guia deste convênio</label>
                  <select value={prestadorId} data-campo="prestador"
                          onChange={e => setPrestadorId(e.target.value)}>
                    <option value="">— ainda não decidido —</option>
                    {cnpjs.map(p => (
                      <option key={p.id} value={p.id}>{p.nome_curto}</option>
                    ))}
                  </select>
                  <small className="wiz-dica">
                    Quem decide é o convênio, não o atendimento: no St James,
                    Bradesco e MedService assinam como Hospital; Allianz, Cassi
                    e Cabesp, como Jarimed.
                    {cnpjs.length === 0 && (
                      <> Nenhum CNPJ cadastrado ainda — cadastre em{' '}
                      <strong>CNPJs faturadores</strong>.</>
                    )}
                  </small>
                </div>

                <div className="form-group">
                  <label>Código do prestador nesta operadora</label>
                  <input type="text" maxLength={30} value={codigoOperadora}
                         data-campo="codigo-operadora"
                         onChange={e => setCodigoOperadora(e.target.value)}
                         placeholder="ex.: 457019" />
                  <small className="wiz-dica">
                    É do <strong>par CNPJ × operadora</strong>: o mesmo
                    hospital tem um número na Bradesco e outro na MedService.
                    {' '}⚠️ Não pode ser CNPJ nem CPF — a crítica 81 do Fature
                    bloqueia o recurso de glosa quando vem assim.
                  </small>
                </div>

                <div className="form-group">
                  <label>Segundo registro ANS</label>
                  <input type="text" maxLength={20} value={ans2}
                         data-campo="ans2"
                         onChange={e => setAns2(e.target.value)}
                         placeholder="só números" />
                  <small className="wiz-dica">
                    Algumas operadoras têm dois — a Bradesco tem 005711 e
                    421715. Mandar o errado para aquele beneficiário gera
                    negativa. Deixe vazio se a operadora só tem um.
                  </small>
                </div>
              </fieldset>

              <label className="dia-check">
                <input type="checkbox" checked={ativo} data-campo="ativo"
                       onChange={e => setAtivo(e.target.checked)} />
                Ativo
              </label>
              <div className="form-actions">
                <button className="btn-secondary" onClick={() => setAberto(false)}
                        disabled={indo}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-convenio"
                        disabled={indo || nome.trim().length < 2} onClick={salvar}>
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


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ A GAVETA DE VALORES SAIU DAQUI       (02/11/2026)
 *
 *  Ela nasceu no `066`, e em 02/11 nasceu também a tela
 *  **Valores — <convênio>** do módulo Faturamento, no formato
 *  que o Tom desenhou.
 *
 *  ⚠️ Por um dia, a pergunta *"quanto a Bradesco paga pela
 *     consulta?"* teve DUAS telas respondendo. As duas liam o
 *     mesmo banco hoje — e é exatamente assim que começa: duas
 *     telas certas, que vão divergir no dia em que uma ganhar
 *     um campo e a outra não.
 *
 *     Foi assim que o almoço sumiu de uma agenda e não da
 *     outra, no sistema antigo. É a doença que este projeto
 *     caça desde o começo, e eu a criei sem perceber.
 *
 *  ⭐ UMA TELA TEM UM DONO SÓ. O botão "Valores" agora LEVA
 *     para a tela, em vez de desenhar uma segunda.
 * ════════════════════════════════════════════════════════════ */
