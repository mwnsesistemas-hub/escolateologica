import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { mapaDaTv, type MapaDaTv, type CirurgiaDaTv } from './dados';
import { temaDoHospital } from './Modulos';

/**
 * ============================================================
 *  O MAPA CIRÚRGICO DA TV                          (06/11/2026)
 *  `/mapa?c=<codigo>` — SEM login. O banco é o `080` (`mapa_tv`).
 *
 *  O Tom: *"uma tela para ser o mapa cirúrgico semanal para ficar
 *  exposto no centro cirúrgico, oscilando entre semanal e dia a cada
 *  10 segundos. Linda e legível numa tela de 50", nomes grandes. Ela
 *  atualiza à medida que há novos agendamentos."*
 *
 *  Três relógios, cada um com a sua função:
 *    · a cada 10 s: alterna Semana ↔ Hoje (a barra embaixo mostra);
 *    · a cada 1 s: o relógio grande (a hora do HOSPITAL, que veio do
 *      banco, mais o tempo que passou — não a hora do computador da TV);
 *    · a cada 20 s: busca o mapa de novo (agendamento novo aparece sozinho).
 *
 *  ⭐ Desenhada em 1920×1080 e ESCALADA para a tela: numa TV de 50" é o
 *     tamanho certo; num monitor menor, tudo encolhe junto e nada quebra.
 *  ⭐ O paciente chega pelo primeiro nome e as iniciais: o corte é no
 *     banco — a tela nem recebe o nome completo.
 * ============================================================
 */
