CREATE TABLE `ad_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`paypal_invoice_id` text,
	`amount_cents` integer NOT NULL,
	`order_ids` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `buyers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`city` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`audience_key` text NOT NULL,
	`audience_size` integer NOT NULL,
	`audience_buyer_ids` text DEFAULT '[]' NOT NULL,
	`product_ids` text NOT NULL,
	`discount_pct` integer DEFAULT 0 NOT NULL,
	`pay_later` integer DEFAULT true NOT NULL,
	`fee_rate` real NOT NULL,
	`budget_cents` integer NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`holdout_pct` integer DEFAULT 10 NOT NULL,
	`headline` text NOT NULL,
	`body` text NOT NULL,
	`agent_blurb` text NOT NULL,
	`rationale` text NOT NULL,
	`forecast` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaign_merchant_idx` ON `campaigns` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`type` text NOT NULL,
	`campaign_id` text,
	`merchant_id` text,
	`publisher_id` text,
	`surface` text,
	`buyer_ref` text,
	`amount_cents` integer,
	`fee_cents` integer,
	`paypal_ref` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `events_ts_idx` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `events_campaign_idx` ON `events` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`emoji` text DEFAULT '🛍️' NOT NULL,
	`paypal_email` text,
	`paypal_merchant_id` text,
	`trust_score` real DEFAULT 0.9 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`merchant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`publisher_id` text,
	`surface` text NOT NULL,
	`buyer_ref` text,
	`gross_cents` integer NOT NULL,
	`discount_cents` integer NOT NULL,
	`fee_cents` integer NOT NULL,
	`publisher_share_cents` integer NOT NULL,
	`merchant_net_cents` integer DEFAULT 0 NOT NULL,
	`fee_mode` text NOT NULL,
	`status` text NOT NULL,
	`capture_id` text,
	`payer_email` text,
	`created_at` integer NOT NULL,
	`captured_at` integer,
	`payout_id` text,
	`settled_at` integer,
	`refund_id` text,
	`invoice_id` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_campaign_idx` ON `orders` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_capture_idx` ON `orders` (`capture_id`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'publisher' NOT NULL,
	`publisher_id` text,
	`merchant_id` text,
	`receiver` text DEFAULT '' NOT NULL,
	`batch_id` text,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`price_cents` integer NOT NULL,
	`image` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_merchant_idx` ON `products` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`site` text NOT NULL,
	`paypal_email` text NOT NULL,
	`rev_share` real DEFAULT 0.5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sim_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`source` text NOT NULL,
	`paypal_capture_id` text,
	`campaign_id` text,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_id`) REFERENCES `buyers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_merchant_idx` ON `transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `tx_buyer_idx` ON `transactions` (`buyer_id`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer NOT NULL
);
