import { useState } from 'react';
import { trocarSenhaProvisoria } from './dados';
import { supabase } from './supabase';

/**
 * ============================================================
 *  A SENHA QUE OUTRA PESSOA DIGITOU             (27/10/2026)
 *
 *  O Tom:
 *
 *  > *"o ideal é que o hospital libere no painel o acesso e ele
 *  >  crie a senha que preferir no primeiro login."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ POR QUE ISTO É UMA PORTA E NÃO UM AVISO
 *
 *  A versão fácil é um lembrete amarelo no topo: *"troque sua
 *  senha"*. Ninguém troca. A senha que o hospital ditou por
 *  telefone — e que ficou escrita num WhatsApp, num papel na
 *  recepção, e na memória de quem ditou — continua valendo para
 *  sempre, e ela abre a agenda de pacientes de um médico.
 *
 *  Então não dá para passar. Não tem "agora não", não tem X no
 *  canto. É a única tela até ela ser trocada.
 *
 *  ⚠️ COM UMA SAÍDA, E ELA IMPORTA: **Sair**.
 *
 *     Quem entrou por engano na conta errada ficaria preso
 *     numa tela que exige trocar a senha de outra pessoa.
 *     Trava sem saída vira chamado para a administração.
 *
 *  ------------------------------------------------------------
 *  ⚠️ NÃO PEDE A SENHA ATUAL
 *
 *  Ele acabou de digitá-la, há dois segundos, para entrar.
 *  Pedir de novo é mandar o médico reabrir o WhatsApp do
 *  hospital de pé, no meio do consultório.
 *
 *  A conferência da senha atual existe no **Meu perfil**, e lá
 *  ela protege de outra coisa: de quem senta no computador
 *  alheio com o painel já aberto. Aqui a sessão acabou de
 *  nascer da senha.
 * ============================================================
 */
export function TrocarSenhaProvisoria({ email, aoTrocar }: {
  email: string;
  aoTrocar: () => void;
}) {
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  /* A mesma régua do Meu perfil: 8 caracteres. Uma régua
     diferente em cada tela ensina que a regra é decoração. */
  const problema =
    !nova && !repete ? ''
    : nova.length < 8 ? 'A senha precisa de pelo menos 8 caracteres.'
    : nova !== repete ? 'As duas senhas não são iguais.'
    : '';

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (problema || !nova || indo) return;
    setIndo(true); setErro('');
    try {
      const r = await trocarSenhaProvisoria(nova);
      if (r.ok) aoTrocar(); else { setErro(r.mensagem); setIndo(false); }
    } catch (ex) {
      setErro((ex as Error).message ?? String(ex)); setIndo(false);
    }
  }

  return (
    <div className="porta-raiz" data-tela="trocar-senha-provisoria">
      <form className="porta-caixa" onSubmit={enviar} data-bloco="senha-provisoria">
        <div className="porta-marca">
          <span className="porta-bola"><i className="fas fa-key" /></span>
          <div>
            <h1>Crie a sua senha</h1>
            <small>{email}</small>
          </div>
        </div>

        <p className="porta-explica">
          A senha que você usou para entrar foi criada pela administração do
          hospital. Escolha agora uma que só você saiba.
        </p>

        {!!erro && <div className="porta-erro" data-aviso="erro">{erro}</div>}

        <div className="form-group">
          <label htmlFor="sp-nova">Nova senha</label>
          <input id="sp-nova" type="password" autoComplete="new-password"
                 data-campo="nova-senha" value={nova} required
                 onChange={e => setNova(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="sp-repete">Repita a nova senha</label>
          <input id="sp-repete" type="password" autoComplete="new-password"
                 data-campo="repete-senha" value={repete} required
                 onChange={e => setRepete(e.target.value)} />
        </div>

        {!!problema && (
          <div className="porta-dica" data-aviso="problema">{problema}</div>
        )}

        <button className="btn-primary porta-btn" type="submit"
                data-acao="salvar-senha"
                disabled={indo || !!problema || nova.length < 8}>
          {indo ? 'Salvando…' : 'Salvar e entrar'}
        </button>

        {/* ⭐ A saída. Entrou na conta errada? Sai. */}
        <button type="button" className="porta-sair-link" data-acao="sair"
                onClick={() => { void supabase.auth.signOut(); }}>
          Não sou {email} — sair
        </button>
      </form>
    </div>
  );
}
