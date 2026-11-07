import { useSessao } from './useSessao';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { meusClientes, souMedico, minhaSenhaEProvisoria, type Cliente } from './dados';
import { TrocarSenhaProvisoria } from './TrocarSenhaProvisoria';
import { MeuDia } from './MeuDia';
import { FRASE_DO_DIA } from './frases';

/**
 * ============================================================
 *  A PORTA DO MÉDICO — /medico
 *  26/10/2026
 *
 *  O Tom, sobre o sistema que roda hoje:
 *
 *  > *"No sistema atual, o acesso do medico não fica no painel.
 *  >  ele fica em um link separado, onde loga com CRM e Senha."*
 *
 *  Ele escolheu manter o **link separado** e a entrada pela
 *  MESMA senha do sistema.
 *
 *  ------------------------------------------------------------
 *  ⚠️ POR QUE NÃO ENTRA POR CRM
 *
 *  Entrar por CRM exigiria uma de duas coisas, e as duas são
 *  caras:
 *
 *   1. Um SEGUNDO cadastro de senha. Dois lugares para a senha
 *      de uma pessoa, dois lugares para destravar, dois para
 *      auditar — e no dia em que divergirem, o médico fica de
 *      fora no meio do consultório.
 *
 *   2. Uma tradução pública CRM → e-mail na tela de entrar. Aí
 *      qualquer pessoa descobre o e-mail dos médicos do
 *      hospital testando CRMs, que é o oposto do que a tela de
 *      entrar do painel faz questão de não fazer (ela nem diz
 *      se o e-mail existe).
 *
 *  Então: endereço próprio, cara própria, e **uma senha só** —
 *  a mesma que a recepção usa, no mesmo lugar, com o mesmo
 *  "Redefinir senha" que já existe.
 *
 *  ------------------------------------------------------------
 *  ⭐ O QUE ESTA TELA NÃO TEM
 *
 *  Barra lateral, seletor de hospital, menu. O médico abre o
 *  link e cai no dia dele. Tudo o que estivesse aqui no meio
 *  seria uma coisa a mais para tocar sem querer com o polegar,
 *  entre um paciente e outro.
 * ============================================================
 */
export function PortaDoMedico() {
  /* ⭐ 29/10: a mesma porta da sessão do painel (`useSessao`). A
     cópia que estava aqui travava em "carregando" quando a aba
     voltava a ficar visível — igual à do painel. */
  const { sessao, lendo, provisoria, senhaTrocada } = useSessao();

  if (lendo) {
    return (
      <div className="porta-raiz">
        <div className="porta-carregando"><i className="fas fa-circle-notch fa-spin" /></div>
      </div>
    );
  }

  if (!sessao) return <EntrarMedico />;

  if (provisoria === null) {
    return (
      <div className="porta-raiz">
        <div className="porta-carregando"><i className="fas fa-circle-notch fa-spin" /></div>
      </div>
    );
  }

  /* ⭐⭐⭐ A senha que o hospital digitou não abre a agenda duas
     vezes. Está antes de tudo — antes até de saber se ele é
     médico aqui. */
  if (provisoria) {
    return (
      <TrocarSenhaProvisoria
        email={sessao.user?.email ?? ''}
        aoTrocar={senhaTrocada} />
    );
  }

  return <DiaDoMedicoLogado />;
}

/* ════════════════════════════════════════════════════════════
 *  ENTRAR
 * ════════════════════════════════════════════════════════════ */
