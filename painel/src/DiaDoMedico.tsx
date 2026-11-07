import { useEffect, useMemo, useRef, useState } from 'react';
import {
  consultasNaFaixa, bloquearFaixa, liberarBloqueio,
  abrirAgendaExtra, abrirEncaixe, removerAbertura,
  type ConsultaNaFaixa, type BloqueioNaAgenda, type Abertura,
  type Grade
} from './dados';
import { comoHora, type LinhaDoDia } from './grade';
import { paraMinutos } from '../../nucleo/tempo';
import { porExtensoNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  O DIA DE UM MÉDICO — a coluna da direita
 *
 *  A mesma forma da tela de hoje: o dia escolhido, os blocos do
 *  expediente em chips, e as três coisas que se faz com a
 *  agenda dele.
 *
 *    FECHAR        tira horário
 *    ENCAIXE       põe uma vaga que o paciente nunca vê
 *    AGENDA EXTRA  põe expediente, e o paciente vê
 *
 *  ------------------------------------------------------------
 *  O QUE MUDOU EM RELAÇÃO À TELA DE HOJE, E POR QUÊ
 *
 *  **A régua aparece primeiro.** Antes de oferecer os três
 *  botões, a tela mostra o dia hora a hora: quem está marcado,
 *  o que está livre, o que está fechado, o que é encaixe. As
 *  três ações mexem no dia — e mexer no que não se está vendo é
 *  como se fecha a quinta-feira de quatro pacientes.
 *
 *  **Fechar aceita um período.** Férias de duas semanas eram
 *  catorze idas à tela. Os atalhos de um dia continuam lá.
 *
 *  **Fechar mostra quem está dentro, antes do clique.** Com
 *  nome e hora. E diz, com todas as letras, que ninguém é
 *  cancelado.
 *
 *  **O encaixe oferece marcar logo depois de criar.** Quem abre
 *  o buraco quase sempre já sabe para quem ele é.
 *
 *  **A agenda extra dá recibo.** "Antes 8 horários, agora 16."
 *  Salvo com sucesso sem número é só uma promessa — e no Apps
 *  Script já houve `success: true` em cima de nada feito.
 * ============================================================
 */

type Secao = 'fechar' | 'encaixe' | 'extra' | null;

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const diaBR = (iso: string) => iso.split('-').reverse().join('/');

export function DiaDoMedico({
  grade, dia, regua, blocosDoDia, bloqueios, aberturas,
  recursoId, medico, aoMudar, aoAvisar, aoMarcarNoEncaixe
}: {
  grade: Grade;
  /** aaaa-mm-dd */
  dia: string;
  regua: LinhaDoDia[];
  /** os blocos do expediente deste dia, já com a agenda extra */
  blocosDoDia: { ini: number; fim: number }[];
  bloqueios: BloqueioNaAgenda[];
  aberturas: Abertura[];
  recursoId: string;
  medico: string;
  /** recarregar tudo */
  aoMudar: () => void;
  aoAvisar: (mensagem: string, bom: boolean) => void;
  /** abre o assistente já no horário do encaixe */
  aoMarcarNoEncaixe: (minutos: number) => void;
}) {
  const [secao, setSecao] = useState<Secao>(null);

  // ---------- fechar ----------
  const [fDe, setFDe] = useState(dia);
  const [fAte, setFAte] = useState(dia);
  const [fDiaInteiro, setFDiaInteiro] = useState(true);
  const [fIni, setFIni] = useState('12:00');
  const [fFim, setFFim] = useState('13:00');
  const [fMotivo, setFMotivo] = useState('');
  const [dentro, setDentro] = useState<ConsultaNaFaixa[]>([]);
  const [olhando, setOlhando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  // ---------- encaixe e extra ----------
  const [eIni, setEIni] = useState('');
  const [eFim, setEFim] = useState('');
  const [eMotivo, setEMotivo] = useState('');
  const [xIni, setXIni] = useState('');
  const [xFim, setXFim] = useState('');
  const [xMotivo, setXMotivo] = useState('');

  const [indo, setIndo] = useState('');
  const [erro, setErro] = useState('');

  // Trocar de dia reposiciona os campos e fecha o que estava
  // aberto. Sem isto, quem clica no dia 9 e depois no 10 fecha
  // o 9 sem perceber.
  useEffect(() => {
    setFDe(dia); setFAte(dia); setSecao(null);
    setConfirmado(false); setErro('');
    setEIni(''); setEFim(''); setXIni(''); setXFim('');
    setFMotivo(''); setEMotivo(''); setXMotivo('');
  }, [dia]);

  const mFIni = fDiaInteiro ? null : paraMinutos(fIni);
  const mFFim = fDiaInteiro ? null : paraMinutos(fFim);
  const periodoOk = !!fDe && !!fAte && fAte >= fDe;
  const horasOk = fDiaInteiro || (mFIni !== null && mFFim !== null && mFFim > mFIni);

  useEffect(() => { setConfirmado(false); }, [fDe, fAte, fDiaInteiro, fIni, fFim]);

  // Quem está marcado dentro do que se vai fechar. Mesma função
  // SQL que a gravação usa — a conta de sobreposição já apareceu
  // errada três vezes neste projeto por ter duas versões.
  const relogio = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(relogio.current);
    if (secao !== 'fechar' || !periodoOk || !horasOk) { setDentro([]); return; }
    setOlhando(true);
    relogio.current = window.setTimeout(() => {
      consultasNaFaixa(recursoId, fDe, fAte, mFIni, mFFim)
        .then(l => { setDentro(l); setOlhando(false); })
        .catch(e => { setErro((e as Error).message ?? String(e)); setOlhando(false); });
    }, 400);
    return () => window.clearTimeout(relogio.current);
  }, [secao, recursoId, fDe, fAte, mFIni, mFFim, periodoOk, horasOk]);

  /**
   * Manhã e Tarde saem do expediente DESTE dia, não de um
   * 08:00–12:00 fixo.
   *
   * O médico que atende 13:00–19:00 não tem manhã; um atalho
   * fixo fecharia uma faixa vazia e diria que fez alguma coisa.
   */
  const atalhos = useMemo(() => {
    if (!blocosDoDia.length) return null;
    const inicio = Math.min(...blocosDoDia.map(b => b.ini));
    const fim = Math.max(...blocosDoDia.map(b => b.fim));
    const meio = 12 * 60;
    return {
      manha: inicio < meio ? { ini: inicio, fim: Math.min(meio, fim) } : null,
      tarde: fim > meio ? { ini: Math.max(meio, inicio), fim } : null
    };
  }, [blocosDoDia]);

  function usarAtalho(f: { ini: number; fim: number }) {
    setFDe(dia); setFAte(dia);
    setFDiaInteiro(false);
    setFIni(hhmm(f.ini)); setFFim(hhmm(f.fim));
  }

  async function correr(qual: string, fn: () => Promise<void>) {
    if (indo) return;
    setIndo(qual); setErro('');
    try { await fn(); }
    catch (e) { setErro((e as Error).message ?? String(e)); }
    finally { setIndo(''); }
  }

  const fechar = () => correr('fechar', async () => {
    const r = await bloquearFaixa({
      recursoId, de: fDe, ate: fAte,
      horaIni: mFIni, horaFim: mFFim, motivo: fMotivo, confirmar: confirmado
    });
    if (!r.ok) {
      setErro(r.mensagem);
      if (r.marcados > 0) setConfirmado(true);
      return;
    }
    aoAvisar(r.mensagem, true);
    setSecao(null); setFMotivo(''); setConfirmado(false);
    aoMudar();
  });

  const encaixar = () => correr('encaixe', async () => {
    const i = paraMinutos(eIni), f = paraMinutos(eFim);
    if (i === null || f === null) { setErro('Informe as duas horas.'); return; }
    const r = await abrirEncaixe({ recursoId, dia, ini: i, fim: f, motivo: eMotivo });
    if (!r.ok) { setErro(r.mensagem); return; }
    aoAvisar(r.mensagem, true);
    setSecao(null); setEIni(''); setEFim(''); setEMotivo('');
    aoMudar();
    // Quem abre o buraco quase sempre já sabe para quem ele é.
    aoMarcarNoEncaixe(i);
  });

  const abrirExtra = () => correr('extra', async () => {
    const i = paraMinutos(xIni), f = paraMinutos(xFim);
    if (i === null || f === null) { setErro('Informe as duas horas.'); return; }

    // O recibo. O número vem do NÚCLEO, com a mesma função que
    // vende o horário — contar no banco seria uma segunda
    // implementação de "quantas vagas tem", e um recibo que
    // discorda da agenda é pior que recibo nenhum.
    const antes = regua.filter(l => l.estado === 'livre').length;

    const r = await abrirAgendaExtra({ recursoId, dia, ini: i, fim: f, motivo: xMotivo });
    if (!r.ok) { setErro(r.mensagem); return; }
    aoAvisar(`${r.mensagem} Antes: ${antes} horário(s) livres neste dia.`, true);
    setSecao(null); setXIni(''); setXFim(''); setXMotivo('');
    aoMudar();
  });

  const tirar = (a: Abertura) => correr(a.id, async () => {
    const r = await removerAbertura(a.tipo, a.id);
    aoAvisar(r.mensagem, r.ok);
    if (r.ok) aoMudar();
  });

  const liberar = (b: BloqueioNaAgenda) => correr(b.id, async () => {
    const r = await liberarBloqueio(b.id);
    aoAvisar(r.mensagem, r.ok);
    if (r.ok) aoMudar();
  });

  // Os números saem da MESMA régua que a tela desenha logo
  // abaixo. Contar de outra fonte seria mostrar 14 linhas e
  // escrever 13 em cima delas.
  const contagem = useMemo(() => ({
    livres:   regua.filter(l => l.estado === 'livre').length,
    marcados: regua.filter(l => l.estado === 'ocupado').length,
    encaixes: regua.filter(l => l.estado === 'encaixe').length,
    fechados: regua.filter(l => l.estado === 'bloqueado').length
  }), [regua]);

  const doDia = aberturas.filter(a => a.dia === dia);
  const fechadoHoje = bloqueios.filter(b => b.data_inicio <= dia && b.data_fim >= dia);

  return (
    <div className="dia-painel" data-dia-painel={dia}>

      {/* ---------------- o cabeçalho ---------------- */}
      <div className="dia-cab">
        <strong>{porExtensoNoFuso(`${dia}T12:00:00Z`, 'UTC')}</strong>
        <span>{diaBR(dia)}</span>
        <div className="dia-chips">
          {/* ════════════════════════════════════════════════════
              ⭐⭐ "SEM EXPEDIENTE" COM GENTE MARCADA É MENTIRA
                                                  (10/10/2026)
              ────────────────────────────────────────────────────
              Achado abrindo a Agenda do Médico num SÁBADO: a
              casinha do mês vinha VERMELHA ("lotado") e o painel
              da direita dizia "sem expediente neste dia" — com
              dois pacientes marcados logo abaixo.

              As duas frases estavam certas separadamente e
              juntas mentiam: ele não tem expediente, e tem
              gente marcada.

              Dá para acontecer no banco do hospital com
              atendimento antigo, de antes da trava de expediente
              que nasceu em 09/10, ou com encaixe que foi
              removido depois.

              ⚠️ A tela NÃO esconde nem conserta: ela NOMEIA.
                 Esconder deixaria o paciente sem ninguém
                 esperando por ele; "consertar" seria a tela
                 decidindo sozinha o que fazer com atendimento de
                 gente de verdade.
              ════════════════════════════════════════════════════ */}
          {blocosDoDia.length
            ? blocosDoDia.map((b, i) => (
                <em key={i} className="dia-chip">{comoHora(b.ini)} – {comoHora(b.fim)}</em>
              ))
            : contagem.marcados > 0
              ? <em className="dia-chip fora" data-chip="fora-do-expediente">
                  sem expediente — e {contagem.marcados}{' '}
                  {contagem.marcados === 1 ? 'atendimento marcado' : 'atendimentos marcados'}
                </em>
              : <em className="dia-chip vazio">sem expediente neste dia</em>}
        </div>
      </div>

      {/*
        ------------------------------------------------------------
         OS NÚMEROS DO DIA

         Eles moravam dentro de cada quadradinho do mês. Trinta e
         um dias com dois números cada eram 62 algarismos
         embolados, e nenhum deles respondia a pergunta que se faz
         olhando o mês inteiro — "onde ainda cabe gente?", que é
         uma pergunta de cor.

         Aqui há espaço para eles dizerem alguma coisa, e para o
         zero significar o que significa. "0 livres" com 14
         marcados é um dia cheio; "0 livres" com 0 marcados é um
         dia fechado. No quadradinho os dois eram o mesmo zero.
        ------------------------------------------------------------
      */}
      <div className="dia-numeros" data-numeros={dia}>
        <div className="dia-n livres">
          <strong data-n="livres">{contagem.livres}</strong>
          <span>{contagem.livres === 1 ? 'livre' : 'livres'}</span>
        </div>
        <div className="dia-n marcados">
          <strong data-n="marcados">{contagem.marcados}</strong>
          <span>{contagem.marcados === 1 ? 'marcado' : 'marcados'}</span>
        </div>
        <div className={'dia-n encaixes' + (contagem.encaixes ? '' : ' zero')}>
          <strong data-n="encaixes">{contagem.encaixes}</strong>
          <span>{contagem.encaixes === 1 ? 'encaixe' : 'encaixes'}</span>
        </div>
        {!!contagem.fechados && (
          <div className="dia-n fechados">
            <strong data-n="fechados">{contagem.fechados}</strong>
            <span>{contagem.fechados === 1 ? 'faixa fechada' : 'faixas fechadas'}</span>
          </div>
        )}
      </div>

      {/* ---------------- a régua ---------------- */}
      <div className="dia-regua" data-lista="regua">
        {!regua.length && (
          <p className="wiz-dica">
            Nada neste dia. Dá para abrir agenda extra ou um encaixe abaixo.
          </p>
        )}
        {regua.map((l, i) => (
          <div key={i} className={`dia-linha ${l.estado}`} data-estado={l.estado}>
            <span className="dia-linha-hora">{comoHora(l.ini)}</span>
            <span className="dia-linha-txt">
              {l.estado === 'ocupado' && (
                <>
                  <strong>{l.quem}</strong>
                  {l.encaixe && <em className="cal-selo encaixe">encaixe</em>}
                  {l.situacao && <em className="cal-selo">{l.situacao.toLowerCase()}</em>}
                  {l.dentroDeBloqueio && (
                    <em className="cal-selo alerta">
                      <i className="fas fa-triangle-exclamation" /> em faixa fechada
                    </em>
                  )}
                </>
              )}
              {l.estado === 'encaixe' && (
                <>
                  <em className="cal-selo encaixe">vaga de encaixe</em>
                  {l.quem && <span className="dia-linha-motivo">{l.quem}</span>}
                  {/* ⭐ NOME, para a prova apertar. Botão sem
                      nome obriga a prova a procurá-lo por
                      classe, e classe muda com o CSS. */}
                  <button className="dia-linha-marcar"
                          data-acao="abrir-encaixe"
                          onClick={() => aoMarcarNoEncaixe(l.ini)}>
                    marcar aqui
                  </button>
                </>
              )}
              {l.estado === 'bloqueado' && <span>agenda fechada até {comoHora(l.fim)}</span>}
              {l.estado === 'passou' && <span>já passou</span>}
              {l.estado === 'livre' && <span>livre</span>}
            </span>
          </div>
        ))}
      </div>

      {/* ---------------- as três ações ---------------- */}
      <div className="dia-acoes">
        <button className={'dia-aba' + (secao === 'fechar' ? ' ativa' : '')}
                data-secao="fechar"
                onClick={() => setSecao(s => s === 'fechar' ? null : 'fechar')}>
          <i className="fas fa-lock" /> Fechar
        </button>
        <button className={'dia-aba' + (secao === 'encaixe' ? ' ativa' : '')}
                data-secao="encaixe"
                onClick={() => setSecao(s => s === 'encaixe' ? null : 'encaixe')}>
          <i className="fas fa-bolt" /> Encaixe
        </button>
        <button className={'dia-aba' + (secao === 'extra' ? ' ativa' : '')}
                data-secao="extra"
                onClick={() => setSecao(s => s === 'extra' ? null : 'extra')}>
          <i className="fas fa-calendar-plus" /> Agenda extra
        </button>
      </div>

      {/* ---------------- FECHAR ---------------- */}
      {secao === 'fechar' && (
        <div className="dia-forma" data-forma="fechar">
          <p className="dia-forma-dica">
            Tira horário da venda. <strong>Não cancela ninguém</strong> — quem já
            está marcado continua.
          </p>

          <div className="dia-atalhos">
            {atalhos?.manha && (
              <button onClick={() => usarAtalho(atalhos.manha!)} data-atalho="manha">
                Manhã
              </button>
            )}
            {atalhos?.tarde && (
              <button onClick={() => usarAtalho(atalhos.tarde!)} data-atalho="tarde">
                Tarde
              </button>
            )}
            <button data-atalho="dia"
                    onClick={() => { setFDe(dia); setFAte(dia); setFDiaInteiro(true); }}>
              O dia inteiro
            </button>
          </div>

          <div className="dia-par">
            <label>De<input type="date" value={fDe} data-campo="de"
                            onChange={e => setFDe(e.target.value)} /></label>
            <label>Até<input type="date" value={fAte} data-campo="ate"
                             onChange={e => setFAte(e.target.value)} /></label>
          </div>
          {!periodoOk && <small className="dia-erro">A data final é antes da inicial.</small>}
          {periodoOk && fAte > fDe && (
            <small className="dia-ok">
              <i className="fas fa-calendar-week" /> Período de vários dias — para
              férias e congresso, num comando só.
            </small>
          )}

          <label className="dia-check">
            <input type="checkbox" checked={fDiaInteiro} data-campo="dia-inteiro"
                   onChange={e => setFDiaInteiro(e.target.checked)} />
            Fechar o dia inteiro
          </label>

          {!fDiaInteiro && (
            <div className="dia-par">
              <label>Das<input type="time" value={fIni}
                               onChange={e => setFIni(e.target.value)} /></label>
              <label>Às<input type="time" value={fFim}
                              onChange={e => setFFim(e.target.value)} /></label>
            </div>
          )}
          {!horasOk && <small className="dia-erro">A hora final tem que ser depois da inicial.</small>}

          <input type="text" maxLength={200} value={fMotivo} className="dia-motivo"
                 onChange={e => setFMotivo(e.target.value)}
                 placeholder="motivo — férias, congresso, cirurgia" />

          {olhando && <p className="wiz-dica">conferindo quem está marcado…</p>}

          {!olhando && periodoOk && horasOk && !dentro.length && (
            <div className="dia-nota azul" data-aviso="ninguem">
              Não há ninguém marcado nessa faixa.
            </div>
          )}

          {!olhando && dentro.length > 0 && (
            <div className="dia-nota amarela" data-aviso="afetados">
              <strong>
                <i className="fas fa-triangle-exclamation" />{' '}
                {dentro.length === 1
                  ? '1 paciente já está marcado aqui dentro'
                  : `${dentro.length} pacientes já estão marcados aqui dentro`}
              </strong>
              <p>
                Fechar <strong>não cancela ninguém</strong>. Eles continuam na
                agenda e precisam ser remarcados ou cancelados um a um, em
                Agendamentos.
              </p>
              <ul>
                {dentro.slice(0, 10).map(c => (
                  <li key={c.id}><span>{diaBR(c.dia)} {c.hora}</span>{c.paciente}</li>
                ))}
              </ul>
              {dentro.length > 10 && <p className="wiz-dica">…e mais {dentro.length - 10}.</p>}
            </div>
          )}

          <button className={confirmado ? 'btn-danger' : 'btn-primary'}
                  data-acao="confirmar-bloqueio"
                  disabled={!periodoOk || !horasOk || !!indo}
                  onClick={fechar}>
            {indo === 'fechar'
              ? <><i className="fas fa-circle-notch fa-spin" /> Fechando…</>
              : confirmado
                ? <><i className="fas fa-lock" /> Fechar mesmo assim</>
                : <><i className="fas fa-lock" /> Fechar a agenda</>}
          </button>
        </div>
      )}

      {/* ---------------- ENCAIXE ---------------- */}
      {secao === 'encaixe' && (
        <div className="dia-forma" data-forma="encaixe">
          <p className="dia-forma-dica">
            Cria <strong>uma vaga</strong> entre as existentes. Só aparece aqui e
            no agendamento manual — <strong>nunca no chat</strong>.
          </p>

          <div className="dia-par">
            <label>Das<input type="time" value={eIni} data-campo="encaixe-de"
                             onChange={e => setEIni(e.target.value)} /></label>
            <label>Às<input type="time" value={eFim} data-campo="encaixe-ate"
                            onChange={e => setEFim(e.target.value)} /></label>
          </div>

          <input type="text" maxLength={200} value={eMotivo} className="dia-motivo"
                 onChange={e => setEMotivo(e.target.value)}
                 placeholder="por que o encaixe — fica na régua e na auditoria" />

          <div className="dia-nota azul">
            Depois de criar, eu já abro o assistente para você marcar o paciente
            nessa vaga. Se não quiser marcar agora, é só fechar — a vaga fica
            esperando.
          </div>

          <button className="btn-primary" data-acao="confirmar-encaixe"
                  disabled={!eIni || !eFim || !!indo} onClick={encaixar}>
            {indo === 'encaixe'
              ? <><i className="fas fa-circle-notch fa-spin" /> Abrindo…</>
              : <><i className="fas fa-bolt" /> Abrir encaixe</>}
          </button>
        </div>
      )}

      {/* ---------------- AGENDA EXTRA ---------------- */}
      {secao === 'extra' && (
        <div className="dia-forma" data-forma="extra">
          <p className="dia-forma-dica">
            <strong>Expediente a mais nesta data.</strong> Vira vaga de verdade e
            aparece para o paciente no chat. Diferente do encaixe, que só existe
            aqui dentro.
          </p>

          <div className="dia-par">
            <label>Das<input type="time" value={xIni} data-campo="extra-de"
                             onChange={e => setXIni(e.target.value)} /></label>
            <label>Às<input type="time" value={xFim} data-campo="extra-ate"
                            onChange={e => setXFim(e.target.value)} /></label>
          </div>

          <input type="text" maxLength={200} value={xMotivo} className="dia-motivo"
                 onChange={e => setXMotivo(e.target.value)}
                 placeholder="motivo — mutirão, reposição" />

          {fechadoHoje.length > 0 && (
            <div className="dia-nota amarela">
              Este dia está <strong>fechado</strong>. O banco vai recusar a agenda
              extra — ela não geraria vaga nenhuma. Libere o dia primeiro, na
              lista abaixo.
            </div>
          )}

          <button className="btn-primary" data-acao="confirmar-extra"
                  disabled={!xIni || !xFim || !!indo} onClick={abrirExtra}>
            {indo === 'extra'
              ? <><i className="fas fa-circle-notch fa-spin" /> Abrindo…</>
              : <><i className="fas fa-calendar-plus" /> Abrir agenda extra</>}
          </button>
        </div>
      )}

      {erro && <div className="erro" style={{ marginTop: 12 }}>{erro}</div>}

      {/* ---------------- o que está aberto e fechado ---------------- */}
      {(doDia.length > 0 || fechadoHoje.length > 0) && (
        <div className="dia-listas">
          {doDia.map(a => (
            <div key={a.id} className={`dia-item ${a.tipo}`} data-abertura={a.tipo}>
              <span className="dia-item-tag">
                {a.tipo === 'extra' ? 'agenda extra' : 'encaixe'}
              </span>
              <span className="dia-item-hora">
                {comoHora(a.inicio_min)} – {comoHora(a.fim_min)}
              </span>
              <span className="dia-item-motivo">{a.motivo || <em>sem motivo</em>}</span>
              <button className="dia-item-x" data-acao="remover-abertura"
                      disabled={indo === a.id} onClick={() => tirar(a)}
                      title="Remover">
                <i className={indo === a.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-times'} />
              </button>
            </div>
          ))}

          {fechadoHoje.map(b => (
            <div key={b.id} className="dia-item fechado" data-abertura="fechado">
              <span className="dia-item-tag">fechado</span>
              <span className="dia-item-hora">
                {b.hora_inicio_min === null || b.hora_fim_min === null
                  ? 'o dia inteiro'
                  : `${comoHora(b.hora_inicio_min)} – ${comoHora(b.hora_fim_min)}`}
                {b.data_fim !== b.data_inicio &&
                  ` · ${diaBR(b.data_inicio)} a ${diaBR(b.data_fim)}`}
              </span>
              <span className="dia-item-motivo">
                {b.motivo || <em>sem motivo</em>}
                {b.marcados > 0 && (
                  <small className="cal-bloqueio-alerta">
                    {' '}· {b.marcados} marcado(s) dentro
                  </small>
                )}
              </span>
              <button className="dia-item-x" data-acao="liberar"
                      disabled={indo === b.id} onClick={() => liberar(b)}
                      title="Liberar">
                <i className={indo === b.id ? 'fas fa-circle-notch fa-spin' : 'fas fa-lock-open'} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="wiz-dica" style={{ marginTop: 10 }}>
        Consultas de {grade.duracao_min} min · {medico}
      </p>
    </div>
  );
}
