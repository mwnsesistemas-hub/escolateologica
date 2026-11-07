import { cartoesDoFaturamento, pendenciasDasContas, type CartoesDoFaturamento, type PendenciaDeConta } from './dados';
import { useEffect, useState } from 'react';
import {
  pendenciasDoFaturamento, resumoDoFaturamento,
  type PendenciaDoFaturamento, type ResumoDoFaturamento
} from './dados';

/**
 * ============================================================
 *  PAINEL DO FATURAMENTO
 *
 *  03/11/2026. O Tom colou o pacote, rodou o placar — 1.316 ok
 *  — mandou o print do menu e escreveu duas palavras:
 *
 *      "Nenhum painel."
 *
 *  ------------------------------------------------------------
 *  ⚠️⚠️ POR QUE NÃO ESTÃO AQUI OS CINCO CARTÕES DO ESBOÇO
 *
 *  O esboço dele tem:
 *
 *      PRONTO PARA FATURAR   COM PENDÊNCIA   EM RISCO
 *      R$ 184.320            R$ 22.870       R$ 9.140
 *
 *  Os três (e os outros dois) saem de `core.contas` — a conta
 *  por atendimento, que **ainda não existe**.
 *
 *  Desenhar os cartões agora significaria mostrar R$ 0,00 todo
 *  dia, ou pior, um número inventado. E número inventado numa
 *  tela de faturamento não é enfeite: é alguém decidindo o mês
 *  em cima dele.
 *
 *  ⭐ "Tela que não aparece não dá erro." Tela que mostra número
 *     que não existe é pior — ela dá a resposta errada com cara
 *     de resposta certa.
 *
 *  ------------------------------------------------------------
 *  O QUE ESTÁ AQUI, E É VERDADE HOJE
 *
 *  As pendências de CADASTRO que impedem faturar. Cada uma diz
 *  quantas são, **o que acontece se ninguém mexer**, e leva
 *  para a tela que resolve.
 *
 *  ⭐ Número sem consequência não faz ninguém levantar da
 *     cadeira. "18 convênios sem registro ANS" é estatística;
 *     "a guia sai incompleta e a operadora recusa na entrada" é
 *     um problema.
 * ============================================================
 */

const CORES: Record<string, string> = {
  alta: 'pend-alta',
  media: 'pend-media',
  baixa: 'pend-baixa'
};

const ICONES: Record<string, string> = {
  convenio_duplicado: 'fa-clone',
  sem_prestador: 'fa-building-columns',
  sem_codigo: 'fa-hashtag',
  sem_ans: 'fa-id-card',
  cnpj_nao_fecha: 'fa-triangle-exclamation',
  sem_tuss: 'fa-barcode',
  sem_preco: 'fa-sack-dollar'
};

