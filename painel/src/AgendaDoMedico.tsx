import { useEffect, useMemo, useState } from 'react';
import {
  medicosDoCliente, gradeDoPeriodo, consultasNoPeriodo,
  bloqueiosDoRecurso, aberturasDoRecurso,
  type Medico, type Grade, type Consulta,
  type BloqueioNaAgenda, type Abertura
} from './dados';
import {
  reguaDoDiaDaGrade, marcadosPorDia, diaDaGrade
} from './grade';
import { Aviso, useAviso } from './Aviso';
import { DiaDoMedico } from './DiaDoMedico';
import { Encaixe } from './Encaixe';
import { ExpedienteDoMedico } from './ExpedienteDoMedico';
import { comoISO, somarDias, hojeNoFuso, diaNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  AGENDA DO MÉDICO
 *
 *  A forma é a da tela que a recepção já usa: o médico no topo,
 *  as abas Calendário e Expediente, o mês à esquerda e o dia
 *  escolhido à direita.
 *
 *  O conteúdo é o que eu construí por baixo: a régua do dia
 *  hora a hora, os nomes de quem está dentro antes de fechar, e
 *  as contas vindas do núcleo em vez de refeitas aqui.
 *
 *  ------------------------------------------------------------
 *  QUATRO CONSULTAS POR PERÍODO. SEMPRE QUATRO.
 *
 *    a grade      → expediente, extra, encaixe, fechado, fuso
 *    as consultas → quem está marcado, com nome
 *    os fechados  → com o `id`, para poder liberar
 *    os abertos   → com o `id`, para poder remover
 *
 *  Não é uma por dia. O mês tem 31 casinhas e cada uma mostra
 *  quantos marcados e quantas vagas — perguntar por dia seriam
 *  124 idas ao banco para desenhar uma tela. É o padrão que fez
 *  a aba ser lida 120 vezes no Apps Script.
 *
 *  ------------------------------------------------------------
 *  NENHUMA CONTA DE HORÁRIO MORA AQUI
 *
 *  Quem decide o que está livre é `nucleo/vagas.ts`, a mesma
 *  função que o assistente de marcação usa. Uma régua própria
 *  nesta tela seria a quinta implementação da mesma pergunta —
 *  e a primeira a discordar das outras numa tela feita para
 *  administrar a agenda.
 * ============================================================
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function AgendaDoMedico({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [medicoId, setMedicoId] = useState('');
  const [aba, setAba] = useState<'calendario' | 'expediente'>('calendario');
  const [mes, setMes] = useState(() => hojeNoFuso('America/Sao_Paulo').slice(0, 7));
  const [dia, setDia] = useState(() => hojeNoFuso('America/Sao_Paulo'));

  const [grade, setGrade] = useState<Grade | null>(null);
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioNaAgenda[]>([]);
  const [aberturas, setAberturas] = useState<Abertura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  /** Quando não é nulo, o assistente abre já nesse minuto. */
  const [marcando, setMarcando] = useState<number | null>(null);

  useEffect(() => {
    let valido = true;
    medicosDoCliente(clienteId)
      .then(l => {
        if (!valido) return;
        setMedicos(l);
        setMedicoId(a => a || (l[0]?.id ?? ''));
        if (!l.length) setCarregando(false);
      })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId]);

  // O período é o mês inteiro, sempre — mesmo na aba do dia. O
  // calendário e o painel da direita leem da mesma carga.
  const { de, ate } = useMemo(() => {
    const [ano, m] = mes.split('-').map(Number);
    const ultimo = new Date(ano!, m!, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
  }, [mes]);

  useEffect(() => {
    if (!medicoId) return;
    let valido = true;
    setCarregando(true);
    setErro('');

    Promise.all([
      gradeDoPeriodo(medicoId, de, ate),
      consultasNoPeriodo(clienteId, de, ate, null, medicoId),
      bloqueiosDoRecurso(medicoId, de, ate),
      aberturasDoRecurso(medicoId, de, ate)
    ])
      .then(([g, c, b, a]) => {
        if (!valido) return;
        if (g?.erro) setErro(g.erro);
        setGrade(g); setConsultas(c); setBloqueios(b); setAberturas(a);
        setCarregando(false);
      })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });

    return () => { valido = false; };
  }, [clienteId, medicoId, de, ate, recarga]);

  const fuso = grade?.fuso ?? 'America/Sao_Paulo';
  const hoje = hojeNoFuso(fuso);
  const medico = medicos.find(m => m.id === medicoId) ?? null;

  const porDia = useMemo(() => marcadosPorDia(consultas, fuso), [consultas, fuso]);

  const diasDoMes = useMemo(() => {
    const fora: string[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) fora.push(d);
    return fora;
  }, [de, ate]);

  /**
   * ------------------------------------------------------------
   *  O ESTADO DE CADA DIA — e só o estado
   *
   *  Os NÚMEROS saíram das casinhas em 08/10/2026. Trinta e um
   *  quadradinhos com dois números cada eram 62 algarismos
   *  disputando a atenção, e a pergunta que a recepção faz
   *  olhando o mês não é "quantas vagas tem o dia 22" — é
   *  **"onde ainda cabe gente?"**.
   *
   *  Isso é uma pergunta de cor, não de número. O quadradinho
   *  passou a responder só isso, e os números foram para o
   *  painel do dia escolhido, onde há espaço para eles
   *  significarem alguma coisa.
   *
   *  ------------------------------------------------------------
   *  `atende` É O QUE A RÉGUA TEM A DIZER
   *
   *  Dia sem expediente devolve régua vazia. Dia com expediente
   *  devolve linhas. Dia fechado por inteiro devolve a faixa
   *  fechada — ele ATENDE, só está fechado, e tem que continuar
   *  clicável para alguém poder liberar. Dia só com encaixe
   *  devolve a linha do encaixe, e também atende.
   *
   *  Os quatro casos saem de `r.length > 0`, sem um `if` para
   *  cada — que é como a lista de casos cresce e um deles fica
   *  para trás.
   * ------------------------------------------------------------
   */
  const resumo = useMemo(() => {
    const m = new Map<string, {
      atende: boolean; vagas: number; marcados: number;
      encaixes: number; fechado: boolean; aberto: boolean;
    }>();
    if (!grade) return m;
    for (const d of diasDoMes) {
      const r = reguaDoDiaDaGrade(grade, d, porDia.get(d) ?? []);
      m.set(d, {
        atende: r.length > 0,
        vagas: r.filter(l => l.estado === 'livre' || l.estado === 'encaixe').length,
        marcados: r.filter(l => l.estado === 'ocupado').length,
        encaixes: r.filter(l => l.estado === 'encaixe').length,
        fechado: r.some(l => l.estado === 'bloqueado'),
        aberto: (grade.extras ?? []).some(e => e.dia === d)
             || (grade.encaixes ?? []).some(e => e.dia === d)
      });
    }
    return m;
  }, [grade, porDia, diasDoMes]);

  const regua = useMemo(
    () => grade ? reguaDoDiaDaGrade(grade, dia, porDia.get(dia) ?? []) : [],
    [grade, dia, porDia]);

  const blocosDoDia = useMemo(
    () => grade ? diaDaGrade(grade, dia).blocos : [], [grade, dia]);

  function andarMes(passos: number) {
    const [ano, m] = mes.split('-').map(Number);
    const d = new Date(ano!, m! - 1 + passos, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const casinhas = useMemo(() => {
    const [ano, m] = de.split('-').map(Number);
    const primeiro = new Date(ano!, m! - 1, 1);
    const fora: (string | null)[] = [];
    for (let i = 0; i < primeiro.getDay(); i++) fora.push(null);
    for (const d of diasDoMes) fora.push(d);
    return fora;
  }, [de, diasDoMes]);

  // Trocar de mês leva o dia escolhido junto, senão o painel da
  // direita mostra um dia que não está no calendário.
  useEffect(() => {
    if (dia.slice(0, 7) !== mes) setDia(`${mes}-01`);
  }, [mes, dia]);

  /**
   * O painel abre num dia em que o médico ATENDE.
   *
   * Sem isto, trocar de médico ou de mês deixava a direita
   * mostrando "sem expediente neste dia" — uma tela inteira
   * dizendo que não há nada, quando há. O primeiro dia 1º de um
   * mês cai num sábado uma vez em sete.
   *
   * Procura a partir de hoje, porque é para frente que se marca.
   * Se o mês inteiro já passou, pega o último dia de atendimento
   * dele.
   */
  useEffect(() => {
    if (!grade || !resumo.size) return;
    if (resumo.get(dia)?.atende) return;
    const alvo = diasDoMes.find(d => d >= hoje && resumo.get(d)?.atende)
              ?? [...diasDoMes].reverse().find(d => resumo.get(d)?.atende);
    if (alvo && alvo !== dia) setDia(alvo);
  }, [grade, resumo, dia, diasDoMes, hoje]);

  if (erro && !grade) return <div className="ag-empty"><h3>{erro}</h3></div>;

  if (!medicos.length && !carregando) {
    return (
      <div className="porvir">
        <i className="fas fa-user-md" />
        <h3>Nenhum médico cadastrado</h3>
        <p>A agenda é de um médico — sem médico não há o que mostrar.</p>
      </div>
    );
  }

  return (
    <>
      {/* ---------------- a barra ---------------- */}
      <div className="agm-barra">
        <div className="agm-titulo">
          <i className="fas fa-calendar-days" />
          <span>Agenda do Médico</span>
        </div>

        <select className="input-select" value={medicoId} data-campo="medico"
                onChange={e => setMedicoId(e.target.value)} aria-label="Médico">
          {medicos.map(m => (
            <option key={m.id} value={m.id}>
              {m.nome}{m.especialidades ? ` — ${m.especialidades}` : ''}
            </option>
          ))}
        </select>

        <div className="agm-abas">
          <button className={'agm-aba' + (aba === 'calendario' ? ' ativa' : '')}
                  data-aba="calendario" onClick={() => setAba('calendario')}>
            Calendário
          </button>
          <button className={'agm-aba' + (aba === 'expediente' ? ' ativa' : '')}
                  data-aba="expediente" onClick={() => setAba('expediente')}>
            Expediente
          </button>
        </div>
      </div>

      {carregando && (
        <div className="loading-placeholder">
          <div className="spinner" /><p>Montando a agenda…</p>
        </div>
      )}

      {erro && grade && <div className="erro" style={{ marginBottom: 14 }}>{erro}</div>}

      {/* ---------------- CALENDÁRIO ---------------- */}
      {!carregando && grade && aba === 'calendario' && (
        <div className="agm-corpo" data-aba-ativa="calendario">

          <div className="agm-mes">
            <div className="agm-mes-topo">
              <button onClick={() => andarMes(-1)} aria-label="Mês anterior">
                <i className="fas fa-chevron-left" />
              </button>
              <strong>
                {MESES[Number(mes.split('-')[1]) - 1]} {mes.split('-')[0]}
              </strong>
              <button onClick={() => andarMes(1)} aria-label="Próximo mês">
                <i className="fas fa-chevron-right" />
              </button>
              <button className="agm-hoje"
                      onClick={() => { setMes(hoje.slice(0, 7)); setDia(hoje); }}>
                Hoje
              </button>
            </div>

            <div className="agm-grade">
              {DIAS_CURTOS.map(d => <div key={d} className="agm-cab">{d}</div>)}
              {casinhas.map((d, i) => d === null
                ? <div key={`v${i}`} className="agm-vazia" />
                : (() => {
                  const e = resumo.get(d);
                  // Verde tem vaga, vermelho está lotado, cinza não
                  // atende. O cinza vem com `disabled`: dia em que o
                  // médico não trabalha não é uma escolha ruim, é uma
                  // escolha que não existe — e botão que só serve para
                  // receber "não" ensina a equipe a ignorar botão.
                  //
                  // `lotado` exige marcados > 0. Um dia fechado por
                  // inteiro também tem zero vaga, e pintá-lo de
                  // vermelho diria "todo mundo marcou" sobre um dia
                  // em que ninguém marcou nada. Zero é o que aparece
                  // quando lotou E quando fechou — distinguir os dois
                  // é o trabalho desta linha.
                  const estado = !e?.atende     ? 'nao-atende'
                               : e.vagas > 0    ? 'tem-vaga'
                               : e.marcados > 0 ? 'lotado'
                               :                  'sem-vaga';
                  const cor = ' ' + estado;
                  return (
                    <button key={d} data-dia={d}
                            disabled={!e?.atende}
                            data-estado={estado}
                            title={!e?.atende ? 'o médico não atende neste dia'
                                 : `${e.vagas} livre(s) · ${e.marcados} marcado(s)`}
                            className={'agm-dia' + cor
                              + (e?.fechado ? ' fechado' : '')
                              + (e?.aberto ? ' aberto' : '')
                              + (d < hoje ? ' passou' : '')
                              + (d === hoje ? ' hoje' : '')
                              + (d === dia ? ' escolhido' : '')}
                            onClick={() => setDia(d)}>
                      <span className="agm-num">{Number(d.split('-')[2])}</span>
                    </button>
                  );
                })())}
            </div>

            <div className="agm-legenda">
              <span><em className="pt verde" /> há vaga</span>
              <span><em className="pt vermelho" /> lotado</span>
              <span><em className="pt cinza" /> não atende</span>
              <span><em className="pt semvaga" /> sem vaga</span>
              <span><em className="pt fech" /> agenda fechada</span>
              <span><em className="pt abre" /> encaixe ou agenda extra</span>
            </div>
          </div>

          <DiaDoMedico
            grade={grade}
            dia={dia}
            regua={regua}
            blocosDoDia={blocosDoDia}
            bloqueios={bloqueios}
            aberturas={aberturas}
            recursoId={medicoId}
            medico={medico?.nome ?? ''}
            aoMudar={() => setRecarga(n => n + 1)}
            aoAvisar={avisar}
            aoMarcarNoEncaixe={setMarcando}
          />
        </div>
      )}

      {/* ---------------- EXPEDIENTE ---------------- */}
      {!carregando && grade && aba === 'expediente' && medicoId && (
        <ExpedienteDoMedico
          recursoId={medicoId}
          medico={medico?.nome ?? ''}
          duracaoMin={grade.duracao_min}
          aoAvisar={avisar}
          aoMudar={() => setRecarga(n => n + 1)}
        />
      )}

      {marcando !== null && grade && medico && (
        <Encaixe
          clienteId={clienteId}
          recursoId={medicoId}
          medico={medico.nome}
          grade={grade}
          dia={dia}
          horaFixa={marcando}
          consultasDoDia={consultas.filter(c => diaNoFuso(c.inicio, fuso) === dia)}
          aoFechar={() => setMarcando(null)}
          aoPronto={m => {
            setMarcando(null);
            avisar(m, true);
            setRecarga(n => n + 1);
          }}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
