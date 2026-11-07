import { useCallback, useEffect, useState } from 'react';
import {
  configDosAvisosDeCirurgia, salvarContatoSetor, definirSetorDaEtapa, ligarAvisosDeCirurgia,
  avisosRecentesDeCirurgia, resumoDoDiaDeCirurgia,
  type ConfigDosAvisosDeCirurgia, type AvisoDeCirurgia, type SituacaoDoAviso, type ResumoDoDia
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  AVISOS DE CIRURGIA — os avisos por setor        (05/11/2026)
 *  Entrega 3, Parte A. O banco é o `075_cirurgia_avisos.sql`.
 *
 *  As decisões do Tom:
 *    · um SETOR FIXO por etapa recebe o aviso de quem entra nela;
 *    · pendência com prazo avisa o setor dela 1 DIA ANTES e QUANDO
 *      ATRASA;
 *    · cada setor tem VÁRIAS PESSOAS.
 *
 *  ⭐⭐⭐ Nasce DESLIGADO do WhatsApp. Até a troca do WhatsApp para o
 *     MedCalendar, os avisos aparecem AQUI. Ligar é da plataforma.
 *
 *  ⚠️ Em voz alta: o aviso que não chegou a ninguém (setor sem
 *     pessoa, nome de setor que o cadastro não conhece) aparece na
 *     lista com o motivo, em vermelho.
 * ============================================================
 */

const SITUACAO: Record<SituacaoDoAviso, string> = {
  NO_PAINEL: 'no painel',
  NA_FILA: 'WhatsApp',
  SEM_CONTATO: 'setor sem ninguém',
  SEM_SETOR: 'setor não cadastrado'
};
const TIPO: Record<AvisoDeCirurgia['tipo'], string> = {
  etapa: 'Etapa',
  aprovacao: 'Aprovação',
  comentario: 'Menção',
  resumo: 'Resumo das 7h',
  pendencia_vespera: 'Vence amanhã',
  pendencia_atrasada: 'Atrasada'
};
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const telefoneBonito = (t: string | null) => {
  const d = (t ?? '').replace(/\D/g, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : (t ?? '');
};

type Aba = 'resumo' | 'avisos' | 'etapas' | 'pessoas';
const CONTATO_NOVO = { id: null as string | null, setor_id: '', nome: '', telefone: '', usuario_id: null as string | null, ativo: true };

export function AvisosCirurgia({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const [cfg, setCfg] = useState<ConfigDosAvisosDeCirurgia | null>(null);
  const [avisos, setAvisos] = useState<AvisoDeCirurgia[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [aba, setAba] = useState<Aba>('resumo');
  const [resumo, setResumo] = useState<ResumoDoDia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [contato, setContato] = useState<typeof CONTATO_NOVO | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'problemas'>('todos');

  const carregar = useCallback(async () => {
    try {
      const [c, a, r] = await Promise.all([configDosAvisosDeCirurgia(clienteId), avisosRecentesDeCirurgia(clienteId),
                                           resumoDoDiaDeCirurgia(clienteId)]);
      setCfg(c); setAvisos(a); setResumo(r);
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setCarregou(true); }
  }, [clienteId, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function rodar(fn: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) {
    setOcupado(true);
    try {
      const r = await fn();
      avisar(r.mensagem, r.ok);
      if (r.ok) { depois?.(); await carregar(); }
    } catch (e) { avisar((e as Error).message ?? String(e), false); }
    finally { setOcupado(false); }
  }

  if (carregou && !cfg) {
    return (
      <div className="card" data-tela="avisoscirurgia">
        <div className="porvir"><i className="fas fa-lock" /><p>Os avisos de cirurgia são da equipe que gere o quadro.</p></div>
      </div>
    );
  }
  const pode = !!cfg?.pode_editar;
  const problemas = avisos.filter(a => a.situacao === 'SEM_CONTATO' || a.situacao === 'SEM_SETOR');
  const lista = filtro === 'problemas' ? problemas : avisos;

  return (
    <div className="card" data-tela="avisoscirurgia">
      <div className="card-header">
        <div>
          <h3><i className="fas fa-bell" /> Avisos de Cirurgia</h3>
          <p className="cad-sub">
            Quem entra numa etapa avisa o setor dela; pendência com prazo avisa o setor 1 dia antes e quando
            atrasa. Cada setor pode ter várias pessoas.
          </p>
        </div>
      </div>

      {cfg && (
        <div className={'avc-faixa' + (cfg.whatsapp_ligado ? ' ligado' : '')} data-whatsapp={cfg.whatsapp_ligado ? 'ligado' : 'desligado'}>
          <i className={'fab fa-whatsapp'} />
          <div>
            {cfg.whatsapp_ligado
              ? <><strong>WhatsApp ligado.</strong> Os avisos vão para a fila e saem pelo número do hospital.</>
              : <><strong>WhatsApp desligado.</strong> Os avisos aparecem só aqui, até a troca do WhatsApp para o
                  MedCalendar. (Ligar antes faria a fila encher e sair tudo de uma vez no dia da troca.)</>}
          </div>
          {cfg.pode_ligar && (
            <button className="btn-secondary btn-sm" disabled={ocupado} data-acao="ligar-whatsapp"
                    onClick={() => void rodar(() => ligarAvisosDeCirurgia(clienteId, !cfg.whatsapp_ligado))}>
              {cfg.whatsapp_ligado ? 'Desligar' : 'Ligar'}
            </button>
          )}
        </div>
      )}

      {cfg && cfg.setores_sem_cadastro.length > 0 && (
        <div className="viab-faltando" data-bloco="setores-sem-cadastro">
          <strong><i className="fas fa-triangle-exclamation" /> Setores das pendências que não existem no cadastro</strong>
          <span className="viab-falta">
            {cfg.setores_sem_cadastro.join(', ')} — as pendências desses setores não avisam ninguém. Crie os setores com
            esses nomes (Configurações → Setores) ou corrija o nome nas pendências do tipo.
          </span>
        </div>
      )}

      <div className="cus-abas" role="tablist">
        {([['resumo', 'Resumo de hoje'],
           ['avisos', `Avisos${problemas.length ? ` (${problemas.length} sem destino)` : ''}`],
           ['etapas', 'Etapa → setor'], ['pessoas', 'Pessoas dos setores']] as [Aba, string][]).map(([k, r]) => (
          <button key={k} className={'cus-aba' + (aba === k ? ' ativa' : '')} data-aba={k} onClick={() => setAba(k)}>{r}</button>
        ))}
      </div>

      {/* ⭐ 05/11 (076): o que cada setor tem para hoje — o mesmo número que
          o resumo das 7h manda pelo WhatsApp (depois da troca). */}
      {cfg && aba === 'resumo' && (
        <div className="cus-corpo" data-aba-ativa="resumo">
          <p className="cad-ajuda">
            Pendências de cirurgia atrasadas, que vencem hoje e amanhã, por setor. Às <b>7h</b>, cada pessoa do setor
            recebe estes números (no painel; pelo WhatsApp depois da troca). Setor sem nada a fazer não recebe.
          </p>
          {(resumo?.setores ?? []).length === 0 && (
            <div className="porvir" data-aviso="resumo-vazio"><p>Nada atrasado, nem vencendo hoje ou amanhã.</p></div>
          )}
          {(resumo?.setores ?? []).map(g => (
            <div key={g.setor} className="avc-setor" data-resumo-setor={g.setor}>
              <div className="avc-setor-topo">
                <strong>{g.setor}</strong>
                {!g.cadastrado && <em className="cad-tag off">setor não cadastrado</em>}
                <span className="avc-conta atrasada" data-conta="atrasadas">{g.atrasadas} atrasada(s)</span>
                <span className="avc-conta hoje" data-conta="hoje">{g.hoje} hoje</span>
                <span className="avc-conta" data-conta="amanha">{g.amanha} amanhã</span>
              </div>
              {g.itens.map((it, i) => (
                <div key={i} className={'avc-pessoa avc-item-' + it.quando} data-item-resumo={it.quando}>
                  <span>{it.descricao}</span>
                  <small>{it.numero} · {it.paciente} · prazo {new Date(it.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {cfg && aba === 'avisos' && (
        <div className="cus-corpo" data-aba-ativa="avisos">
          <div className="avc-filtro">
            <button className={'cus-aba' + (filtro === 'todos' ? ' ativa' : '')} data-filtro="todos" onClick={() => setFiltro('todos')}>Todos</button>
            <button className={'cus-aba' + (filtro === 'problemas' ? ' ativa' : '')} data-filtro="problemas" onClick={() => setFiltro('problemas')}>
              Sem destino
            </button>
          </div>
          {lista.length === 0 && <div className="porvir" data-aviso="sem-avisos"><p>Nenhum aviso ainda.</p></div>}
          {lista.map(a => (
            <div key={a.id} className={'avc-aviso avc-' + a.situacao.toLowerCase()} data-aviso-situacao={a.situacao}>
              <div className="avc-topo">
                <span className={'avc-tipo avc-' + a.tipo}>{TIPO[a.tipo]}</span>
                <b>{a.setor ?? '—'}</b>
                {a.contato && <span>→ {a.contato} <small>{telefoneBonito(a.telefone)}</small></span>}
                <span className="avc-situacao">{SITUACAO[a.situacao]}{a.mensagem_situacao && ` · ${a.mensagem_situacao.toLowerCase()}`}</span>
                <small className="avc-quando">{quando(a.criado_em)}</small>
              </div>
              <p className="avc-texto">{a.texto}</p>
            </div>
          ))}
        </div>
      )}

      {cfg && aba === 'etapas' && (
        <div className="cus-corpo" data-aba-ativa="etapas">
          <p className="cad-ajuda">
            Quando uma cirurgia <b>entra</b> na etapa — por qualquer caminho: arraste, entrada automática na aprovação,
            aprovação, recusa — o setor escolhido é avisado. Etapa sem setor não avisa ninguém.
          </p>
          {cfg.etapas.map(e => (
            <div key={e.id} className="cus-linha" data-etapa-setor={e.nome}>
              <strong><span className="avc-cor" style={{ background: e.cor }} />{e.nome}</strong>
              <select value={e.setor_id ?? ''} disabled={!pode || ocupado} data-campo="setor-da-etapa"
                      onChange={ev => void rodar(() => definirSetorDaEtapa(e.id, ev.target.value || null))}>
                <option value="">ninguém é avisado</option>
                {cfg.setores.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.contatos.filter(c => c.ativo).length})</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {cfg && aba === 'pessoas' && (
        <div className="cus-corpo" data-aba-ativa="pessoas">
          <p className="cad-ajuda">
            As pessoas de cada setor que recebem os avisos. Quem está ligado a um <b>usuário com permissão de
            aprovar</b> e está no setor da etapa de aprovação recebe a conta da cirurgia com os botões
            <b>APROVAR</b> e <b>REPROVAR</b> (reprovar pede o motivo por escrito).
          </p>
          {cfg.setores.length === 0 && (
            <div className="porvir"><p>Nenhum setor cadastrado. Crie os setores em Configurações → Setores.</p></div>
          )}
          {contato && (
            <div className="cus-form" data-bloco="form-contato">
              <select value={contato.setor_id} data-campo="contato-setor" onChange={e => setContato({ ...contato, setor_id: e.target.value })}>
                <option value="">Setor…</option>
                {cfg.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input placeholder="Nome" value={contato.nome} data-campo="contato-nome"
                     onChange={e => setContato({ ...contato, nome: e.target.value })} />
              <input placeholder="WhatsApp com DDD" value={contato.telefone} data-campo="contato-telefone" inputMode="tel"
                     onChange={e => setContato({ ...contato, telefone: e.target.value })} />
              <select value={contato.usuario_id ?? ''} data-campo="contato-usuario"
                      onChange={e => setContato({ ...contato, usuario_id: e.target.value || null })}>
                <option value="">sem usuário do sistema</option>
                {cfg.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              <label className="cus-check">
                <input type="checkbox" checked={contato.ativo} onChange={e => setContato({ ...contato, ativo: e.target.checked })} />
                <span>Recebe avisos</span>
              </label>
              <div className="cad-botoes">
                <button className="btn-primary btn-sm" disabled={ocupado || !contato.setor_id} data-acao="salvar-contato"
                        onClick={() => void rodar(() => salvarContatoSetor(clienteId, contato), () => setContato(null))}>
                  <i className="fas fa-check" /> Salvar
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setContato(null)}>Voltar</button>
              </div>
            </div>
          )}
          {cfg.setores.map(s => (
            <div key={s.id} className="avc-setor" data-setor={s.nome}>
              <div className="avc-setor-topo">
                <strong>{s.nome}</strong>
                {s.contatos.filter(c => c.ativo).length === 0 && <em className="cad-tag off">ninguém recebe</em>}
                {pode && !contato && (
                  <button className="btn-secondary btn-sm" data-acao="nova-pessoa"
                          onClick={() => setContato({ ...CONTATO_NOVO, setor_id: s.id })}>
                    <i className="fas fa-plus" /> Pessoa
                  </button>
                )}
              </div>
              {s.contatos.map(c => (
                <div key={c.id} className={'avc-pessoa' + (c.ativo ? '' : ' desligado')} data-contato={c.nome}>
                  <span>{c.nome}</span>
                  <small>{telefoneBonito(c.telefone)}{c.usuario && ` · usuário: ${c.usuario}`}</small>
                  {c.aprova && c.ativo && <em className="cad-tag forte" data-aprova>aprova pelo WhatsApp</em>}
                  {!c.ativo && <em className="cad-tag off">não recebe</em>}
                  {pode && (
                    <button className="btn-secondary btn-sm" data-acao="editar-contato"
                            onClick={() => setContato({ id: c.id, setor_id: s.id, nome: c.nome, telefone: c.telefone,
                                                        usuario_id: c.usuario_id, ativo: c.ativo })}>
                      <i className="fas fa-pen" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}
