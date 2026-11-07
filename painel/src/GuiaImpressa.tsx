import { useEffect, useState } from 'react';
import { cirurgiaParaImprimir } from './dados';

/**
 * ============================================================
 *  A GUIA TISS IMPRESSA                        31/10/2026
 *
 *  O Tom: *"Por hora vamos gerar os pdf's"*, e *"o ideal é que
 *  saísse com logo do convênio"*.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE O PDF SAI DO NAVEGADOR, E NÃO DE UM GERADOR
 *
 *  O caminho óbvio seria desenhar a guia por coordenadas, no
 *  servidor. Duas razões contra:
 *
 *  · Seria um SEGUNDO desenho da mesma guia, ao lado do que a
 *    gaveta já mostra. Duas respostas para a mesma pergunta — o
 *    defeito que já custou cinco dias a este projeto. No dia em
 *    que um campo mudasse, a tela e o PAPEL passariam a
 *    discordar em silêncio, e o papel é o que vai ao convênio.
 *
 *  · Coordenada à mão é verdade digitada à mão.
 *
 *  Então: `window.print()`, `@media print`, e o mesmo objeto.
 *  "Salvar como PDF" é uma opção da própria caixa de impressão.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE SAI AQUI É O QUE A PESSOA PODE VER
 *
 *  `cirurgia_para_imprimir` chama o `cirurgia_detalhe` por
 *  dentro. Para o médico, `cpf` e `telefone` chegam nulos — e
 *  esta tela escreve "—", em vez de deixar um branco que parece
 *  cadastro faltando.
 * ============================================================
 */

function emData(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [a, m, dia] = s.split('-');
  if (!a || !m || !dia) return '—';
  return `${dia}/${m}/${a}`;
}

function Campo(
  { rotulo, valor, largo }: { rotulo: string; valor?: any; largo?: boolean }
) {
  const texto = valor === null || valor === undefined || valor === ''
    ? '—' : String(valor);
  return (
    <div className={'guia-campo' + (largo ? ' largo' : '')}>
      <span className="guia-rotulo">{rotulo}</span>
      <span className="guia-valor">{texto}</span>
    </div>
  );
}

