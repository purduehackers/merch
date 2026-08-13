/// <reference path="../.astro/types.d.ts" />

declare module 'poly-decomp';

// Astro only ships `*.jpg`; macOS assets often use uppercase `.JPG`.
declare module '*.JPG' {
	const metadata: import('astro').ImageMetadata;
	export default metadata;
}