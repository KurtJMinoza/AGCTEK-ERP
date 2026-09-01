import type { Config } from "tailwindcss";

const config: Config = {
	content: [
		"./src/assets/svg/**/*.{jsx,tsx}",
		"./src/pages/**/*.{jsx,tsx,mdx}",
		"./src/components/**/*.{jsx,tsx,mdx}",
		"./src/utils/**/*.{jsx,tsx}",
		"./src/app/**/*.{jsx,tsx,mdx}",
	],
	darkMode: 'class',
	theme: {
		fontFamily: {
			sans: [
				'Inter',
				'ui-sans-serif',
				'system-ui',
				'-apple-system',
				'BlinkMacSystemFont',
				'"Segoe UI"',
				'Roboto',
				'"Helvetica Neue"',
				'Arial',
				'"Noto Sans"',
				'sans-serif',
				'"Apple Color Emoji"',
				'"Segoe UI Emoji"',
				'"Segoe UI Symbol"',
				'"Noto Color Emoji"',
			],
			serif: [
				'ui-serif',
				'Georgia',
				'Cambria',
				'"Times New Roman"',
				'Times',
				'serif',
			],
			mono: [
				'ui-monospace',
				'SFMono-Regular',
				'Menlo',
				'Monaco',
				'Consolas',
				'"Liberation Mono"',
				'"Courier New"',
				'monospace',
			],
		},
		screens: {
			xs: '576px',
			sm: '640px',
			md: '768px',
			lg: '1024px',
			xl: '1280px',
			'2xl': '1536px',
		},
		extend: {
			colors: {
				'primary': 'var(--primary)',
				'primary-deep': 'var(--primary-deep)',
				'primary-mild': 'var(--primary-mild)',
				'primary-subtle': 'var(--primary-subtle)',
				'error': 'var(--error)',
				'error-subtle': 'var(--error-subtle)',
				'success': 'var(--success)',
				'success-subtle': 'var(--success-subtle)',
				'info': 'var(--info)',
				'info-subtle': 'var(--info-subtle)',
				'warning': 'var(--warning)',
				'warning-subtle': 'var(--warning-subtle)',
				'neutral': 'var(--neutral)',
				'gray-50': 'var(--gray-50)',
				'gray-100': 'var(--gray-100)',
				'gray-200': 'var(--gray-200)',
				'gray-300': 'var(--gray-300)',
				'gray-400': 'var(--gray-400)',
				'gray-500': 'var(--gray-500)',
				'gray-600': 'var(--gray-600)',
				'gray-700': 'var(--gray-700)',
				'gray-800': 'var(--gray-800)',
				'gray-900': 'var(--gray-900)',
				'gray-950': 'var(--gray-950)',
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			typography: (theme: any) => ({
				DEFAULT: {
					css: {
						color: theme('colors.gray.500'),
						maxWidth: '65ch',
					},
				},
				invert: {
					css: {
						color: theme('colors.gray.400'),
					},
				},
			}),
		},
	},
	plugins: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@tailwindcss/typography'),
	],
};
export default config;
