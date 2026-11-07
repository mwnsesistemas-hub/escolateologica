import { useEffect, useState } from 'react';
import {
  estadoDoAgendador, ligarAgendador, desligarAgendador, type EstadoDoAgendador
} from './dados';

/**
 * ============================================================
 *  O AGENDADOR DOS AVISOS — SÓ A PLATAFORMA      (23/10/2026)
 *
 *  O relógio do próprio banco (pg_cron): o motor de avisos a cada
 *  5 minutos, o envio a cada minuto. No lugar dos gatilhos do
 *  Apps Script — e por isso ligado só no DIA DA TROCA, junto com
 *  o desligamento deles.
 *
 *  ⭐ A tela mostra o que falta (as extensões, o endereço) e a
 *     última execução de cada tarefa, com o erro se houver: um
 *     relógio parado em silêncio é como o lembrete deixa de sair
 *     sem ninguém perceber.
 * ============================================================
 */
export function AgendadorDosAvisos({ aoAvisar }: { aoAvisar: (m: string, ok: boolean) => void }) {
  const [e, setE] = useState<EstadoDoAgendador | null>(null);
  const [url, setUrl] = useState('');
  const [segredo, setSegredo] = useState('');
  const [indo, setIndo] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let valido = true;
    estadoDoAgendador().then(x => { if (valido) { setE(x); if (x?.url) setUrl(x.url); } }).catch(() => {});
    return () => { valido = false; };
  }, [recarga]);

  if (!e) return null;
  const ligado = e.tarefas.length > 0;

  async function ligar() {
    setIndo(true);
    try {
      const r = await ligarAgendador(url.trim(), segredo.trim());
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) { setSegredo(''); setRecarga(n => n + 1); }
    } catch (x) { aoAvisar((x as Error).message ?? String(x), false); }
    setIndo(false);
  }
  async function desligar() {
    setIndo(true);
    try {
      const r = await desligarAgendador();
      aoAvisar(r.mensagem, r.ok);
      setRecarga(n => n + 1);
    } catch (x) { aoAvisar((x as Error).message ?? String(x), false); }
    setIndo(false);
  }

  return (
    <div className="cad-bloco" data-bloco="agendador">
      <h4><i className="fas fa-clock" /> Agendador dos avisos</h4>
      <div className={'dia-nota ' + (ligado ? 'verde' : 'amarela')} data-aviso="estado-agendador">
        <strong>{ligado ? 'LIGADO: o motor roda a cada 5 minutos, e o envio a cada minuto.'
                        : 'Desligado: nada roda sozinho.'}</strong>
        <p>
          Extensões do Supabase:{' '}
          <span data-campo="ext-cron">pg_cron {e.pg_cron ? '✅' : '❌ falta ativar'}</span> ·{' '}
          <span data-campo="ext-net">pg_net {e.pg_net ? '✅' : '❌ falta ativar'}</span>
          {(!e.pg_cron || !e.pg_net) && ' — em Database → Extensions, no painel do Supabase.'}
        </p>
      </div>

      {ligado ? (
        <>
          <div className="mod-ensaio" data-lista="tarefas">
            {e.tarefas.map(t => (
              <div key={t.nome} className="mod-ensaio-linha" data-tarefa={t.nome}>
                <span><strong>{t.nome}</strong> · {t.quando}</span>
                <small>{t.ultima
                  ? `última: ${new Date(t.ultima.em).toLocaleString('pt-BR')} · ${t.ultima.status}`
                    + (t.ultima.status !== 'succeeded' && t.ultima.mensagem ? ` — ${t.ultima.mensagem}` : '')
                  : 'ainda não rodou'}</small>
              </div>
            ))}
          </div>
          <button className="btn-secondary" data-acao="desligar-agendador" disabled={indo}
                  onClick={() => void desligar()}>
            <i className="fas fa-power-off" /> Desligar o agendador
          </button>
        </>
      ) : (
        <>
          <div className="form-group">
            <label>Endereço da Edge Function de envio</label>
            <input type="text" data-campo="agendador-url" value={url}
                   placeholder="https://<projeto>.supabase.co/functions/v1/enviar-whatsapp"
                   onChange={x => setUrl(x.target.value)} />
          </div>
          <div className="form-group">
            <label>Segredo do envio (o mesmo de ENVIO_SEGREDO)</label>
            <input type="password" autoComplete="new-password" data-campo="agendador-segredo"
                   value={segredo} onChange={x => setSegredo(x.target.value)} />
          </div>
          <button className="btn-primary" data-acao="ligar-agendador" disabled={indo}
                  onClick={() => void ligar()}>
            <i className="fas fa-power-off" /> Ligar o agendador
          </button>
          <small className="wiz-dica" style={{ display: 'block' }}>
            Ligue só no dia da troca, junto com o desligamento dos gatilhos do Apps Script.
            Mesmo ligado, só sai aviso de hospital com o motor de avisos ligado.
          </small>
        </>
      )}
    </div>
  );
}
