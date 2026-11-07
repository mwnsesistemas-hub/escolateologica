import { useCallback, useEffect, useState } from 'react';
import { cotacaoParaFornecedor, responderCotacaoOpme, anexarPdfDaCotacao } from './dados';

/**
 * ============================================================
 *  A PORTA DO FORNECEDOR
 *
 *  `/cotacao?c=<codigo>` — sem login, igual ao chat do paciente.
 *
 *  ------------------------------------------------------------
 *  ⚠️⚠️⚠️ O QUE ESTA TELA NÃO MOSTRA, E É O PONTO DELA
 *
 *  No protótipo do Apps Script, o `CotacaoFornecedor.html` fazia:
 *
 *      document.getElementById('infoPaciente').textContent
 *        = cirurgia.PacienteNome || '-';
 *
 *  O nome do paciente, na tela de uma EMPRESA DE FORA. E o
 *  servidor mandava a linha inteira da cirurgia junto — CPF,
 *  carteirinha, telefone, CID, indicação clínica — tudo
 *  disponível no navegador do fornecedor, bastando abrir o
 *  console.
 *
 *  ⭐⭐⭐ Um fornecedor de prótese não precisa saber de QUEM é a
 *     prótese. Precisa saber O QUÊ, QUANTOS e PARA QUANDO.
 *
 *  A `cotacao_para_fornecedor` do `064` devolve só isso — e o
 *  placar tem um caso que falha se o nome, o CPF, o telefone, o
 *  CID, a indicação ou o médico aparecerem na resposta.
 *
 *  ------------------------------------------------------------
 *  ⚠️ E O PDF É OPCIONAL AQUI
 *
 *  No protótipo ele era obrigatório — e jogado fora por uma
 *  função duplicada. Agora é guardado de verdade, e opcional:
 *  derrubar a proposta inteira porque o fornecedor não conseguiu
 *  anexar na hora é trocar um preço que o hospital teria por um
 *  formulário que ninguém termina.
 * ============================================================
 */

interface ItemResposta {
  opme_id: string;
  descricao: string;
  quantidade: number;
  fabricante: string;
  referencia: string;
  valor: string;
}

