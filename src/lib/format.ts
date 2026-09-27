/** Formata centavos em BRL: 29700 → "R$ 297,00" */
export function brl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Gera slug a partir de um título */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export type VideoEmbed =
  | { type: "youtube"; src: string }
  | { type: "vimeo"; src: string }
  | { type: "panda"; src: string }
  | { type: "direct"; src: string }
  | null;

/**
 * Detecta a plataforma do vídeo e retorna o embed correto.
 *
 * Plataformas suportadas:
 *  - YouTube  → youtube.com/watch, youtu.be, youtube.com/shorts
 *  - Vimeo    → vimeo.com/<id>
 *  - Panda Video → player.pandavideo.com.br/<id> ou pandavideo.com.br/embed/?v=<id>
 *  - Direto   → qualquer URL de arquivo de vídeo (.mp4, .webm, etc.)
 */
export function getVideoEmbed(url: string): VideoEmbed {
  if (!url) return null;

  // ── YouTube ──────────────────────────────────────────────────────
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  if (yt) {
    return { type: "youtube", src: `https://www.youtube.com/embed/${yt[1]}?rel=0` };
  }

  // ── Vimeo ────────────────────────────────────────────────────────
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { type: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}?badge=0&byline=0&portrait=0&title=0` };
  }

  // ── Panda Video ──────────────────────────────────────────────────
  // Formato 1: https://player.pandavideo.com.br/ABCDEF123456
  const pandaDirect = url.match(/player\.pandavideo\.com\.br\/([a-zA-Z0-9_-]+)/);
  if (pandaDirect) {
    return { type: "panda", src: `https://player.pandavideo.com.br/${pandaDirect[1]}` };
  }
  // Formato 2: https://pandavideo.com.br/embed/?v=ABCDEF123456
  const pandaEmbed = url.match(/pandavideo\.com\.br\/embed\/\?v=([a-zA-Z0-9_-]+)/);
  if (pandaEmbed) {
    return { type: "panda", src: `https://player.pandavideo.com.br/${pandaEmbed[1]}` };
  }
  // Formato 3: https://b-vz-XXXX.tv.pandavideo.com.br/embed/?v=XXXX
  if (url.includes("pandavideo.com.br")) {
    return { type: "panda", src: url };
  }

  // ── Vídeo direto (MP4, WebM, etc.) ──────────────────────────────
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
    return { type: "direct", src: url };
  }

  return null;
}

/**
 * @deprecated Use getVideoEmbed() — mantido só por compatibilidade.
 */
export function toYouTubeEmbed(url: string): string | null {
  const result = getVideoEmbed(url);
  return result?.type === "youtube" ? result.src : null;
}

export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
