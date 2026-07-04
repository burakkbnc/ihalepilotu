/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        // [ANA TEMA — yon1_light.html onaylandı, kalıcı tasarım dili]
        // Logo'dan türetilmiş marka paleti — lacivert (mark/wordmark koyu
        // tonu) ve uçak işaretinin mavisi (400/500) AYNEN korunur (gerçek
        // logo renkleri). Orta-üst ton (600/700) onaylanan light mockup'ın
        // indigo vurgusuna kaydırılmıştır — shadcn/ui + Tremor referansı.
        brand: {
          50: '#eef0fc',
          100: '#dee1f8',
          200: '#bfc4ef',
          300: '#9298e3',
          400: '#5d83cd', // logo uçak işareti mavisi — değişmez
          500: '#4f46e5', // indigo-600 ana vurgu (yon1_light)
          600: '#4338ca', // indigo-700
          700: '#3730a3', // indigo-800
          800: '#1c2d52',
          900: '#0f1e3d' // logo lacivert — değişmez
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          600: '#15803d',
          700: '#166534'
        },
        warning: {
          50: '#fff7ed',
          100: '#ffedd5',
          600: '#c2410c',
          700: '#9a3412'
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          600: '#dc2626',
          700: '#b91c1c'
        },
        // [ANA TEMA] Sıcak taş-beyazı zemin sistemi (yon1_light.html) —
        // soğuk slate paletinin yerini alır. "Demo/teknolojik" hissi
        // azaltmak için kullanıcı talebiyle benimsenmiştir.
        surface: {
          DEFAULT: '#ffffff',
          muted: '#fafaf9'
        },
        muted: {
          DEFAULT: '#78716c',
          foreground: '#a8a29e'
        },
        border: {
          DEFAULT: '#f0eeec',
          strong: '#e7e5e4'
        }
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '20px'
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04), 0 1px 1px 0 rgb(28 25 23 / 0.03)',
        hover: '0 4px 12px -2px rgb(28 25 23 / 0.08), 0 2px 4px -2px rgb(28 25 23 / 0.04)',
        modal: '0 20px 40px -8px rgb(28 25 23 / 0.18), 0 8px 16px -8px rgb(28 25 23 / 0.08)'
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
