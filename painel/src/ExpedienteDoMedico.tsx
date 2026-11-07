import { useEffect, useMemo, useRef, useState } from 'react';
import {
  expedienteDoRecurso, consultasForaDoExpediente, salvarExpediente,
  type FaixaExpediente, type ConsultaForaDoExpediente
} from './dados';
import { comoHora } from './grade';
import { paraMinutos } from '../../nucleo/tempo';

/**
 * ============================================================
 *  O EXPEDIENTE DE UM MÉDICO
 *
 *  ════════════════════════════════════════════════════════════
 *   ⭐ ESTA TELA EXISTE POR CAUSA DE 07/10/2026
 *  ════════════════════════════════════════════════════════════
 *
 *  Naquele dia, no Apps Script, o expediente de QUATRO médicos
 *  foi apagado. Eles sumiram do chat do paciente. Havia 215
 *  consultas futuras marcadas com eles.
 *
 *  A causa, em uma linha:
 *
 *      linhas.filter(d => d.ativo)   →   []
 *
 *  O salvamento apaga todas as linhas do médico e regrava uma
 *  por dia ativo. Com a lista vazia, apagou tudo — e respondeu
 *  `success: true`. Não deu erro. Deu sucesso.
 *
 *  ------------------------------------------------------------
 *  O QUE ESTA TELA FAZ DIFERENTE
 *
 *  **Mostra quem ficaria sem chão, enquanto a pessoa mexe.** Não
 *  depois de salvar: durante. A cada mudança ela pergunta ao
 *  banco quais consultas futuras o expediente novo deixaria de
 *  cobrir, e lista nome, dia e hora.
 *
 *  **Quem recusa é o banco.** A lista desta tela é educação; a
 *  trava é `salvar_expediente`, que confere de novo na hora de
 *  gravar — porque entre a tela mostrar e a pessoa clicar pode
 *  entrar um agendamento pelo chat.
 *
 *  **A conta é a MESMA.** `consultas_fora_do_expediente` é
 *  chamada pela tela e pela gravação. Duas contas para a mesma
 *  pergunta é o que faz a tela dizer "3 pacientes" e o banco
 *  gravar como se fossem zero.
 *
 *  **Lista vazia é o caso mais perigoso, não o mais simples.**
 *  Era exatamente o caso de 07/10, e tem aviso próprio.
 *
 *  ------------------------------------------------------------
 *  DUAS FAIXAS NO MESMO DIA
 *
 *  A tela do Apps Script não aguenta: ela usa `achou[0]` e a
 *  segunda sexta do Dr. Gustavo era invisível para quem editava
 *  — e sobrescrita no primeiro salvamento. Aqui cada dia tem um
 *  botão de acrescentar faixa.
 * ============================================================
 */

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
              'Quinta-feira', 'Sexta-feira', 'Sábado'];

const hhmm = (min: number | null) =>
  min === null || min === undefined ? '' : comoHora(min);

/** O que a tela edita: uma faixa com as pontas em texto. */
interface Linha {
  dia: number;
  ini: string;
  fim: string;
  almocoIni: string;
  almocoFim: string;
  semanas: number[];
}

const deFaixa = (f: FaixaExpediente): Linha => ({
  dia: f.dia_semana,
  ini: hhmm(f.inicio_min),
  fim: hhmm(f.fim_min),
  almocoIni: hhmm(f.intervalo_inicio),
  almocoFim: hhmm(f.intervalo_fim),
  semanas: f.semanas_do_mes ?? []
});

