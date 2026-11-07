import { useEffect, useMemo, useState } from 'react';
import {
  eixosDoRanking, rankingDoPeriodo,
  type EixoDoRanking, type LinhaDoRanking
} from './dados';
import { hojeNoFuso, somarDias } from '../../nucleo/formato';

/**
 * ============================================================
 *  OS RANKINGS DO DASHBOARD
 *
 *  13/10/2026, o Tom: *"O Dashboard tem a questão do top
 *  médicos, especialidades, exames, usuários, convênios etc."*
 *
 *  Perguntado o que medir, escolheu **atendimentos marcados**.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE A BARRA, E NÃO SÓ O NÚMERO
 *
 *  "Dr. A — 142" não diz nada sozinho. 142 é muito? É metade do
 *  hospital ou é 4%?
 *
 *  A barra é a **fatia do total do período**, e ela vem do
 *  banco calculada sobre TUDO — não sobre os dez que a tela
 *  mostra. Um ranking cuja soma é sempre 100% não informa nada.
 *
 *  É a mesma lição do botão Simular das campanhas, em setembro:
 *  *"mostrar 419 elegíveis sozinho seria a coisa mais perigosa
 *  que essa tela pode fazer — um número sem o caminho até ele
 *  não dá para conferir."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ A COLUNA DE PRESENÇA PODE VIR VAZIA, E ISSO É CERTO
 *
 *  `taxa_presenca` é nula quando nenhum atendimento daquele
 *  item já passou. Mostrar 0% ali faria um médico com a agenda
 *  cheia do mês que vem parecer o pior do hospital.
 *
 *  Vazio com um traço é honesto: ainda não há o que medir.
 *
 *  ------------------------------------------------------------
 *  O QUE ESTA TELA NÃO FAZ
 *
 *  Não inventa média, não projeta, não dá nota. Todo número
 *  aqui é uma contagem de linha no banco — e a única conta é a
 *  divisão da fatia, que o banco faz.
 * ============================================================
 */

const FUSO = 'America/Sao_Paulo';

const PERIODOS: { id: string; rotulo: string; dias: number }[] = [
  { id: '7',  rotulo: '7 dias',  dias: 6 },
  { id: '30', rotulo: '30 dias', dias: 29 },
  { id: '90', rotulo: '90 dias', dias: 89 }
];

function comoData(d: string): string {
  const [a, m, x] = d.split('-');
  return `${x}/${m}/${a}`;
}

export function Rankings({ clienteId, atendeConvenios = true }: {
  clienteId: string;
  /** ⭐ 21/10: clínica sem convênio não tem a aba "Convênios". */
  atendeConvenios?: boolean;
}) {
  const [eixos, setEixos] = useState<EixoDoRanking[]>([]);
  const [eixo, setEixo] = useState('medico');
  const [periodo, setPeriodo] = useState('30');
  const [linhas, setLinhas] = useState<LinhaDoRanking[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const janela = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)?.dias ?? 29;
    const ate = hojeNoFuso(FUSO);
    return { de: somarDias(ate, -dias), ate };
  }, [periodo]);

  useEffect(() => {
    let valido = true;
    eixosDoRanking()
      .then(l => { if (valido) setEixos(atendeConvenios ? l : l.filter(e => e.eixo !== 'convenio')); })
      .catch(e => { if (valido) setErro((e as Error).message ?? String(e)); });
    return () => { valido = false; };
  }, [atendeConvenios]);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    rankingDoPeriodo({
      clienteId, eixo, de: janela.de, ate: janela.ate, limite: 10
    })
      .then(l => { if (valido) { setLinhas(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, eixo, janela.de, janela.ate]);

  const atual = eixos.find(e => e.eixo === eixo);
  const total = linhas.reduce((s, l) => s + l.marcados, 0);

  if (erro) return <div className="erro-caixa">{erro}</div>;

  return (
    <div className="rk-caixa" data-bloco="rankings">
      <div className="rk-topo">
        <h3>Quem move a agenda</h3>
        <div className="rk-periodos" data-bloco="periodo-ranking">
          {PERIODOS.map(p => (
            <button key={p.id}
                    className={periodo === p.id ? 'atual' : ''}
                    data-periodo={p.id}
                    onClick={() => setPeriodo(p.id)}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <p className="rk-janela" data-texto="janela">
        De {comoData(janela.de)} a {comoData(janela.ate)}, pelo dia do
        atendimento — não pelo dia em que foi digitado.
      </p>

      <div className="rk-abas" data-bloco="eixos">
        {eixos.map(e => (
          <button key={e.eixo}
                  className={eixo === e.eixo ? 'atual' : ''}
                  data-eixo={e.eixo}
                  onClick={() => setEixo(e.eixo)}>
            {e.rotulo}
          </button>
        ))}
      </div>

      {!!atual && (
        <p className="rk-ajuda" data-texto="ajuda-eixo">{atual.ajuda}</p>
      )}

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /></div>
      )}

      {!carregando && !linhas.length && (
        <p className="cad-rodape" data-aviso="ranking-vazio">
          Nenhum atendimento neste período.
        </p>
      )}

      {!carregando && !!linhas.length && (
        <table className="rk-tabela" data-tabela="ranking">
          <thead>
            <tr>
              <th>#</th>
              <th>Quem</th>
              <th className="num">Marcados</th>
              <th className="num">Veio</th>
              <th className="num">Faltou</th>
              <th className="num">Cancelado</th>
              <th className="num">Presença</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={(l.id ?? l.nome) + i} data-linha={i + 1}>
                <td className="rk-pos">{i + 1}</td>
                <td className="rk-nome">
                  <strong>{l.nome}</strong>
                  {!!l.detalhe && <small>{l.detalhe}</small>}
                  {/* ⭐ A barra é a fatia do TOTAL do período,
                      calculada no banco sobre tudo — e não sobre
                      as dez linhas desta tabela. */}
                  <span className="rk-barra" data-fatia={l.fatia}>
                    <i style={{ width: `${Math.max(2, l.fatia)}%` }} />
                    <em>{l.fatia}%</em>
                  </span>
                </td>
                <td className="num"><strong>{l.marcados}</strong></td>
                <td className="num">{l.compareceram}</td>
                <td className="num">{l.faltaram}</td>
                <td className="num">{l.cancelados}</td>
                <td className="num" data-presenca={l.taxa_presenca ?? ''}>
                  {/* ⭐⭐ Nulo vira traço, não zero. Agenda cheia
                      do mês que vem com 0% faria o melhor médico
                      parecer o pior. */}
                  {l.taxa_presenca === null
                    ? <span className="rk-sem">—</span>
                    : <span className={l.taxa_presenca < 70 ? 'ruim' : ''}>
                        {l.taxa_presenca}%
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!carregando && !!linhas.length && (
        <p className="cad-rodape" data-texto="rodape-ranking">
          Os 10 primeiros somam {total} atendimento(s).
          {' '}<strong>O cancelado conta</strong> — ele ocupou a vaga entre
          uma coisa e outra, e tirá-lo faria quem remarca muito parecer
          ocioso. Ele está na coluna própria, ao lado.
          {' '}A presença é sobre o que já passou e não foi cancelado.
        </p>
      )}
    </div>
  );
}
