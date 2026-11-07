import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  calendarioCirurgico, salasCirurgicas, salvarSalaCirurgica, linkDoMapaTv, trocarLinkDoMapaTv,
  type CalendarioCirurgico as Cal, type CirurgiaDoCalendario, type SalaCirurgica
} from './dados';
import { temaDoHospital } from './Modulos';
import { Aviso, useAviso } from './Aviso';
import { hojeNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  O CALENDÁRIO CIRÚRGICO                           (06/11/2026)
 *  O banco é o `080_calendario_e_mapa.sql`.
 *
 *  O Tom: *"uma aba para calendário cirúrgico, todos os agendamentos,
 *  botões hoje/semana/mês"* — no estilo da tela inicial (a Versão 4),
 *  que ele quer como PADRÃO: a cor do hospital nos botões e no bloco de
 *  destaque, a Sora nos títulos, os blocos arredondados.
 *
 *  ⭐ A situação de cada cirurgia (concluída / em andamento / agendada)
 *     sai do RELÓGIO DO HOSPITAL (`agora`, que vem do banco) — ninguém
 *     precisa clicar nada, e o computador de quem olha não decide nada.
 *  ⭐ Cada SALA tem uma cor, a mesma em todas as vistas.
 * ============================================================
 */
type Vista = 'hoje' | 'semana' | 'mes';
const COR_SALA = ['#2F5BEA', '#7C3AED', '#0D9488', '#EA580C', '#DB2777', '#0891B2', '#65A30D', '#B45309'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* Datas como texto 'AAAA-MM-DD', com a conta feita em UTC: o dia do
   hospital já veio decidido; aqui só se anda no calendário. */
const paraData = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const paraTexto = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const somar = (s: string, dias: number) => { const d = paraData(s); d.setUTCDate(d.getUTCDate() + dias); return paraTexto(d); };
const diaDaSemana = (s: string) => paraData(s).getUTCDay();
const segunda = (s: string) => somar(s, -((diaDaSemana(s) + 6) % 7));
const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function CalendarioCirurgico({ clienteId, corDoHospital }: { clienteId: string; corDoHospital: string }) {
  const { recado, avisar, fechar } = useAviso();
  const tema = useMemo(() => temaDoHospital(corDoHospital), [corDoHospital]);
  const [vista, setVista] = useState<Vista>('semana');
  const [ref, setRef] = useState(() => hojeNoFuso('America/Sao_Paulo'));
  const [cal, setCal] = useState<Cal | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [codigoTv, setCodigoTv] = useState<string | null>(null);
  const [salasAbertas, setSalasAbertas] = useState(false);

  const periodo = useMemo(() => {
    if (vista === 'hoje') return { de: ref, ate: ref };
    if (vista === 'semana') { const s = segunda(ref); return { de: s, ate: somar(s, 6) }; }
    const d = paraData(ref);
    const ini = paraTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const fim = paraTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    return { de: ini, ate: fim };
  }, [vista, ref]);

  const carregar = useCallback(async () => {
    try { setCal(await calendarioCirurgico(clienteId, periodo.de, periodo.ate)); }
    catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setCarregou(true); }
  }, [clienteId, periodo, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { linkDoMapaTv(clienteId).then(setCodigoTv).catch(() => setCodigoTv(null)); }, [clienteId]);

  const agora = cal?.agora ?? '';
  const hoje = agora.slice(0, 10) || hojeNoFuso('America/Sao_Paulo');
  const minAgora = agora ? minutos(agora.slice(11, 16)) : 0;
  const corDaSala = (id: string | null) => {
    const i = (cal?.salas ?? []).findIndex(s => s.id === id);
    return i < 0 ? '#64748B' : COR_SALA[i % COR_SALA.length];
  };
  const situacao = (c: CirurgiaDoCalendario) => {
    if (c.realizada) return 'Concluída';
    if (!c.hora) return 'Sem horário';
    if (c.data < hoje) return 'Concluída';
    if (c.data > hoje) return 'Agendada';
    const ini = minutos(c.hora), fim = ini + (c.duracao ?? 120);
    return minAgora >= fim ? 'Concluída' : minAgora >= ini ? 'Em andamento' : 'Agendada';
  };
  const lista = cal?.cirurgias ?? [];
  const deHoje = lista.filter(c => c.data === hoje);
  const emAndamento = deHoje.filter(c => situacao(c) === 'Em andamento').length;
  const proxima = deHoje.filter(c => c.hora && situacao(c) === 'Agendada').sort((a, b) => (a.hora! < b.hora! ? -1 : 1))[0];

  const andar = (n: number) => {
    if (vista === 'hoje') setRef(somar(ref, n));
    else if (vista === 'semana') setRef(somar(ref, 7 * n));
    else { const d = paraData(ref); setRef(paraTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)))); }
  };
  const rotulo = (() => {
    const d = paraData(ref);
    if (vista === 'hoje') return `${['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
    if (vista === 'semana') { const a = paraData(periodo.de), b = paraData(periodo.ate);
      return `${a.getUTCDate()}${a.getUTCMonth() !== b.getUTCMonth() ? ' de ' + MESES[a.getUTCMonth()] : ''} a ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`; }
    return `${MESES[d.getUTCMonth()][0].toUpperCase() + MESES[d.getUTCMonth()].slice(1)} de ${d.getUTCFullYear()}`;
  })();

  if (carregou && !cal) {
    return <div className="card" data-tela="calendariocirurgico"><div className="porvir"><i className="fas fa-lock" /><p>O calendário cirúrgico é da equipe do centro cirúrgico.</p></div></div>;
  }
  const estilo = { ['--hosp' as any]: tema.botao, ['--hosp-painel' as any]: tema.painel } as CSSProperties;

  return (
    <div className="cal-tela" data-tela="calendariocirurgico" style={estilo}>
      <div className="cal-topo">
        <div className="cal-titulo">
          <h1>Calendário cirúrgico</h1>
          <div className="cal-nav">
            <button type="button" aria-label="Anterior" onClick={() => andar(-1)}><i className="fas fa-chevron-left" /></button>
            <span data-periodo>{rotulo}</span>
            <button type="button" aria-label="Próximo" onClick={() => andar(1)}><i className="fas fa-chevron-right" /></button>
            {ref !== hoje && <button type="button" className="cal-ir-hoje" onClick={() => setRef(hoje)}>Ir para hoje</button>}
          </div>
        </div>
        <div className="cal-acoes">
          <div className="cal-abas" role="tablist" aria-label="Período">
            {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']] as [Vista, string][]).map(([k, n]) => (
              <button key={k} type="button" role="tab" aria-selected={vista === k} data-vista={k}
                      className={vista === k ? 'ativa' : ''} onClick={() => setVista(k)}>{n}</button>
            ))}
          </div>
          <button type="button" className="cal-secundario" data-acao="salas" onClick={() => setSalasAbertas(!salasAbertas)}>
            <i className="fas fa-door-open" /> Salas
          </button>
          {codigoTv && (
            <a className="cal-secundario" data-acao="abrir-mapa-tv" href={`/mapa?c=${codigoTv}`} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-tv" /> Mapa da TV
            </a>
          )}
          {codigoTv && (
            /* O link da TV abre sem senha: se ele vazar, um código novo o
               invalida na hora (e a TV precisa do link novo). */
            <button type="button" className="cal-secundario" data-acao="trocar-link-tv" onClick={async () => {
              if (!window.confirm('Trocar o link da TV? O link antigo para de funcionar agora, e a TV precisa abrir o link novo.')) return;
              const novo = await trocarLinkDoMapaTv(clienteId);
              if (novo) { setCodigoTv(novo); avisar('Link da TV trocado. Abra o link novo na TV (Links de acesso, na tela inicial).', true); }
            }}><i className="fas fa-rotate" /> Trocar link</button>
          )}
        </div>
      </div>

      {salasAbertas && <EditorDeSalas clienteId={clienteId} aoMudar={() => void carregar()} avisar={avisar} />}

      <div className="cal-resumo">
        <div className="cal-tile destaque"><span>Hoje</span><b data-valor="hoje">{deHoje.length} {deHoje.length === 1 ? 'cirurgia' : 'cirurgias'}</b></div>
        <div className="cal-tile"><span><i className="cal-ponto-vivo" /> Em andamento agora</span><b data-valor="em-andamento">{emAndamento}</b></div>
        <div className="cal-tile"><span>No período</span><b>{lista.length}</b></div>
        <div className="cal-tile"><span>Próxima</span>
          {proxima ? <><b className="menor">{proxima.hora}{proxima.sala ? ` · ${proxima.sala}` : ''}</b><small>{proxima.procedimento}</small></> : <b className="menor">—</b>}
        </div>
      </div>

      {vista === 'semana' && (
        <section className="cal-semana" data-bloco="semana">
          {Array.from({ length: 7 }, (_, i) => somar(periodo.de, i)).map(d => {
            /* Em ordem de hora sempre — a tela não confia na ordem de quem mandou. */
            const doDia = lista.filter(c => c.data === d).sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'));
            return (
              <div key={d} className={'cal-dia' + (d === hoje ? ' hoje' : '')} data-dia={d}>
                <div className="cal-dia-topo">
                  <button type="button" onClick={() => { setRef(d); setVista('hoje'); }}>
                    {DIAS[diaDaSemana(d)]} {paraData(d).getUTCDate()}{d === hoje ? ' · hoje' : ''}
                  </button>
                  <span>{doDia.length}</span>
                </div>
                {doDia.map(c => (
                  <div key={c.id} className="cal-cartao" data-cirurgia={c.numero} style={{ borderLeftColor: corDaSala(c.sala_id) }}>
                    <div className="cal-cartao-l1"><b>{c.hora ?? 's/ hora'}</b>
                      {c.sala && <span className="cal-chip" style={{ color: corDaSala(c.sala_id), background: corDaSala(c.sala_id) + '1A' }}>{c.sala}</span>}</div>
                    <strong>{c.paciente}</strong>
                    <span>{c.procedimento}</span>
                    {c.cirurgiao && <small>{c.cirurgiao}</small>}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {vista === 'hoje' && <VistaDoDia dia={ref} cal={cal} situacao={situacao} corDaSala={corDaSala}
                                        minAgora={ref === hoje ? minAgora : null} />}

      {vista === 'mes' && (
        <section className="cal-mes" data-bloco="mes">
          {DIAS.map(n => <span key={n} className="cal-mes-cab">{n}</span>)}
          {Array.from({ length: diaDaSemana(periodo.de) }, (_, i) => <span key={'v' + i} />)}
          {Array.from({ length: paraData(periodo.ate).getUTCDate() }, (_, i) => somar(periodo.de, i)).map(d => {
            const doDia = lista.filter(c => c.data === d);
            return (
              <button type="button" key={d} className={'cal-mes-dia' + (d === hoje ? ' hoje' : '')} data-dia-mes={d}
                      onClick={() => { setRef(d); setVista('hoje'); }}>
                <span className="cal-mes-num">{paraData(d).getUTCDate()}</span>
                {doDia.length > 0 && <b>{doDia.length} {doDia.length === 1 ? 'cirurgia' : 'cirurgias'}</b>}
                <span className="cal-mes-pontos">{doDia.slice(0, 8).map(c => <i key={c.id} style={{ background: corDaSala(c.sala_id) }} />)}</span>
              </button>
            );
          })}
        </section>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}

/* ---------- Hoje: a linha do tempo de cada sala ---------- */
function VistaDoDia({ dia, cal, situacao, corDaSala, minAgora }: {
  dia: string; cal: Cal | null; situacao: (c: CirurgiaDoCalendario) => string;
  corDaSala: (id: string | null) => string; minAgora: number | null;
}) {
  const doDia = (cal?.cirurgias ?? []).filter(c => c.data === dia);
  const comHora = doDia.filter(c => c.hora && c.sala_id);
  const semLugar = doDia.filter(c => !c.hora || !c.sala_id);
  const ini = Math.min(7 * 60, ...comHora.map(c => Math.floor(minutos(c.hora!) / 60) * 60));
  const fim = Math.max(18 * 60, ...comHora.map(c => Math.ceil((minutos(c.hora!) + (c.duracao ?? 120)) / 60) * 60));
  const PX = 64 / 60;
  const altura = (fim - ini) * PX;
  return (
    <section className="cal-hoje" data-bloco="hoje">
      <div className="cal-hoje-grade" style={{ gridTemplateColumns: `56px repeat(${Math.max(1, (cal?.salas ?? []).length)}, minmax(170px, 1fr))` }}>
        <div />
        {(cal?.salas ?? []).map(s => (
          <div key={s.id} className="cal-sala-cab"><i style={{ background: corDaSala(s.id) }} /><b>{s.nome}</b>
            <span>{comHora.filter(c => c.sala_id === s.id).length}</span></div>
        ))}
        <div className="cal-horas" style={{ height: altura }}>
          {Array.from({ length: (fim - ini) / 60 + 1 }, (_, i) => <span key={i} style={{ top: i * 64 - 7 }}>{hhmm(ini + i * 60)}</span>)}
        </div>
        {(cal?.salas ?? []).map(s => (
          <div key={s.id} className="cal-trilho" style={{ height: altura }} data-sala={s.nome}>
            {comHora.filter(c => c.sala_id === s.id).map(c => {
              const st = situacao(c);
              const cor = corDaSala(s.id);
              const top = (minutos(c.hora!) - ini) * PX;
              const h = Math.max(36, (c.duracao ?? 120) * PX - 6);
              return (
                <div key={c.id} className={'cal-bloco' + (st === 'Concluída' ? ' feita' : '') + (h < 84 ? ' curto' : '')} data-situacao={st}
                     style={{ top: top + 3, height: h, borderLeftColor: cor, background: st === 'Concluída' ? '#FFFFFF' : cor + '14', borderColor: cor + '55' }}>
                  <div className="cal-cartao-l1"><b>{c.hora} – {hhmm(minutos(c.hora!) + (c.duracao ?? 120))}</b>
                    <span className="cal-situacao" style={{ color: st === 'Em andamento' ? '#15803D' : st === 'Concluída' ? '#5B6475' : cor }}>{st}</span></div>
                  <strong>{c.paciente}</strong>
                  <span>{c.procedimento}{c.cirurgiao ? ` · ${c.cirurgiao}` : ''}</span>
                </div>
              );
            })}
            {minAgora !== null && minAgora >= ini && minAgora <= fim && <span className="cal-agora" style={{ top: (minAgora - ini) * PX }} />}
          </div>
        ))}
      </div>
      {semLugar.length > 0 && (
        <div className="cal-sem-lugar" data-bloco="sem-horario">
          <b>Sem horário ou sem sala ({semLugar.length})</b>
          {semLugar.map(c => <span key={c.id}>{c.numero} · {c.paciente} · {c.procedimento}</span>)}
          <small>Marque a hora e a sala no agendamento da cirurgia para ela entrar na linha do tempo e no mapa da TV.</small>
        </div>
      )}
      {doDia.length === 0 && <p className="cal-vazio">Nenhuma cirurgia neste dia.</p>}
    </section>
  );
}

/* ---------- as salas ---------- */
function EditorDeSalas({ clienteId, aoMudar, avisar }: { clienteId: string; aoMudar: () => void; avisar: (t: string, b?: boolean) => void }) {
  const [salas, setSalas] = useState<SalaCirurgica[]>([]);
  const [nova, setNova] = useState('');
  const carregar = useCallback(async () => { setSalas(await salasCirurgicas(clienteId)); }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);
  async function salvar(id: string | null, nome: string, ordem: number, ativa: boolean) {
    const r = await salvarSalaCirurgica(clienteId, id, nome, ordem, ativa);
    avisar(r.motivo, r.ok);
    if (r.ok) { setNova(''); await carregar(); aoMudar(); }
  }
  return (
    <section className="cal-salas" data-bloco="editor-salas">
      <b>Salas do centro cirúrgico</b>
      {salas.map((s, i) => (
        <div key={s.id} className="cal-sala-linha">
          <input defaultValue={s.nome} aria-label="Nome da sala"
                 onBlur={e => { if (e.target.value.trim() && e.target.value !== s.nome) void salvar(s.id, e.target.value, s.ordem ?? (i + 1) * 10, s.ativa ?? true); }} />
          <label><input type="checkbox" checked={s.ativa ?? true} onChange={e => void salvar(s.id, s.nome, s.ordem ?? (i + 1) * 10, e.target.checked)} /> ativa</label>
        </div>
      ))}
      <div className="cal-sala-linha">
        <input value={nova} placeholder="Nova sala (ex.: Sala 4, Hemodinâmica)" onChange={e => setNova(e.target.value)} data-campo="nova-sala" />
        <button type="button" className="cal-secundario" disabled={!nova.trim()} onClick={() => void salvar(null, nova, (salas.length + 1) * 10, true)}>Adicionar</button>
      </div>
    </section>
  );
}