export function GuiaImpressa(
  { id, aoFechar }: { id: string; aoFechar: () => void }
) {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    cirurgiaParaImprimir(id)
      .then(x => { if (valido) setD(x); })
      .catch(e => { if (valido) setErro(e?.message ?? String(e)); });
    return () => { valido = false; };
  }, [id]);

  if (erro) {
    return (
      <div className="guia-fundo" onClick={aoFechar}>
        <div className="guia-folha" onClick={e => e.stopPropagation()}>
          <div className="cir-erro">{erro}</div>
        </div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="guia-fundo" onClick={aoFechar}>
        <div className="guia-folha" onClick={e => e.stopPropagation()}>
          <div className="cir-vazio"><i className="fas fa-spinner fa-spin" /></div>
        </div>
      </div>
    );
  }

  const h = d.hospital ?? {};
  const p = d.paciente ?? {};
  const m = d.medico ?? {};
  const c = d.convenio ?? {};
  const i = d.internacao ?? {};
  const g = d.diagnostico ?? {};
  const a = d.assinatura ?? null;

  /* ⭐ O endereço de conferência vem da TABELA
     (`core.config_da_plataforma`). Se ninguém configurou, a guia
     não imprime um link quebrado: ela não imprime link nenhum. */
  const confere = d.verificar_em && a
    ? `${String(d.verificar_em).replace(/\/+$/, '')}/verificar?c=${a.codigo}`
    : null;

  return (
    <div className="guia-fundo" onClick={aoFechar}>
      <div className="guia-folha" onClick={e => e.stopPropagation()}>

        <div className="guia-barra">
          <button className="btn-secondary btn-sm" onClick={aoFechar}>
            <i className="fas fa-arrow-left" /> Voltar
          </button>
          <button className="btn-primary btn-sm" data-acao="imprimir-guia"
                  onClick={() => window.print()}>
            <i className="fas fa-print" /> Imprimir / Salvar PDF
          </button>
        </div>

        <article className="guia" data-bloco="guia-tiss">

          <header className="guia-topo">
            {h.logo_url && (
              <img className="guia-logo" src={h.logo_url} alt=""
                   onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div className="guia-hospital">
              <strong>{h.nome ?? '—'}</strong>
              {h.cnpj && <span>CNPJ {h.cnpj}</span>}
              {h.endereco && <span>{h.endereco}</span>}
              {h.telefone && <span>{h.telefone}</span>}
            </div>
            {/* ⭐ O pedido do Tom: a logo do CONVÊNIO no cabeçalho. */}
            {d.convenio_logo_url && (
              <img className="guia-logo-convenio" src={d.convenio_logo_url} alt=""
                   data-campo="logo-do-convenio"
                   onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
          </header>

          <h1 className="guia-titulo">
            Guia de Solicitação de Internação
            <small>Padrão TISS · {d.numero}</small>
          </h1>

          <section className="guia-secao">
            <h2>1 · Operadora</h2>
            <div className="guia-grade">
              <Campo rotulo="Convênio" valor={c.nome} />
              <Campo rotulo="Registro ANS" valor={c.registro_ans} />
              <Campo rotulo="Nº da guia no prestador" valor={d.numero_guia} />
            </div>
          </section>

          <section className="guia-secao">
            <h2>2 · Beneficiário</h2>
            <div className="guia-grade">
              <Campo rotulo="Nome" valor={p.nome} largo />
              <Campo rotulo="Carteirinha" valor={p.carteirinha} />
              <Campo rotulo="Plano" valor={p.plano} />
              <Campo rotulo="Validade" valor={emData(p.validade_carteira)} />
              <Campo rotulo="Nascimento" valor={emData(p.nascimento)} />
              <Campo rotulo="Sexo" valor={p.sexo} />
              <Campo rotulo="CNS" valor={p.cns} />
              {/* ⚠️ Nulo aqui é REGRA (27/10), não cadastro faltando. */}
              <Campo rotulo="CPF" valor={p.cpf} />
            </div>
          </section>

          <section className="guia-secao">
            <h2>3 · Solicitante</h2>
            <div className="guia-grade">
              <Campo rotulo="Profissional" valor={m.nome} largo />
              <Campo rotulo="Conselho" valor={m.crm} />
              <Campo rotulo="UF" valor={m.uf} />
              <Campo rotulo="CBO-S" valor={m.cbos} />
              <Campo rotulo="Especialidade" valor={m.especialidade} />
            </div>
          </section>

          <section className="guia-secao">
            <h2>4 · Internação</h2>
            <div className="guia-grade">
              <Campo rotulo="Caráter" valor={i.carater} />
              <Campo rotulo="Tipo" valor={i.tipo} />
              <Campo rotulo="Regime" valor={i.regime} />
              <Campo rotulo="Diárias" valor={i.diarias} />
              <Campo rotulo="Acomodação" valor={i.acomodacao} />
              <Campo rotulo="Data prevista" valor={emData(i.data_prevista)} />
            </div>
            <Campo rotulo="Indicação clínica" valor={i.indicacao} largo />
          </section>

          <section className="guia-secao">
            <h2>5 · Hipótese diagnóstica</h2>
            <div className="guia-grade">
              <Campo rotulo="CID principal" valor={g.cid_principal} />
              <Campo rotulo="CID 2" valor={g.cid_2} />
              <Campo rotulo="CID 3" valor={g.cid_3} />
              <Campo rotulo="Tipo da doença" valor={g.tipo_doenca} />
              <Campo rotulo="Tempo" valor={g.tempo_doenca} />
              <Campo rotulo="Acidente" valor={g.acidente} />
            </div>
            <Campo rotulo="Hipótese" valor={g.hipotese} largo />
          </section>

          <section className="guia-secao">
            <h2>6 · Procedimentos solicitados</h2>
            <table className="guia-tabela">
              <thead>
                <tr><th>#</th><th>Código TUSS</th><th>Descrição</th><th>Qtd.</th></tr>
              </thead>
              <tbody>
                {(d.procedimentos ?? []).map((x: any) => (
                  <tr key={x.ordem}>
                    <td>{x.ordem}</td>
                    <td className="guia-mono">{x.codigo}</td>
                    <td>{x.descricao}</td>
                    <td className="guia-num">{x.quantidade}</td>
                  </tr>
                ))}
                {!(d.procedimentos ?? []).length && (
                  <tr><td colSpan={4} className="guia-vazio">Nenhum procedimento.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {!!(d.opme ?? []).length && (
            <section className="guia-secao">
              <h2>7 · OPME</h2>
              <table className="guia-tabela">
                <thead>
                  <tr><th>#</th><th>Descrição</th><th>Fabricante</th><th>Qtd.</th></tr>
                </thead>
                <tbody>
                  {d.opme.map((x: any) => (
                    <tr key={x.ordem}>
                      <td>{x.ordem}</td>
                      <td>{x.descricao}</td>
                      <td>{x.fabricante ?? '—'}</td>
                      <td className="guia-num">{x.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {d.observacoes && (
            <section className="guia-secao">
              <h2>Observações</h2>
              <p className="guia-texto">{d.observacoes}</p>
            </section>
          )}

          <footer className="guia-rodape">
            <div className="guia-assina">
              <div className="guia-risco" />
              <strong>{m.nome ?? '—'}</strong>
              <span>{[m.crm, m.uf].filter(Boolean).join(' / ') || '—'}</span>
              <small>Assinatura e carimbo do profissional solicitante</small>
            </div>

            {a ? (
              <div className="guia-selo" data-bloco="selo">
                <strong>Assinado eletronicamente</strong>
                <span className="guia-mono">{a.codigo}</span>
                <span>{a.medico_nome} — {a.medico_crm}</span>
                <span>{emData(a.assinado_em)}</span>
                {/* ⭐ Sem endereço configurado, nenhum link: um link
                    quebrado impresso é pior que link nenhum, porque
                    quem confere conclui que a guia é falsa. */}
                {confere
                  ? <small className="guia-mono">{confere}</small>
                  : <small>Confira pelo código no painel.</small>}
              </div>
            ) : (
              <div className="guia-selo vazio">
                <span>Esta guia ainda não foi assinada.</span>
              </div>
            )}
          </footer>

          <p className="guia-emissao">
            Emitida em {new Date().toLocaleString('pt-BR')} · {h.nome ?? ''}
          </p>
        </article>
      </div>
    </div>
  );
}
