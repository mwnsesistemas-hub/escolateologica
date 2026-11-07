import { useCallback, useEffect, useState } from 'react';
import {
  linhaDoTempoDaCirurgia, comentarCirurgia, configDosAvisosDeCirurgia,
  type EventoDaCirurgia, type ConfigDosAvisosDeCirurgia
} from './dados';

/**
 * ============================================================
 *  A LINHA DO TEMPO DA CIRURGIA, COM COMENTÁRIOS   (05/11/2026)
 *  Entrega 4, Parte A. O banco é o `076_acompanhamento.sql`.
 *
 *  Tudo o que aconteceu, do mais novo para o mais velho: etapas,
 *  pendências concluídas, comentários, viabilidade, cotações e os
 *  avisos que saíram. A tela não monta a lista — o banco monta.
 *
 *  ⭐ O comentário menciona @SETOR e @PESSOA (decisão do Tom), e quem
 *     é mencionado é avisado (075). Comentário não se edita nem se
 *     apaga: é fato.
 *
 *  ⚠️ O médico recebe só as etapas, e não vê a caixa de comentário
 *     (a lista de setores e pessoas vem nula para ele).
 * ============================================================
 */

const ICONE: Record<EventoDaCirurgia['tipo'], string> = {
  etapa: 'fa-arrow-right', pendencia: 'fa-check', comentario: 'fa-comment',
  viabilidade: 'fa-scale-balanced', cotacao: 'fa-box-open', aviso: 'fa-bell'
};

export function LinhaDoTempo({
  solicitacaoId, clienteId, chave, mostrar
}: {
  solicitacaoId: string;
  clienteId: string;
  /** Muda quando a gaveta muda — e a linha recarrega. */
  chave: string;
  mostrar: (texto: string, bom?: boolean) => void;
}) {
  const [eventos, setEventos] = useState<EventoDaCirurgia[] | null>(null);
  const [cfg, setCfg] = useState<ConfigDosAvisosDeCirurgia | null>(null);
  const [texto, setTexto] = useState('');
  const [setores, setSetores] = useState<string[]>([]);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([
        linhaDoTempoDaCirurgia(solicitacaoId),
        configDosAvisosDeCirurgia(clienteId).catch(() => null)
      ]);
      setEventos(e); setCfg(c);
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui abrir a linha do tempo.', false);
    }
  }, [solicitacaoId, clienteId, mostrar]);
  useEffect(() => { void carregar(); }, [carregar, chave]);

  const todasPessoas = (cfg?.setores ?? []).flatMap(s =>
    s.contatos.filter(c => c.ativo).map(c => ({ id: c.id, nome: c.nome, setor: s.nome })));

  async function enviar() {
    setOcupado(true);
    try {
      const r = await comentarCirurgia(solicitacaoId, texto.trim(), setores, pessoas);
      mostrar(r.mensagem, r.ok);
      if (r.ok) { setTexto(''); setSetores([]); setPessoas([]); await carregar(); }
    } catch (e: any) {
      mostrar(e?.message ?? 'Não consegui comentar.', false);
    } finally { setOcupado(false); }
  }

  return (
    <section className="cir-bloco" data-bloco="linha-do-tempo">
      <h4><i className="fas fa-timeline" /> Linha do tempo</h4>

      {cfg && (
        <div className="ldt-comentar" data-bloco="comentar">
          <textarea className="cir-campo" rows={2} value={texto} data-campo="comentario"
                    placeholder="Escreva um comentário para a equipe…"
                    onChange={e => setTexto(e.target.value)} />
          <div className="ldt-mencoes">
            {setores.map(id => {
              const s = cfg.setores.find(x => x.id === id);
              return <span key={id} className="ldt-chip" data-mencao="setor">@{s?.nome}
                <button type="button" aria-label="tirar" onClick={() => setSetores(setores.filter(x => x !== id))}>×</button></span>;
            })}
            {pessoas.map(id => {
              const p = todasPessoas.find(x => x.id === id);
              return <span key={id} className="ldt-chip pessoa" data-mencao="pessoa">@{p?.nome}
                <button type="button" aria-label="tirar" onClick={() => setPessoas(pessoas.filter(x => x !== id))}>×</button></span>;
            })}
            <select value="" data-campo="mencionar-setor" disabled={ocupado}
                    onChange={e => { if (e.target.value && !setores.includes(e.target.value)) setSetores([...setores, e.target.value]); }}>
              <option value="">+ @setor</option>
              {cfg.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <select value="" data-campo="mencionar-pessoa" disabled={ocupado || todasPessoas.length === 0}
                    onChange={e => { if (e.target.value && !pessoas.includes(e.target.value)) setPessoas([...pessoas, e.target.value]); }}>
              <option value="">+ @pessoa</option>
              {todasPessoas.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.setor})</option>)}
            </select>
            <button className="btn-primary btn-sm" disabled={ocupado || texto.trim().length < 2} data-acao="comentar"
                    onClick={() => void enviar()}>
              <i className="fas fa-paper-plane" /> Comentar
            </button>
          </div>
          {(setores.length > 0 || pessoas.length > 0) && (
            <small className="viab-nota">Quem for mencionado é avisado (no painel; pelo WhatsApp depois da troca).</small>
          )}
        </div>
      )}

      {eventos === null && <p className="cir-calado">Sem acesso à linha do tempo.</p>}
      {(eventos ?? []).map((e, i) => (
        <div className={'ldt-evento ldt-' + e.tipo + (e.sem_destino ? ' sem-destino' : '')} key={i} data-evento={e.tipo}>
          <span className="ldt-icone" style={e.tipo === 'etapa' && e.cor ? { background: e.cor, color: '#fff' } : undefined}>
            <i className={'fas ' + ICONE[e.tipo]} />
          </span>
          <div>
            <strong>{e.titulo}</strong>
            <small>
              {new Date(e.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {e.por && ` · ${e.por}`}
              {e.atrasada && ' · depois do prazo'}
            </small>
            {e.texto && <p className="cir-texto">{e.texto}</p>}
            {(e.mencoes ?? []).length > 0 && (
              <div className="ldt-mencoes">{e.mencoes!.map(m => <span key={m} className="ldt-chip fixo">{m}</span>)}</div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
