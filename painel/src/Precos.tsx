import { useEffect, useMemo, useState } from 'react';
import {
  planilhaDePrecos, colunasDaPlanilha, importarPrecos, reajustarPrecos,
  conveniosDoCliente, resumoDoConvenio, efeitoDoReajusteNoPassado,
  precosDoConvenio, salvarPrecoConvenio, vigenciasDoPreco,
  type LinhaDaPlanilha, type ColunaDaPlanilha,
  type RespostaImportacao, type RespostaReajuste, type Convenio,
  type ResumoDoConvenio, type EfeitoNoPassado,
  type PrecoDoConvenio, type VigenciaDoPreco
} from './dados';
import { Aviso, useAviso } from './Aviso';
import { hojeNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  VALORES — <CONVÊNIO>
 *
 *  A tela que o Tom desenhou em 02/11, no esboço "Precos":
 *
 *      Valores — Bradesco
 *      Faturado por Hospital Novo Jarinu · 41 serviços · 9 sem valor
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ UMA TELA TEM UM DONO SÓ
 *
 *  Até hoje a pergunta *"quanto a Bradesco paga pela consulta?"*
 *  tinha DUAS telas respondendo: a gaveta dentro de Convênios
 *  (nascida no `066`) e a tabela de preços (nascida no `069`).
 *
 *  Duas telas que respondem a mesma pergunta acabam
 *  discordando — é a doença que este projeto caça desde o
 *  começo, e eu a tinha criado sem perceber.
 *
 *  Esta tela é a única. A gaveta virou um link para cá.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ OS TRÊS QUADROS DA PRÉVIA
 *
 *      VÃO SUBIR        FICAM DE FORA      EFEITO NO MÊS PASSADO
 *      32 serviços      9 sem valor        nenhum
 *
 *  O terceiro é o que importa. "Preço tem data" (a regra do
 *  `066`) é metade; a outra metade é que **data tem
 *  consequência**: uma vigência para trás muda o preço de
 *  consultas JÁ ATENDIDAS, e com ele o relatório de um mês que
 *  o hospital já fechou.
 *
 *  Isso não é erro do sistema — é o sistema fazendo o que
 *  mandaram. O defeito seria fazer isso calado.
 * ============================================================
 */

const NOME_DO_TIPO: Record<string, string> = {
  consulta: 'Consultas',
  exame: 'Exames',
  procedimento: 'Procedimentos'
};

function emReais(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2,
                                     maximumFractionDigits: 2 });
}

function comMoeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function emData(d: string | null): string {
  if (!d) return '';
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

function comMascaraCNPJ(cnpj: string | null): string {
  const d = (cnpj ?? '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj ?? '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}`
       + `/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * ⚠️ CSV com PONTO E VÍRGULA e BOM, de propósito.
 *
 *    O Excel em português abre CSV separado por vírgula tudo
 *    numa coluna só, e come os acentos sem o BOM.
 *
 *    ⭐ "Prova que roda num mundo mais fácil que o do cliente
 *       prova que o código funciona naquele mundo."
 */
function montarCSV(linhas: LinhaDaPlanilha[], colunas: ColunaDaPlanilha[]): string {
  const cabecalho = ['Codigo TUSS', 'Descricao', 'Tipo',
                     ...colunas.map(c => c.nome)];
  const corpo = linhas.map(l => [
    l.codigo_tuss ?? '',
    l.descricao,
    l.tipo,
    ...colunas.map(c => emReais(l.valores?.[c.convenio_id]))
  ]);
  const escapa = (s: string) =>
    /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return '﻿' + [cabecalho, ...corpo]
    .map(l => l.map(c => escapa(String(c))).join(';')).join('\r\n');
}

function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => c.trim() !== ''));
}

/**
 * ⚠️ "1.234,56" é mil duzentos e trinta e quatro. "1234.56"
 *    também. E "" é VAZIO, não zero.
 *
 *    O Apps Script perdeu o zero à esquerda de dois CNPJs por
 *    confiar no que o Excel devolve. Número que vem de planilha
 *    é texto até prova em contrário.
 */
