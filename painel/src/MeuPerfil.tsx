import { useState } from 'react';
import { salvarMeuNome, trocarMinhaSenha } from './dados';

/**
 * ============================================================
 *  MEU PERFIL                                     (23/10/2026)
 *
 *  O Tom: "editar perfil, mudar senha não existe para o usuário."
 *
 *  ⭐ A senha nova só vale depois de CONFERIR A ATUAL: alguém que
 *     sentou no computador de outra pessoa, com o painel aberto,
 *     não troca a senha dela e a tranca para fora.
 * ============================================================
 */
export function MeuPerfil({ email, nomeAtual, aoFechar, aoAvisar }: {
  email: string; nomeAtual: string;
  aoFechar: () => void; aoAvisar: (m: string, ok: boolean) => void;
}) {
  const [nome, setNome] = useState(nomeAtual);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [indo, setIndo] = useState(false);

  const erroSenha = !nova && !repete ? '' :
    nova.length < 8 ? 'A senha nova precisa de pelo menos 8 caracteres.' :
    nova !== repete ? 'As duas senhas novas não são iguais.' :
    !atual ? 'Digite a senha atual.' : '';

  async function salvarNome() {
    setIndo(true);
    try {
      const r = await salvarMeuNome(nome);
      aoAvisar(r.mensagem, r.ok);
    } catch (e) { aoAvisar((e as Error).message ?? String(e), false); }
    setIndo(false);
  }
  async function salvarSenha() {
    setIndo(true);
    try {
      const r = await trocarMinhaSenha(email, atual, nova);
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) { setAtual(''); setNova(''); setRepete(''); }
    } catch (e) { aoAvisar((e as Error).message ?? String(e), false); }
    setIndo(false);
  }

  return (
    <div className="modal" data-modal="meu-perfil">
      <div className="modal-overlay" onClick={() => !indo && aoFechar()} />
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3><i className="fas fa-user" /> Meu perfil</h3>
          <button onClick={aoFechar} aria-label="Fechar" data-acao="fechar-perfil"><i className="fas fa-times" /></button>
        </div>
        <div className="modal-body">
          <p className="cad-sub">{email}</p>

          <div className="form-group">
            <label>Meu nome</label>
            <input type="text" maxLength={80} value={nome} data-campo="meu-nome"
                   onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn-secondary" data-acao="salvar-meu-nome" disabled={indo || nome.trim().length < 3}
                    onClick={() => void salvarNome()}>
              <i className="fas fa-check" /> Salvar nome
            </button>
          </div>

          <h4 className="cli-secao">Trocar a minha senha</h4>
          <div className="form-group">
            <label>Senha atual</label>
            <input type="password" autoComplete="current-password" value={atual} data-campo="senha-atual"
                   onChange={e => setAtual(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Senha nova</label>
            <input type="password" autoComplete="new-password" value={nova} data-campo="senha-nova"
                   onChange={e => setNova(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Repita a senha nova</label>
            <input type="password" autoComplete="new-password" value={repete} data-campo="senha-repete"
                   onChange={e => setRepete(e.target.value)} />
          </div>
          {!!erroSenha && <div className="dia-nota amarela" data-erro="senha">{erroSenha}</div>}
          <div className="form-actions">
            <button className="btn-primary" data-acao="trocar-senha" disabled={indo || !nova || !!erroSenha}
                    onClick={() => void salvarSenha()}>
              <i className="fas fa-key" /> Trocar senha
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
