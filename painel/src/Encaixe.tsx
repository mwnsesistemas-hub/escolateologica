import { useEffect, useMemo, useState } from 'react';
import {
  servicosDoRecurso, conveniosDoCliente, marcarConsulta, marcarExame,
  type ServicoDoRecurso, type Convenio, type Paciente, type Grade
} from './dados';
import { BuscaPaciente } from './BuscaPaciente';
import { reguaDoDiaDaGrade, comoHora, instanteNoFuso } from './grade';
import { marcadosPorDia } from './grade';
import { paraMinutos } from '../../nucleo/tempo';
import type { Consulta } from './dados';

/**
 * ============================================================
 *  ENCAIXE — a vaga que não está na grade
 *
 *  O médico pede. A recepção abre um horário que o expediente
 *  não tem: 07:30 antes de começar, 12:30 no meio do almoço,
 *  18:10 depois do último.
 *
 *  ------------------------------------------------------------
 *  ⚠️ POR QUE A HORA AQUI É DIGITADA, E NÃO ESCOLHIDA NUMA LISTA
 *
 *  Porque encaixe é, por definição, o horário que a lista não
 *  tem. Um seletor de vagas ofereceria exatamente os horários
 *  que já estão livres — e para esses não é preciso encaixe
 *  nenhum: é Novo Agendamento.
 *
 *  A tela mostra, ao lado, o que o expediente tem naquele dia,
 *  para a pessoa saber onde está encaixando. Mas quem decide a
 *  hora é ela.
 *
 *  ------------------------------------------------------------
 *  O QUE CONTINUA VALENDO
 *
 *  Encaixe fura a GRADE, não as travas:
 *
 *    · dois pacientes no mesmo horário continua recusado
 *      (`recurso_sem_conflito`, no banco)
 *    · a regra dos 30 dias continua valendo
 *      (`marcar_consulta` confere o piso)
 *
 *  "Encaixe resolve falta de vaga, não regra de convênio" — a
 *  frase é do sistema antigo, e está no 011 por escrito.
 *
 *  ------------------------------------------------------------
 *  E O PACIENTE TEM QUE JÁ EXISTIR
 *
 *  O encaixe não cadastra ninguém. Quem é encaixado é quem o
 *  médico conhece — e um cadastro feito às pressas, num modal
 *  pequeno, no meio de um pedido urgente, é como nasce a
 *  duplicata que divide o histórico do paciente em dois.
 *
 *  Para cadastrar, Novo Agendamento, que tem o formulário
 *  inteiro e confere o CPF antes.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O QUE MUDOU EM 13/10/2026
 *
 *  O Tom: *"Se estou em uma agenda de exame, vai ser exame; se
 *  estou numa agenda de consulta, vai ser consulta. Hoje está
 *  aparecendo todas as especialidades, isso pode dar erro."*
 *
 *  Até hoje esta tela pedia `servicosDoCliente(cliente,
 *  'consulta')` — uma constante escrita no código — e chamava
 *  sempre `marcar_consulta`. Duas consequências:
 *
 *  1. Na agenda de um APARELHO, ela oferecia consulta. Um
 *     Holter às 07:00 nasceria como consulta: fora de todo
 *     relatório de exame, sem preparo, sem autorização.
 *
 *  2. Na agenda de um MÉDICO, ela oferecia **todos** os
 *     serviços de consulta do hospital. O ortopedista de ombro
 *     aparecia com "Consulta Oftalmológica" na lista.
 *
 *  ⭐ E nenhum dos dois dá erro. A vaga é gasta, a consulta do
 *     convênio é gasta, o paciente viaja — e os dois números do
 *     relatório dizem que deu tudo certo.
 *
 *  Agora a lista vem de `servicos_do_recurso`, que pergunta à
 *  `public.quem_faz_o_que` — a MESMA que o Novo Agendamento
 *  usa. E o botão manda para `marcar_exame` quando o serviço
 *  escolhido é exame.
 * ============================================================
 */