function lerValor(bruto: string): number | null {
  const t = (bruto ?? '').trim();
  if (t === '') return null;
  const limpo = t.replace(/[^\d.,-]/g, '');
  if (limpo === '') return null;
  const n = limpo.includes(',')
    ? Number(limpo.replace(/\./g, '').replace(',', '.'))
    : Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** O que o reajuste faria com UM valor — a mesma conta do banco. */
function comReajuste(v: number, pct: number, modo: string): number {
  const bruto = v * (1 + pct / 100);
  if (modo === 'real') return Math.round(bruto);
  if (modo === 'dez_centavos') return Math.round(bruto * 10) / 10;
  return Math.round(bruto * 100) / 100;
}

export function Precos({ clienteId, fuso = 'America/Sao_Paulo', convenioInicial }: {
  clienteId: string;
  fuso?: string;
  /** Quando a tela é aberta a partir de um convênio. */
  convenioInicial?: string | null;
}) {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [convenioId, setConvenioId] = useState(convenioInicial ?? '');
  const [resumo, setResumo] = useState<ResumoDoConvenio | null>(null);
  const [linhas, setLinhas] = useState<PrecoDoConvenio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const { recado, avisar, fechar } = useAviso();

  // ---------- editar um preço ----------
  const [editando, setEditando] = useState<string | null>(null);
  const [valorNovo, setValorNovo] = useState('');
  const [desdeNovo, setDesdeNovo] = useState('');
  const [historia, setHistoria] = useState<VigenciaDoPreco[] | null>(null);
  const [historiaDe, setHistoriaDe] = useState<string | null>(null);

  // ---------- reajuste ----------
  const [abrindoReajuste, setAbrindoReajuste] = useState(false);
  const [percentual, setPercentual] = useState('');
  const [arredondar, setArredondar] =
    useState<'centavo' | 'dez_centavos' | 'real'>('centavo');
  const [vigenciaReajuste, setVigenciaReajuste] = useState('');
  const [servicoReajuste, setServicoReajuste] = useState('');
  const [previa, setPrevia] = useState<RespostaReajuste | null>(null);
  const [passado, setPassado] = useState<EfeitoNoPassado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // ---------- planilha ----------
  const [planilha, setPlanilha] = useState<LinhaDaPlanilha[]>([]);
  const [colunas, setColunas] = useState<ColunaDaPlanilha[]>([]);
  const [paraImportar, setParaImportar] =
    useState<Array<{ servico_id: string; valores: Record<string, number | null> }>>([]);
  const [ensaio, setEnsaio] = useState<RespostaImportacao | null>(null);
  const [vigenciaImport, setVigenciaImport] = useState('');

  useEffect(() => {
    let valido = true;
    Promise.all([
      conveniosDoCliente(clienteId),
      planilhaDePrecos(clienteId),
      colunasDaPlanilha(clienteId)
    ])
      .then(([cv, pl, co]) => {
        if (!valido) return;
        setConvenios(cv); setPlanilha(pl); setColunas(co); setErro('');
        if (!convenioId) {
          const primeiro = cv.find(c => c.ativo);
          if (primeiro) setConvenioId(primeiro.id);
        }
      })
      .catch(e => { if (valido) setErro(e.message ?? String(e)); })
      .finally(() => { if (valido) setCarregando(false); });
    return () => { valido = false; };
  }, [clienteId]);

  function carregarConvenio(id: string) {
    if (!id) { setResumo(null); setLinhas([]); return; }
    setCarregando(true);
    Promise.all([resumoDoConvenio(clienteId, id), precosDoConvenio(clienteId, id)])
      .then(([r, l]) => { setResumo(r); setLinhas(l); setErro(''); })
      .catch(e => setErro(e.message ?? String(e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => { carregarConvenio(convenioId); }, [convenioId, clienteId]);

  /* ⭐ A prévia é apagada por QUALQUER mudança de campo.
     Aplicar um reajuste de 10% olhando o resumo de 5% seria
     pior do que não ter resumo nenhum. */
  function esquecerPrevia() { setPrevia(null); setPassado(null); }

  const porTipo = useMemo(() => {
    const t = (busca ?? '').trim().toLocaleLowerCase('pt-BR');
    const filtradas = !t ? linhas : linhas.filter(l =>
      l.servico.toLocaleLowerCase('pt-BR').includes(t)
      || (l.codigo_tuss ?? '').includes(t));
    const mapa = new Map<string, PrecoDoConvenio[]>();
    for (const l of filtradas) {
      if (!mapa.has(l.tipo)) mapa.set(l.tipo, []);
      mapa.get(l.tipo)!.push(l);
    }
    return [...mapa.entries()];
  }, [linhas, busca]);

  const pct = Number(String(percentual).replace(',', '.'));
  const pctVale = Number.isFinite(pct) && pct !== 0;

  async function verPrevia() {
    if (!convenioId) { avisar('Escolha o convênio.', false); return; }
    if (!pctVale) { avisar('Informe o percentual — por exemplo 8,5.', false); return; }
    setOcupado(true);
    try {
      /* ⭐⭐⭐ As DUAS perguntas de uma vez: "quanto sobe" e
         "quanto do passado isso mexe". Perguntar só a primeira
         foi o que a tela fazia até hoje. */
      const [r, e] = await Promise.all([
        reajustarPrecos({
          clienteId, convenioId, percentual: pct,
          vigenteDesde: vigenciaReajuste || null,
          arredondar, servicoId: servicoReajuste || null, ensaio: true
        }),
        efeitoDoReajusteNoPassado({
          clienteId, convenioId,
          vigenteDesde: vigenciaReajuste || null,
          servicoId: servicoReajuste || null
        })
      ]);
      setPrevia(r); setPassado(e);
      if (!r.ok) avisar(r.mensagem, false);
    } catch (err: any) {
      avisar(err.message ?? String(err), false);
    } finally { setOcupado(false); }
  }

  async function aplicarReajuste() {
    setOcupado(true);
    try {
      const r = await reajustarPrecos({
        clienteId, convenioId, percentual: pct,
        vigenteDesde: vigenciaReajuste || null,
        arredondar, servicoId: servicoReajuste || null, ensaio: false
      });
      avisar(r.mensagem, r.ok);
      esquecerPrevia(); setPercentual(''); setAbrindoReajuste(false);
      carregarConvenio(convenioId);
      planilhaDePrecos(clienteId).then(setPlanilha).catch(() => {});
    } catch (err: any) {
      avisar(err.message ?? String(err), false);
    } finally { setOcupado(false); }
  }

  async function gravarPreco(servicoId: string) {
    const v = lerValor(valorNovo);
    if (v === null) { avisar('Informe o valor.', false); return; }
    setOcupado(true);
    try {
      const r = await salvarPrecoConvenio({
        clienteId, convenioId, servicoId, valor: v,
        vigenteDesde: desdeNovo || null
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) {
        setEditando(null); setValorNovo(''); setDesdeNovo('');
        carregarConvenio(convenioId);
        planilhaDePrecos(clienteId).then(setPlanilha).catch(() => {});
      }
    } catch (err: any) {
      avisar(err.message ?? String(err), false);
    } finally { setOcupado(false); }
  }

  function baixar() {
    const csv = montarCSV(planilha, colunas);
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    /* ⚠️ `toISOString()` é UTC SEMPRE, e a guarda do relógio me
       pegou nesta linha. Das 21h à meia-noite de Brasília o
       arquivo sairia carimbado com o dia seguinte. */
    a.download = `precos-${hojeNoFuso(fuso)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar('Planilha baixada. Abra no Excel, preencha e volte aqui.');
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;

    const tabela = lerCSV(await arq.text());
    if (tabela.length < 2) { avisar('A planilha está vazia.', false); return; }

    /* ⭐ As colunas são casadas pelo NOME DO CONVÊNIO do
       cabeçalho, contra o cadastro. Coluna que não casa é
       ignorada e DITA — nunca adivinhada. */
    const cab = tabela[0].map(c => c.trim());
    const porColuna = new Map<number, string>();
    const naoCasaram: string[] = [];
    cab.forEach((nome, i) => {
      if (i < 3) return;
      const c = colunas.find(x =>
        x.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'));
      if (c) porColuna.set(i, c.convenio_id);
      else if (nome) naoCasaram.push(nome);
    });

    /* O serviço é achado pelo TUSS; sem TUSS, pela descrição
       exata. Nunca por "começa com" — foi a lição de 14/09, em
       que "Cabe" casou com "Cabesp". */
    const porTuss = new Map(planilha.filter(l => l.codigo_tuss)
      .map(l => [l.codigo_tuss!.replace(/\D/g, ''), l.servico_id]));
    const porNome = new Map(planilha.map(l =>
      [l.descricao.trim().toLocaleLowerCase('pt-BR'), l.servico_id]));

    const pedido: Array<{ servico_id: string; valores: Record<string, number | null> }> = [];
    let semServico = 0;
    for (const l of tabela.slice(1)) {
      const tuss = (l[0] ?? '').replace(/\D/g, '');
      const id = (tuss && porTuss.get(tuss))
        || porNome.get((l[1] ?? '').trim().toLocaleLowerCase('pt-BR'));
      if (!id) { semServico++; continue; }
      const valores: Record<string, number | null> = {};
      for (const [i, cid] of porColuna) {
        const v = lerValor(l[i] ?? '');
        if (v !== null) valores[cid] = v;   // vazio NÃO entra
      }
      if (Object.keys(valores).length) pedido.push({ servico_id: id, valores });
    }

    if (!pedido.length) {
      avisar('Nenhuma linha da planilha casou com um serviço do cadastro.', false);
      return;
    }

    setParaImportar(pedido);
    setOcupado(true);
    try {
      const r = await importarPrecos({
        clienteId, linhas: pedido,
        vigenteDesde: vigenciaImport || null, ensaio: true
      });
      setEnsaio(r);
      if (naoCasaram.length) {
        avisar('Colunas ignoradas (não são convênios do cadastro): '
          + naoCasaram.join(', '), false);
      } else if (semServico) {
        avisar(`${semServico} linha(s) sem serviço correspondente foram ignoradas.`,
          false);
      }
    } catch (err: any) {
      avisar(err.message ?? String(err), false);
    } finally { setOcupado(false); }
  }

  async function gravarImportacao() {
    setOcupado(true);
    try {
      const r = await importarPrecos({
        clienteId, linhas: paraImportar,
        vigenteDesde: vigenciaImport || null, ensaio: false
      });
      avisar(r.mensagem, r.ok);
      setEnsaio(null); setParaImportar([]);
      carregarConvenio(convenioId);
      planilhaDePrecos(clienteId).then(setPlanilha).catch(() => {});
    } catch (err: any) {
      avisar(err.message ?? String(err), false);
    } finally { setOcupado(false); }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  const semTuss = linhas.filter(l => !l.codigo_tuss || !l.codigo_tuss.trim()).length;

  return (
    <>
      <Aviso recado={recado} aoFechar={fechar} />

      <nav className="migalhas" data-bloco="migalhas">
        Faturamento → Convênios → <strong>{resumo?.nome ?? '…'}</strong>
      </nav>

      <div className="page-header">
        <h2>
          {resumo?.logo_url
            ? <img className="cnv-logo" src={resumo.logo_url} alt=""
                   data-campo="logo-do-convenio" />
            : <i className="fas fa-table-list" />}
          {' '}Valores — {resumo?.nome ?? ''}
        </h2>
        <div className="cad-botoes">
          <button className="btn-secondary" data-acao="baixar-planilha"
            onClick={baixar} disabled={!planilha.length}>
            <i className="fas fa-download" /> Baixar planilha
          </button>
          <label className="btn-secondary" style={{ cursor: 'pointer' }}>
            <i className="fas fa-upload" /> Importar planilha
            <input type="file" accept=".csv,text/csv" hidden
              data-acao="arquivo-precos"
              onChange={aoEscolherArquivo} disabled={ocupado} />
          </label>
          <button className="btn-primary" data-acao="abrir-reajuste"
            onClick={() => { setAbrindoReajuste(v => !v); esquecerPrevia(); }}
            disabled={!convenioId}>
            <i className="fas fa-percent" /> Reajustar tudo
          </button>
        </div>
      </div>

      {/* ⭐ O cabeçalho do esboço: quem assina, quantos serviços,
          quantos sem valor — tudo de UMA chamada. */}
      <p className="cad-sub" data-campo="resumo-do-convenio">
        {resumo?.prestador_nome
          ? <>Faturado por <strong>{resumo.prestador_nome}</strong>
              {' '}<small>{comMascaraCNPJ(resumo.prestador_cnpj)}</small></>
          : <em className="cad-tag off">sem CNPJ faturador</em>}
        {' · '}{resumo?.servicos ?? 0} serviços
        {' · '}
        <strong className={resumo?.sem_valor ? 'ruim' : undefined}
                data-campo="sem-valor">
          {resumo?.sem_valor ?? 0} sem valor
        </strong>
      </p>

      {convenios.length > 1 && (
        <label className="troca-convenio">
          Convênio
          <select value={convenioId} data-campo="trocar-convenio"
            onChange={e => { setConvenioId(e.target.value); esquecerPrevia(); }}>
            {convenios.filter(c => c.ativo).map(c =>
              <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}

      {/* ⚠️ O aviso fixo do esboço. Ele não é decoração: é a
          regra do `066` dita em português, no lugar onde a
          pessoa está prestes a mudar um valor. */}
      <div className="faixa-aviso" data-aviso="preco-tem-data">
        <strong>Mudar um valor não reescreve o passado.</strong> Cria uma
        vigência nova. O que já foi atendido continua valendo o preço daquele
        dia — inclusive nos relatórios que você já fechou.
      </div>

      {/* ---------- o reajuste ---------- */}
      {abrindoReajuste && (
        <div className="cartao" data-bloco="reajustar">
          <div className="linha-campos">
            <label>
              Item (em branco = o convênio inteiro)
              <select value={servicoReajuste} data-campo="servico-reajuste"
                onChange={e => { setServicoReajuste(e.target.value); esquecerPrevia(); }}>
                <option value="">todos os itens</option>
                {linhas.map(l =>
                  <option key={l.servico_id} value={l.servico_id}>{l.servico}</option>)}
              </select>
            </label>
            <label>
              Percentual
              <input type="text" inputMode="decimal" placeholder="6,5"
                data-campo="percentual" value={percentual}
                onChange={e => { setPercentual(e.target.value); esquecerPrevia(); }} />
              <small>Negativo abaixa: −3 tira 3%.</small>
            </label>
            <label>
              Arredondar para
              <select value={arredondar} data-campo="arredondar"
                onChange={e => { setArredondar(e.target.value as any); esquecerPrevia(); }}>
                <option value="centavo">centavo</option>
                <option value="dez_centavos">dez centavos</option>
                <option value="real">real</option>
              </select>
            </label>
            <label>
              Passa a valer em
              <input type="date" value={vigenciaReajuste} data-campo="vigencia-reajuste"
                onChange={e => { setVigenciaReajuste(e.target.value); esquecerPrevia(); }} />
              <small>Em branco = hoje.</small>
            </label>
          </div>
          <button className="btn-secondary" data-acao="ensaiar-reajuste"
            onClick={verPrevia} disabled={ocupado}>
            <i className="fas fa-eye" /> Ver o que mudaria
          </button>
        </div>
      )}

      {previa && (
        <div className="previa" data-bloco="previa-do-reajuste">
          <div className="previa-topo">
            <div>
              <strong>Prévia do reajuste — nada foi gravado ainda</strong>
              <small>
                {pct > 0 ? '+' : ''}{percentual}% em {previa.quantos} serviço(s)
                {' '}com preço, a partir de{' '}
                {emData(vigenciaReajuste || hojeNoFuso(fuso))}, arredondando ao{' '}
                {arredondar === 'real' ? 'real'
                  : arredondar === 'dez_centavos' ? 'dez centavos' : 'centavo'}
              </small>
            </div>
            <div className="cad-botoes">
              <button className="btn-secondary" data-acao="cancelar-reajuste"
                onClick={esquecerPrevia}>Cancelar</button>
              <button className="btn-primary" data-acao="gravar-reajuste"
                onClick={aplicarReajuste}
                disabled={ocupado || !previa.quantos}>
                Gravar as {previa.quantos} vigências
              </button>
            </div>
          </div>

          <div className="previa-quadros">
            <div data-quadro="vao-subir">
              <small>VÃO SUBIR</small>
              <strong>{previa.quantos} serviços</strong>
            </div>
            <div data-quadro="ficam-de-fora">
              <small>FICAM DE FORA</small>
              <strong className={previa.sem_preco ? 'ruim' : undefined}>
                {previa.sem_preco} sem valor
              </strong>
            </div>
            {/* ⭐⭐⭐ O quadro que não existia até hoje. */}
            <div data-quadro="efeito-no-passado">
              <small>EFEITO NO MÊS PASSADO</small>
              {passado && passado.atendimentos > 0
                ? <strong className="ruim" data-campo="efeito-retroativo">
                    {passado.atendimentos} atendimentos já feitos
                  </strong>
                : <strong className="bom" data-campo="efeito-retroativo">
                    nenhum
                  </strong>}
            </div>
          </div>

          {!!passado && passado.atendimentos > 0 && (
            <div className="erro-caixa" data-aviso="reajuste-retroativo">
              <strong>Esta data é para trás.</strong>{' '}
              {passado.atendimentos} atendimento(s) que já aconteceram — desde{' '}
              {passado.desde_o_mes}, em {passado.meses} mês(es) — passariam a
              valer o preço novo. Isso muda relatórios que você já fechou e já
              conferiu, no total de {comMoeda(passado.valor_hoje)} pelo preço
              de hoje.
              <br />
              Se é isso mesmo que você quer (lançar um reajuste que já
              aconteceu), pode gravar. Se não, mude a data.
            </div>
          )}
        </div>
      )}

      {/* ---------- importar ---------- */}
      {ensaio && (
        <div className="previa" data-bloco="ensaio-importacao">
          <div className="previa-topo">
            <div>
              <strong>Importação — nada foi gravado ainda</strong>
              <small>
                {ensaio.novos} preço(s) novo(s) · {ensaio.reajustes} mudança(s)
                {' '}de valor · {ensaio.iguais} já estavam assim
                {ensaio.recusados > 0 && ` · ${ensaio.recusados} recusado(s)`}
              </small>
            </div>
            <div className="cad-botoes">
              <button className="btn-secondary" data-acao="cancelar-importacao"
                onClick={() => { setEnsaio(null); setParaImportar([]); }}>
                Cancelar
              </button>
              <button className="btn-primary" data-acao="gravar-importacao"
                onClick={gravarImportacao} disabled={ocupado}>
                <i className="fas fa-check" /> Gravar
              </button>
            </div>
          </div>
          <label className="linha-campos">
            Os valores passam a valer em
            <input type="date" value={vigenciaImport} data-campo="vigencia-import"
              onChange={e => setVigenciaImport(e.target.value)} />
            <small>Em branco = hoje.</small>
          </label>
        </div>
      )}

      {/* ---------- a lista ---------- */}
      <div className="cartao">
        <div className="prc-topo">
          <input type="text" className="prc-busca" data-campo="busca-servico"
            placeholder="Procurar consulta ou exame…"
            value={busca} onChange={e => setBusca(e.target.value)} />
          {!!resumo?.sem_valor && (
            <em className="cad-tag off" data-campo="chip-sem-valor">
              {resumo.sem_valor} sem valor
            </em>
          )}
        </div>

        {carregando && (
          <div className="loading-placeholder"><div className="spinner" />
            <p>Carregando…</p></div>
        )}

        {!carregando && !linhas.length && (
          <div className="porvir">
            <i className="fas fa-table-list" />
            <p>Nenhum serviço cadastrado ainda.</p>
          </div>
        )}

        {porTipo.map(([tipo, itens]) => (
          <div key={tipo} data-grupo={tipo}>
            <div className="prc-grupo">{NOME_DO_TIPO[tipo] ?? tipo}</div>
            <table className="tabela" data-tabela="precos">
              <thead>
                <tr>
                  <th>Código TUSS</th>
                  <th>Serviço</th>
                  <th style={{ textAlign: 'right' }}>Valor vigente</th>
                  <th>Desde</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map(l => {
                  const vaiSubir = previa && previa.quantos > 0 && l.valor !== null
                    && (!servicoReajuste || servicoReajuste === l.servico_id)
                    && pctVale;
                  return (
                    <tr key={l.servico_id} data-servico={l.servico_id}
                        data-sem-valor={l.valor === null ? 'sim' : 'nao'}
                        className={l.valor === null ? 'linha-sem-valor' : undefined}>
                      <td>{l.codigo_tuss
                        || <em className="cad-tag off">falta</em>}</td>
                      <td>{l.servico}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.valor === null
                          ? <em className="cad-tag off">sem valor</em>
                          : <>
                              <strong>{comMoeda(l.valor)}</strong>
                              {vaiSubir && (
                                <small className="vai-subir" data-campo="vai-subir">
                                  → {comMoeda(comReajuste(l.valor, pct, arredondar))}
                                </small>
                              )}
                            </>}
                      </td>
                      <td>{l.vigente_desde ? emData(l.vigente_desde) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.vigencias > 1 && (
                          <button className="btn-secondary btn-sm"
                            data-acao="ver-vigencias"
                            onClick={() => {
                              setHistoriaDe(l.servico_id);
                              vigenciasDoPreco(convenioId, l.servico_id)
                                .then(setHistoria).catch(() => setHistoria([]));
                            }}>
                            {l.vigencias} vigências
                          </button>
                        )}
                        {' '}
                        <button
                          className={l.valor === null ? 'btn-alerta btn-sm'
                                                      : 'btn-secondary btn-sm'}
                          data-acao={l.valor === null ? 'lancar-preco' : 'editar-preco'}
                          onClick={() => {
                            setEditando(l.servico_id);
                            setValorNovo(l.valor === null ? '' : emReais(l.valor));
                            setDesdeNovo('');
                          }}>
                          {l.valor === null ? 'Lançar preço' : 'Editar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {itens.filter(l => editando === l.servico_id).map(l => (
                  <tr key={l.servico_id + '-edit'} data-bloco="editar-preco">
                    <td colSpan={5}>
                      <div className="linha-campos">
                        <label>
                          Valor
                          <input type="text" autoFocus inputMode="decimal"
                            data-campo="valor" value={valorNovo}
                            onChange={e => setValorNovo(e.target.value)} />
                        </label>
                        <label>
                          Passa a valer em
                          <input type="date" data-campo="vigente-desde"
                            value={desdeNovo}
                            onChange={e => setDesdeNovo(e.target.value)} />
                          <small>Em branco = hoje.</small>
                        </label>
                        <button className="btn-primary" data-acao="gravar-preco"
                          onClick={() => gravarPreco(l.servico_id)}
                          disabled={ocupado}>Gravar</button>
                        <button className="btn-secondary"
                          data-acao="cancelar-preco"
                          onClick={() => setEditando(null)}>Cancelar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {historia && (
        <div className="modal" data-modal="vigencias">
          <div className="modal-overlay" onClick={() => setHistoria(null)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Histórico do preço</h3>
              <button className="btn-secondary btn-sm" data-acao="fechar-vigencias"
                onClick={() => setHistoria(null)}>Fechar</button>
            </div>
            <p className="cad-sub">
              Cada linha valeu a partir da data dela. É por isso que o
              relatório de março continua certo.
            </p>
            <table className="tabela">
              <tbody>
                {historia.map(v => (
                  <tr key={v.vigente_desde} data-vigencia={v.vigente_desde}>
                    <td>{emData(v.vigente_desde)}</td>
                    <td><strong>{comMoeda(v.valor)}</strong></td>
                    <td><small>{v.por ?? ''}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- a planilha ---------- */}
      <div className="cartao" data-bloco="explicar-planilha">
        <h3>A planilha que baixa e importa</h3>
        <p className="cad-sub">
          Uma coluna por convênio ativo do seu cadastro, uma linha por serviço.
          Baixa já preenchida — célula vazia é preço que ninguém lançou.
        </p>
        {semTuss > 0 && (
          <div className="erro-caixa" data-aviso="sem-tuss">
            <strong>{semTuss} serviço(s) sem código TUSS.</strong>{' '}
            Eles são casados pela descrição na importação. Sem TUSS, a guia sai
            com o código errado — é o que hoje acontece com RX e Tomografia,
            que têm um código só para tudo.
          </div>
        )}
        <div className="tabela-rolante">
          <table className="tabela" data-tabela="modelo-planilha">
            <thead>
              <tr>
                <th>Código TUSS</th><th>Descrição</th>
                {colunas.map(c => <th key={c.convenio_id}>{c.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {planilha.slice(0, 3).map(l => (
                <tr key={l.servico_id}>
                  <td>{l.codigo_tuss ?? ''}</td>
                  <td>{l.descricao}</td>
                  {colunas.map(c => (
                    <td key={c.convenio_id} style={{ textAlign: 'right' }}>
                      {l.valores?.[c.convenio_id] !== undefined
                        ? emReais(l.valores[c.convenio_id]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cad-sub">
          Ao importar, a tela mostra <strong>o que vai mudar antes de
          gravar</strong> — quantos preços novos, quantos reajustes, quantos
          iguais — e só grava no segundo clique. Linha com TUSS que não existe
          no cadastro é avisada, e nenhum serviço é inventado.
        </p>
      </div>
    </>
  );
}
