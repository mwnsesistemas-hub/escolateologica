import type { Consulta } from './dados';
import { infoStatus, estaEmAberto } from './status';
import { horaDe, dataPorExtenso, type AcoesConsulta } from './CardConsulta';
import { formatarCPF, formatarTelefone, quandoNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  O CARD DE DETALHES — A FAIXA VERMELHA
 *
 *  Reconstruído do `verDetalhesConsulta` do JS_Admin: a faixa
 *  com a hora grande, os dois quadros e os cinco botões.
 *
 *  As classes são as mesmas (`.ag-detalhes-hero`, `.hora-grande`,
 *  `.data-completa`) — a faixa continua com a cor da marca, que
 *  agora vem do cliente em vez de ser o vermelho do St James.
 *
 *  ------------------------------------------------------------
 *  O AVISO DE CONFLITO APARECE AQUI TAMBÉM
 *
 *  Não é repetição por descuido. Quem abre o card é justamente
 *  quem vai pegar o telefone para ligar — e precisa saber que a
 *  vaga está dividida ANTES de prometer o horário ao paciente.
 *  O comentário original dizia isso; ficou.
 * ============================================================
 */

export function DetalhesConsulta({
  c, acoes, aoFechar
}: {
  c: Consulta;
  acoes: AcoesConsulta;
  aoFechar: () => void;
}) {
  const st = infoStatus(c.situacao);
  const aberto = estaEmAberto(c.situacao);

  const agir = (fn: () => void) => () => { aoFechar(); fn(); };

  return (
    <div className="modal">
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content">

        <div className="modal-header">
          <h3>Detalhes do agendamento</h3>
          <button onClick={aoFechar} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="ag-detalhes-hero">
          <div className="hora-grande">{horaDe(c.inicio, c.fuso)}</div>
          <div className="data-completa">{dataPorExtenso(c.inicio, c.fuso)}</div>
          <div className="medico-nome">{c.recurso}</div>
          <div className="esp-nome">{c.servico}</div>
        </div>

        <div style={{ padding: 25 }}>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 20, padding: '12px 18px',
            background: 'var(--gray-50)', borderRadius: 10, flexWrap: 'wrap', gap: 8
          }}>
            <div>
              <strong style={{ color: 'var(--gray-700)', fontSize: 12 }}>STATUS:</strong>{' '}
              <span className={`ag-card-status-badge status-${st.classe}`} style={{ marginLeft: 8 }}>
                {st.icone} {st.rotulo}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Protocolo:{' '}
              <strong style={{ color: 'var(--primary)' }}>
                {c.id.slice(0, 8).toUpperCase()}
              </strong>
            </div>
          </div>

          <div className="detalhes-grid">
            <div className="detalhes-section">
              <h4>👤 Paciente</h4>
              <div className="detalhes-item"><span>Nome:</span><strong>{c.paciente}</strong></div>
              <div className="detalhes-item"><span>CPF:</span><strong>{formatarCPF(c.paciente_cpf) || '—'}</strong></div>
              <div className="detalhes-item"><span>Telefone:</span><strong>{formatarTelefone(c.paciente_telefone) || '—'}</strong></div>
              <div className="detalhes-item"><span>E-mail:</span><strong>{c.paciente_email ?? 'N/A'}</strong></div>
            </div>
            <div className="detalhes-section">
              <h4>📋 Agendamento</h4>
              <div className="detalhes-item"><span>Convênio:</span><strong>{c.convenio ?? 'Particular'}</strong></div>
              <div className="detalhes-item"><span>Duração:</span><strong>{c.duracao_min} min</strong></div>
              <div className="detalhes-item">
                <span>Origem:</span>
                <strong>{c.origem === 'chat' ? 'Chat Bot'
                       : c.origem === 'campanha' ? 'Campanha'
                       : c.origem === 'importacao' ? 'Importação'
                       : 'Operador'}</strong>
              </div>
              <div className="detalhes-item">
                <span>Criado em:</span>
                <strong>{quandoNoFuso(c.criado_em, c.fuso)}</strong>
              </div>
            </div>
          </div>

          {c.conflito_com && (
            <div style={{
              background: '#FEF2F2', borderLeft: '4px solid var(--danger)',
              padding: 12, borderRadius: 8, marginTop: 15
            }}>
              <strong style={{ color: '#991B1B' }}>
                ⛔ Horário dividido com {c.conflito_com}
              </strong>
              {/* ⚠️⚠️⚠️ AQUI DIZIA, ATÉ 31/10/2026:
                *
                *   "Nenhum dos dois recebe lembrete enquanto isto
                *    não for resolvido."
                *
                *  E NÃO É VERDADE. Fui ler o motor de avisos
                *  (`banco/048`) para escrever a tarja nova e
                *  descobri que ele escolhe por cliente, janela de
                *  dias, tipo de serviço e situação — e **nunca**
                *  olha para conflito. Os dois recebem lembrete,
                *  normalmente, desde sempre.
                *
                *  ⭐ Frase na tela que nenhum código cumpre é a
                *     mesma família de "comentário não roda": ela
                *     descreve um sistema que não existe, e alguém
                *     toma decisão confiando nela.
                *
                *  Trocada pelo que a tela de fato sabe. Fazer a
                *  frase antiga virar verdade (segurar o lembrete
                *  dos dois) é decisão do Tom, não minha: mexe no
                *  que o paciente recebe. */}
              <p style={{ color: '#7F1D1D', fontSize: 12, margin: '6px 0 0' }}>
                Os dois continuam recebendo lembrete. Ligue para um deles
                e remarque.
              </p>
            </div>
          )}

          {/* 🟪 ver CardConsulta: encaixe não é conflito (31/10) */}
          {c.divide_horario_com && (
            <div className="tarja tarja-roxa" style={{ marginTop: 15 }}>
              <i className="fas fa-user-group" /> Divide o horário com{' '}
              {c.divide_horario_com} — encaixe, não precisa remarcar.
            </div>
          )}

          {c.eh_encaixe && (
            <div className="tarja tarja-roxa" style={{ marginTop: 15 }}>
              <i className="fas fa-plus" /> ENCAIXE — vaga aberta fora da grade
            </div>
          )}

          {c.tem_retorno && (
            <div className="tarja tarja-roxa" style={{ marginTop: 15 }}>
              <i className="fas fa-calendar-check" /> Retorno agendado
              {c.retorno_em ? ` para ${quandoNoFuso(c.retorno_em, c.fuso)}` : ''}
            </div>
          )}

          {c.reagendado_para_quando && (
            <div className="tarja tarja-reagendado" style={{ marginTop: 15 }}>
              <i className="fas fa-calendar-alt" /> REAGENDADO — o paciente foi para{' '}
              {quandoNoFuso(c.reagendado_para_quando, c.fuso)}
            </div>
          )}

          {c.observacoes && (
            <div className="detalhes-section" style={{
              background: '#FFFBEB', borderLeft: '4px solid #F59E0B',
              padding: 12, borderRadius: 6, marginTop: 15
            }}>
              <h4 style={{ color: '#92400E' }}>📝 Observações</h4>
              <p style={{ color: '#78350F', fontSize: 13, margin: '5px 0 0' }}>{c.observacoes}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ background: '#25D366', flex: 1 }}
                    onClick={() => acoes.aoWhatsApp(c)}>
              <i className="fab fa-whatsapp" /> Enviar WhatsApp
            </button>

            <button className="btn-secondary" style={{ flex: 1 }}
                    onClick={agir(() => acoes.aoCorrigir(c))}>
              <i className="fas fa-pen" /> Corrigir dados
            </button>

            {aberto && (
              <>
                <button className="btn-primary" style={{ background: 'var(--info)', flex: 1 }}
                        onClick={agir(() => acoes.aoReagendar(c))}>
                  <i className="fas fa-calendar-alt" /> Reagendar
                </button>
                <button className="btn-primary" style={{ background: 'var(--success)', flex: 1 }}
                        onClick={agir(() => acoes.aoMudarStatus(c, 'COMPARECEU'))}>
                  <i className="fas fa-check" /> Compareceu
                </button>
                <button className="btn-primary" style={{ background: 'var(--danger)', flex: 1 }}
                        onClick={agir(() => acoes.aoMudarStatus(c, 'CANCELADO'))}>
                  <i className="fas fa-ban" /> Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