export function ExpedienteDoMedico({
  recursoId, medico, duracaoMin, aoAvisar, aoMudar
}: {
  recursoId: string;
  medico: string;
  duracaoMin: number;
  aoAvisar: (mensagem: string, bom: boolean) => void;
  /** avisa a tela de cima que a agenda mudou */
  aoMudar: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [original, setOriginal] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [fora, setFora] = useState<ConsultaForaDoExpediente[]>([]);
  const [olhando, setOlhando] = useState(false);
  const [indo, setIndo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  // ---------- carrega ----------
  useEffect(() => {
    let valido = true;
    setCarregando(true); setErro(''); setConfirmar(false);
    expedienteDoRecurso(recursoId)
      .then(l => {
        if (!valido) return;
        const ls = l.map(deFaixa);
        setLinhas(ls);
        setOriginal(JSON.stringify(ls));
        setCarregando(false);
      })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [recursoId]);

  /** As linhas no formato do banco. Só as que fecham. */
  const paraBanco = useMemo((): FaixaExpediente[] => {
    const fora: FaixaExpediente[] = [];
    for (const l of linhas) {
      const i = paraMinutos(l.ini), f = paraMinutos(l.fim);
      if (i === null || f === null || f <= i) continue;
      const ai = paraMinutos(l.almocoIni), af = paraMinutos(l.almocoFim);
      fora.push({
        dia_semana: l.dia, inicio_min: i, fim_min: f,
        intervalo_inicio: ai !== null && af !== null && af > ai ? ai : null,
        intervalo_fim:    ai !== null && af !== null && af > ai ? af : null,
        semanas_do_mes: l.semanas
      });
    }
    return fora;
  }, [linhas]);

  const mudou = JSON.stringify(linhas) !== original;

  /** As faixas que não fecham — a tela avisa antes de o banco recusar. */
  const tortas = useMemo(() => linhas.filter(l => {
    const i = paraMinutos(l.ini), f = paraMinutos(l.fim);
    if (i === null || f === null) return true;
    if (f <= i) return true;
    const ai = paraMinutos(l.almocoIni), af = paraMinutos(l.almocoFim);
    // Metade do almoço preenchida é o caso que `Number('')`
    // transformava em 00:00 no sistema antigo.
    if ((ai === null) !== (af === null)) return true;
    if (ai !== null && af !== null && (af <= ai || ai < i || af > f)) return true;
    return false;
  }).length, [linhas]);

  // ---------- quem ficaria sem chão ----------
  const relogio = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(relogio.current);
    if (carregando || tortas > 0) { setFora([]); return; }
    setOlhando(true);
    relogio.current = window.setTimeout(() => {
      consultasForaDoExpediente(recursoId, paraBanco)
        .then(l => { setFora(l); setOlhando(false); })
        .catch(e => { setErro((e as Error).message ?? String(e)); setOlhando(false); });
    }, 450);
    return () => window.clearTimeout(relogio.current);
  }, [recursoId, paraBanco, carregando, tortas]);

  // Mexer em qualquer coisa invalida a confirmação: ela era
  // sobre OUTRO expediente.
  useEffect(() => { setConfirmar(false); }, [linhas]);

  function mexer(i: number, campo: Partial<Linha>) {
    setLinhas(ls => ls.map((l, k) => k === i ? { ...l, ...campo } : l));
  }

  function acrescentar(dia: number) {
    // A faixa nova nasce com o horário mais comum do hospital.
    // Nascer vazia obrigaria a digitar quatro campos para o caso
    // que é quase sempre o mesmo.
    setLinhas(ls => [...ls, {
      dia, ini: '08:00', fim: '12:00', almocoIni: '', almocoFim: '', semanas: []
    }]);
  }

  function tirar(i: number) {
    setLinhas(ls => ls.filter((_, k) => k !== i));
  }

  function virarSemana(i: number, s: number) {
    const l = linhas[i];
    if (!l) return;
    mexer(i, {
      semanas: l.semanas.includes(s)
        ? l.semanas.filter(x => x !== s)
        : [...l.semanas, s].sort()
    });
  }

  async function salvar() {
    if (indo || tortas > 0) return;
    setIndo(true);
    try {
      const r = await salvarExpediente(recursoId, paraBanco, confirmar);
      if (!r.ok) {
        if (r.em_risco > 0) setConfirmar(true);
        aoAvisar(r.mensagem, false);
        setIndo(false);
        return;
      }
      aoAvisar(r.mensagem, true);
      setOriginal(JSON.stringify(linhas));
      setConfirmar(false);
      aoMudar();
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  const vazio = paraBanco.length === 0;

  if (carregando) {
    return (
      <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
    );
  }

  return (
    <div className="agm-expediente" data-aba-ativa="expediente">
      <h3>Expediente de {medico}</h3>
      <p className="wiz-dica">
        Consultas de <strong>{duracaoMin} minutos</strong>. Um dia pode ter mais
        de uma faixa — manhã e noite, por exemplo.
      </p>

      <div className="exp-lista">
        {DIAS.map((nome, d) => {
          const doDia = linhas
            .map((l, i) => ({ l, i }))
            .filter(x => x.l.dia === d);
          return (
            <div key={d} className={'exp-dia' + (doDia.length ? '' : ' sem')}
                 data-dia-semana={d}>
              <span className="exp-nome">{nome}</span>

              <div className="exp-faixas-edit">
                {!doDia.length && <em className="exp-vazio">não atende</em>}

                {doDia.map(({ l, i }) => (
                  <div key={i} className="exp-faixa-edit" data-faixa={i}>
                    <div className="exp-horas">
                      <label>das
                        <input type="time" value={l.ini} data-campo="ini"
                               onChange={e => mexer(i, { ini: e.target.value })} />
                      </label>
                      <label>às
                        <input type="time" value={l.fim} data-campo="fim"
                               onChange={e => mexer(i, { fim: e.target.value })} />
                      </label>
                      <label>almoço
                        <input type="time" value={l.almocoIni} data-campo="almoco-ini"
                               onChange={e => mexer(i, { almocoIni: e.target.value })} />
                      </label>
                      <label>até
                        <input type="time" value={l.almocoFim} data-campo="almoco-fim"
                               onChange={e => mexer(i, { almocoFim: e.target.value })} />
                      </label>
                      <button className="exp-x" data-acao="tirar-faixa"
                              title="Tirar esta faixa" onClick={() => tirar(i)}>
                        <i className="fas fa-times" />
                      </button>
                    </div>

                    <div className="exp-semanas">
                      <span>semanas do mês:</span>
                      {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} data-semana={s}
                                className={'exp-sem' + (l.semanas.includes(s) ? ' on' : '')}
                                onClick={() => virarSemana(i, s)}>
                          {s}ª
                        </button>
                      ))}
                      <em>
                        {l.semanas.length === 0
                          ? 'nenhuma marcada = todas as semanas'
                          : `só na ${l.semanas.join('ª, ')}ª`}
                      </em>
                    </div>
                  </div>
                ))}

                <button className="exp-mais" data-acao="mais-faixa"
                        onClick={() => acrescentar(d)}>
                  <i className="fas fa-plus" /> faixa
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- o que está torto ---------- */}
      {tortas > 0 && (
        <div className="dia-nota amarela" style={{ marginTop: 14 }} data-aviso="tortas">
          <strong>{tortas} faixa(s) não fecham</strong>
          <p>
            A hora final tem que ser depois da inicial, e o almoço precisa das
            duas pontas, dentro da faixa do dia. Enquanto houver uma torta eu não
            consigo nem conferir quem ficaria sem horário.
          </p>
        </div>
      )}

      {/* ---------- ⭐ quem ficaria sem chão ---------- */}
      {tortas === 0 && olhando && (
        <p className="wiz-dica" style={{ marginTop: 14 }}>
          conferindo quem ficaria fora deste expediente…
        </p>
      )}

      {tortas === 0 && !olhando && vazio && (
        <div className="dia-nota amarela" style={{ marginTop: 14 }} data-aviso="vazio">
          <strong>
            <i className="fas fa-triangle-exclamation" /> O expediente está VAZIO
          </strong>
          <p>
            Salvando assim, este médico deixa de aparecer para o paciente em
            qualquer dia — no chat, na campanha e no reagendamento.
          </p>
          <p>
            Em 07/10 isso aconteceu com quatro médicos de uma vez, no sistema
            antigo, e a resposta foi "salvo com sucesso". Aqui eu aviso.
          </p>
        </div>
      )}

      {tortas === 0 && !olhando && fora.length > 0 && (
        <div className="dia-nota amarela" style={{ marginTop: 14 }} data-aviso="sem-chao">
          <strong>
            <i className="fas fa-triangle-exclamation" />{' '}
            {fora.length === 1
              ? '1 consulta futura ficaria fora deste expediente'
              : `${fora.length} consultas futuras ficariam fora deste expediente`}
          </strong>
          <p>
            Elas <strong>não são canceladas</strong> — ficam na agenda num
            horário que o médico deixou de atender, e o paciente aparece num dia
            em que ninguém o espera. Remarque antes, ou salve e remarque depois.
          </p>
          <ul>
            {fora.slice(0, 12).map(c => (
              <li key={c.id}>
                <span>{c.dia.split('-').reverse().join('/')} {c.hora}</span>
                {c.paciente}
              </li>
            ))}
          </ul>
          {fora.length > 12 && (
            <p className="wiz-dica">…e mais {fora.length - 12}.</p>
          )}
        </div>
      )}

      {tortas === 0 && !olhando && !vazio && !fora.length && mudou && (
        <div className="dia-nota azul" style={{ marginTop: 14 }} data-aviso="ninguem">
          Nenhuma consulta futura fica fora deste expediente.
        </div>
      )}

      {erro && <div className="erro" style={{ marginTop: 12 }}>{erro}</div>}

      <div className="form-actions" style={{ marginTop: 16 }}>
        <span className="wiz-dica" style={{ marginRight: 'auto' }}>
          {mudou
            ? `${paraBanco.length} faixa(s) — não salvo`
            : `${paraBanco.length} faixa(s) salvas`}
        </span>
        <button className={confirmar ? 'btn-danger' : 'btn-primary'}
                data-acao="salvar-expediente"
                disabled={indo || tortas > 0 || !mudou}
                onClick={salvar}>
          {indo
            ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
            : confirmar
              ? <><i className="fas fa-triangle-exclamation" /> Salvar mesmo assim</>
              : <><i className="fas fa-check" /> Salvar expediente</>}
        </button>
      </div>

      <p className="wiz-dica" style={{ marginTop: 10 }}>
        A faixa que sai do expediente não é apagada: fica guardada, desativada.
        A pergunta "qual era o expediente dele em março?" continua tendo
        resposta.
      </p>
    </div>
  );
}
