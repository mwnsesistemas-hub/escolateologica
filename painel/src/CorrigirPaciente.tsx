import { useEffect, useState } from 'react';
import { pacientePorId, corrigirPaciente, type Consulta, type Paciente } from './dados';

/**
 * ============================================================
 *  CORRIGIR O CADASTRO — o botão do lápis
 *
 *  ------------------------------------------------------------
 *  POR QUE ELE LÊ O PACIENTE DE NOVO, EM VEZ DE USAR O CARD
 *
 *  O card mostra nome, CPF e telefone. O cadastro tem também
 *  e-mail e nascimento.
 *
 *  Se o modal abrisse só com o que o card tem, salvar o
 *  telefone mandaria e-mail e nascimento VAZIOS — e apagaria os
 *  dois, calado. Uma correção que destrói dado ao lado é o tipo
 *  de defeito que ninguém liga ao botão que o causou.
 *
 *  Uma consulta a mais, uma vez, ao abrir o modal.
 *
 *  ------------------------------------------------------------
 *  O CPF
 *
 *  Quem valida de verdade é o banco: ele recusa menos de 11
 *  dígitos e recusa um CPF que já é de OUTRO paciente, dizendo
 *  de quem é. Aqui só avisamos antes, para a pessoa não
 *  descobrir depois de clicar.
 * ============================================================
 */

function soDigitos(s: string) { return (s ?? '').replace(/\D/g, ''); }

export function CorrigirPaciente({
  c, aoPronto, aoFechar
}: {
  c: Consulta;
  aoPronto: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [p, setP] = useState<Paciente | null>(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [nasc, setNasc] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    pacientePorId(c.paciente_id)
      .then(x => {
        if (!valido) return;
        if (!x) { setErro('Paciente não encontrado.'); setCarregando(false); return; }
        setP(x);
        setNome(x.nome ?? '');
        setCpf(x.cpf ?? '');
        setTel(x.telefone ?? '');
        setEmail(x.email ?? '');
        setNasc(x.nascimento ?? '');
        setCarregando(false);
      })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [c.paciente_id]);

  const cpfOk = !cpf.trim() || soDigitos(cpf).length === 11;
  const pode = !!p && nome.trim().length >= 3 && cpfOk && !indo;

  // Nada mudou: salvar seria uma ida ao banco e uma linha de
  // auditoria para registrar que ninguém mexeu em nada.
  const mudou = !!p && (
    nome.trim() !== (p.nome ?? '') ||
    soDigitos(cpf) !== soDigitos(p.cpf ?? '') ||
    tel.trim() !== (p.telefone ?? '') ||
    email.trim() !== (p.email ?? '') ||
    (nasc || null) !== (p.nascimento ?? null)
  );

  async function salvar() {
    if (!pode || !p) return;
    setIndo(true); setErro('');
    try {
      const r = await corrigirPaciente({
        id: p.id, nome: nome.trim(), cpf: soDigitos(cpf),
        telefone: tel.trim(), email: email.trim(), nascimento: nasc || null
      });
      if (!r.ok) { setErro(r.mensagem); setIndo(false); return; }
      aoPronto(r.mensagem);
    } catch (e) {
      setErro((e as Error).message ?? String(e));
      setIndo(false);
    }
  }

  return (
    <div className="modal" data-modal="corrigir">
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content">

        <div className="modal-header">
          <h3>Corrigir dados do paciente</h3>
          <button onClick={aoFechar} aria-label="Fechar"><i className="fas fa-times" /></button>
        </div>

        <div className="modal-body">
          {carregando && (
            <div className="loading-placeholder">
              <div className="spinner" /><p>Lendo o cadastro…</p>
            </div>
          )}

          {!carregando && p && (
            <>
              <div className="wiz-aviso-azul">
                A correção vale para o <strong>cadastro do paciente</strong>, não só
                para esta consulta. Todas as consultas dele passam a mostrar o
                dado novo.
              </div>

              <div className="form-group">
                <label>Nome completo *</label>
                <input type="text" autoFocus value={nome} maxLength={120}
                       onChange={e => setNome(e.target.value)} />
                {nome.trim().length > 0 && nome.trim().length < 3 && (
                  <small style={{ color: 'var(--danger)' }}>Nome muito curto.</small>
                )}
              </div>

              <div className="form-row" style={{ display: 'flex', gap: 14 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>CPF</label>
                  <input type="text" value={cpf} maxLength={14}
                         onChange={e => setCpf(e.target.value)} />
                  {!cpfOk && (
                    <small style={{ color: 'var(--danger)' }}>
                      Faltam {11 - soDigitos(cpf).length} dígitos.
                    </small>
                  )}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Telefone</label>
                  <input type="text" value={tel} maxLength={20}
                         onChange={e => setTel(e.target.value)} />
                  <small style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                    É por aqui que o WhatsApp sai.
                  </small>
                </div>
              </div>

              <div className="form-row" style={{ display: 'flex', gap: 14 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Nascimento</label>
                  <input type="date" value={nasc} onChange={e => setNasc(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>E-mail</label>
                  <input type="email" value={email} maxLength={120}
                         onChange={e => setEmail(e.target.value)} />
                </div>
              </div>

              <small className="wiz-dica">
                O que estava antes fica guardado na auditoria, com o seu nome.
              </small>
            </>
          )}

          {erro && <div className="erro" style={{ marginTop: 14 }}>{erro}</div>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={aoFechar} disabled={indo}>
              Voltar
            </button>
            <button type="button" className="btn-primary" data-acao="salvar-paciente"
                    onClick={salvar} disabled={!pode || !mudou}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                : mudou
                  ? <><i className="fas fa-check" /> Salvar</>
                  : 'Nada mudou'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
