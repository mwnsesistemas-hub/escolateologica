import { useEffect, useState } from 'react';
import {
  contasDoMes, registrarAutorizacao, type ContaDoMes, type EstadoDaConta
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  CONTAS — UMA POR ATENDIMENTO                    (03/11/2026)
 *
 *  A conta nasce quando a recepção marca "Compareceu" num
 *  atendimento de convênio (`072_as_contas.sql`). Esta tela lista
 *  as contas do mês e deixa resolver a pendência mais comum: a
 *  AUTORIZAÇÃO, que a recepção digita até a integração com a
 *  operadora existir.
 *
 *  ⭐ O estado de cada conta vem do BANCO (`core.estado_da_conta`):
 *     a tela não decide o que é "em risco" — só mostra.
 * ============================================================
 */
const ROTULO: Record<EstadoDaConta, string> = {
  PRONTA: 'Pronta', COM_PENDENCIA: 'Com pendência', EM_RISCO: 'Em risco',
  SEM_PRECO: 'Sem preço', CANCELADA: 'Cancelada'
};
const COR: Record<EstadoDaConta, string> = {
  PRONTA: 'bom', COM_PENDENCIA: 'atencao', EM_RISCO: 'ruim', SEM_PRECO: 'atencao', CANCELADA: ''
};
const FILTROS: (EstadoDaConta | null)[] = [null, 'EM_RISCO', 'COM_PENDENCIA', 'SEM_PRECO', 'PRONTA'];

const real = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d: string | null) =>
  d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—';

export function ContasFaturamento({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [estado, setEstado] = useState<EstadoDaConta | null>(null);
  const [contas, setContas] = useState<ContaDoMes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  /** A conta cuja autorização está sendo digitada. */
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [validade, setValidade] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    contasDoMes(clienteId, null, estado)
      .then(l => { if (vivo) setContas(l); })
      .catch(e => { if (vivo) avisar((e as Error).message ?? String(e), false); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [clienteId, estado, recarga, avisar]);

  async function salvar(c: ContaDoMes) {
    try {
      const r = await registrarAutorizacao(clienteId, c.id, senha, validade || null);
      avisar(r.mensagem, r.ok);
      if (r.ok) { setAbrindo(null); setSenha(''); setValidade(''); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  return (
    <div className="card" data-tela="contas">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-file-invoice-dollar" /> Contas do mês</h3>
          <p className="cad-sub">
            Uma conta por atendimento de convênio, com o preço do dia em que o paciente foi atendido.
          </p>
        </div>
      </div>

      <div className="cad-abas" data-bloco="filtro-contas">
        {FILTROS.map(f => (
          <button key={f ?? 'todas'} className={estado === f ? 'atual' : ''}
                  data-filtro={f ?? 'TODAS'} onClick={() => setEstado(f)}>
            {f ? ROTULO[f] : 'Todas'}
          </button>
        ))}
      </div>

      {carregando && <p className="cad-rodape">Carregando…</p>}

      {!carregando && contas.length === 0 && (
        <div className="porvir" data-aviso="sem-contas">
          <i className="fas fa-circle-info" />
          <p>
            Nenhuma conta {estado ? `"${ROTULO[estado].toLowerCase()}"` : ''} neste mês. A conta
            nasce quando a recepção marca <strong>Compareceu</strong> num atendimento de convênio
            (particular não gera conta).
          </p>
        </div>
      )}

      {!carregando && contas.length > 0 && (
        <div className="cad-lista" data-lista="contas">
          {contas.map(c => (
            <div key={c.id} className="cad-linha" data-conta={c.id} data-estado={c.estado}>
              <div>
                <strong>{c.paciente ?? '(paciente)'}</strong>{' '}
                <em className={'cad-tag ' + COR[c.estado]} data-campo="estado">{ROTULO[c.estado]}</em>
                <small style={{ display: 'block' }}>
                  {data(c.data_atendimento)} · {c.servico} · {c.convenio}
                  {c.prestador ? ` · faturado por ${c.prestador}` : ''}
                </small>
                {c.exige_autorizacao && (
                  <small style={{ display: 'block' }} data-campo="autorizacao">
                    {c.autorizacao_senha
                      ? `Autorização ${c.autorizacao_senha}` +
                        (c.autorizacao_validade ? ` · vale até ${data(c.autorizacao_validade)}` : '')
                      : 'Sem autorização registrada'}
                  </small>
                )}
              </div>
              <div className="cad-botoes">
                <strong data-campo="valor">{real(c.valor)}</strong>
                {c.exige_autorizacao && c.estado !== 'CANCELADA' && abrindo !== c.id && (
                  <button className="btn-secondary btn-sm" data-acao="registrar-autorizacao"
                          onClick={() => { setAbrindo(c.id); setSenha(c.autorizacao_senha ?? '');
                                           setValidade(c.autorizacao_validade ?? ''); }}>
                    <i className="fas fa-key" /> {c.autorizacao_senha ? 'Corrigir autorização' : 'Registrar autorização'}
                  </button>
                )}
              </div>
              {abrindo === c.id && (
                <div className="cad-dupla" data-bloco="form-autorizacao" style={{ width: '100%' }}>
                  <input type="text" placeholder="Senha ou nº da guia" value={senha}
                         data-campo="autorizacao-senha" onChange={e => setSenha(e.target.value)} />
                  <input type="date" value={validade} data-campo="autorizacao-validade"
                         onChange={e => setValidade(e.target.value)} />
                  <button className="btn-primary btn-sm" data-acao="salvar-autorizacao"
                          disabled={!senha.trim()} onClick={() => void salvar(c)}>
                    <i className="fas fa-check" /> Salvar
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setAbrindo(null)}>Voltar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
