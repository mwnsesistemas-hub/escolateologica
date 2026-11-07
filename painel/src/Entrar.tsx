import { useState } from 'react';
import { supabase, configurado } from './supabase';

// Os dois logos entram no PACOTE, como a fonte e os ícones. Um
// logo puxado de um endereço de fora some junto com a internet —
// e a tela de entrada de um hospital não pode depender disso.
import logoMedCalendar from './marca/medcalendar.png';
import logoMwnse from './marca/mwnse.png';

/**
 * ============================================================
 *  A PORTA DE ENTRADA
 *
 *  A mesma tela do sistema de hoje: o cartão branco sobre o
 *  gradiente da marca, os dois campos com ícone e o botão
 *  cheio. Mesmas classes de CSS.
 *
 *  ------------------------------------------------------------
 *  O LOGIN AINDA NÃO SABE DE QUAL HOSPITAL VOCÊ É
 *
 *  E não precisa saber. Quem entra não escolhe hospital: o banco
 *  é que sabe a quais clientes esta pessoa pertence, pelo
 *  vínculo. Por isso esta tela mostra a marca do MedCalendar, e
 *  a do cliente só aparece depois de entrar.
 *
 *  (Quando cada cliente tiver o seu próprio endereço —
 *  `hospital.medcalendar.com.br` — dá para pintar o login com a
 *  cor dele antes do login, porque o endereço já diz quem é. Fica
 *  para quando os endereços existirem.)
 * ============================================================
 */
export function Entrar() {
  const [esqueci, setEsqueci] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setIndo(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      // A mensagem da Supabase vem em inglês e é vaga de
      // propósito — ela não diz se o e-mail existe, para não
      // virar uma forma de descobrir quem é cadastrado. Aqui ela
      // é traduzida sem perder essa qualidade.
      setErro(
        error.message.toLowerCase().includes('invalid')
          ? 'E-mail ou senha não conferem.'
          : 'Não consegui entrar: ' + error.message
      );
      setIndo(false);
    }
    // Deu certo: o App percebe a sessão e troca a tela sozinho.
  }

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={enviar}>
        {/* A versão NORMAL, azul sobre branco.

            Quase usei a clara aqui, porque o fundo da TELA é o
            gradiente azul-marinho. Mas o gradiente fica atrás do
            cartão: o cartão em si é branco (`.login-box`), e a
            versão clara sumiria dentro dele.

            Só descobri tirando uma foto da tela. Ler o CSS não
            bastou — o `.login-screen` é azul e o `.login-box` é
            branco, e eu olhei o de fora. */}
        <img className="login-marca" src={logoMedCalendar}
             alt="MedCalendar — Hospital Information System" />

        <p>Painel Administrativo</p>

        <div className="login-form">
          <div className="input-group">
            <i className="fas fa-envelope" />
            <input type="email" placeholder="E-mail" autoComplete="username" required
                   disabled={indo}
                   value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="input-group">
            <i className="fas fa-lock" />
            <input type="password" placeholder="Senha" autoComplete="current-password" required
                   disabled={indo}
                   value={senha} onChange={e => setSenha(e.target.value)} />
          </div>

          <button type="submit" className="btn-login" disabled={indo || !configurado}>
            {indo
              ? <><i className="fas fa-circle-notch fa-spin" /> Entrando…</>
              : <><i className="fas fa-sign-in-alt" /> Entrar</>}
          </button>
          {/* ⭐ 23/10: sem serviço de e-mail ligado, o caminho é a diretoria. */}
          <button type="button" className="link-botao" data-acao="esqueci-senha"
                  onClick={() => setEsqueci(true)}>Esqueci minha senha</button>
          {esqueci && (
            <p className="login-dica" data-aviso="esqueci-senha">
              Peça à diretoria do seu hospital para redefinir a sua senha, em
              Usuários. Ela gera uma senha provisória na hora.
            </p>
          )}

          {!configurado && (
            <p className="login-error" style={{ color: '#D97706' }}>
              O painel não sabe onde fica o banco. Faltam as variáveis
              VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
            </p>
          )}

          {erro && <p className="login-error">{erro}</p>}
        </div>

        <div className="login-porquem">
          <span>Desenvolvido por</span>
          <img src={logoMwnse} alt="MWNSE Sistemas" />
        </div>
      </form>
    </div>
  );
}