const COR_SALA = ['#7EA2FF', '#B794FF', '#4FD1C1', '#FDBA74', '#F9A8D4', '#67E8F9', '#BEF264', '#FCD34D'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const TROCA_MS = 10_000;

const paraData = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const somar = (s: string, n: number) => { const d = paraData(s); d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function MapaTV({ codigo }: { codigo: string }) {
  const [mapa, setMapa] = useState<MapaDaTv | null>(null);
  const [falhou, setFalhou] = useState<'link' | 'rede' | null>(null);
  const [buscadoEm, setBuscadoEm] = useState(0);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  const [inicioDoCiclo, setInicioDoCiclo] = useState(() => Date.now());
  const [escala, setEscala] = useState(1);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    const buscar = () => mapaDaTv(codigo)
      .then(m => { if (!vivo.current) return; if (m) { setMapa(m); setBuscadoEm(Date.now()); setFalhou(null); } else setFalhou('link'); })
      .catch(() => { if (vivo.current) setFalhou(f => (f === 'link' ? f : 'rede')); });
    void buscar();
    const b = setInterval(buscar, 20_000);
    const t = setInterval(() => setAgoraMs(Date.now()), 250);
    const ajustar = () => setEscala(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => { vivo.current = false; clearInterval(b); clearInterval(t); window.removeEventListener('resize', ajustar); };
  }, [codigo]);

  const tema = useMemo(() => temaDoHospital(mapa?.cor ?? ''), [mapa?.cor]);
  const ciclo = (agoraMs - inicioDoCiclo) % (2 * TROCA_MS);
  const mostraDia = ciclo >= TROCA_MS;
  const fracao = (ciclo % TROCA_MS) / TROCA_MS;
  /* ⚠️ O ciclo começa UMA vez, quando o mapa chega pela primeira vez. A busca
     de 20 em 20 s traz um objeto novo a cada vez — se o ciclo recomeçasse
     junto, a TV voltaria para "Semana" de 20 em 20 s e quase nunca
     mostraria "Hoje". */
  const jaChegou = useRef(false);
  useEffect(() => { if (mapa && !jaChegou.current) { jaChegou.current = true; setInicioDoCiclo(Date.now()); } }, [mapa]);

  if (!mapa) {
    return (
      <div className="tv-fundo tv-aviso" style={{ background: '#0B1A33' }}>
        <p>{falhou === 'link'
          ? 'Este link do mapa cirúrgico não vale mais. Peça o link novo a quem cuida das cirurgias (Calendário cirúrgico → Mapa da TV).'
          : falhou === 'rede' ? 'Sem conexão. Tentando de novo…' : 'Abrindo o mapa cirúrgico…'}</p>
      </div>
    );
  }

  /* A hora do hospital: a que o banco mandou, mais o tempo que passou desde a busca. */
  const [diaBase, horaBase] = mapa.agora.split('T');
  const segBase = minutos(horaBase.slice(0, 5)) * 60 + Number(horaBase.slice(6, 8) || 0);
  const segAgora = segBase + Math.floor((agoraMs - buscadoEm) / 1000);
  const hoje = segAgora >= 86400 ? somar(diaBase, 1) : diaBase;
  const minAgora = Math.floor((segAgora % 86400) / 60);
  const d = paraData(hoje);
  const corDaSala = (id: string | null) => { const i = mapa.salas.findIndex(s => s.id === id); return i < 0 ? '#CBD5E1' : COR_SALA[i % COR_SALA.length]; };
  const situacao = (c: CirurgiaDaTv) => {
    if (c.realizada || c.data < hoje) return 'Concluída';
    if (c.data > hoje || !c.hora) return 'Agendada';
    const ini = minutos(c.hora), fim = ini + (c.duracao ?? 120);
    return minAgora >= fim ? 'Concluída' : minAgora >= ini ? 'Em andamento' : 'Agendada';
  };
  const dias = Array.from({ length: 7 }, (_, i) => somar(mapa.semana_de, i))
    .filter((x, i) => i < 6 || mapa.cirurgias.some(c => c.data === x));   // o domingo só se tiver cirurgia
  const doDia = mapa.cirurgias.filter(c => c.data === hoje && c.hora);

  return (
    <div className="tv-fundo" style={{ background: tema.painel }}>
      <div className="tv-palco" data-tela="mapa-tv" data-modo={mostraDia ? 'dia' : 'semana'}
           style={{ transform: `scale(${escala})`, ['--tv-painel' as any]: tema.painel } as CSSProperties}>
        <svg className="tv-pontos" aria-hidden="true" width="100%" height="100%">
          <defs><pattern id="tv-pontos" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#FFFFFF" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#tv-pontos)" />
        </svg>

        <header className="tv-topo">
          <div className="tv-marca">
            <span className="tv-selo">{mapa.logo ? <img src={mapa.logo} alt="" /> :
              <svg width="50" height="50" viewBox="0 0 30 30" aria-hidden="true"><path d="M11 3h8v8h8v8h-8v8h-8v-8H3v-8h8z" fill={tema.botao} /></svg>}</span>
            <div>
              <span className="tv-hospital">{mapa.hospital}</span>
              <h1>Mapa cirúrgico <em>· {mostraDia ? 'hoje' : 'semana'}</em></h1>
            </div>
          </div>
          <div className="tv-hora">
            <div className="tv-hora-texto">
              <span className={'tv-vivo' + (falhou ? ' caiu' : '')}><i />{falhou ? 'Reconectando' : 'Ao vivo'}</span>
              <span>{DIAS_LONGOS[d.getUTCDay()]}, {d.getUTCDate()} de {MESES[d.getUTCMonth()]}</span>
            </div>
            <b data-relogio>{hhmm(minAgora)}</b>
          </div>
        </header>

        {mostraDia ? (
          <main className="tv-salas" style={{ gridTemplateColumns: `repeat(${Math.max(1, mapa.salas.length)}, minmax(0, 1fr))` }}>
            {mapa.salas.map(s => {
              const l = doDia.filter(c => c.sala_id === s.id).sort((a, b) => (a.hora! < b.hora! ? -1 : 1));
              const emUso = l.some(c => situacao(c) === 'Em andamento');
              return (
                <section key={s.id} className="tv-sala" data-tv-sala={s.nome}>
                  <div className="tv-sala-cab">
                    <div><i style={{ background: corDaSala(s.id) }} /><h2>{s.nome}</h2></div>
                    <span className={emUso ? 'uso' : ''}>{emUso ? 'Em uso' : 'Livre agora'}</span>
                  </div>
                  {l.length === 0 && <p className="tv-vazio">Sem cirurgias hoje</p>}
                  {/* ⚠️ Para caber SEMPRE (a foto da tela pegou a 4ª cirurgia
                      cortada no rodapé): as concluídas viram uma linha curta, as
                      próximas ficam grandes até 3, e o resto vira "+ N". */}
                  {(() => {
                    const feitas = l.filter(c => situacao(c) === 'Concluída');
                    const vem = l.filter(c => situacao(c) !== 'Concluída');
                    return (<>
                      {feitas.slice(-2).map((c, i) => (
                        <div key={'f' + i} className="tv-feita" style={{ borderLeftColor: corDaSala(s.id) }} data-tv-situacao="Concluída">
                          <b>{c.hora}</b><span>{c.paciente}</span><em>concluída</em>
                        </div>
                      ))}
                      {feitas.length > 2 && <p className="tv-mais">+ {feitas.length - 2} concluída(s) antes</p>}
                      {vem.slice(0, 3).map((c, i) => {
                        const st = situacao(c);
                        return (
                          <div key={i} className={'tv-cartao ' + (st === 'Em andamento' ? 'agora' : '')}
                               style={{ borderLeftColor: corDaSala(s.id) }} data-tv-situacao={st}>
                            <div className="tv-l1"><b>{c.hora} – {hhmm(minutos(c.hora!) + (c.duracao ?? 120))}</b><span>{st}</span></div>
                            <strong>{c.paciente}</strong>
                            <span className="tv-proc">{c.procedimento}</span>
                            {c.cirurgiao && <span className="tv-cir">{c.cirurgiao}</span>}
                          </div>
                        );
                      })}
                      {vem.length > 3 && <p className="tv-mais">+ {vem.length - 3} mais tarde</p>}
                    </>);
                  })()}
                </section>
              );
            })}
          </main>
        ) : (
          <main className="tv-semana" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
            {dias.map(x => {
              const l = mapa.cirurgias.filter(c => c.data === x).sort((a, b) => ((a.hora ?? '99') < (b.hora ?? '99') ? -1 : 1));
              return (
                <section key={x} className={'tv-dia' + (x === hoje ? ' hoje' : '')} data-tv-dia={x}>
                  <div className="tv-dia-cab"><h2>{DIAS[paraData(x).getUTCDay()]} {paraData(x).getUTCDate()}{x === hoje ? ' · hoje' : ''}</h2><span>{l.length}</span></div>
                  {/* Até 5 cabem; com mais, 4 e o "+ N" (o dia completo aparece no Hoje). */}
                  {l.slice(0, l.length > 5 ? 4 : 5).map((c, i) => (
                    <div key={i} className="tv-mini" style={{ borderLeftColor: corDaSala(c.sala_id) }}>
                      <div className="tv-l1"><b>{c.hora ?? 's/ hora'}</b>
                        {c.sala_id && <span style={{ background: corDaSala(c.sala_id) }}>{mapa.salas.find(s => s.id === c.sala_id)?.nome}</span>}</div>
                      <strong>{c.paciente}</strong>
                      <span>{c.procedimento}</span>
                    </div>
                  ))}
                  {l.length > 5 && <p className="tv-mais">+ {l.length - 4} no dia</p>}
                </section>
              );
            })}
          </main>
        )}

        <footer className="tv-rodape">
          <div className="tv-abas"><span className={!mostraDia ? 'ativa' : ''}>Semana</span><span className={mostraDia ? 'ativa' : ''}>Hoje</span></div>
          <div className="tv-barra"><i style={{ width: `${fracao * 100}%` }} /></div>
          <span className="tv-proxima">{mostraDia ? 'Semana' : 'Hoje'} em {Math.max(1, Math.ceil((1 - fracao) * TROCA_MS / 1000))} s</span>
        </footer>
      </div>
    </div>
  );
}