function EntrarMedico() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setIndo(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: senha
    });
    if (error) {
      /* ⚠️ A mesma frase para "e-mail não existe" e "senha
         errada". Frases diferentes contam, para quem está
         tentando, quais e-mails são de médicos do hospital. */
      setErro(error.message.toLowerCase().includes('invalid')
        ? 'E-mail ou senha não conferem.'
        : 'Não consegui entrar: ' + error.message);
      setIndo(false);
    }
  }

  return (
    <div className="porta-raiz" data-tela="porta-do-medico">
      <form className="porta-caixa" onSubmit={enviar} data-bloco="entrar-medico">
        <div className="porta-marca">
          <span className="porta-bola"><i className="fas fa-user-doctor" /></span>
          <div>
            <h1>Agenda Médica</h1>
            <small>MedCalendar</small>
          </div>
        </div>

        {!!erro && <div className="porta-erro" data-aviso="erro">{erro}</div>}

        <div className="form-group">
          <label htmlFor="pm-email">E-mail</label>
          <input id="pm-email" type="email" autoComplete="username"
                 data-campo="email" value={email} required
                 onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="pm-senha">Senha</label>
          <input id="pm-senha" type="password" autoComplete="current-password"
                 data-campo="senha" value={senha} required
                 onChange={e => setSenha(e.target.value)} />
        </div>

        <button className="btn-primary porta-btn" type="submit"
                data-acao="entrar" disabled={indo}>
          {indo ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="porta-rodape">
          Sem acesso? Fale com a administração do hospital.
        </p>
      </form>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
 *  JÁ ENTROU
 * ════════════════════════════════════════════════════════════ */
function DiaDoMedicoLogado() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [souDali, setSouDali] = useState<boolean | null>(null);
  const [erro, setErro] = useState('');
  const [frase] = useState(() => FRASE_DO_DIA());

  useEffect(() => {
    let valido = true;
    meusClientes()
      .then(async cs => {
        if (!valido) return;
        setClientes(cs);
        /* ⭐ Um hospital só — que é o caso de quase todo médico —
           entra direto. Perguntar "em qual hospital?" para quem
           só tem um é um clique que não decide nada. */
        if (cs.length === 1) setCliente(cs[0]!);
      })
      .catch(e => { if (valido) setErro((e as Error).message ?? String(e)); });
    return () => { valido = false; };
  }, []);

  useEffect(() => {
    if (!cliente) return;
    let valido = true;
    souMedico(cliente.id)
      .then(r => { if (valido) setSouDali(r.ok); })
      .catch(() => { if (valido) setSouDali(false); });
    return () => { valido = false; };
  }, [cliente?.id]);

  async function sair() {
    await supabase.auth.signOut();
  }

  const topo = (
    <header className="porta-topo" data-bloco="topo">
      <span className="porta-topo-marca">
        <i className="fas fa-user-doctor" /> Agenda Médica
      </span>
      <button className="porta-sair" data-acao="sair" onClick={() => { void sair(); }}>
        <i className="fas fa-power-off" /> <span>Sair</span>
      </button>
    </header>
  );

  if (erro) {
    return (
      <div className="porta-dia">{topo}
        <div className="porta-miolo"><div className="erro-caixa">{erro}</div></div>
      </div>
    );
  }

  if (!clientes) {
    return (
      <div className="porta-dia">{topo}
        <div className="porta-miolo">
          <div className="porta-carregando"><i className="fas fa-circle-notch fa-spin" /></div>
        </div>
      </div>
    );
  }

  /* ⭐ Nenhum hospital: a pessoa entrou com um login que não tem
     acesso a lugar nenhum. Dizer isso é melhor que uma tela em
     branco — e melhor que "erro". */
  if (!clientes.length) {
    return (
      <div className="porta-dia">{topo}
        <div className="porta-miolo">
          <div className="med-vazio" data-aviso="sem-hospital">
            <i className="fas fa-hospital" />
            <strong>Este acesso não está ligado a nenhum hospital</strong>
            <p>Fale com a administração.</p>
          </div>
        </div>
      </div>
    );
  }

  /* Mais de um hospital: pergunta uma vez, e só então. */
  if (!cliente) {
    return (
      <div className="porta-dia">{topo}
        <div className="porta-miolo">
          <div className="porta-escolher" data-bloco="escolher-hospital">
            <h2>Em qual hospital você está hoje?</h2>
            {clientes.map(c => (
              <button key={c.id} className="porta-hospital" data-hospital={c.id}
                      onClick={() => setCliente(c)}>
                <i className="fas fa-hospital" /> {c.nome}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (souDali === false) {
    return (
      <div className="porta-dia">{topo}
        <div className="porta-miolo">
          <div className="med-vazio" data-aviso="nao-sou-medico">
            <i className="fas fa-user-doctor" />
            <strong>Você ainda não tem agenda aqui</strong>
            <p>
              A administração precisa ligar o seu acesso ao seu cadastro de
              profissional, em <strong>Médicos</strong> → <strong>Acesso ao
              painel</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="porta-dia" data-tela="porta-do-medico-dentro">
      {topo}
      {/* A frase mora no topo aqui, e não dentro do Meu Dia: lá
          ela já existe, e duas faixas na mesma tela seria uma
          faixa a mais entre o médico e o primeiro paciente. */}
      <div className="porta-frase" data-bloco="frase-da-porta">
        <span>{frase.texto}</span>
        <small>{frase.autor}</small>
      </div>
      <div className="porta-miolo">
        {souDali === null
          ? <div className="porta-carregando"><i className="fas fa-circle-notch fa-spin" /></div>
          : <MeuDia clienteId={cliente.id} semFrase />}
      </div>
    </div>
  );
}
