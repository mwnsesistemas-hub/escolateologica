import { useEffect, useState } from 'react';
import { configDosAvisos, salvarConfigDosAvisos, type ConfigDosAvisos } from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  AVISOS — OS TEMPOS DO HOSPITAL                 (22/10/2026)
 *
 *  O Tom: "configuração de tempo de disparo de mensagens. Quanto
 *  tempo antes. Tem que ser configurável pelo Painel."
 *
 *  ⭐ Aqui ficam os tempos das CONSULTAS e o padrão dos exames.
 *     O tempo PRÓPRIO de cada exame fica na Gestão de Exames.
 *  ⭐ Ligar o motor NÃO é daqui: é do MedCalendar, na área de
 *     Clientes. A tela só mostra se ele está ligado.
 *  ⭐ As combinações que não fazem sentido (lembrete antes da
 *     véspera, reenvio que nunca sairia) são recusadas pelo
 *     banco, com a frase dele.
 * ============================================================
 */
export function Avisos({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [c, setC] = useState<ConfigDosAvisos | null>(null);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    let valido = true;
    configDosAvisos(clienteId).then(x => { if (valido) setC(x); })
      .catch(e => { if (valido) avisar((e as Error).message ?? String(e), false); });
    return () => { valido = false; };
  }, [clienteId, avisar]);

  if (!c) return <div className="card"><p>Carregando…</p></div>;

  const mexer = (k: keyof ConfigDosAvisos, v: number | boolean) => setC({ ...c, [k]: v });
  const num = (k: keyof ConfigDosAvisos, rot: string, dica: string, min: number, max: number) => (
    <div className="form-group">
      <label>{rot}</label>
      <input type="number" min={min} max={max} data-campo={'aviso-' + k}
             value={Number(c[k])} onChange={e => mexer(k, Number(e.target.value))} />
      <small className="form-dica">{dica}</small>
    </div>
  );

  async function salvar() {
    if (!c) return;
    setIndo(true);
    try {
      const r = await salvarConfigDosAvisos(clienteId, c);
      avisar(r.mensagem, r.ok);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
    setIndo(false);
  }

  return (
    <div className="card" data-tela="avisos">
      <div className="card-header">
        <div>
          <h3>Avisos por WhatsApp</h3>
          <p className="cad-sub">Quanto tempo antes cada aviso sai, e em que horário.</p>
        </div>
      </div>

      <div className={'dia-nota ' + (c.ligado ? 'verde' : 'amarela')} data-aviso="motor-do-hospital">
        <strong>{c.ligado ? 'Os avisos estão LIGADOS para este hospital.'
                          : 'Os avisos ainda estão desligados para este hospital.'}</strong>
        <p>Quem liga e desliga é o MedCalendar. Os tempos abaixo valem a partir de quando estiver ligado.</p>
      </div>

      <h4 className="cli-secao">Consultas</h4>
      <label className="cad-escolha"><input type="checkbox" checked={c.vespera}
             onChange={e => mexer('vespera', e.target.checked)} /> Pergunta de confirmação (véspera)</label>
      {num('vespera_horas', 'Véspera: quantas horas antes', 'Com Confirmar, Cancelar e Reagendar. Padrão: 24h.', 2, 168)}
      <label className="cad-escolha"><input type="checkbox" checked={c.reenvio}
             onChange={e => mexer('reenvio', e.target.checked)} /> Reenviar para quem ficou em silêncio</label>
      {num('reenvio_espera_horas', 'Reenvio: quantas horas depois da véspera', 'Padrão: 5h.', 1, 72)}
      {num('reenvio_minimo_antes_horas', 'Reenvio: até quantas horas antes da consulta',
           'Mais perto que isso, o reenvio não muda nada e não sai. Padrão: 4h.', 1, 72)}
      <label className="cad-escolha"><input type="checkbox" checked={c.lembrete}
             onChange={e => mexer('lembrete', e.target.checked)} /> Lembrete final</label>
      {num('lembrete_horas', 'Lembrete final: quantas horas antes', 'Padrão: 2h.', 1, 48)}

      <h4 className="cli-secao">Exames</h4>
      {num('exame_horas', 'Confirmação do exame: quantas horas antes (padrão)',
           'Vale para os exames sem tempo próprio. O tempo de cada exame fica na Gestão de Exames — uma colonoscopia, por causa do preparo, pode avisar 72h antes.', 2, 168)}

      <h4 className="cli-secao">Conversas</h4>
      {num('conversa_minutos', 'O robô finaliza a conversa depois de quantos minutos sem resposta',
           'Só a que o robô resolveu. A assumida por alguém só fecha quando a pessoa clicar em Finalizar. Padrão: 15.', 5, 240)}

      <h4 className="cli-secao">Horário de envio</h4>
      <div className="cad-dupla">
        {num('hora_inicio', 'A partir de (hora)', 'No fuso do hospital.', 0, 23)}
        {num('hora_fim', 'Até (hora)', 'Nada sai fora deste horário.', 0, 23)}
      </div>

      <div className="form-actions">
        <button className="btn-primary" data-acao="salvar-avisos" disabled={indo} onClick={() => void salvar()}>
          <i className="fas fa-check" /> Salvar tempos
        </button>
      </div>
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
