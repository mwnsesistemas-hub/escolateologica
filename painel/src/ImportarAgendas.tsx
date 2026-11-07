import { useMemo, useState } from 'react';
import {
  importarAgendamentos, oQueAVarreduraLeva,
  type AgendasImportadas, type OQueAVarreduraLeva
} from './dados';
import type { ResumoDaAgenda } from '../../nucleo/planilha';

/**
 * ============================================================
 *  IMPORTAR AS AGENDAS                          (27/10/2026)
 *
 *  O Tom:
 *
 *  > *"mande uma atualização que eu possa importar as agendas
 *  >  separadas no importar planilha."*
 *
 *  E escolheu: **consultas**, **o histórico inteiro**, e
 *  **substituir** a agenda que está no MedCalendar hoje.
 *
 *  ------------------------------------------------------------
 *  ⭐ POR QUE É UM PASSO SEPARADO, E NÃO MAIS UMA SEÇÃO
 *
 *  Porque é o único passo que **tira** coisa do lugar. Cadastro
 *  e paciente só somam; a agenda pode substituir a que está lá.
 *  Misturar os dois faria alguém clicar "importar" pensando em
 *  médicos e levar a agenda junto.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O "APAGAR" QUE NÃO APAGA
 *
 *  O Tom pediu para apagar os agendamentos. O motivo é bom — o
 *  que está lá é teste dele. Mas a regra desta casa é *"não se
 *  apaga fato"*, e uma função "apagar tudo" morando no sistema
 *  é uma arma carregada para daqui a seis meses.
 *
 *  Então: varrer ARQUIVA cada linha inteira antes de tirá-la da
 *  agenda, e o ensaio mostra **de onde vieram** as que vão sair
 *  — porque o chat está no ar, e marcação feita pelo paciente
 *  no WhatsApp **não está na planilha**: sai e não volta.
 * ============================================================
 */

/** ⚠️ 150 e não 300. Ver o comentário do lote abaixo. */
const LOTE_INICIAL = 150;
const LOTE_MINIMO = 25;

type Passo = 'parado' | 'ensaio' | 'pronto';

