import { useEffect, useMemo, useState } from 'react';
import {
  logDoCliente, acoesDoLog, medicosDoCliente, examesDoCliente,
  conveniosDoCliente, usuariosDoCliente,
  type LinhaDoLog, type Medico, type Exame, type Convenio,
  type UsuarioDoCliente
} from './dados';
import { Aviso, useAviso } from './Aviso';
import { diaNoFuso, horaNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  O LOG — tudo que foi feito, e por quem
 *
 *  10/10/2026, o Tom: *"tudo que for feito ficar registrado e
 *  pesquisável. Alguém alterou o expediente do médico tal, fica
 *  registrado. Alguém fez um encaixe, fica registrado. Alguém
 *  cancelou a agenda ou uma consulta, fica registrado. Tela de
 *  logs com filtro de ações, por médico, exame, convênio."*
 *
 *  ------------------------------------------------------------
 *  ⭐ O REGISTRO JÁ EXISTIA. FALTAVA A TELA.
 *
 *  `core.auditoria` está no banco desde o primeiro dia, e **18
 *  lugares do sistema já escrevem nela** — marcar, cancelar,
 *  reagendar, mexer em expediente, em médico, em convênio, em
 *  especialidade, em paciente.
 *
 *  Então isto aqui não é "passar a registrar". É mostrar o que
 *  já estava guardado.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O FILTRO POR MÉDICO/EXAME/CONVÊNIO VALE PARA O PASSADO
 *
 *  Eu tinha dito ao Tom que precisaria de três colunas novas,
 *  preenchidas daqui para frente, e que o histórico ficaria sem
 *  filtro fino.
 *
 *  Fui escrever e vi que não precisa: a auditoria guarda
 *  `alvo_tabela` + `alvo_id`, e daí dá para DEDUZIR os três. Vale
 *  para tudo que já está lá — e não cria uma segunda cópia da
 *  verdade que pode divergir da primeira.
 * ============================================================
 */

/** Um dia atrás, no formato do <input type="date">. */
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const FUSO = 'America/Sao_Paulo';

export function Logs({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<LinhaDoLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const { recado, avisar, fechar } = useAviso();

  const [de, setDe] = useState(diasAtras(7));
  const [ate, setAte] = useState(diasAtras(0));
  const [acao, setAcao] = useState('');
  const [usuario, setUsuario] = useState('');
  const [recurso, setRecurso] = useState('');
  const [servico, setServico] = useState('');
  const [convenio, setConvenio] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<LinhaDoLog | null>(null);

  const [acoes, setAcoes] = useState<{ acao: string; quantas: number }[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [exames, setExames] = useState<Exame[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [pessoas, setPessoas] = useState<UsuarioDoCliente[]>([]);

  // As listas dos filtros: uma ida só, na abertura.
  useEffect(() => {
    let valido = true;
    Promise.all([
      acoesDoLog(clienteId), medicosDoCliente(clienteId),
      examesDoCliente(clienteId), conveniosDoCliente(clienteId),
      usuariosDoCliente(clienteId)
    ]).then(([a, m, e, c, u]) => {
      if (!valido) return;
      setAcoes(a); setMedicos(m); setExames(e); setConvenios(c); setPessoas(u);
    }).catch(() => { /* os filtros são opcionais; a lista é que importa */ });
    return () => { valido = false; };
  }, [clienteId]);

  /* ⚠️ O FILTRO VAI AO BANCO, E NÃO A UM `.filter()` DEPOIS.
     A auditoria cresce para sempre. Trazer o histórico inteiro
     para mostrar uma semana é o padrão que transformou "montar
     uma lista" em três minutos de espera no sistema antigo. */
  useEffect(() => {
    let valido = true;
    setCarregando(true);
    logDoCliente({ clienteId, de, ate, acao, usuario, recurso, servico,
                   convenio, busca, limite: 200 })
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { avisar(e.message ?? String(e), false); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, de, ate, acao, usuario, recurso, servico, convenio,
      busca, recarga, avisar]);

  const porDia = useMemo(() => {
    const m = new Map<string, LinhaDoLog[]>();
    for (const l of lista) {
      const d = diaNoFuso(l.quando, FUSO);
      m.set(d, [...(m.get(d) ?? []), l]);
    }
    return [...m.entries()];
  }, [lista]);

  const temFiltro = !!(acao || usuario || recurso || servico || convenio || busca);

  function limpar() {
    setAcao(''); setUsuario(''); setRecurso(''); setServico('');
    setConvenio(''); setBusca('');
  }

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Registro de atividades</h2>
          <p>
            Quem fez o quê, e quando. Marcar, cancelar, reagendar, mexer em
            expediente, em cadastro — tudo que o sistema grava.
          </p>
        </div>
        <button className="btn-secondary" data-acao="recarregar-log"
                onClick={() => setRecarga(n => n + 1)}>
          <i className="fas fa-rotate" /> Atualizar
        </button>
      </div>

      <div className="log-filtros" data-bloco="filtros">
        <div className="cad-busca" style={{ marginBottom: 0, flex: '1 1 240px' }}>
          <i className="fas fa-search" />
          <input type="text" value={busca} data-campo="busca-log"
                 onChange={e => setBusca(e.target.value)}
                 placeholder="Buscar por nome, ação, paciente…" />
        </div>

        <label className="log-campo">
          De
          <input type="date" value={de} data-campo="de"
                 onChange={e => setDe(e.target.value)} />
        </label>
        <label className="log-campo">
          Até
          <input type="date" value={ate} data-campo="ate"
                 onChange={e => setAte(e.target.value)} />
        </label>

        {/* ⭐ O menu de ações lê o que EXISTE no banco, com a
            contagem. Lista escrita à mão envelhece calada: alguém
            acrescenta uma ação nova e ela nunca aparece aqui. */}
        <select className="input-select" value={acao} data-filtro="acao"
                onChange={e => setAcao(e.target.value)}>
          <option value="">Todas as ações</option>
          {acoes.map(a => (
            <option key={a.acao} value={a.acao}>{a.acao} ({a.quantas})</option>
          ))}
        </select>

        <select className="input-select" value={usuario} data-filtro="usuario"
                onChange={e => setUsuario(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {pessoas.map(p => (
            <option key={p.usuario_id} value={p.usuario_id}>
              {p.nome ?? p.email}
            </option>
          ))}
        </select>

        <select className="input-select" value={recurso} data-filtro="medico"
                onChange={e => setRecurso(e.target.value)}>
          <option value="">Todos os médicos</option>
          {medicos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>

        <select className="input-select" value={servico} data-filtro="exame"
                onChange={e => setServico(e.target.value)}>
          <option value="">Todos os exames</option>
          {exames.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>

        <select className="input-select" value={convenio} data-filtro="convenio"
                onChange={e => setConvenio(e.target.value)}>
          <option value="">Todos os convênios</option>
          {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        {temFiltro && (
          <button className="btn-secondary btn-sm" data-acao="limpar-filtros"
                  onClick={limpar}>
            <i className="fas fa-times" /> Limpar filtros
          </button>
        )}
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Lendo…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-clipboard-list" />
          <h3>Nada neste período</h3>
          <p>
            {temFiltro
              ? 'Nenhum registro com estes filtros. Tente limpar algum, ou alargar as datas.'
              : 'Nenhum registro entre as datas escolhidas. Alargue o período.'}
          </p>
        </div>
      )}

      {/* ⚠️ O TETO É DITO EM LETRAS.
          A consulta traz no máximo 200 linhas. Uma lista cortada
          em silêncio faria alguém concluir que não houve mais
          nada — e num registro de atividades essa conclusão é
          exatamente a errada. */}
      {!carregando && lista.length >= 200 && (
        <div className="dia-nota amarela" data-aviso="teto-do-log">
          <strong>Mostrando as 200 mais recentes.</strong>
          <p>
            Há mais coisa neste período. Estreite as datas ou use um filtro
            para ver o resto.
          </p>
        </div>
      )}

      {!carregando && porDia.map(([dia, linhas]) => (
        <div key={dia} className="log-dia" data-dia={dia}>
          <div className="log-dia-cab">
            <span>{dia.split('-').reverse().join('/')}</span>
            <em>{linhas.length} {linhas.length === 1 ? 'registro' : 'registros'}</em>
          </div>

          {linhas.map(l => (
            <button key={l.id} className="log-linha" data-log={l.id}
                    onClick={() => setAberta(l)}>
              <span className="log-hora">{horaNoFuso(l.quando, FUSO)}</span>
              <span className="log-acao">{l.acao}</span>
              <span className="log-alvos">
                {l.recurso  && <em data-alvo="medico">{l.recurso}</em>}
                {l.servico  && <em data-alvo="exame">{l.servico}</em>}
                {l.convenio && <em data-alvo="convenio">{l.convenio}</em>}
                {l.paciente && <em data-alvo="paciente">{l.paciente}</em>}
              </span>
              <span className="log-quem">
                <i className="fas fa-user" /> {l.quem}
              </span>
            </button>
          ))}
        </div>
      ))}

      {/* ---------------- o detalhe ---------------- */}
      {aberta && (
        <div className="modal" data-modal="log">
          <div className="modal-overlay" onClick={() => setAberta(null)} />
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>{aberta.acao}</h3>
              <button onClick={() => setAberta(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <div className="wiz-resumo">
                <div className="wiz-resumo-linha">
                  <span>Quando</span>
                  <strong>
                    {diaNoFuso(aberta.quando, FUSO).split('-').reverse().join('/')}
                    {' às '}{horaNoFuso(aberta.quando, FUSO)}
                  </strong>
                </div>
                <div className="wiz-resumo-linha">
                  <span>Quem</span><strong>{aberta.quem}</strong>
                </div>
                {aberta.origem && (
                  <div className="wiz-resumo-linha">
                    <span>De onde</span><strong>{aberta.origem}</strong>
                  </div>
                )}
                {aberta.recurso && (
                  <div className="wiz-resumo-linha">
                    <span>Médico</span><strong>{aberta.recurso}</strong>
                  </div>
                )}
                {aberta.paciente && (
                  <div className="wiz-resumo-linha">
                    <span>Paciente</span><strong>{aberta.paciente}</strong>
                  </div>
                )}
              </div>

              {/* ⭐ ANTES e DEPOIS lado a lado. É o que responde
                  "o que mudou", que é a pergunta que leva alguém a
                  abrir um registro. */}
              <div className="log-diff">
                <div>
                  <strong>Antes</strong>
                  <pre data-bloco="antes">
                    {aberta.antes ? JSON.stringify(aberta.antes, null, 1) : '—'}
                  </pre>
                </div>
                <div>
                  <strong>Depois</strong>
                  <pre data-bloco="depois">
                    {aberta.depois ? JSON.stringify(aberta.depois, null, 1) : '—'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
