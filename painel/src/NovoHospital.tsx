import { useMemo, useState } from 'react';
import { criarCliente } from './dados';
import { MENU } from './menu';
import { sugerirSlug, problemaDoSlug } from '../../nucleo/plataforma';

/**
 * ============================================================
 *  UM HOSPITAL NOVO
 *
 *  13/10/2026. Até hoje a tela de Clientes dizia, em letras:
 *  *"criar hospital novo pelo painel ainda não existe — vem no
 *  próximo pacote."* É este.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O SLUG É PARA SEMPRE, E POR ISSO ELE É CONFERIDO AQUI
 *
 *  O `001_core.sql` promete que o identificador nunca muda, e
 *  há coisa amarrada nele que não é endereço: o `semear_demo`
 *  apaga `where slug = 'demo'`.
 *
 *  Um hospital criado com slug `Demo`, `demo-2` ou com espaço
 *  no meio não dá erro no dia. Dá erro no dia em que alguém
 *  roda a semeadura de demonstração.
 *
 *  A trava de verdade está no banco — `criar_cliente` tem a
 *  mesma expressão regular e recusa `demo`. Esta tela repete a
 *  conferência para que o Tom veja o motivo ANTES de clicar, e
 *  não depois num toast vermelho.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ O E-MAIL É OPCIONAL, E A TELA DIZ O QUE ACONTECE SEM ELE
 *
 *  `criar_cliente` só liga a primeira pessoa se ela JÁ tiver
 *  conta. Não cria login — criar usuário é do sistema de
 *  autenticação, não do banco.
 *
 *  Sem dizer isso aqui, o Tom digitaria o e-mail do diretor,
 *  veria "hospital criado" em verde e esperaria que o diretor
 *  conseguisse entrar. Ele não conseguiria, e ninguém saberia
 *  por quê.
 * ============================================================
 */

const NOME_DO_MODULO: Record<string, string> = {
  agendamento: 'Agendamento',
  exames: 'Exames',
  chat: 'Atendimento e WhatsApp'
};

const MODULOS: string[] = (() => {
  const vistos: string[] = [];
  for (const s of MENU)
    for (const i of s.itens)
      if (i.modulo && !vistos.includes(i.modulo)) vistos.push(i.modulo);
  return vistos;
})();

/* ⭐ A expressão do slug, a sugestão e o motivo da recusa moram
   em `nucleo/plataforma.ts`, com teste. Aqui ficaria sem teste,
   e a cópia da regra do banco é justamente a que não pode
   envelhecer calada. */

export function NovoHospital({
  aoFechar, aoAvisar
}: {
  aoFechar: (criou: boolean) => void;
  aoAvisar: (mensagem: string, bom: boolean) => void;
}) {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [mexeuNoSlug, setMexeuNoSlug] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [mods, setMods] = useState<string[]>(['agendamento']);
  const [indo, setIndo] = useState(false);

  const slugFinal = mexeuNoSlug ? slug : sugerirSlug(nome);

  const problema = useMemo(() => problemaDoSlug(slugFinal), [slugFinal]);

  const podeCriar = !indo && nome.trim().length >= 3 && !problema;

  async function criar() {
    if (!podeCriar) return;
    setIndo(true);
    try {
      const r = await criarCliente({
        slug: slugFinal, nome: nome.trim(),
        cnpj: cnpj.replace(/\D/g, '') || null,
        modulos: mods, email: email.trim() || null
      });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) aoFechar(true);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  return (
    <div className="modal" data-modal="novo-hospital">
      <div className="modal-overlay" onClick={() => aoFechar(false)} />
      <div className="modal-content" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3>Novo hospital</h3>
          <button onClick={() => aoFechar(false)} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Razão social *</label>
            <input type="text" value={nome} data-campo="novo-nome"
                   maxLength={120} autoFocus
                   onChange={e => setNome(e.target.value)}
                   placeholder="Hospital Israelita St James" />
          </div>

          <div className="cad-dupla">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Identificador (slug) *</label>
              <input type="text" value={slugFinal} data-campo="novo-slug"
                     maxLength={40}
                     onChange={e => {
                       setMexeuNoSlug(true);
                       setSlug(e.target.value.toLowerCase());
                     }} />
              <small className="form-dica">
                Nunca muda depois. Sai do nome sozinho — mexa só se precisar.
              </small>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>CNPJ</label>
              <input type="text" value={cnpj} data-campo="novo-cnpj"
                     onChange={e => setCnpj(e.target.value)}
                     placeholder="00.000.000/0000-00" />
            </div>
          </div>

          {!!problema && nome.trim().length >= 3 && (
            <div className="dia-nota amarela" data-erro="slug">
              <strong>Este identificador não serve.</strong>
              <p>{problema}</p>
            </div>
          )}

          <h4 className="cli-secao">Módulos contratados</h4>
          {MODULOS.map(m => (
            <label key={m} className={'cli-modulo' + (mods.includes(m) ? ' ligado' : '')}
                   data-modulo-novo={m}>
              <input type="checkbox" checked={mods.includes(m)}
                     onChange={e => setMods(l => e.target.checked
                       ? [...l, m] : l.filter(x => x !== m))} />
              <span className="cli-modulo-nome">{NOME_DO_MODULO[m] ?? m}</span>
            </label>
          ))}

          <h4 className="cli-secao">Quem vai administrar</h4>
          <div className="form-group">
            <label>E-mail de quem administra (opcional)</label>
            <input type="email" value={email} data-campo="novo-email"
                   onChange={e => setEmail(e.target.value)}
                   placeholder="diretoria@hospital.com.br" />
          </div>

          {/* ⭐⭐⭐ O que o botão NÃO faz, dito antes do clique. */}
          <div className="dia-nota azul" data-aviso="email-sem-conta">
            <strong>Este campo não cria login.</strong>
            <p>
              Se essa pessoa <strong>já tiver conta</strong> no MedCalendar, ela
              entra como Diretoria do hospital novo na hora. Se ainda não tiver,
              o hospital é criado do mesmo jeito e ela precisa se cadastrar
              primeiro — aí você a liga em <strong>Usuários</strong>.
            </p>
          </div>

          <div className="dia-nota azul" data-aviso="o-que-nasce-junto">
            <strong>O hospital nasce com:</strong>
            <p>
              os quatro papéis (Diretoria, Coordenação, Recepção, Médico), com
              as permissões e as telas de sempre, e os motivos de cancelamento
              padrão. Especialidades, convênios e médicos são do hospital —
              eles cadastram.
            </p>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" disabled={indo}
                    onClick={() => aoFechar(false)}>Voltar</button>
            <button className="btn-primary" data-acao="criar-hospital"
                    disabled={!podeCriar} onClick={criar}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Criando…</>
                : <><i className="fas fa-hospital" /> Criar hospital</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