const dinheiro = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CotacaoFornecedor({ codigo }: { codigo: string }) {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemResposta[]>([]);
  const [validade, setValidade] = useState('');
  const [prazo, setPrazo] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await cotacaoParaFornecedor(codigo);
      if (!r?.ok) { setErro(r?.motivo ?? 'Link inválido.'); return; }
      setD(r);
      setItens((r.itens ?? []).map((i: any) => ({
        opme_id: i.id, descricao: i.descricao, quantidade: i.quantidade,
        fabricante: i.fabricante ?? '', referencia: '', valor: ''
      })));
      if (r.ja_respondida) setPronto(true);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui abrir este pedido.');
    }
  }, [codigo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const total = itens.reduce(
    (s, i) => s + (Number(i.valor) || 0) * (i.quantidade || 1), 0);

  async function enviar() {
    const semValor = itens.find(i => !i.valor || Number(i.valor) <= 0);
    if (semValor) {
      setErro(`Falta o valor de "${semValor.descricao}".`);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await responderCotacaoOpme(codigo,
        itens.map(i => ({
          opme_id: i.opme_id, descricao: i.descricao, quantidade: i.quantidade,
          fabricante: i.fabricante, referencia: i.referencia,
          valor_unitario: i.valor
        })),
        { validade: validade || null, prazo, observacoes: obs });

      if (!r.ok) { setErro(r.motivo); return; }

      /* ⚠️ O PDF vai DEPOIS dos preços, e um erro aqui NÃO
         derruba a proposta: ela já está no hospital. O
         fornecedor fica sabendo que o anexo falhou, e o
         hospital enxerga na comparação que esta proposta veio
         sem PDF. */
      if (arquivo) {
        try {
          const a = await anexarPdfDaCotacao(codigo, arquivo);
          if (!a.ok) setAvisoPdf(a.mensagem);
        } catch {
          setAvisoPdf('Os preços foram recebidos, mas o PDF não subiu. '
            + 'O hospital pode pedir o arquivo por outro caminho.');
        }
      }
      setPronto(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui enviar.');
    } finally { setEnviando(false); }
  }

  if (erro && !d) {
    return (
      <div className="forn-tela">
        <div className="forn-caixa forn-ruim">
          <i className="fas fa-link-slash" />
          <h2>Não deu para abrir</h2>
          <p>{erro}</p>
        </div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="forn-tela">
        <div className="forn-caixa"><i className="fas fa-spinner fa-spin" /></div>
      </div>
    );
  }

  if (pronto) {
    return (
      <div className="forn-tela">
        <div className="forn-caixa forn-bom">
          <i className="fas fa-circle-check" />
          <h2>Cotação recebida</h2>
          <p>
            Obrigado! O <strong>{d.hospital}</strong> já recebeu a sua proposta
            para a guia <strong>{d.numero}</strong>.
          </p>
          {avisoPdf && <p className="forn-aviso">⚠️ {avisoPdf}</p>}
          <p className="forn-nota">
            Se precisar corrigir algum valor, abra este mesmo link de novo —
            dá para reenviar enquanto o hospital não escolher.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="forn-tela">
      <header className="forn-topo">
        <h1>{d.hospital}</h1>
        <p>Pedido de cotação — OPME</p>
      </header>

      <div className="forn-corpo">
        <section className="forn-caixa forn-info">
          <div className="forn-linhas">
            <div><span>Guia</span><b>{d.numero}</b></div>
            <div><span>Fornecedor</span><b>{d.fornecedor}</b></div>
            {d.data_prevista && (
              <div><span>Cirurgia prevista</span>
                <b>{new Date(d.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}</b>
              </div>
            )}
            <div><span>Responder até</span>
              <b>{new Date(d.expira_em).toLocaleDateString('pt-BR')}</b>
            </div>
          </div>

          {d.urgente && (
            <p className="forn-urgente"><i className="fas fa-triangle-exclamation" />
              {' '}Cirurgia de urgência — o hospital precisa da resposta o quanto antes.
            </p>
          )}

          <div className="forn-procs">
            <h3>Procedimento</h3>
            {(d.procedimentos ?? []).map((p: any, i: number) => (
              <div className="forn-proc" key={i}>
                <code>{p.codigo}</code> {p.descricao}
              </div>
            ))}
          </div>

          {/* ⭐ Dito com todas as letras, para o fornecedor saber
              que não é falta de informação — é escolha. */}
          <p className="forn-privacidade">
            <i className="fas fa-user-shield" /> Os dados do paciente não são
            compartilhados com fornecedores.
          </p>
        </section>

        <section className="forn-caixa">
          <h3>Preencha a sua cotação</h3>
          <div className="forn-tabela">
            <div className="forn-cab">
              <span>#</span><span>Material</span><span>Qtd</span>
              <span>Fabricante</span><span>Referência</span><span>Valor unit.</span>
            </div>
            {itens.map((i, idx) => (
              <div className="forn-linha" key={i.opme_id}>
                <span className="forn-n">{idx + 1}</span>
                <span className="forn-desc">{i.descricao}</span>
                <span className="forn-qtd">{i.quantidade}</span>
                <input placeholder="Fabricante" value={i.fabricante}
                       onChange={e => setItens(l => l.map((x, j) =>
                         j === idx ? { ...x, fabricante: e.target.value } : x))} />
                <input placeholder="Ref." value={i.referencia}
                       onChange={e => setItens(l => l.map((x, j) =>
                         j === idx ? { ...x, referencia: e.target.value } : x))} />
                <input type="number" step="0.01" min="0" placeholder="0,00"
                       inputMode="decimal" value={i.valor}
                       onChange={e => setItens(l => l.map((x, j) =>
                         j === idx ? { ...x, valor: e.target.value } : x))} />
              </div>
            ))}
          </div>

          <div className="forn-total">
            <span>Total da proposta</span>
            <b>{dinheiro(total)}</b>
          </div>
        </section>

        <section className="forn-caixa">
          <h3>Condições</h3>
          <div className="forn-grade">
            <label>
              <span>Validade da cotação</span>
              <input type="date" value={validade}
                     onChange={e => setValidade(e.target.value)} />
            </label>
            <label>
              <span>Prazo de entrega</span>
              <input placeholder="Ex.: 5 dias úteis" value={prazo}
                     onChange={e => setPrazo(e.target.value)} />
            </label>
            <label className="larga">
              <span>Observações</span>
              <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)} />
            </label>
            <label className="larga">
              <span>Cotação em PDF <em>(opcional)</em></span>
              <input type="file" accept="application/pdf"
                     onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
              {arquivo && (
                <small className="forn-arquivo">
                  <i className="fas fa-file-pdf" /> {arquivo.name}
                  {' · '}{Math.round(arquivo.size / 1024)} KB
                </small>
              )}
            </label>
          </div>
        </section>

        {erro && <div className="forn-erro">{erro}</div>}

        <button className="forn-enviar" onClick={() => void enviar()} disabled={enviando}>
          <i className={enviando ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'} />
          {enviando ? ' Enviando…' : ' Enviar cotação'}
        </button>

        <p className="forn-rodape">MedCalendar · {d.hospital}</p>
      </div>
    </div>
  );
}
