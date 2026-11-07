import { useEffect, useMemo, useState } from 'react';
import { monitorDosClientes, type ClienteNoMonitor } from './dados';
import {
  queda, nivelDoCliente, PESO_DO_NIVEL, type NivelDoCliente
} from '../../nucleo/plataforma';

/**
 * ============================================================
 *  O MONITOR DOS CLIENTES
 *
 *  11/10/2026, o Tom: *"quero ter monitores dos meus clientes,
 *  níveis de atividade."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ A PERGUNTA QUE ESTA TELA RESPONDE
 *
 *  Não é "quantos clientes eu tenho" — isso a tela de Clientes
 *  já diz. É **"qual deles vai cancelar e ainda não falou"**.
 *
 *  Um hospital que marcava 80 consultas por semana e marcou 9
 *  esta semana não mandou e-mail nenhum. Ele simplesmente
 *  voltou para a planilha. Quando o aviso chega, já chegou como
 *  pedido de cancelamento.
 *
 *  Por isso a coluna mais importante não é o total: é a
 *  COMPARAÇÃO com a semana anterior.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ POR QUE NÃO ORDENAR POR TAMANHO
 *
 *  O maior cliente não é o que precisa de você hoje. A ordem
 *  padrão é por RISCO: quem caiu mais, primeiro. Um cliente
 *  pequeno parado há 12 dias aparece antes de um grande
 *  saudável, porque é com ele que dá para fazer alguma coisa.
 *
 *  ------------------------------------------------------------
 *  O QUE ESTA TELA NÃO INVENTA
 *
 *  Nada aqui é estimativa. Todos os números saem de
 *  `monitor_dos_clientes()`, contando linha no banco. Não há
 *  "saúde do cliente" de 0 a 100: um número desses parece
 *  objetivo e é um chute com casa decimal.
 * ============================================================
 */

/* ⭐ A classificação e a comparação com a semana anterior moram
   em `nucleo/plataforma.ts`, com teste e com mutantes. Regra na
   tela não tem teste, e regra sem teste muda sozinha. */

const ROTULO: Record<NivelDoCliente, string> = {
  parado: 'parado',
  caindo: 'caindo',
  novo: 'implantando',
  ok: 'em uso'
};

export function MonitorDosClientes({
  aoConfigurar
}: {
  aoConfigurar: (clienteId: string) => void;
}) {
  const [lista, setLista] = useState<ClienteNoMonitor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    monitorDosClientes()
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, []);

  const ordenados = useMemo(() => {
    return [...lista].sort((a, b) => {
      const d = PESO_DO_NIVEL[nivelDoCliente(a)] - PESO_DO_NIVEL[nivelDoCliente(b)];
      if (d !== 0) return d;
      return b.marcados_30d - a.marcados_30d;
    });
  }, [lista]);

  const precisam = ordenados.filter(c => {
    const n = nivelDoCliente(c);
    return n === 'parado' || n === 'caindo';
  });

  if (erro) return <div className="erro-caixa">{erro}</div>;
  if (carregando) {
    return (
      <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
    );
  }

  return (
    <>
      <div className="cad-nota plataforma" data-aviso="monitor-resumo">
        <i className="fas fa-heart-pulse" />
        <div>
          <strong>
            {precisam.length === 0
              ? 'Nenhum cliente parado ou caindo.'
              : `${precisam.length} ${precisam.length === 1
                  ? 'cliente precisa' : 'clientes precisam'} de um telefonema.`}
          </strong>
          <p>
            A ordem é por risco, não por tamanho: quem caiu mais vem primeiro.
            Cliente que some não reclama — ele volta para a planilha e avisa
            no fim do contrato.
          </p>
        </div>
      </div>

      {ordenados.map(c => {
        const nivel = nivelDoCliente(c);
        const q = queda(c.marcados_7d, c.marcados_7d_antes);
        return (
          <div key={c.id} className={'mon-linha ' + nivel}
               data-cliente={c.id} data-nivel={nivel}>
            <span className="mon-nome">
              {c.nome}
              <small>{c.slug}</small>
            </span>

            <span className="cad-tags">
              <em className={'cad-tag ' + (nivel === 'ok' ? '' : 'off')}
                  data-tag="nivel">{ROTULO[nivel]}</em>
              {c.demo && <em className="cad-tag sub" data-tag="demo">demonstração</em>}
            </span>

            <span className="mon-num" data-num="marcados-7d">
              <strong>{c.marcados_7d}</strong>
              <small>marcados · 7 dias</small>
            </span>

            {/* ⭐⭐⭐ A coluna que conta a história: contra a
                semana anterior. Sozinho, "9 marcados" não diz
                nada; "9 contra 80" diz tudo. */}
            <span className="mon-num" data-num="variacao">
              {q === null
                ? <strong className="neutro">—</strong>
                : <strong className={q >= 40 ? 'ruim' : q <= -10 ? 'bom' : 'neutro'}>
                    {q > 0 ? `−${q}%` : q < 0 ? `+${-q}%` : '='}
                  </strong>}
              <small>vs. semana anterior ({c.marcados_7d_antes})</small>
            </span>

            <span className="mon-num" data-num="dias-parado">
              <strong className={(c.dias_parado ?? 0) >= 7 ? 'ruim' : 'neutro'}>
                {c.dias_parado === null ? 'nunca' : `${c.dias_parado}d`}
              </strong>
              <small>desde o último</small>
            </span>

            <span className="mon-num" data-num="ativos">
              <strong>{c.usuarios_ativos_7d}/{c.usuarios}</strong>
              <small>pessoas usando</small>
            </span>

            {/* ⭐ Pendências: o que dá para resolver no telefonema
                em vez de só constatar a queda. */}
            <span className="mon-pend">
              {c.fila_pendente > 0 && (
                <em className="cad-tag exame" data-tag="fila">
                  {c.fila_pendente} na fila de exames
                </em>
              )}
              {c.exames_sem_quem_faca > 0 && (
                <em className="cad-tag off" data-tag="sem-quem-faca">
                  {c.exames_sem_quem_faca} exame(s) sem quem faça
                </em>
              )}
              {c.modulos_vencendo > 0 && (
                <em className="cad-tag exame" data-tag="vencendo">
                  {c.modulos_vencendo} módulo(s) vencendo
                </em>
              )}
            </span>

            <div className="cad-botoes">
              <button className="btn-secondary btn-sm" data-acao="configurar-do-monitor"
                      onClick={() => aoConfigurar(c.id)}>
                <i className="fas fa-sliders" /> Configurar
              </button>
            </div>
          </div>
        );
      })}

      {/* ⚠️ Exame sem ninguém que faça é o defeito que a Gestão
          de Exames acusa desde 09/10 — aqui ele aparece do lado
          de fora, para o MedCalendar ver antes do hospital. */}
      <p className="cad-rodape">
        As pendências acima são do hospital, não suas. Elas estão aqui porque
        são o motivo mais comum de um cliente achar que "o sistema não
        funciona": a fila não anda, o exame não tem com quem marcar.
      </p>
    </>
  );
}
