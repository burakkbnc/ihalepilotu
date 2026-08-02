/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb'
    },
    // Next 14: keep native OCR/canvas/PDF packages out of the webpack bundle.
    //
    // KÖK NEDEN DÜZELTMESİ (Trabzon testinde bulundu): `pdfjs-dist` daha
    // önce bu listede YOKTU. Next.js onu sunucu webpack bundle'ına dahil
    // edince, kütüphanenin runtime'da dinamik olarak import etmeye
    // çalıştığı `pdf.worker.mjs` dosyası bundle çıktısının yanına
    // kopyalanmıyor ve "Cannot find module '.../vendor-chunks/pdf.worker.mjs'"
    // hatasıyla PDF render'ı (ve onun üzerine kurulu Vision LLM analizi)
    // TAMAMEN başarısız oluyordu — bu da 78 sayfalık taranmış bir
    // dokümanın 0 sayfasının bile LLM'e ulaşmamasına yol açan asıl
    // nedendi. `tesseract.js` ve `pdf-parse` da aynı sınıf soruna açık
    // olabileceğinden (native/dosya-sistemi bağımlı kütüphaneler) önlem
    // amacıyla eklendi.
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'tesseract.js', 'pdf-parse']
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@napi-rs/canvas': 'commonjs @napi-rs/canvas',
        'pdfjs-dist': 'commonjs pdfjs-dist',
        'tesseract.js': 'commonjs tesseract.js'
      });
    }
    return config;
  }
};

module.exports = nextConfig;