const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PainelFaturamento({ clienteId, aoIrPara }: {
  clienteId: string;
  /** Leva para a tela que resolve a pendência. */
  aoIrPara?: (pagina: string) => void;
}) {
  const [resumo, setResumo] = useState<ResumoDoFaturamento | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaDoFaturamento[]>([]);
  /* ⭐⭐⭐ 03/11, noite: o dinheiro, que sai das CONTAS (072). */
  const [cartoes, setCartoes] = useState<CartoesDoFaturamento | null>(null);
  const [pendContas, setPendContas] = useState<PendenciaDeConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    Promise.all([
      resumoDoFaturamento(clienteId),
      pendenciasDoFaturamento(clienteId),
      cartoesDoFaturamento(clienteId, null, null),
      pendenciasDasContas(clienteId, null, null)
    ])
      .then(([r, p, c, pc]) => {
        if (vivo) { setResumo(r); setPendencias(p); setCartoes(c); setPendContas(pc); setErro(''); }
      })
      .catch(e => { if (vivo) setErro(e.message ?? String(e)); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [clienteId]);

  if (erro) return <div className="erro-caixa">{erro}</div>;

  const prontos = resumo?.convenios_prontos ?? 0;
  const ativos = resumo?.convenios_ativos ?? 0;
  const faltam = Math.max(0, ativos - prontos);

  return (
    <>
      <div className="page-header">
        <h2><i className="fas fa-chart-pie" /> Faturamento</h2>
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" />
          <p>Carregando…</p></div>
      )}

      {!carregando && (
        <>
          {/* ════════════════════════════════════════════════════
              ⭐⭐⭐ OS CINCO CARTÕES DO ESBOÇO DO TOM   (03/11, noite)
              Todo R$ aqui sai de `core.contas` — uma conta por
              atendimento, com o preço do dia. Os dois últimos
              dependem de LOTE enviado, que ainda não existe: eles
              dizem isso, em vez de mostrar zero.
              ════════════════════════════════════════════════════ */}
          <div className="fat-cartoes" data-bloco="cartoes-dinheiro">
            <div className="fat-cartao" data-cartao="pronto">
              <small>PRONTO PARA FATURAR</small>
              <strong>{real(cartoes?.pronto_valor ?? 0)}</strong>
              <span>{cartoes?.pronto_contas ?? 0} conta{cartoes?.pronto_contas === 1 ? '' : 's'}</span>
            </div>
            <div className="fat-cartao" data-cartao="pendencia">
              <small>COM PENDÊNCIA</small>
              <strong className={(cartoes?.pendencia_contas ?? 0) > 0 ? 'atencao' : undefined}>
                {real(cartoes?.pendencia_valor ?? 0)}</strong>
              <span>{cartoes?.pendencia_contas ?? 0} conta{cartoes?.pendencia_contas === 1 ? '' : 's'} · autorização vence antes do exame</span>
            </div>
            <div className="fat-cartao" data-cartao="risco">
              <small>EM RISCO</small>
              <strong className={(cartoes?.risco_contas ?? 0) > 0 ? 'ruim' : undefined}>
                {real(cartoes?.risco_valor ?? 0)}</strong>
              <span>executado sem autorização</span>
            </div>
            <div className="fat-cartao" data-cartao="glosado">
              <small>GLOSADO NO MÊS</small>
              <strong>—</strong>
              <span data-campo="sem-lote">ainda não há lote enviado</span>
            </div>
            <div className="fat-cartao" data-cartao="recuperado">
              <small>RECUPERADO</small>
              <strong>—</strong>
              <span data-campo="sem-lote">ainda não há lote enviado</span>
            </div>
          </div>

          {/* ⭐ O cadastro, abaixo. Nenhum destes é de dinheiro, e
              isso continua de propósito. */}
          <div className="fat-cartoes" data-bloco="resumo-faturamento">
            <div className="fat-cartao" data-cartao="prontos">
              <small>CONVÊNIOS PRONTOS PARA FATURAR</small>
              <strong className={prontos === 0 ? 'ruim' : undefined}>
                {prontos} de {ativos}
              </strong>
              <span>com CNPJ, código na operadora e registro ANS</span>
            </div>
            <div className="fat-cartao" data-cartao="faltam">
              <small>FALTA ALGUMA COISA EM</small>
              <strong className={faltam > 0 ? 'atencao' : 'bom'}>
                {faltam} convênio{faltam === 1 ? '' : 's'}
              </strong>
              <span>a guia desses volta, ou sai pelo CNPJ errado</span>
            </div>
            <div className="fat-cartao" data-cartao="cnpjs">
              <small>CNPJs FATURADORES</small>
              <strong>{resumo?.cnpjs ?? 0}</strong>
              <span>quem decide qual assina é o convênio</span>
            </div>
            <div className="fat-cartao" data-cartao="precos">
              <small>PREÇOS LANÇADOS</small>
              <strong>{resumo?.precos_lancados ?? 0}</strong>
              <span>em {resumo?.servicos ?? 0} serviços ativos</span>
            </div>
          </div>

          {/* ⚠️ A FILA DE PENDÊNCIAS. */}
          <div className="page-header" style={{ marginTop: '1.4rem' }}>
            <h3>
              Fila de pendências
              {!!resumo?.pendencias_altas && (
                <em className="cad-tag off" data-campo="quantas-graves">
                  {resumo.pendencias_altas} grave{resumo.pendencias_altas === 1 ? '' : 's'}
                </em>
              )}
            </h3>
          </div>

          {/* ⭐ As pendências das CONTAS: o que custa dinheiro primeiro. */}
          {pendContas.map(p => (
            <div className={'fat-pendencia ' + (p.estado === 'EM_RISCO' ? 'alta' : 'media')}
                 key={p.estado + p.convenio + p.prestador} data-pendencia-conta={p.estado}>
              <div className="fat-pend-icone">
                <i className={'fas ' + (p.estado === 'EM_RISCO' ? 'fa-triangle-exclamation'
                                     : p.estado === 'SEM_PRECO' ? 'fa-tag' : 'fa-hourglass-half')} />
              </div>
              <div className="fat-pend-texto">
                <strong>
                  <span data-campo="quantos">{p.quantas}</span> · {
                    p.estado === 'EM_RISCO' ? `exame${p.quantas === 1 ? '' : 's'} executado${p.quantas === 1 ? '' : 's'} sem autorização`
                    : p.estado === 'SEM_PRECO' ? `conta${p.quantas === 1 ? '' : 's'} sem preço vigente no dia do atendimento`
                    : `autorizaç${p.quantas === 1 ? 'ão vence' : 'ões vencem'} antes da data do exame`}
                </strong>
                <p data-campo="consequencia">{p.convenio} · {p.prestador}</p>
                {!!p.exemplos && <small data-campo="exemplos">{p.exemplos}</small>}
              </div>
              <div className="fat-pend-acao">
                {p.valor !== null && <strong data-campo="valor">{real(p.valor)}</strong>}
                <button className="btn-secondary"
                        data-acao={p.estado === 'SEM_PRECO' ? 'ir-precos' : 'ir-contas'}
                        onClick={() => aoIrPara?.(p.estado === 'SEM_PRECO' ? 'precos' : 'contas')}>
                  {p.estado === 'SEM_PRECO' ? 'Lançar preço' : 'Abrir as contas'} <i className="fas fa-arrow-right" />
                </button>
              </div>
            </div>
          ))}

          {pendencias.length === 0 && pendContas.length === 0 && (
            <div className="porvir" data-bloco="sem-pendencias">
              <i className="fas fa-circle-check" />
              <p>
                Nenhuma pendência de cadastro. Todo convênio ativo tem CNPJ
                faturador, código na operadora e registro ANS, e todo serviço
                tem preço.
              </p>
            </div>
          )}

          {pendencias.map(p => (
            <div className={'fat-pendencia ' + (CORES[p.gravidade] ?? '')}
                 key={p.chave} data-pendencia={p.chave}
                 data-gravidade={p.gravidade}>
              <div className="fat-pend-icone">
                <i className={'fas ' + (ICONES[p.chave] ?? 'fa-circle-exclamation')} />
              </div>
              <div className="fat-pend-texto">
                <strong>
                  <span data-campo="quantos">{p.quantos}</span> · {p.titulo}
                </strong>
                {/* ⭐ A consequência, e não só o número. Número sem
                    consequência não faz ninguém levantar da cadeira. */}
                <p data-campo="consequencia">{p.consequencia}</p>
                {!!p.exemplos && (
                  <small data-campo="exemplos">{p.exemplos}</small>
                )}
              </div>
              <div className="fat-pend-acao">
                <button className="btn-secondary" data-acao={'ir-' + p.tela}
                        onClick={() => aoIrPara?.(p.tela)}>
                  Resolver <i className="fas fa-arrow-right" />
                </button>
              </div>
            </div>
          ))}

        </>
      )}
    </>
  );
}