export function Encaixe({
  clienteId, recursoId, medico, grade, dia, horaFixa,
  consultasDoDia, aoPronto, aoFechar
}: {
  clienteId: string;
  recursoId: string;
  medico: string;
  grade: Grade;
  /** aaaa-mm-dd */
  dia: string;
  /**
   * Minutos desde a meia-noite, quando este modal foi aberto a
   * partir de uma VAGA DE ENCAIXE que já existe.
   *
   * Nesse caso a hora não se digita: ela é a vaga. Deixar o
   * campo livre convidaria a marcar a 08:10 numa vaga aberta
   * para as 07:30 — e aí a vaga continuaria lá, esperando
   * ninguém.
   */
  horaFixa?: number;
  consultasDoDia: Consulta[];
  aoPronto: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [servicos, setServicos] = useState<ServicoDoRecurso[]>([]);
  /** ⭐ "Mostrar os de outras especialidades". Nasce desligado. */
  const [mostrarOutras, setMostrarOutras] = useState(false);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState('');
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [servicoId, setServicoId] = useState('');
  const [convenioId, setConvenioId] = useState('');
  const [hora, setHora] = useState(
    horaFixa === undefined ? ''
      : `${String(Math.floor(horaFixa / 60)).padStart(2, '0')}:`
        + String(horaFixa % 60).padStart(2, '0'));
  const [obs, setObs] = useState('');

  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    // ⭐ A lista é do RECURSO, não do cliente. É esta linha que
    //   conserta os dois defeitos de uma vez.
    Promise.all([servicosDoRecurso(clienteId, recursoId), conveniosDoCliente(clienteId)])
      .then(([s, c]) => { if (valido) { setServicos(s); setConvenios(c); setCarregando(false); } })
      .catch(e => { if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId, recursoId]);

  // O dia como ele está: para a pessoa ver onde está enfiando a
  // consulta. Vem da MESMA régua que desenha a tela do médico.
  const regua = useMemo(() => {
    const porDia = marcadosPorDia(consultasDoDia, grade.fuso);
    return reguaDoDiaDaGrade(grade, dia, porDia.get(dia) ?? []);
  }, [grade, dia, consultasDoDia]);

  const minutos = paraMinutos(hora);
  const horaOk = minutos !== null && minutos >= 0 && minutos < 1440;

  // A tela já sabe que esse minuto está tomado — e avisa antes
  // do clique. Quem recusa de verdade continua sendo a trava do
  // banco, que também pega quem chegou no mesmo milissegundo.
  const duracao = grade.duracao_min;
  const colide = horaOk && regua.some(l =>
    l.estado === 'ocupado' && minutos! < l.fim && l.ini < minutos! + duracao);

  /* ⭐ A lista que a tela mostra: os da especialidade sempre, e
     os de fora só quando a pessoa pediu. */
  const deOutras = useMemo(
    () => servicos.filter(s => !s.da_especialidade), [servicos]);
  const oferecidos = useMemo(
    () => mostrarOutras ? servicos : servicos.filter(s => s.da_especialidade),
    [servicos, mostrarOutras]);
  const escolhido = useMemo(
    () => servicos.find(s => s.id === servicoId) ?? null, [servicos, servicoId]);

  const pode = !!paciente && !!servicoId && horaOk && !colide && !indo;

  async function gravar() {
    if (!pode) return;
    setIndo(true);
    setErro('');
    try {
      /* ⭐⭐⭐ A PORTA SEGUE O SERVIÇO, NÃO A TELA.
         Consulta e exame moram na mesma agenda desde setembro,
         mas nascem por funções diferentes: `marcar_exame`
         carrega preparo, autorização e a duração do subtipo.
         Marcar um Holter por `marcar_consulta` não dá erro —
         só produz um exame que não é exame em lugar nenhum. */
      const r = escolhido && escolhido.tipo !== 'consulta'
        ? await marcarExame({
            clienteId, recursoId,
            servicos: [servicoId],
            inicio: instanteNoFuso(dia, minutos!, grade.fuso),
            pacienteId: paciente!.id,
            convenioId: convenioId || null,
            observacoes: obs
          })
        : await marcarConsulta({
        clienteId, recursoId, servicoId,
        inicio: instanteNoFuso(dia, minutos!, grade.fuso),
        pacienteId: paciente!.id,
        convenioId: convenioId || null,
        observacoes: obs,
        ehEncaixe: true
      });
      if (!r.ok) { setErro(r.mensagem); setIndo(false); return; }
      aoPronto(r.mensagem);
    } catch (e) {
      setErro((e as Error).message ?? String(e));
      setIndo(false);
    }
  }

  return (
    <div className="modal" data-modal="encaixe">
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content" style={{ maxWidth: 820 }}>

        <div className="modal-header">
          <h3>{horaFixa === undefined ? 'Abrir encaixe' : 'Marcar no encaixe'}</h3>
          <button onClick={aoFechar} aria-label="Fechar"><i className="fas fa-times" /></button>
        </div>

        <div className="modal-body">
          <div className="mover-origem">
            <strong>{medico}</strong>
            <span>
              {dia.split('-').reverse().join('/')} · consultas de {duracao} minutos
            </span>
          </div>

          <div className="wiz-aviso-amarelo">
            O encaixe <strong>não aparece para o paciente</strong> em lugar
            nenhum: nem no chat, nem na campanha. É uma vaga aberta à mão,
            e some da lista assim que for usada.
          </div>

          {carregando && (
            <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
          )}

          {!carregando && (
            <div className="wiz-horario">
              <div>
                <h4 className="cal-sub">1 · Quem</h4>
                <BuscaPaciente
                  clienteId={clienteId}
                  termo={busca}
                  aoTermo={setBusca}
                  escolhido={paciente}
                  aoEscolher={setPaciente}
                  aoFalhar={setErro}
                />

                <h4 className="cal-sub" style={{ marginTop: 18 }}>2 · O quê</h4>
                <div className="form-group">
                  <label>Serviço *</label>
                  <select value={servicoId} data-campo="servico"
                          onChange={e => setServicoId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {oferecidos.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome_completo || s.nome}
                        {s.tipo !== 'consulta' ? ' · exame' : ''}
                        {!s.da_especialidade && s.especialidade
                          ? ` · ${s.especialidade}` : ''}
                      </option>
                    ))}
                  </select>

                  {/* ⭐⭐⭐ ESCONDER, E NÃO SUMIR.
                      O ortopedista de ombro não deve ver
                      "Consulta Oftalmológica" a um clique de
                      distância. Mas o pediatra que recebe o
                      irmão de 19 anos existe — e sumir sem
                      escape transforma a exceção legítima em
                      telefonema. */}
                  {!!deOutras.length && !mostrarOutras && (
                    <small className="wiz-dica" data-aviso="outras-especialidades">
                      {deOutras.length} serviço(s) de outra especialidade
                      {' '}escondido(s).{' '}
                      <button type="button" className="link-botao"
                              data-acao="mostrar-outras-especialidades"
                              onClick={() => setMostrarOutras(true)}>
                        Mostrar mesmo assim
                      </button>
                    </small>
                  )}

                  {!servicos.length && (
                    <small className="wiz-dica" data-aviso="nao-faz-nada">
                      <strong>Este recurso não faz nenhum serviço ativo.</strong>
                      {' '}Ligue um em <strong>Gestão de Exames</strong> ou em
                      {' '}<strong>Médicos</strong> antes de encaixar.
                    </small>
                  )}

                  {!!escolhido && escolhido.tipo !== 'consulta' && (
                    <small className="wiz-dica" data-aviso="vai-nascer-exame">
                      Este encaixe vai nascer como <strong>EXAME</strong>, com
                      {' '}{escolhido.duracao_efetiva} min — com preparo,
                      autorização e relatório de exame.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Convênio</label>
                  <select value={convenioId} onChange={e => setConvenioId(e.target.value)}>
                    <option value="">Particular</option>
                    {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Por que o encaixe?</label>
                  <input type="text" maxLength={300} value={obs}
                         onChange={e => setObs(e.target.value)}
                         placeholder="opcional — fica no card e na auditoria" />
                </div>
              </div>

              <div>
                <h4 className="cal-sub">3 · Que horas</h4>
                <div className="form-group">
                  <input type="time" value={hora} data-campo="hora"
                         readOnly={horaFixa !== undefined}
                         onChange={e => setHora(e.target.value)} />
                  {horaFixa !== undefined && (
                    <small className="wiz-dica">
                      A hora é a da vaga de encaixe que você acabou de abrir.
                    </small>
                  )}
                  {colide && (
                    <small style={{ color: 'var(--danger)' }}>
                      Já há consulta nesse horário. O banco recusaria.
                    </small>
                  )}
                </div>

                <p className="wiz-dica">Como o dia está:</p>
                <div className="cal-mini" data-lista="dia-do-encaixe">
                  {!regua.length && <p className="wiz-dica">Sem expediente neste dia.</p>}
                  {regua.map((l, i) => (
                    <div key={i} className={`cal-mini-linha ${l.estado}`}>
                      <span>{comoHora(l.ini)}</span>
                      <em>
                        {l.estado === 'ocupado'   ? 'marcado'
                       : l.estado === 'bloqueado' ? 'fechado'
                       : l.estado === 'passou'    ? 'já passou'
                       : 'livre'}
                      </em>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {erro && <div className="erro" style={{ marginTop: 14 }}>{erro}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary"
                    data-acao="fechar-encaixe"
                    onClick={aoFechar} disabled={indo}>
              Voltar
            </button>
            <button type="button" className="btn-primary" data-acao="confirmar-encaixe"
                    onClick={gravar} disabled={!pode}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Gravando…</>
                : <><i className="fas fa-plus" /> Encaixar {horaOk ? `às ${comoHora(minutos!)}` : ''}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
