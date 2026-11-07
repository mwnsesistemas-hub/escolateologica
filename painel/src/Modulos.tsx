import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MODULOS_DO_APP, MENU, type GrupoDoApp, type ModuloDoApp } from './menu';
import { telaInicial, linkDoMapaTv, type TelaInicial, type LinhaDoHoje, type GraficosDoDia } from './dados';

/**
 * ============================================================
 *  A TELA INICIAL — ESCOLHER O MÓDULO
 *
 *  31/10/2026, o Tom:
 *
 *      *"Quero fazer uma tela inicial que vai ter módulos a
 *      escolher. Atendimento é tudo que está pronto atualmente.
 *      E o módulo Cirurgias."*
 *      *"Todo mundo escolhe ao entrar, mas só tem acesso aos
 *      módulos quem tiver permissão de usuário."*
 *
 *  ⭐⭐⭐ 06/11/2026 — A VERSÃO 4 (o Tom: "Vou querer a Versão 4!").
 *  Depois de quatro prévias no canvas de design, a direção aprovada:
 *
 *    · a tela VESTE A COR DO HOSPITAL (`marca.cor` do cadastro): o bloco
 *      principal é um tom profundo dela, e os botões são ela mesma — o
 *      cliente tem a sensação de um sistema DELE. Cor clara demais é
 *      escurecida até o texto branco ter contraste de sobra;
 *    · "Precisa de você hoje": as coisas do dia, cada uma um botão que
 *      leva direto para a tela certa;
 *    · cada módulo com um ícone de app e o mini-gráfico do seu dia;
 *    · os módulos que ainda não existem como apps apagados, "Em breve";
 *    · os LINKS DE ACESSO de cada hospital (o chat do paciente, com o
 *      endereço DELE, e a tela do médico), com copiar e WhatsApp.
 *
 *  ⚠️ O cartão do módulo inteiro é clicável (o mouse), e o botão "Entrar"
 *     é o controle de verdade (o teclado). As marcas `.mod-cartao` e
 *     `.mod-cabeca p` ficaram: a prova de tela anda por elas.
 *
 *  ------------------------------------------------------------
 *  ⚠️ DUAS PERGUNTAS, E NÃO UMA
 *
 *  Um cartão só aparece quando AS DUAS valem:
 *
 *    1. o hospital **contratou** o módulo
 *       (`core.clientes_modulos`), e
 *    2. o usuário tem **alguma tela** dele no papel.
 *
 *  ⭐ Se sobra UM módulo só, esta tela não aparece: ninguém
 *     merece um clique a mais para escolher entre uma opção.
 * ============================================================
 */

