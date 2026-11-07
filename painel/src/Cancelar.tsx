import { useEffect, useState } from 'react';
import { motivosDeCancelamento, type Consulta, type MotivoCancelamento } from './dados';
import { horaNoFuso, porExtensoNoFuso } from '../../nucleo/formato';

/**
 * ============================================================
 *  CANCELAR — COM MOTIVO, SEM DIGITAR
 *
 *  ------------------------------------------------------------
 *  POR QUE A RECEPÇÃO NÃO ESCREVE O AVISO
 *
 *  Cada motivo interno tem um par PÚBLICO, escrito antes, que é
 *  o que o paciente vai receber. A recepção escolhe da lista.
 *
 *  Quando quem cancela digita o aviso, o vocabulário interno
 *  vaza. "Cancelado por baixa ocupação da agenda" é uma frase
 *  verdadeira que o paciente não deve ler.
 *
 *  Isso veio do sistema de hoje, que já tinha acertado — e aqui
 *  os pares moram no banco, por cliente, em vez de num mapa
 *  dentro do código. Cada hospital escreve as frases dele.
 *
 *  ------------------------------------------------------------
 *  A PRÉVIA
 *
 *  A tela mostra, antes de confirmar, exatamente o que o
 *  paciente vai receber. Quem cancela vê a frase que vai sair no
 *  nome do hospital.
 * ============================================================
 */

export function Cancelar({
  c, clienteId, aoConfirmar, aoFechar
}: {
  c: Consulta;
  clienteId: string;
  aoConfirmar: (motivo: string, detalhe: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [motivos, setMotivos] = useState<MotivoCancelamento[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    motivosDeCancelamento(clienteId)
      .then(m => valido && setMotivos(m))
      .catch(e => valido && setErro(e.message ?? String(e)));
    return () => { valido = false; };
  }, [clienteId]);

  const m = motivos.find(x => x.motivo === escolhido);
  const faltaDetalhe = !!m?.pede_detalhe && !detalhe.trim();
  const podeConfirmar = !!m && !faltaDetalhe && !indo;

  async function confirmar() {
    if (!podeConfirmar) return;
    setIndo(true);
    setErro('');
    try {
      await aoConfirmar(escolhido, detalhe.trim());
    } catch (e) {
      setErro((e as Error).message ?? String(e));
      setIndo(false);
    }
  }

  return (
    <div className="modal" data-modal="cancelar">
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content">

        <div className="modal-header">
          <h3>Cancelar agendamento</h3>
          <button onClick={aoFechar} aria-label="Fechar"><i className="fas fa-times" /></button>
        </div>

        <div className="modal-body">
          <div style={{
            background: 'var(--gray-50)', borderRadius: 10, padding: '12px 14px',
            marginBottom: 18, fontSize: 13, color: 'var(--gray-700)'
          }}>
            <strong>{c.paciente}</strong><br />
            {porExtensoNoFuso(c.inicio, c.fuso)} às {horaNoFuso(c.inicio, c.fuso)}
            {' · '}{c.recurso}
          </div>

          <div className="form-group">
            <label>Por que está cancelando? *</label>
            <select data-campo="motivo"
                    value={escolhido} onChange={e => { setEscolhido(e.target.value); setDetalhe(''); }}>
              <option value="">Escolha o motivo…</option>
              {motivos.map(x => (
                <option key={x.motivo} value={x.motivo}>{x.rotulo}</option>
              ))}
            </select>
            <small style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              O motivo fica registrado na auditoria, com o seu nome.
            </small>
          </div>

          {m?.pede_detalhe && (
            <div className="form-group">
              <label>Explique em uma linha *</label>
              <input type="text" maxLength={200} value={detalhe}
                     onChange={e => setDetalhe(e.target.value)}
                     placeholder="Fica só na auditoria — o paciente não vê" />
            </div>
          )}

          {m && (
            <div className="cancelar-previa" style={{
              background: '#EFF6FF', borderLeft: '4px solid var(--info)',
              padding: '12px 14px', borderRadius: 8, marginTop: 4
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '.05em',
                textTransform: 'uppercase', color: '#1E40AF', marginBottom: 6
              }}>
                O paciente vai receber
              </div>
              <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.5 }}>
                {m.publico}
              </div>
            </div>
          )}

          <div style={{
            background: '#FFFBEB', borderLeft: '4px solid #F59E0B',
            padding: '10px 14px', borderRadius: 8, marginTop: 14,
            fontSize: 12.5, color: '#78350F'
          }}>
            <strong>O aviso ainda não é enviado.</strong> O cancelamento fica
            registrado agora; o WhatsApp vem na próxima etapa. Até lá, ligue
            para o paciente.
          </div>

          {erro && <div className="erro" style={{ marginTop: 14 }}>{erro}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={aoFechar} disabled={indo}>
              Voltar
            </button>
            <button type="button" className="btn-primary" data-acao="confirmar-cancelamento"
                    style={{ background: 'var(--danger)' }}
                    onClick={confirmar} disabled={!podeConfirmar}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Cancelando…</>
                : <><i className="fas fa-ban" /> Confirmar cancelamento</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
