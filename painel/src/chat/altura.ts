import { useEffect } from 'react';
import { alturaUtil } from '../../../nucleo/visor';

/**
 * ============================================================
 *  ⭐⭐⭐ A ALTURA DE VERDADE — O CONSERTO DO TECLADO
 *  14/10/2026
 *
 *  O Tom, sobre o chat de hoje: *"o teclado às vezes esconde
 *  informações que estão sendo escritas."*
 *
 *  ------------------------------------------------------------
 *  POR QUE ACONTECE
 *
 *  `height: 100vh` é a altura da tela **sem** o teclado, e ela
 *  não diminui quando o teclado abre. O navegador empurra a
 *  página para cima; os últimos centímetros — onde ficam o campo
 *  e a última mensagem — saem por baixo do teclado.
 *
 *  O CSS já resolve a maior parte com `100dvh`. Este arquivo
 *  existe para o resto: no iOS, a `dvh` ainda conta a barra do
 *  Safari que aparece e some, e sobra uma faixa escondida.
 *
 *  ------------------------------------------------------------
 *  ⭐ A `visualViewport` É QUEM SABE
 *
 *  Ela é a única API que enxerga o teclado. `window.innerHeight`
 *  não muda quando ele abre; `visualViewport.height` muda.
 *
 *  Então: medimos, escrevemos numa variável CSS, e o
 *  `.chat-raiz` usa essa variável. Uma linha de CSS, um
 *  `addEventListener`.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE EU **NÃO** FIZ
 *
 *  `window.scrollTo(0, 0)` no `focus`, que é a receita que mais
 *  aparece na internet. Ela briga com o navegador: ele rola
 *  para mostrar o campo, o script rola de volta, e a tela
 *  treme. O Tom já viu tela tremendo neste projeto — está
 *  escrito num documento de setembro — e não precisa ver de
 *  novo.
 *
 *  Aqui ninguém rola nada. Só se diz ao CSS qual é a altura.
 * ============================================================
 */
export function useAlturaDeVerdade(dentroDeIframe: boolean) {
  useEffect(() => {
    /* ════════════════════════════════════════════════════════
     *  ⭐⭐⭐ DENTRO DE UM IFRAME, NÃO SE MEDE NADA.
     *
     *  O Tom, 14/10: *"o chat em si vai ficar em iframe no site
     *  dos clientes."*
     *
     *  ⚠️ E isso quebraria exatamente o conserto deste arquivo.
     *
     *  `window.visualViewport`, lido de dentro de um iframe,
     *  descreve a janela do NAVEGADOR — não a caixa do iframe.
     *  Num celular de 844px com o chat embutido numa caixa de
     *  600px, a medição devolveria 844, e o chat passaria 244px
     *  por baixo do próprio iframe.
     *
     *  O conserto certo: dentro de um iframe a altura é 100% da
     *  caixa, e quem manda nela é o site do hospital. O CSS faz
     *  isso sozinho com `.chat-raiz.embutido { height: 100% }`.
     *
     *  ⭐ Medir onde não se deve é pior que não medir: o `100%`
     *     já estava certo, e a medição o estragaria.
     * ════════════════════════════════════════════════════════ */
    if (dentroDeIframe) return;

    const vv = window.visualViewport;

    function medir() {
      const altura = alturaUtil(
        vv ? vv.height : null,
        vv ? vv.offsetTop : null,
        window.innerHeight
      );
      document.documentElement.style.setProperty('--chat-altura', `${altura}px`);
    }

    medir();

    if (vv) {
      vv.addEventListener('resize', medir);
      vv.addEventListener('scroll', medir);
    }
    window.addEventListener('orientationchange', medir);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', medir);
        vv.removeEventListener('scroll', medir);
      }
      window.removeEventListener('orientationchange', medir);
      document.documentElement.style.removeProperty('--chat-altura');
    };
  }, [dentroDeIframe]);
}