const SAUDACAO = { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' } as const;
const NUMERO = ['Nada', 'Uma coisa', 'Duas coisas', 'Três coisas', 'Quatro coisas', 'Cinco coisas', 'Seis coisas'];

/** A cor e o ícone de app de cada módulo (a cor do MÓDULO fica no ícone;
    a do HOSPITAL veste o resto). */
const APP: Record<string, { de: string; ate: string; sombra: string; resumo: string }> = {
  atendimento: { de: '#6B8BFF', ate: '#1E40AF', sombra: 'rgba(47, 91, 234, 0.55)', resumo: 'Agenda, exames, chat e cadastros' },
  cirurgias:   { de: '#A78BFA', ate: '#5B21B6', sombra: 'rgba(124, 58, 237, 0.55)', resumo: 'Pedidos, etapas, OPME e viabilidade' },
  faturamento: { de: '#5EEAD4', ate: '#0F766E', sombra: 'rgba(13, 148, 136, 0.55)', resumo: 'Convênios, preços, contas e autorizações' }
};
const COR_DO_PONTO: Record<string, string> = { atendimento: '#3B82F6', cirurgias: '#8B5CF6', faturamento: '#14B8A6' };

/** Os módulos que ainda não existem. Quando um nascer em `MODULOS_DO_APP`,
    ele sai daqui sozinho (o filtro abaixo) — e "acende" lá em cima. */
const EM_BREVE: { area: string; itens: { grupo: string; nome: string; de: string; ate: string; icone: string }[] }[] = [
  { area: 'Assistencial', itens: [
    { grupo: 'pep', nome: 'PEP', de: '#FDA4C4', ate: '#E11D74', icone: 'medico' },
    { grupo: 'internacao', nome: 'Internação', de: '#67E8F9', ate: '#0891B2', icone: 'leito' },
    { grupo: 'farmacia', nome: 'Farmácia', de: '#FDBA74', ate: '#EA580C', icone: 'capsula' }
  ] },
  { area: 'Gestão', itens: [
    { grupo: 'financeiro', nome: 'Financeiro', de: '#FCD34D', ate: '#D97706', icone: 'grafico' },
    { grupo: 'compras', nome: 'Compras', de: '#A5B4FC', ate: '#4F46E5', icone: 'carrinho' },
    { grupo: 'estoque', nome: 'Estoque e Almoxarifado', de: '#D6B48C', ate: '#8B6A45', icone: 'caixa' },
    { grupo: 'rh', nome: 'RH', de: '#86EFAC', ate: '#16A34A', icone: 'pessoas' },
    { grupo: 'cartao', nome: 'Cartão Benefício', de: '#7DD3FC', ate: '#0284C7', icone: 'cartao' }
  ] }
];

/* ---------- a cor do hospital ---------- */
type Rgb = [number, number, number];
const hex = (c: string): Rgb => {
  const h = /^#?([0-9a-f]{6})$/i.test(c) ? c.replace('#', '') : '004994';
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)) as Rgb;
};
const paraHex = (rgb: Rgb) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const misturar = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i] - v) * t) as Rgb;
const luminancia = (rgb: Rgb) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb.map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Escurece até o branco ter `alvo` de contraste (WCAG) — a cor clara de um
    cliente não pode deixar o texto ilegível. */
const escurecerAte = (rgb: Rgb, alvo: number): Rgb => {
  let x = rgb;
  for (let i = 0; i < 40 && 1.05 / (luminancia(x) + 0.05) < alvo; i++) x = misturar(x, [6, 10, 20], 0.08);
  return x;
};
export function temaDoHospital(cor: string) {
  const base = hex(cor || '#004994');
  return {
    painel: paraHex(escurecerAte(misturar(base, [6, 10, 20], 0.3), 8)),
    botao: paraHex(escurecerAte(base, 5))
  };
}

