import { useEffect, useMemo, useState } from 'react';
import {
  souMedico, minhaAgendaDoDia, marcarPresencaDoMedico, criarRetornoDoMedico,
  gradeDoPeriodo, type AtendimentoDoDia, type Grade
} from './dados';
import { vagasDoDiaDaGrade, comoHora } from './grade';
import { instanteNoFuso, hojeNoFuso, somarDias } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';
import { FRASE_DO_DIA } from './frases';

/**
 * ============================================================
 *  MEU DIA — O CONSULTÓRIO DO MÉDICO
 *  26/10/2026
 *
 *  O Tom mandou os três arquivos do painel médico que roda hoje
 *  no Apps Script, e com eles o que já foi aprendido em uso
 *  real. Esta tela é a continuação daquela, não uma tela nova —
 *  e o que está aqui dentro é quase todo decisão dele.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE "ATENDIDO" É MAIOR QUE "FALTOU"
 *
 *  Está escrito no CSS dele, e é o melhor pedaço dos três
 *  arquivos:
 *
 *  > *"No dia 03/09, as 17:03, a auditoria registrou:
 *  >   FALTOU / CONFIRMADO (desfez) / COMPARECEU — tres eventos
 *  >   em um minuto. O medico marcou Faltou, percebeu e desfez.
 *  >   Aconteceu no primeiro dia de uso."*
 *
 *  > *"Atendido e' o que acontece em quase toda consulta; Faltou
 *  >  e' a excecao. Dar o mesmo peso visual as duas convida ao
 *  >  engano."*
 *
 *  Então: Atendido cheio e largo, Faltou de contorno e estreito.
 *  Sem confirmação extra atrapalhando quem acerta.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ A TELA MUDA ANTES DA RESPOSTA DO SERVIDOR
 *
 *  Também dele: *"o medico nunca espera a planilha entre um
 *  paciente e outro."* O cartão muda no toque e o banco é
 *  avisado depois; se o banco recusar, volta atrás e diz por
 *  quê. O cartão é a verdade provisória, não a definitiva.
 *
 *  ------------------------------------------------------------
 *  ⭐ OS CONTADORES SAEM DA MESMA LISTA QUE DESENHA
 *
 *  Não vêm do banco separados. Número e lista calculados de
 *  fontes diferentes podem discordar — e aí ninguém sabe em qual
 *  acreditar. É a mesma escolha do encaixe e do retorno neste
 *  projeto: calcular na leitura em vez de guardar marca.
 *
 *  ------------------------------------------------------------
 *  ⚠️ UMA DIFERENÇA DELIBERADA PARA O SISTEMA DE HOJE
 *
 *  Lá o médico desfaz o "Atendido". Aqui a máquina de situações
 *  do `009_acoes` não deixa: *"Compareceu é um fato."* O engano
 *  de 03/09 continua coberto — FALTOU vai direto para
 *  COMPARECEU, com um toque a menos que no Apps Script. O que
 *  não dá é desfazer o Atendido, e a tela DIZ isso em vez de
 *  esconder o botão.
 * ============================================================
 */

type Filtro = 'agenda' | 'atender' | 'atendido' | 'falta';

const EM_ABERTO = ['AGENDADO', 'CONFIRMADO'];