export function ImportarAgendas({ clienteId, resumo, aoAvisar }: {
  clienteId: string;
  resumo: ResumoDaAgenda;
  aoAvisar: (m: string, ok: boolean) => void;
}) {
  const [passo, setPasso] = useState<Passo>('parado');
  const [substituir, setSubstituir] = useState(false);
  const [leva, setLeva] = useState<OQueAVarreduraLeva[] | null>(null);
  const [indo, setIndo] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [rel, setRel] = useState<AgendasImportadas | null>(null);

  const total = resumo.linhas.length;

  const statusOrdenados = useMemo(
    () => Object.entries(resumo.porStatus).sort((a, b) => b[1] - a[1]),
    [resumo.porStatus]);

  /* ⭐ O de-para, escrito na tela e não só no banco.
     São cinco nomes de cada lado e três coincidem — quem lê
     "CONFIRMADO vira AGENDADO" entende por que o número de
     "confirmados" vai mudar depois de importar. */
  const VIRA: Record<string, string> = {
    CONFIRMADO: 'AGENDADO',
    CONFIRMADO_PRESENCA: 'CONFIRMADO',
    COMPARECEU: 'COMPARECEU',
    FALTOU: 'FALTOU',
    CANCELADO: 'CANCELADO',
  };

  async function verOQueSai() {
    try {
      setLeva(await oQueAVarreduraLeva(clienteId));
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    }
  }

  function somar(a: AgendasImportadas, b: AgendasImportadas): AgendasImportadas {
    return {
      criados: a.criados + b.criados,
      ignorados: a.ignorados + b.ignorados,
      recusados: a.recusados + b.recusados,
      varridos: a.varridos + b.varridos,
      pacientes_novos: a.pacientes_novos + b.pacientes_novos,
      sem_cpf: a.sem_cpf + b.sem_cpf,
      /* ⚠️ No máximo 40 motivos na tela. Um relatório com 2.661
         linhas é um relatório que ninguém lê. */
      detalhes: [...a.detalhes, ...b.detalhes].slice(0, 40),
    };
  }

  const ZERO: AgendasImportadas = {
    criados: 0, ignorados: 0, recusados: 0, varridos: 0,
    pacientes_novos: 0, sem_cpf: 0, detalhes: [],
  };

  function ehTempoEsgotado(e: unknown): boolean {
    const x = e as { code?: string; message?: string };
    return x?.code === '57014' || /statement timeout/i.test(x?.message ?? '');
  }

  async function correr(confirmar: boolean) {
    setIndo(true); setProgresso(''); setRel(null);
    let acc = { ...ZERO };
    try {
      /* ⚠️⚠️ A VARREDURA VAI SOZINHA, NUMA CHAMADA SÓ DELA.
       *
       *  Medido com a planilha do Tom: varrer 10.140 consultas
       *  leva ~5s; um lote leva ~2s. Juntos deram 6,3s — e o
       *  Supabase corta em 8. O banco RECUSA os dois juntos, de
       *  propósito; aqui a tela faz do jeito certo. */
      if (confirmar && substituir) {
        setProgresso('guardando e tirando a agenda atual…');
        acc = somar(acc, await importarAgendamentos(
          clienteId, [], true, true, true));
      }

      /* ⭐ O LOTE ENCOLHE QUANDO O TEMPO ESTOURA.
       *
       *  Mesmo motivo do importador de pacientes: um número fixo
       *  seria chutar o tamanho da máquina do hospital. Começa
       *  em 150 porque cada tentativa que leva corte custa os 8
       *  segundos inteiros antes de a tela saber que falhou. */
      let lote = LOTE_INICIAL;
      let i = 0;
      while (i < total) {
        const bloco = resumo.linhas.slice(i, i + lote);
        setProgresso(
          `${confirmar ? 'importando' : 'conferindo'} ` +
          `${Math.min(i + bloco.length, total)} de ${total}…`);
        try {
          acc = somar(acc, await importarAgendamentos(
            clienteId, bloco, confirmar, false, false));
          i += bloco.length;
        } catch (e) {
          if (ehTempoEsgotado(e) && lote > LOTE_MINIMO) {
            lote = Math.max(LOTE_MINIMO, Math.floor(lote / 2));
            setProgresso(`o banco cortou por tempo — tentando de novo ` +
                         `com ${lote} por vez…`);
            continue;
          }
          throw e;
        }
      }

      setRel(acc);
      setPasso(confirmar ? 'pronto' : 'ensaio');
      if (confirmar) {
        aoAvisar(`${acc.criados} consulta(s) importada(s).`, true);
      }
    } catch (e) {
      /* ⚠️ Dizer ONDE parou. "Erro" no meio de 10 mil linhas
         sem o ponto de parada obriga a recomeçar do zero — e
         recomeçar do zero depois de varrer é o pior momento
         possível para não saber onde estava. */
      setRel(acc);
      aoAvisar(
        `Parou com ${acc.criados} importada(s): ` +
        ((e as Error).message ?? String(e)), false);
    } finally {
      setIndo(false); setProgresso('');
    }
  }

  return (
    <div className="imp-caixa" data-bloco="agendas">
      <h3><i className="fas fa-calendar-check" /> 4 · As agendas</h3>

      <p className="imp-sub">
        As consultas já marcadas na aba <code>Agendamentos</code>. Elas
        entram <strong>depois</strong> dos cadastros — é o nome do médico
        e da especialidade que liga uma coisa na outra.
      </p>

      {/* ---------------- o que o arquivo tem ---------------- */}
      <div className="imp-numeros" data-bloco="numeros-agenda">
        <div><em data-campo="total">{total}</em><span>consultas no arquivo</span></div>
        <div><em data-campo="futuras">{resumo.futuras}</em><span>de hoje em diante</span></div>
        <div><em data-campo="periodo">
          {resumo.primeira.slice(0, 10).split('-').reverse().join('/')}
        </em><span>a {resumo.ultima.slice(0, 10).split('-').reverse().join('/')}</span></div>
      </div>

      {/* ⭐ O de-para, à vista. */}
      <div className="imp-depara" data-bloco="de-para">
        <strong>Como cada situação entra aqui</strong>
        <table>
          <tbody>
            {statusOrdenados.map(([s, n]) => (
              <tr key={s} data-status={s}>
                <td>{s}</td>
                <td className="imp-seta"><i className="fas fa-arrow-right" /></td>
                <td><strong>{VIRA[s] ?? 'AGENDADO'}</strong></td>
                <td className="imp-qtd">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!!VIRA['CONFIRMADO'] && (
          <small>
            <strong>CONFIRMADO</strong> na planilha quer dizer "está
            marcado"; aqui isso se chama <strong>AGENDADO</strong>. Casar
            pelo nome faria{' '}
            {(resumo.porStatus['CONFIRMADO'] ?? 0).toLocaleString('pt-BR')}{' '}
            consultas entrarem como "o paciente já confirmou" sem ninguém
            ter confirmado nada.
          </small>
        )}
      </div>

      {!!resumo.semMedico && (
        <div className="dia-nota amarela" data-aviso="sem-medico">
          <strong>
            {resumo.semMedico} consulta(s) apontam para um médico que não
            está na aba <code>Medicos</code>.
          </strong>
          <p>
            Elas vão ser recusadas, com o nome, no relatório. Nada é
            inventado: criar um médico a partir de um código solto daria
            um profissional fantasma com agenda.
          </p>
        </div>
      )}

      {/* ---------------- substituir ---------------- */}
      <label className="cad-escolha" data-campo="substituir">
        <input type="checkbox" checked={substituir} disabled={indo}
               onChange={e => {
                 setSubstituir(e.target.checked);
                 if (e.target.checked && !leva) void verOQueSai();
               }} />
        <span>
          <strong>Substituir</strong> a agenda que está no sistema
          <small className="wiz-dica" style={{ display: 'block' }}>
            As atuais são <strong>guardadas</strong> antes de sair. Some
            da agenda, não some do banco.
          </small>
        </span>
      </label>

      {substituir && leva && (
        <div className="dia-nota vermelha" data-bloco="o-que-sai">
          <strong>
            {leva.reduce((s, l) => s + l.quantas, 0)} agendamento(s) vão
            sair da agenda:
          </strong>
          <table className="imp-sai">
            <tbody>
              {leva.map(l => (
                <tr key={l.origem} data-origem={l.origem}>
                  <td>{l.origem}</td>
                  <td className="imp-qtd">{l.quantas}</td>
                  <td>{l.futuros} futura(s)</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leva.some(l => l.origem === 'chat' && l.quantas > 0) && (
            <p data-aviso="veio-do-chat">
              ⚠️ <strong>
                {leva.find(l => l.origem === 'chat')?.quantas} vieram do
                chat do paciente
              </strong> — marcadas por quem falou no WhatsApp. Essas
              <strong> não estão na planilha</strong>: saem e não voltam
              pela importação.
            </p>
          )}
        </div>
      )}

      {!!indo && (
        <div className="imp-progresso" data-aviso="progresso">
          <i className="fas fa-circle-notch fa-spin" /> {progresso}
        </div>
      )}

      {/* ---------------- o relatório ---------------- */}
      {!!rel && (
        <div className="imp-relatorio" data-bloco="relatorio-agenda">
          <div className="imp-numeros">
            <div><em data-campo="r-criados">{rel.criados}</em>
                 <span>{passo === 'pronto' ? 'importadas' : 'entrariam'}</span></div>
            <div><em data-campo="r-recusados">{rel.recusados}</em><span>recusadas</span></div>
            <div><em data-campo="r-pacientes">{rel.pacientes_novos}</em>
                 <span>pacientes novos{passo === 'ensaio' ? ' (até)' : ''}</span></div>
            {!!rel.varridos && (
              <div><em data-campo="r-varridos">{rel.varridos}</em><span>guardadas</span></div>
            )}
          </div>

          {passo === 'ensaio' && (
            /* ⚠️ O ensaio não grava, então não sabe quantas pessoas
               do arquivo são a MESMA pessoa entre um lote e outro.
               Dizer "até" é mais honesto que dizer um número
               redondo errado — e o relatório de verdade acerta. */
            <small className="imp-nota">
              "Pacientes novos" é um teto: o ensaio não grava, e por isso
              não enxerga que a mesma pessoa aparece em vários lotes.
            </small>
          )}

          {!!rel.sem_cpf && (
            <div className="dia-nota amarela" data-aviso="sem-cpf">
              <strong>{rel.sem_cpf} linha(s) sem CPF.</strong>
              <p>
                Essas pessoas são reconhecidas por <strong>nome e
                telefone</strong> — é a mesma chave que o sistema antigo
                usava para identificar quem ligava.
              </p>
            </div>
          )}

          {!!rel.detalhes.length && (
            <div className="imp-recusas" data-bloco="recusas-agenda">
              <strong>Por que cada uma foi recusada</strong>
              <ul>
                {rel.detalhes.map((d, i) => (
                  <li key={i}><b>{d.linha}</b> — {d.motivo}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---------------- os botões ---------------- */}
      <div className="form-actions">
        {passo !== 'pronto' && (
          <button className="btn-secondary" data-acao="ensaio-agenda"
                  disabled={indo || !total}
                  onClick={() => { void correr(false); }}>
            <i className="fas fa-glasses" /> Fazer o ensaio
          </button>
        )}
        {passo === 'ensaio' && (
          <button className="btn-danger" data-acao="importar-agenda"
                  disabled={indo}
                  onClick={() => { void correr(true); }}>
            <i className="fas fa-calendar-check" />{' '}
            {substituir
              ? 'Substituir a agenda e importar'
              : `Importar ${total} consulta(s)`}
          </button>
        )}
      </div>

      {passo === 'parado' && (
        /* ⭐ O ensaio não é opcional, e a tela diz por quê. */
        <small className="imp-nota">
          O ensaio não grava nada. Ele existe porque 10 mil linhas entrando
          errado é mais fácil de evitar do que de desfazer.
        </small>
      )}
    </div>
  );
}
