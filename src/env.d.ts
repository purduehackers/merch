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
	/** signing secrets of the /api/stripe-webhook endpoints (one per Stripe mode) */
	readonly STRIPE_WEBHOOK_SECRET?: string;
	readonly STRIPE_WEBHOOK_TEST_SECRET?: string;
	/** Notion integration token (shared by the sign-up list and the pickup database) */
	readonly NOTION_TOKEN?: string;
	/** the "notify me" sign-up list (/api/notify) */
	readonly NOTION_DATABASE_ID?: string;
	readonly NOTION_EMAIL_PROPERTY?: string;
	/** the pickup database paid orders go into (/api/stripe-webhook) */
	readonly NOTION_ORDERS_DATABASE_ID?: string;
	/** quantities added up per day, kept in step by /api/stripe-webhook (optional) */
	readonly NOTION_TOTALS_DATABASE_ID?: string;
}
