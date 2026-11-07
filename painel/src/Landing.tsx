import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import marcaEscura from './marca/medcalendar.png';

/**
 * ============================================================
 *  A PORTA DA FRENTE DO MEDCALENDAR
 *  14/10/2026
 *
 *  O Tom: *"tenho o domínio medcalendar.com.br […] ele podia
 *  abrir uma landing page falando sobre o sistema com um botão
 *  de login onde seria a entrada do painel para as empresas."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ O BOTÃO MUDA SE VOCÊ JÁ ESTÁ DENTRO
 *
 *  Quem tem sessão aberta lê **"Abrir meu painel"**; quem não
 *  tem lê **"Entrar"**.
 *
 *  É um detalhe de três linhas e evita o atrito mais comum de
 *  um SaaS: o cliente que usa o sistema todo dia chega pelo
 *  domínio, vê a página de vendas, e acha que se desconectou.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE ESTA PÁGINA NÃO FAZ
 *
 *  Não promete número que eu não medi. Não tem "mais de X
 *  hospitais confiam em nós" nem "99,9% de disponibilidade" —
 *  são duas frases que todo site tem e que, no dia em que um
 *  cliente perguntar, ninguém sabe de onde saíram.
 *
 *  O que está escrito aqui é o que o sistema faz hoje.
 * ============================================================
 */

const RECURSOS = [
  {
    icone: 'fa-calendar-check',
    titulo: 'Agenda que não vende o mesmo horário duas vezes',
    texto: 'A trava é do banco de dados, não da tela. Duas recepcionistas '
         + 'clicando no mesmo segundo: uma marca, a outra recebe um aviso '
         + 'claro — e nenhum paciente aparece para um horário que não existe.'
  },
  {
    icone: 'fa-comments',
    titulo: 'O paciente marca sozinho, pelo celular',
    texto: 'Um chat no site do hospital, com a cara do hospital. Ele escolhe '
         + 'especialidade, convênio, profissional e horário — e o '
         + 'agendamento entra direto na sua agenda, já com o convênio '
         + 'conferido.'
  },
  {
    icone: 'fa-whatsapp',
    titulo: 'Confirmação e lembrete por WhatsApp',
    texto: 'Mensagem oficial pela API da Meta, pelo número do próprio '
         + 'hospital. Quem escreve "oi" recebe o caminho para marcar; quem '
         + 'escreve "estou com dor no peito" recebe o Pronto Atendimento '
         + 'e o 192.'
  },
  {
    icone: 'fa-microscope',
    titulo: 'Exames com preparo e entrevista',
    texto: 'Cada exame com o preparo certo do subtipo — jejum de abdome é '
         + 'diferente de jejum de mama. Os que precisam de avaliação caem '
         + 'numa fila para o setor decidir, em vez de marcar sozinhos.'
  },
  {
    icone: 'fa-user-shield',
    titulo: 'Cada pessoa vê o que é dela',
    texto: 'Permissão por tela e por ação: abrir encaixe, cancelar agenda e '
         + 'configurar exame são decisões separadas. E cada mudança fica '
         + 'registrada, com o antes e o depois.'
  },
  {
    icone: 'fa-chart-pie',
    titulo: 'Os números que você olha de manhã',
    texto: 'Quem move a agenda, quanto veio do chat, quem faltou, qual exame '
         + 'está sem ninguém que o faça. Tudo contado no banco — nenhuma '
         + 'estimativa, nenhuma nota de 0 a 100.'
  }
];

export function Landing() {
  const [temSessao, setTemSessao] = useState(false);

  useEffect(() => {
    let valido = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (valido) setTemSessao(!!data.session); })
      // ⭐ Sem sessão é o caso normal, não um erro. Silêncio aqui
      //   é a resposta certa — um toast vermelho na página de
      //   vendas assustaria quem nunca viu o sistema.
      .catch(() => {});
    return () => { valido = false; };
  }, []);

  function entrar() { window.location.href = '/painel'; }

  return (
    <div className="lp" data-pagina="landing">

      <header className="lp-topo">
        <div className="lp-largura lp-topo-linha">
          <img src={marcaEscura} alt="MedCalendar" className="lp-marca" />
          <nav className="lp-menu">
            <a href="#recursos">O que faz</a>
            <a href="#como">Como começa</a>
            <button className="lp-botao" data-acao="entrar" onClick={entrar}>
              {temSessao ? 'Abrir meu painel' : 'Entrar'}
            </button>
          </nav>
        </div>
      </header>

      <section className="lp-capa">
        <div className="lp-largura">
          <h1>
            A agenda do seu hospital,<br />
            <span>sem telefone tocando o dia inteiro.</span>
          </h1>
          <p className="lp-chamada">
            Agendamento, exames, WhatsApp e relatórios num sistema só —
            feito para a recepção de um hospital de verdade, não para uma
            demonstração.
          </p>
          <div className="lp-acoes">
            <button className="lp-botao grande" data-acao="entrar-capa"
                    onClick={entrar}>
              {temSessao ? 'Abrir meu painel' : 'Entrar no painel'}
            </button>
            <a className="lp-botao vazado grande" href="#recursos">
              Ver o que o sistema faz
            </a>
          </div>
        </div>
      </section>

      <section className="lp-faixa" id="recursos">
        <div className="lp-largura">
          <h2>O que ele faz</h2>
          <div className="lp-grade">
            {RECURSOS.map(r => (
              <article key={r.titulo} className="lp-cartao" data-recurso={r.icone}>
                <div className="lp-cartao-icone">
                  <i className={(r.icone === 'fa-whatsapp' ? 'fab ' : 'fas ') + r.icone} />
                </div>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-faixa clara" id="como">
        <div className="lp-largura">
          <h2>Como começa</h2>
          <ol className="lp-passos">
            <li>
              <strong>Conversamos sobre a sua operação.</strong>
              Quantos profissionais, quais convênios, que exames. É o que
              decide o que vai ligado no primeiro dia.
            </li>
            <li>
              <strong>Trazemos o seu cadastro.</strong>
              Médicos, especialidades, convênios e pacientes entram por
              planilha — e a importação diz, linha a linha, o que entrou e
              o que ficou de fora, e por quê.
            </li>
            <li>
              <strong>O hospital usa, e o chat entra depois.</strong>
              Primeiro a recepção, com a agenda funcionando. O agendamento
              pelo paciente entra quando a casa já está arrumada.
            </li>
          </ol>
        </div>
      </section>

      <section className="lp-fecho">
        <div className="lp-largura">
          <h2>Quer ver funcionando?</h2>
          <p>
            Fale com a gente e marcamos uma conversa com o sistema aberto,
            com os seus dados.
          </p>
          <a className="lp-botao grande claro"
             href="mailto:contato@medcalendar.com.br"
             data-acao="falar">
            Falar com o MedCalendar
          </a>
        </div>
      </section>

      <footer className="lp-rodape">
        <div className="lp-largura">
          <p>MedCalendar · MWNSE Sistemas</p>
          <p className="lp-mini">
            Sistema de gestão de agendamento hospitalar.
          </p>
        </div>
      </footer>
    </div>
  );
}
