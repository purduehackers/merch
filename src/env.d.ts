/// <reference path="../.astro/types.d.ts" />

declare module 'poly-decomp';

// Astro only ships `*.jpg`; macOS assets often use uppercase `.JPG`.
declare module '*.JPG' {
	const metadata: import('astro').ImageMetadata;
	export default metadata;
}
interface ImportMetaEnv {
	/** Notion integration token for the "notify me" sign-up list */
	readonly NOTION_TOKEN?: string;
	/** the "notify me" sign-up list (/api/notify) */
	readonly NOTION_DATABASE_ID?: string;
	readonly NOTION_EMAIL_PROPERTY?: string;
}
