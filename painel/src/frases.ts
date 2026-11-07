/**
 * ============================================================
 *  A FRASE DA TELA DO MÉDICO
 *
 *  Veio do `JS_Medico.html` do Tom, com a justificativa dele:
 *
 *  > *"Lista fixa, aqui no codigo. Poderia vir de um servico de
 *  >  citacoes, mas ai uma frase que ninguem revisou apareceria
 *  >  na tela de um medico — e nao ha ganho nenhum que compense
 *  >  isso. Todas com autor conferido; onde a atribuicao popular
 *  >  e' duvidosa, esta creditado quem realmente escreveu."*
 *
 *  Mantida inteira, com as atribuições como ele as deixou.
 * ============================================================
 */

export interface Frase { texto: string; autor: string }

export const FRASES: Frase[] = [
  { texto: 'Onde há amor pela medicina, há também amor pela humanidade.', autor: 'Hipócrates' },
  { texto: 'O bom médico trata a doença; o grande médico trata o paciente que tem a doença.', autor: 'William Osler' },
  { texto: 'A medicina é a ciência da incerteza e a arte da probabilidade.', autor: 'William Osler' },
  { texto: 'Ouça o seu paciente: ele está lhe dizendo o diagnóstico.', autor: 'William Osler' },
  { texto: 'Curar às vezes, aliviar frequentemente, confortar sempre.', autor: 'Provérbio médico francês, século XV' },
  { texto: 'Cada paciente carrega consigo o seu próprio médico interior.', autor: 'Albert Schweitzer' },
  { texto: 'Nada na vida deve ser temido, apenas compreendido. Agora é hora de compreender mais, para temer menos.', autor: 'Marie Curie' },
  { texto: 'O que sabemos é uma gota; o que ignoramos é um oceano.', autor: 'Isaac Newton' },
  { texto: 'Somos aquilo que repetidamente fazemos. A excelência, portanto, não é um ato — é um hábito.', autor: 'Aristóteles, na síntese de Will Durant' },
  { texto: 'A dúvida é o princípio da sabedoria.', autor: 'Aristóteles' },
  { texto: 'A esperança é o sonho do homem acordado.', autor: 'Aristóteles' },
  { texto: 'Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que elas são difíceis.', autor: 'Sêneca' },
  { texto: 'Não são as coisas que perturbam os homens, mas as opiniões que eles têm sobre as coisas.', autor: 'Epicteto' },
  { texto: 'Tudo pode ser tirado de um homem, menos a última das liberdades humanas: escolher a própria atitude diante de qualquer circunstância.', autor: 'Viktor Frankl' },
  { texto: 'Não importa o que esperamos da vida, mas sim o que a vida espera de nós.', autor: 'Viktor Frankl' },
  { texto: 'Quem tem um porquê para viver suporta quase qualquer como.', autor: 'Friedrich Nietzsche' },
  { texto: 'A vida só pode ser compreendida olhando-se para trás, mas só pode ser vivida olhando-se para a frente.', autor: 'Søren Kierkegaard' },
  { texto: 'Trate as pessoas como se elas fossem o que deveriam ser, e você as ajudará a se tornar o que são capazes de ser.', autor: 'Goethe' },
  { texto: 'Só sabemos com exatidão quando sabemos pouco; à medida que adquirimos conhecimento, instala-se a dúvida.', autor: 'Goethe' },
  { texto: 'A tarefa não é tanto ver o que ninguém viu, mas pensar o que ninguém ainda pensou sobre aquilo que todos veem.', autor: 'Arthur Schopenhauer' },
  { texto: 'A perfeição é atingida não quando não há mais nada para acrescentar, mas quando não há mais nada para retirar.', autor: 'Antoine de Saint-Exupéry' },
  { texto: 'Foi o tempo que dedicaste à tua rosa que a fez tão importante.', autor: 'Antoine de Saint-Exupéry' },
  { texto: 'Grandes obras são realizadas não pela força, mas pela perseverança.', autor: 'Samuel Johnson' },
  { texto: 'Faça o que puder, com o que tiver, onde estiver.', autor: 'Theodore Roosevelt' },
  { texto: 'Não julgue cada dia pela colheita que faz, mas pelas sementes que planta.', autor: 'Robert Louis Stevenson' },
  { texto: 'A ciência é feita de erros, mas de erros que é útil cometer, porque conduzem pouco a pouco à verdade.', autor: 'Jules Verne' },
  { texto: 'Não há caminho para a paz; a paz é o caminho.', autor: 'Mahatma Gandhi' },
  { texto: 'A educação é a arma mais poderosa que você pode usar para mudar o mundo.', autor: 'Nelson Mandela' },
  { texto: 'Feliz aquele que transfere o que sabe e aprende o que ensina.', autor: 'Cora Coralina' },
  { texto: 'Somos o que pensamos. Tudo o que somos surge com os nossos pensamentos.', autor: 'Buda, no Dhammapada' },
  { texto: 'Aprender sem pensar é tempo perdido; pensar sem aprender é perigoso.', autor: 'Confúcio' },
  { texto: 'Ninguém é tão grande que não possa aprender, nem tão pequeno que não possa ensinar.', autor: 'Esopo' },
  { texto: 'Não sou obrigado a vencer, mas tenho o dever de ser verdadeiro.', autor: 'Abraham Lincoln' },
  { texto: 'O tempo é aquilo que mais queremos, e o que pior usamos.', autor: 'William Penn' },
  { texto: 'Nada tem tanta força quanto a gentileza, e nada é tão gentil quanto a força verdadeira.', autor: 'São Francisco de Sales' },
  { texto: 'A única maneira de fazer um excelente trabalho é amar o que se faz.', autor: 'Steve Jobs' }
];

const CHAVE = 'medcalendar_ultima_frase';

/**
 * Uma frase, evitando repetir a última.
 *
 * ⚠️ O `localStorage` vai dentro de `try`: numa aba anônima, ou
 *    com os dados do site bloqueados, o acesso LANÇA. E uma
 *    frase bonita não vale derrubar a tela do médico.
 *    (A mesma precaução está no arquivo do Tom, pelo mesmo
 *    motivo — lá era o iframe do Apps Script.)
 */
export function FRASE_DO_DIA(): Frase {
  let ultima = -1;
  try { ultima = Number(localStorage.getItem(CHAVE)); } catch { /* sem memória */ }

  let i = Math.floor(Math.random() * FRASES.length);
  if (FRASES.length > 1 && i === ultima) i = (i + 1) % FRASES.length;

  try { localStorage.setItem(CHAVE, String(i)); } catch { /* sem memória */ }
  return FRASES[i]!;
}
