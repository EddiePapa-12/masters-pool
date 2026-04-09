import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Augusta National greens
        masters: {
          green: "#006747",
          yellow: "#FFCD00",
          white: "#FFFFFF",
        },
      },
    },
  },
  plugins: [],
};

export default config;
