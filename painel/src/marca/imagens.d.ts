// O TypeScript não sabe, sozinho, que o Vite transforma um
// `import` de imagem num endereço. Sem isto ele reclama de
// "módulo não encontrado" em todo import de .png.
declare module '*.png' {
  const url: string;
  export default url;
}
