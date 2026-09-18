import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite carregar imagens dos domínios externos usados como capas de curso
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.io" },
    ],
  },

  // Necessário para o pg/node-postgres funcionar corretamente
  // no ambiente serverless da Vercel (evita bundling de módulos nativos)
  serverExternalPackages: ["pg", "pg-native"],

  // Suprime aviso de pacotes não otimizados que não afetam o build
  experimental: {},
};

export default nextConfig;