/* ⚠️ Fora do componente desde 27/10: os atalhos do retorno
   escrevem a data por extenso num bloco que fica ACIMA de onde
   estas listas eram declaradas. Dentro do componente elas
   funcionavam por sorte da ordem de execução; fora, a pergunta
   nem existe — e elas param de ser recriadas a cada desenho. */
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
              'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function MeuDia({ clienteId, fuso = 'America/Sao_Paulo', semFrase = false }: {
  clienteId: string; fuso?: string;
  /** ⭐ 26/10: na porta `/medico` a frase já está no topo da
   *  página. Duas faixas na mesma tela seria uma faixa a mais
   *  entre o médico e o primeiro paciente do dia. */
  semFrase?: boolean;
}) {
  const { recado, avisar, fechar } = useAviso();

  const [carregando, setCarregando] = useState(true);
  const [souEu, setSouEu] = useState<{ ok: boolean; recurso_id: string | null;
                                       nome: string | null } | null>(null);
  const [dia, setDia] = useState(() => hojeNoFuso(fuso));
  const [lista, setLista] = useState<AtendimentoDoDia[]>([]);
  /* ⭐ O padrão é "a atender" — foi o pedido do Dr. Gustavo, e
     está certo: quem abre a tela no meio do expediente quer ver
     quem falta, não quem já passou. */
  const [filtro, setFiltro] = useState<Filtro>('atender');
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  /** A frase do dia. Decorativa, e escolhida uma vez por carga. */
  const frase = useMemo(() => FRASE_DO_DIA(), []);

  /* ---------------- quem sou eu ---------------- */
  useEffect(() => {
    let valido = true;
    souMedico(clienteId)
      .then(r => { if (valido) setSouEu(r); })
      .catch(e => { if (valido) setErro((e as Error).message ?? String(e)); });
    return () => { valido = false; };
  }, [clienteId]);

  /* ---------------- a agenda do dia ---------------- */
  useEffect(() => {
    if (!souEu?.ok) return;
    let valido = true;
    setCarregando(true);
    minhaAgendaDoDia(clienteId, dia)
      .then(l => { if (valido) { setLista(l); setErro(''); } })
      .catch(e => { if (valido) setErro((e as Error).message ?? String(e)); })
      .finally(() => { if (valido) setCarregando(false); });
    return () => { valido = false; };
  }, [clienteId, dia, souEu?.ok, recarga]);

  /* ---------------- os contadores ---------------- */
  const conta = useMemo(() => {
    const c = { agenda: 0, atender: 0, atendido: 0, falta: 0, cancelado: 0 };
    for (const a of lista) {
      if (a.situacao === 'CANCELADO') { c.cancelado++; continue; }
      c.agenda++;
      if (a.situacao === 'COMPARECEU') c.atendido++;
      else if (a.situacao === 'FALTOU') c.falta++;
      else c.atender++;
    }
    return c;
  }, [lista]);

  /** Cancelada não entra em filtro nenhum: ela aparece só pelo
   *  botão discreto no fim da lista "na agenda". Se entrasse, o
   *  número do cartão discordaria do que está na tela. */
  function passa(a: AtendimentoDoDia) {
    if (a.situacao === 'CANCELADO') return false;
    if (filtro === 'agenda')   return true;
    if (filtro === 'atendido') return a.situacao === 'COMPARECEU';
    if (filtro === 'falta')    return a.situacao === 'FALTOU';
    return EM_ABERTO.includes(a.situacao);
  }

  const visiveis = lista.filter(passa);
  const canceladas = lista.filter(a => a.situacao === 'CANCELADO');
  const [verCanceladas, setVerCanceladas] = useState(false);

  /* ---------------- marcar presença ---------------- */
  const [indo, setIndo] = useState<string | null>(null);

  async function marcar(a: AtendimentoDoDia, situacao: string) {
    if (indo) return;
    const antes = a.situacao;
    setIndo(a.id);
    /* ⭐ A tela muda ANTES. Ver o cabeçalho deste arquivo. */
    setLista(l => l.map(x => x.id === a.id ? { ...x, situacao } : x));
    try {
      const r = await marcarPresencaDoMedico(clienteId, a.id, situacao);
      if (!r.ok) {
        setLista(l => l.map(x => x.id === a.id ? { ...x, situacao: antes } : x));
        avisar(r.mensagem, false);
        return;
      }
      avisar(r.mensagem, true);
      /* ⭐ "Atendido" abre a pergunta do retorno NA HORA — o
         momento de decidir é com o paciente ainda na sala. */
      if (situacao === 'COMPARECEU' && !a.ja_tem_retorno) {
        abrirRetorno({ ...a, situacao });
      }
    } catch (e) {
      setLista(l => l.map(x => x.id === a.id ? { ...x, situacao: antes } : x));
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(null);
    }
  }

  /* ---------------- o retorno ---------------- */
  const [ret, setRet] = useState<AtendimentoDoDia | null>(null);
  const [retDia, setRetDia] = useState('');
  const [retGrade, setRetGrade] = useState<Grade | null>(null);
  const [retMin, setRetMin] = useState(-1);
  const [retMotivo, setRetMotivo] = useState('');
  const [retPedeMotivo, setRetPedeMotivo] = useState(false);
  const [retAviso, setRetAviso] = useState('');
  const [retIndo, setRetIndo] = useState(false);

  function abrirRetorno(a: AtendimentoDoDia) {
    setRet(a);
    setRetDia(''); setRetGrade(null); setRetMin(-1);
    setRetMotivo(''); setRetPedeMotivo(false); setRetAviso('');
  }

  /* ⚠️⚠️ TROCAR DE DATA TEM QUE APAGAR A EXIGÊNCIA DE MOTIVO.
   *
   *  Achado em 27/10, e o defeito era de ontem: `retPedeMotivo`
   *  ficava ligado depois que o banco pedia o motivo, e NÃO era
   *  desligado ao escolher outra data.
   *
   *  O médico apertava 7 dias, levava o pedido de motivo,
   *  mudava de ideia e apertava 90 — e a tela continuava
   *  exigindo um motivo que a regra não pede mais, com o
   *  "Confirmar retorno" travado. Ele concluiria que o botão
   *  quebrou.
   *
   *  ⭐ O TEXTO QUE ELE JÁ DIGITOU FICA. Só a exigência cai.
   *     Apagar o que a pessoa escreveu porque ela mexeu na data
   *     ao lado é castigo, e quem escreve de novo escreve "ok".
   *     Se a regra pedir outra vez, o motivo já está ali. */
  function esqueceraExigencia() {
    setRetPedeMotivo(false); setRetAviso('');
  }

  async function escolherDiaDoRetorno(d: string) {
    setRetDia(d); setRetMin(-1); setRetGrade(null); setRetPulo(null);
    esqueceraExigencia();
    if (!d || !souEu?.recurso_id) return;
    try {
      setRetGrade(await gradeDoPeriodo(souEu.recurso_id, d, d));
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  /* ════════════════════════════════════════════════════════════
   *  ⭐⭐⭐ OS ATALHOS — 7, 15, 30, 45, 60, 90
   *
   *  O Tom: *"botões de atalhos 7, 15, 30, 45, 60, 90 dias para
   *  retorno e o calendário carrega a data mais próxima depois
   *  desse atalho (para agilizar o trabalho dele). Aqui tem que
   *  ser muito rápido."*
   *
   *  ------------------------------------------------------------
   *  ⚠️ "A DATA MAIS PRÓXIMA DEPOIS" É O PEDIDO INTEIRO
   *
   *  Pular para hoje+30 e parar ali seria quase inútil: hoje+30
   *  cai num sábado, ou num dia em que ele não atende, ou num dia
   *  lotado. O médico apertaria o atalho e leria "nenhum horário
   *  livre neste dia" — um atalho que dá trabalho.
   *
   *  Então o atalho não escolhe UM dia. Ele varre a partir dali
   *  e para no primeiro dia que **tem vaga de verdade**, pela
   *  mesma régua que desenha as vagas.
   *
   *  ⭐ UMA chamada ao banco, não trinta. `grade_do_periodo` já
   *     aceita um intervalo; pedir dia a dia até achar seria
   *     rápido no consultório vazio e lento justamente no médico
   *     cheio, que é quem precisa.
   * ════════════════════════════════════════════════════════════ */
  const ATALHOS = [7, 15, 30, 45, 60, 90];
  /** Quantos dias varrer à frente antes de desistir. */
  const JANELA = 45;
  const [retPulo, setRetPulo] = useState<number | null>(null);
  const [retPulando, setRetPulando] = useState(false);

  /* As mesmas palavras da barra do dia, para a tela falar uma
     língua só. */
  const porExtenso = (diaISO: string) => {
    const x = new Date(diaISO + 'T12:00:00');
    return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`;
  };
  const diasAte = (diaISO: string) =>
    Math.round((new Date(diaISO + 'T12:00:00').getTime()
              - new Date(hojeNoFuso(fuso) + 'T12:00:00').getTime()) / 86400000);

  async function pularPara(dias: number) {
    if (!souEu?.recurso_id || retPulando) return;
    setRetPulando(true); setRetPulo(dias);
    setRetMin(-1); setRetGrade(null); setRetDia('');
    esqueceraExigencia();
    try {
      const de  = somarDias(hojeNoFuso(fuso), dias);
      const ate = somarDias(de, JANELA);
      const g   = await gradeDoPeriodo(souEu.recurso_id, de, ate);

      let achado = '';
      for (let i = 0; i <= JANELA; i++) {
        const d = somarDias(de, i);
        if (vagasDoDiaDaGrade(g, d).length > 0) { achado = d; break; }
      }

      if (!achado) {
        /* ⚠️ Dizer o que aconteceu, e não só não fazer nada.
           Atalho que não mexe na tela é indistinguível de botão
           quebrado. */
        setRetGrade(null); setRetDia('');
        avisar(`Sem vaga nos ${JANELA} dias seguintes a ${dias} dias. `
             + 'Escolha a data no calendário.', false);
        return;
      }
      setRetGrade(g); setRetDia(achado);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setRetPulando(false);
    }
  }

  /* ⭐ As vagas saem do MESMO `vagasDoDiaDaGrade` que o resto do
     painel usa. Uma régua própria aqui seria a quarta conta de
     "o que está livre" — e a primeira a discordar das outras
     numa tela onde o paciente está sentado na frente. */
  const vagas = useMemo(
    () => (retGrade && retDia) ? vagasDoDiaDaGrade(retGrade, retDia) : [],
    [retGrade, retDia]);

  async function confirmarRetorno() {
    if (!ret || retMin < 0 || retIndo) return;
    setRetIndo(true);
    try {
      const r = await criarRetornoDoMedico({
        clienteId, origemId: ret.id,
        inicio: instanteNoFuso(retDia, retMin, fuso),
        motivo: retMotivo.trim() || null
      });
      if (!r.ok) {
        /* ⭐ `pede_motivo` é FATO vindo do banco, não leitura da
           frase. Regra sobre o mensageiro quebra quando o
           mensageiro muda. */
        if (r.pede_motivo) {
          setRetPedeMotivo(true);
          setRetAviso(r.mensagem);
        } else {
          avisar(r.mensagem, false);
        }
        return;
      }
      avisar(r.mensagem, true);
      setRet(null);
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setRetIndo(false);
    }
  }

  /* ════════════════════════════════════════════════════════
   *  O DESENHO
   * ════════════════════════════════════════════════════════ */

  if (souEu && !souEu.ok) {
    return (
      <div className="med-vazio" data-aviso="nao-sou-medico">
        <i className="fas fa-user-doctor" />
        <strong>Você ainda não tem agenda aqui</strong>
        <p>
          Esta tela mostra os seus pacientes do dia. Para ela funcionar, a
          administração precisa ligar o seu acesso ao seu cadastro de
          profissional — em <strong>Médicos</strong>, na ficha do
          profissional, no campo <strong>Acesso ao painel</strong>.
        </p>
      </div>
    );
  }

  const ehHoje = dia === hojeNoFuso(fuso);
  const d = new Date(dia + 'T12:00:00');

  return (
    <div className="med-raiz" data-tela="meu-dia">
      <Aviso recado={recado} aoFechar={fechar} />

      {/* ---------- a tira da frase ---------- */}
      {!semFrase && (
        <div className="med-tira" data-bloco="frase">
          <div className="med-tira-txt">{frase.texto}</div>
          <div className="med-tira-autor">{frase.autor}</div>
        </div>
      )}

      {/* ---------- a barra do dia ---------- */}
      <div className="med-dia" data-bloco="barra-do-dia">
        <button className="med-nav" data-acao="dia-anterior"
                aria-label="Dia anterior"
                onClick={() => setDia(somarDias(dia, -1))}>
          <i className="fas fa-chevron-left" />
        </button>
        <div className="med-dia-txt">
          <strong data-campo="dia-por-extenso">
            {DIAS[d.getDay()]}, {d.getDate()} de {MESES[d.getMonth()]}
          </strong>
          {ehHoje
            ? <span className="med-hoje" data-marca="hoje">hoje</span>
            : <span>&nbsp;</span>}
        </div>
        <button className="med-nav" data-acao="dia-seguinte"
                aria-label="Próximo dia"
                onClick={() => setDia(somarDias(dia, 1))}>
          <i className="fas fa-chevron-right" />
        </button>
        <input type="date" className="med-data" data-campo="ir-para-dia"
               value={dia} onChange={e => e.target.value && setDia(e.target.value)} />
      </div>

      {/* ---------- os quatro contadores ---------- */}
      <div className="med-filtros" data-bloco="filtros">
        {([
          ['agenda',   'na agenda', conta.agenda],
          ['atender',  'a atender', conta.atender],
          ['atendido', 'atendidos', conta.atendido],
          ['falta',    'faltas',    conta.falta]
        ] as [Filtro, string, number][]).map(([k, rotulo, n]) => (
          <button key={k}
                  className={'med-filtro f-' + k + (filtro === k ? ' on' : '')}
                  data-filtro={k} data-ligado={filtro === k ? 'sim' : 'nao'}
                  onClick={() => { setFiltro(k); setVerCanceladas(false); }}>
            <b>{carregando ? '—' : n}</b>
            <span>{rotulo}</span>
          </button>
        ))}
      </div>

      {!!erro && <div className="erro-caixa">{erro}</div>}

      {/* ---------- a lista ---------- */}
      {carregando ? (
        <div className="med-lista">
          <div className="med-esqueleto" /><div className="med-esqueleto" />
          <div className="med-esqueleto" />
        </div>
      ) : (
        <div className="med-lista" data-bloco="atendimentos">
          {!visiveis.length && <Vazio filtro={filtro} />}
          {visiveis.map(a => (
            <Cartao key={a.id} a={a} indo={indo === a.id}
                    aoMarcar={(s) => { void marcar(a, s); }}
                    aoRetorno={() => abrirRetorno(a)} />
          ))}

          {/* ⭐ As canceladas ficam fora dos filtros e aparecem
              só aqui. Se entrassem no "na agenda", o número do
              cartão discordaria do que está na tela. */}
          {filtro === 'agenda' && !!canceladas.length && (
            <>
              <button className="med-canceladas" data-acao="ver-canceladas"
                      onClick={() => setVerCanceladas(v => !v)}>
                <i className={verCanceladas ? 'fas fa-eye-slash' : 'fas fa-eye'} />{' '}
                {verCanceladas
                  ? 'esconder as canceladas'
                  : `ver ${canceladas.length} cancelada(s)`}
              </button>
              {verCanceladas && canceladas.map(a => (
                <Cartao key={a.id} a={a} indo={false}
                        aoMarcar={() => {}} aoRetorno={() => {}} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ---------- a folha do retorno ---------- */}
      {!!ret && (
        <div className="modal" data-modal="retorno">
          <div className="modal-overlay" onClick={() => setRet(null)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Marcar retorno</h3>
              <button onClick={() => setRet(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <p className="med-quem">{ret.paciente} · {ret.servico}</p>

              {/* ⭐⭐⭐ Os atalhos vêm ANTES do calendário, e são
                  o caminho normal. O calendário fica para a
                  exceção. Quem desenha o atalho embaixo do campo
                  está dizendo "primeiro faça do jeito difícil". */}
              <div className="med-atalhos" data-bloco="atalhos-do-retorno">
                {ATALHOS.map(d => (
                  <button key={d}
                          className={'med-atalho' + (retPulo === d ? ' escolhido' : '')}
                          data-atalho={d} disabled={retPulando}
                          onClick={() => { void pularPara(d); }}>
                    {d}<small>dias</small>
                  </button>
                ))}
              </div>

              {retPulando && (
                <div className="med-procurando" data-aviso="procurando">
                  <i className="fas fa-circle-notch fa-spin" /> procurando a
                  primeira vaga…
                </div>
              )}

              {/* ⭐ Quando o atalho pula um pedaço, ele DIZ quanto
                  pulou. O médico combinou "um mês" com o paciente
                  e a tela foi para 38 dias — ele precisa ver
                  isso antes de confirmar, não depois. */}
              {!!retPulo && !!retDia && !retPulando && (
                <div className="dia-nota azul" data-aviso="pulou-para">
                  <strong data-campo="dia-achado">{porExtenso(retDia)}</strong>
                  <small>
                    primeira vaga a partir de {retPulo} dias
                    {diasAte(retDia) !== retPulo &&
                      ` — caiu em ${diasAte(retDia)}`}
                  </small>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="ret-dia">
                  {retPulo ? 'Ou escolha outra data' : 'Data do retorno'}
                </label>
                <input id="ret-dia" type="date" data-campo="retorno-dia"
                       min={somarDias(hojeNoFuso(fuso), 1)}
                       value={retDia}
                       onChange={e => { void escolherDiaDoRetorno(e.target.value); }} />
              </div>

              {!!retDia && !vagas.length && (
                <div className="dia-nota amarela" data-aviso="sem-vaga">
                  Nenhum horário livre neste dia. Escolha outra data.
                </div>
              )}

              {!!vagas.length && (
                <div className="med-vagas" data-bloco="vagas-do-retorno">
                  {vagas.map(v => (
                    <button key={v.ini}
                            className={'med-vaga' + (retMin === v.ini ? ' escolhida' : '')}
                            data-vaga={v.ini}
                            onClick={() => setRetMin(v.ini)}>
                      {comoHora(v.ini)}
                    </button>
                  ))}
                </div>
              )}

              {/* ⭐⭐⭐ A REGRA AVISA, NÃO TRAVA — e pede o motivo.
                  O Tom: *"tirar essa decisao dele so criaria
                  telefonema para a administracao no meio do
                  consultorio."* Autonomia com registro. */}
              {retPedeMotivo && (
                <div className="dia-nota amarela" data-bloco="motivo-do-retorno">
                  <strong>{retAviso}</strong>
                  <textarea rows={2} data-campo="retorno-motivo"
                            value={retMotivo}
                            placeholder="Ex.: revisão de pós-operatório, ajuste de medicação."
                            onChange={e => setRetMotivo(e.target.value)} />
                  <small className="form-dica">
                    {retMotivo.trim().length >= 10
                      ? '✓ pronto'
                      : 'Mínimo 10 caracteres. Fica registrado com o seu nome.'}
                  </small>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" data-acao="fechar-retorno"
                        onClick={() => setRet(null)}>Agora não</button>
                <button className="btn-primary" data-acao="confirmar-retorno"
                        disabled={retIndo || retMin < 0
                          || (retPedeMotivo && retMotivo.trim().length < 10)}
                        onClick={() => { void confirmarRetorno(); }}>
                  <i className="fas fa-calendar-plus" /> Confirmar retorno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
 *  O CARTÃO DE UM ATENDIMENTO
 * ════════════════════════════════════════════════════════════ */
function Cartao({ a, indo, aoMarcar, aoRetorno }: {
  a: AtendimentoDoDia; indo: boolean;
  aoMarcar: (situacao: string) => void;
  aoRetorno: () => void;
}) {
  const atendido  = a.situacao === 'COMPARECEU';
  const faltou    = a.situacao === 'FALTOU';
  const cancelado = a.situacao === 'CANCELADO';
  const emAberto  = EM_ABERTO.includes(a.situacao);

  const classe = cancelado ? 's-cancelado'
               : atendido  ? 's-atendido'
               : faltou    ? 's-faltou'
               : a.situacao === 'CONFIRMADO' ? 's-confirmado' : '';

  return (
    <div className={'med-cartao ' + classe}
         data-atendimento={a.id} data-situacao={a.situacao}>
      <span className="med-barra" aria-hidden="true" />

      <div className="med-hora">
        <b>{a.hora}</b>
        <span>{a.duracao_min} min</span>
      </div>

      <div className="med-corpo">
        <div className="med-linha1">
          <strong>{a.paciente}</strong>
          {a.idade !== null && (
            <span className="med-idade" data-campo="idade">{a.idade} anos</span>
          )}
          <Selo situacao={a.situacao} />
          {a.eh_retorno && !cancelado && (
            <em className="cad-tag" data-tag="retorno">
              <i className="fas fa-rotate-left" /> retorno
            </em>
          )}
        </div>

        <div className="med-linha2">
          <span><i className="fas fa-stethoscope" /> {a.servico}</span>
          {/* ⚠️ Convênio SIM, telefone NÃO. O convênio muda a
              consulta — o médico precisa saber por qual ele está
              atendendo. O telefone não muda nada dentro do
              consultório, e o banco nem manda esse campo. */}
          <span><i className="fas fa-hospital" /> {a.convenio}</span>
        </div>

        {a.eh_encaixe && !cancelado && (
          <div className="med-tarja" data-tarja="encaixe">
            <i className="fas fa-plus" /> Encaixe — vaga aberta fora da grade
          </div>
        )}
        {a.ja_tem_retorno && (
          <div className="med-tarja" data-tarja="ja-tem-retorno">
            <i className="fas fa-calendar-check" /> Já saiu com retorno marcado
          </div>
        )}
      </div>

      {!cancelado && (
        <div className="med-acoes">
          {emAberto && (
            <>
              {/* ⭐⭐⭐ Atendido CHEIO e largo; Faltou de contorno
                  e estreito. O incidente de 03/09, 17:03. */}
              <button className="med-btn b-atendido" data-acao="atendido"
                      disabled={indo}
                      onClick={() => aoMarcar('COMPARECEU')}>
                <i className="fas fa-check" /> Atendido
              </button>
              <button className="med-btn b-faltou" data-acao="faltou"
                      disabled={indo}
                      onClick={() => aoMarcar('FALTOU')}>
                <i className="fas fa-user-xmark" /> Faltou
              </button>
            </>
          )}

          {/* ⭐ Quem faltou pode ser engano da recepção: o paciente
              estava na sala e ninguém deu baixa. Um toque conserta
              — no Apps Script eram dois. */}
          {faltou && (
            <button className="med-btn b-atendido" data-acao="desfazer-falta"
                    disabled={indo}
                    onClick={() => aoMarcar('COMPARECEU')}>
              <i className="fas fa-rotate-left" /> Na verdade, atendi
            </button>
          )}

          {/* ⚠️ Atendido NÃO tem desfazer: "Compareceu é um fato",
              regra do 009. A tela DIZ isso em vez de esconder o
              botão — guarda que recusa em silêncio é
              indistinguível de botão quebrado. */}
          {atendido && (
            <span className="med-nota-fixa" data-nota="sem-desfazer">
              Atendimento registrado. Para desfazer, fale com a recepção.
            </span>
          )}

          {/* Retorno só faz sentido para quem esteve aqui. */}
          {!faltou && !a.ja_tem_retorno && (
            <button className="med-btn b-retorno" data-acao="retorno"
                    disabled={indo} onClick={aoRetorno}>
              <i className="fas fa-calendar-plus" /> Retorno
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Selo({ situacao }: { situacao: string }) {
  const mapa: Record<string, [string, string]> = {
    AGENDADO:   ['t-aguardando', 'aguardando'],
    CONFIRMADO: ['t-confirmado', 'confirmado'],
    COMPARECEU: ['t-atendido',   'atendido'],
    FALTOU:     ['t-faltou',     'faltou'],
    CANCELADO:  ['t-cancelado',  'cancelado']
  };
  const [classe, rotulo] = mapa[situacao] ?? ['t-aguardando', situacao];
  return <em className={'cad-tag ' + classe} data-selo={situacao}>{rotulo}</em>;
}

function Vazio({ filtro }: { filtro: Filtro }) {
  const textos: Record<Filtro, [string, string, string]> = {
    agenda:   ['fa-calendar-check', 'Nenhum atendimento neste dia',
               'Use as setas para trocar de dia.'],
    atender:  ['fa-circle-check', 'Ninguém esperando',
               'Todos os pacientes deste dia já foram marcados.'],
    atendido: ['fa-user-check', 'Nenhum atendimento marcado ainda',
               'Eles aparecem aqui conforme você marca "Atendido".'],
    falta:    ['fa-face-smile', 'Nenhuma falta', 'Ninguém faltou neste dia.']
  };
  const [icone, titulo, dica] = textos[filtro];
  return (
    <div className="med-vazio" data-vazio={filtro}>
      <i className={'fas ' + icone} />
      <strong>{titulo}</strong>
      <p>{dica}</p>
    </div>
  );
}
