import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,mdx}",
        "./pages/**/*.{js,ts,jsx,mdx}",
        "./components/**/*.{js,ts,jsx,mdx}",
    ],
    theme: {
        extend: {},
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
};
export default config;