export function Modulos({
  clienteId, modulosDoCliente, telas, plataforma, nomeDoHospital, logo, corDoHospital, sigla, slug, aoEscolher
}: {
  clienteId: string;
  modulosDoCliente: string[];
  telas: string[];
  plataforma: boolean;
  nomeDoHospital: string;
  logo: string;
  corDoHospital: string;
  sigla: string;
  slug: string;
  aoEscolher: (g: GrupoDoApp, pagina?: string) => void;
}) {
  const liberados = modulosLiberados(modulosDoCliente, telas, plataforma);
  const [t, setT] = useState<TelaInicial | null>(null);
  const [linksAbertos, setLinksAbertos] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [codigoTv, setCodigoTv] = useState<string | null>(null);
  const tema = useMemo(() => temaDoHospital(corDoHospital), [corDoHospital]);

  /* O "hoje" chega depois: a tela abre na hora, e os números entram quando
     vierem. Se a função falhar, os cartões continuam — a tela inicial é a
     porta e não pode quebrar por causa de um número. */
  useEffect(() => {
    let vivo = true;
    telaInicial(clienteId).then(r => { if (vivo) setT(r); }).catch(() => {});
    /* ⭐ 06/11: o link da TV do centro cirúrgico (080) — só vem para quem
       gere ou configura as cirurgias; os outros recebem nulo. */
    if (modulosDoCliente.includes('cirurgias')) linkDoMapaTv(clienteId).then(c => { if (vivo) setCodigoTv(c); }).catch(() => {});
    return () => { vivo = false; };
  }, [clienteId]);

  const podeVer = (pagina?: string) => !!pagina && (!telas.length || telas.includes('*') || telas.includes(pagina));
  const precisa = useMemo(() => {
    const l: (LinhaDoHoje & { grupo: GrupoDoApp })[] = [];
    for (const m of liberados) for (const x of t?.hoje?.[m.grupo] ?? []) {
      if (x.n > 0 && x.acao !== false) l.push({ ...x, grupo: m.grupo });
    }
    return l.sort((a, b) => Number(b.alerta) - Number(a.alerta)).slice(0, 5);
  }, [t, liberados]);

  const dia = t?.dia
    ? new Date(t.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  const links = [
    ...(modulosDoCliente.includes('chat') && slug ? [{
      chave: 'chat', nome: 'Chat do paciente', url: `${origem}/chat/${slug}`,
      nota: 'Para o paciente marcar e tirar dúvidas, sem instalar nada.',
      mensagem: `Fale com o ${nomeDoHospital} por aqui: `
    }] : []),
    { chave: 'medico', nome: 'Tela do médico', url: `${origem}/medico`,
      nota: 'O médico entra com o mesmo e-mail e senha do sistema.',
      mensagem: `Acesso do médico ao ${nomeDoHospital}: ` },
    ...(codigoTv ? [{
      chave: 'tv', nome: 'Mapa da TV do centro cirúrgico', url: `${origem}/mapa?c=${codigoTv}`,
      nota: 'Abre sem senha. Se o link vazar, troque em Calendário cirúrgico.',
      mensagem: `Mapa cirúrgico do ${nomeDoHospital} (abrir na TV): `
    }] : [])
  ];
  async function copiar(chave: string, url: string) {
    try { await navigator.clipboard.writeText(url); } catch { /* sem permissão: o endereço está visível para copiar à mão */ }
    setCopiado(chave);
  }

  const [principal, ...demais] = liberados;
  const estilo = { ['--hosp' as any]: tema.botao, ['--hosp-painel' as any]: tema.painel } as CSSProperties;

  const cartao = (m: ModuloDoApp, grande: boolean) => {
    const app = APP[m.grupo] ?? { de: '#94A3B8', ate: '#475569', sombra: 'rgba(71, 85, 105, 0.45)', resumo: m.frase };
    const linhas = (t?.hoje?.[m.grupo] ?? []).slice(0, 2);
    return (
      <article key={m.grupo} className={'mod-cartao' + (grande ? ' grande' : '')} data-modulo={m.grupo}
               onClick={() => aoEscolher(m.grupo)}>
        <div className="mod-cartao-topo">
          <span className="mod-app" aria-hidden="true"
                style={{ background: `linear-gradient(145deg, ${app.de} 0%, ${app.ate} 100%)`, boxShadow: `0 10px 22px -8px ${app.sombra}, inset 0 1px 0 rgba(255,255,255,0.35)` }}>
            <IconeDoModulo grupo={m.grupo} />
          </span>
          <div className="mod-cartao-nome">
            <h2>{m.nome}</h2>
            <small>{app.resumo}</small>
          </div>
          {grande && (
            <button type="button" className="mod-entrar no-topo" aria-label={`Entrar: ${m.nome}`}
                    onClick={e => { e.stopPropagation(); aoEscolher(m.grupo); }}>Entrar</button>
          )}
        </div>
        <Grafico grupo={m.grupo} g={t?.graficos} linhas={linhas} />
        {/* No cartão grande o "Entrar" mora no topo; no celular ele desce e vira
            o botão largo, como nos outros (o CSS escolhe qual aparece). */}
        <button type="button" className={'mod-entrar largo' + (grande ? ' so-celular' : '')} aria-label={`Entrar: ${m.nome}`}
                onClick={e => { e.stopPropagation(); aoEscolher(m.grupo); }}>Entrar</button>
      </article>
    );
  };

  const emBreve = EM_BREVE.map(a => ({ ...a, itens: a.itens.filter(i => !MODULOS_DO_APP.some(m => m.grupo === i.grupo)) }))
                          .filter(a => a.itens.length);

  return (
    <div className="mod-tela" style={estilo}>
      <div className="mod-caixa">
        <header className="mod-topo">
          <div className="mod-marca">
            <span className="mod-selo" aria-hidden="true">{logo ? <img src={logo} alt="" /> : sigla}</span>
            <div className="mod-cabeca">
              <p>{nomeDoHospital}</p>
              <small>Painel MedCalendar</small>
            </div>
          </div>
          <div className="mod-topo-acoes">
            <button type="button" className="mod-links-botao" aria-expanded={linksAbertos} aria-label="Links de acesso" data-acao="links-de-acesso"
                    onClick={() => { setLinksAbertos(!linksAbertos); setCopiado(null); }}>
              <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
              <span>Links de acesso</span>
            </button>
            {linksAbertos && (
              <div className="mod-links" role="dialog" aria-label="Links de acesso" data-bloco="links-de-acesso">
                {links.map(l => (
                  <div key={l.chave} className="mod-link" data-link={l.chave}>
                    <div className="mod-link-texto">
                      <strong>{l.nome}</strong>
                      <span className="mod-link-url">{l.url}</span>
                      <small>{l.nota}</small>
                    </div>
                    <div className="mod-link-acoes">
                      <button type="button" className="mod-link-copiar" data-acao={'copiar-' + l.chave}
                              onClick={() => void copiar(l.chave, l.url)}>{copiado === l.chave ? 'Copiado' : 'Copiar'}</button>
                      <a className="mod-link-zap" href={`https://wa.me/?text=${encodeURIComponent(l.mensagem + l.url)}`}
                         target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="mod-grade">
          <section className="mod-ola">
            <svg className="mod-pontos" aria-hidden="true" width="100%" height="100%">
              <defs><pattern id="mod-pontos" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#FFFFFF" /></pattern></defs>
              <rect width="100%" height="100%" fill="url(#mod-pontos)" />
            </svg>
            <div className="mod-ola-texto">
              {dia && <span className="mod-data"><i aria-hidden="true" />{dia}</span>}
              <h1>{t ? `${SAUDACAO[t.periodo]}${t.nome ? `, ${t.nome}` : ''}.` : 'Por onde começamos?'}</h1>
              <p>{t
                ? (precisa.length
                    ? `${NUMERO[precisa.length] ?? `${precisa.length} coisas`} ${precisa.length === 1 ? 'precisa' : 'precisam'} de você hoje.`
                    : 'Nada esperando por você agora. Escolha por onde começar.')
                : 'Escolha por onde começar.'}</p>
            </div>
            {precisa.length > 0 && (
              <div className="mod-precisa" data-bloco="precisa-de-voce">
                {precisa.map((l, i) => (
                  <button key={i} type="button" className={'mod-precisa-item' + (l.alerta ? ' alerta' : '')}
                          data-linha-hoje={l.texto}
                          onClick={() => aoEscolher(l.grupo, podeVer(l.pagina) ? l.pagina : undefined)}>
                    <b style={{ background: l.alerta ? '#F97316' : COR_DO_PONTO[l.grupo] ?? '#64748B' }}>{l.n}</b>
                    <span>{l.texto}</span>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="mod-modulos">
            {principal && cartao(principal, true)}
            {demais.length > 0 && <div className="mod-modulos-par">{demais.map(m => cartao(m, false))}</div>}
          </div>
        </div>

        {liberados.length === 0 && (
          <p className="mod-nada">
            O seu usuário ainda não tem acesso a nenhum módulo.
            Peça para a gestão liberar em <b>Usuários</b>.
          </p>
        )}

        {emBreve.length > 0 && (
          <section className="mod-breve" data-bloco="em-breve">
            <div className="mod-breve-topo">
              <h2>Em breve no MedCalendar</h2>
              <span>Quando um módulo ficar pronto, ele acende aqui.</span>
            </div>
            <div className="mod-breve-areas">
              {emBreve.map(a => (
                <div key={a.area} className="mod-breve-area">
                  <span className="mod-breve-titulo">{a.area}</span>
                  <div className="mod-breve-apps">
                    {a.itens.map(i => (
                      <div key={i.grupo} className="mod-breve-app" data-em-breve={i.nome}>
                        <span className="mod-app apagado" aria-hidden="true"
                              style={{ background: `linear-gradient(145deg, ${i.de} 0%, ${i.ate} 100%)` }}>
                          <IconeEmBreve icone={i.icone} />
                        </span>
                        <span>{i.nome}</span>
                      </div>
                    ))}
                    {/* "Outros" fecha a ÚLTIMA área (sozinho numa área dele, no
                        celular ficava perdido numa linha só). */}
                    {a === emBreve[emBreve.length - 1] && (
                      <div className="mod-breve-app" data-em-breve="Outros">
                        <span className="mod-app outros" aria-hidden="true">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B6475" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </span>
                        <span className="mudo">Outros</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ---------- o mini-gráfico do dia de cada módulo ---------- */
function Grafico({ grupo, g, linhas }: { grupo: string; g?: GraficosDoDia; linhas: LinhaDoHoje[] }) {
  if (grupo === 'atendimento' && g?.atendimento) {
    const a = g.atendimento;
    const max = Math.max(1, ...a.por_hora);
    const total = linhas[0]?.n ?? a.por_hora.reduce((s, n) => s + n, 0);
    const agora = a.hora_agora - a.inicio;
    return (
      <div className="mod-graf agenda" data-grafico="agenda">
        <div className="mod-graf-numero"><b>{total}</b><span>na agenda hoje</span></div>
        <div className="mod-graf-barras-caixa">
          <div className="mod-graf-barras">
            {a.por_hora.map((n, i) => (
              <span key={i} title={`${a.inicio + i}h: ${n}`}
                    className={i === agora ? 'agora' : i < agora ? 'passou' : ''}
                    style={{ height: `${Math.max(8, (n / max) * 100)}%` }} />
            ))}
          </div>
          <div className="mod-graf-legenda">
            <span>{a.inicio}h</span>
            {agora >= 0 && agora < a.por_hora.length && <span className="agora">agora, {a.hora_agora}h</span>}
            <span>{a.inicio + a.por_hora.length - 1}h</span>
          </div>
        </div>
      </div>
    );
  }
  if (grupo === 'cirurgias' && g?.cirurgias) {
    const c = g.cirurgias;
    const max = Math.max(1, ...c.por_etapa.map(e => e.n));
    return (
      <div className="mod-graf etapas" data-grafico="etapas">
        <small className="mod-graf-sub">{c.total} no quadro</small>
        <div className="mod-graf-colunas">
          {c.por_etapa.map(e => (
            <div key={e.chave} className={'mod-graf-coluna' + (e.chave === 'aprovacao' ? ' destaque' : '')} title={`${e.nome}: ${e.n}`}>
              <b>{e.n}</b>
              <span style={{ height: `${Math.max(6, (e.n / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mod-graf-legenda"><span>Pedido</span><span className="destaque">Aprovação</span><span>Agendada</span></div>
      </div>
    );
  }
  if (grupo === 'faturamento' && g?.faturamento) {
    const f = g.faturamento;
    const pct = f.realizadas_no_mes > 0 ? Math.round((f.lancadas / f.realizadas_no_mes) * 100) : 100;
    const faltam = f.realizadas_no_mes - f.lancadas;
    return (
      <div className="mod-graf anel" data-grafico="contas">
        <svg aria-hidden="true" width="74" height="74" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#E0F5F2" strokeWidth="5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="#0D9488" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)" />
        </svg>
        <div className="mod-graf-numero">
          <b>{pct}%</b>
          <span>{f.realizadas_no_mes === 0 ? 'nenhuma cirurgia realizada no mês' : `das contas do mês lançadas${faltam ? `; faltam ${faltam}` : ''}`}</span>
        </div>
      </div>
    );
  }
  // Sem gráfico (sem permissão para ele, ou ainda carregando): as linhas do dia.
  if (!linhas.length) return null;
  return (
    <div className="mod-hoje" data-hoje={grupo}>
      {linhas.map((l, i) => (
        <div key={i} className={'mod-hoje-linha' + (l.alerta ? ' alerta' : '')}><b>{l.n}</b><span>{l.texto}</span></div>
      ))}
    </div>
  );
}

/* ---------- os ícones (traço branco sobre o app) ---------- */
function IconeDoModulo({ grupo }: { grupo: string }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (grupo === 'atendimento') return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M9 15l2 2 4-4" /></svg>;
  if (grupo === 'cirurgias') return <svg {...p}><rect x="2.5" y="4" width="19" height="13" rx="3" /><path d="M5.5 11h3l1.6-3.4 2.4 6.4 1.8-4 1 1.6h3.2" /><path d="M9 21h6M12 17v4" /></svg>;
  if (grupo === 'faturamento') return <svg {...p}><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
  return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4" /></svg>;
}
function IconeEmBreve({ icone }: { icone: string }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icone) {
    // O médico: jaleco com gola em V e o estetoscópio no pescoço (pedido do Tom).
    case 'medico': return <svg {...p} strokeWidth={1.8}><circle cx="12" cy="6.6" r="3.4" /><path d="M4 21.5v-1.8c0-3.4 2.7-6 6-6h4c3.3 0 6 2.6 6 6v1.8" /><path d="M10 13.8l2 3.2 2-3.2" /><path d="M8.4 14.2c-.5 2.6.6 4.6 2.4 5.2" /><path d="M15.6 14.2v3.3" /><circle cx="15.6" cy="18.9" r="1.4" /></svg>;
    case 'leito': return <svg {...p}><path d="M3 7v12M21 13v6M3 15h18" /><rect x="9" y="10" width="11" height="5" rx="2" /><circle cx="6" cy="12" r="2" /></svg>;
    case 'capsula': return <svg {...p}><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-40 12 12)" /><path d="M9.7 9.3l5 4.2" /></svg>;
    case 'grafico': return <svg {...p}><path d="M3 20h18M4 16l5-5 4 3 7-8" /><path d="M15 6h5v5" /></svg>;
    case 'carrinho': return <svg {...p}><path d="M3 4h2.5l2.2 11h10.6L20.5 8H7" /><circle cx="9.5" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>;
    case 'caixa': return <svg {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>;
    case 'pessoas': return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14c2.6.2 4.5 2.3 4.5 5" /></svg>;
    case 'cartao': return <svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 9.5h19" /><path d="M12.6 16.6l-2.2-2.1a1.3 1.3 0 0 1 1.9-1.8l.3.3.3-.3a1.3 1.3 0 0 1 1.9 1.8z" fill="#FFFFFF" strokeWidth={1.2} /></svg>;
    default: return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  }
}

/**
 * ⭐ A MESMA conta que o menu usa para esconder item, aplicada ao
 *    módulo inteiro. Escrita UMA vez e exportada: se ela morasse
 *    aqui e no App, um cartão poderia abrir um módulo cujo menu
 *    estaria vazio — e o usuário cairia numa tela em branco sem
 *    erro nenhum.
 */
export function modulosLiberados(
  modulosDoCliente: string[], telas: string[], plataforma: boolean
): ModuloDoApp[] {
  return MODULOS_DO_APP.filter(m => {
    if (m.modulo && !modulosDoCliente.includes(m.modulo)) return false;
    return MENU.some(s => {
      if (s.sempre) return false;             // a área institucional não conta
      if ((s.grupo ?? 'atendimento') !== m.grupo) return false;
      return s.itens.some(i => {
        if (i.plataforma) return plataforma;
        if (i.modulo && !modulosDoCliente.includes(i.modulo)) return false;
        return !telas.length || telas.includes('*') || telas.includes(i.pagina);
      });
    });
  });
}
