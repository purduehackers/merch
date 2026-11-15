/// <reference path="../.astro/types.d.ts" />

declare module 'poly-decomp';

// Astro only ships `*.jpg`; macOS assets often use uppercase `.JPG`.
declare module '*.JPG' {
	const metadata: import('astro').ImageMetadata;
	export default metadata;
}
interface ImportMetaEnv {
	readonly STRIPE_MODE?: 'test' | 'live';
	readonly STRIPE_SECRET_KEY?: string;
	readonly STRIPE_SECRET_TEST_KEY?: string;
	readonly PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
	readonly PUBLIC_STRIPE_TEST_KEY?: string;
}
