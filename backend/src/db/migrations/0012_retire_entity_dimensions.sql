-- 先转换存量数据，再限制类型；保留选项、任务关联及历史状态表。
-- 锁住写入，避免旧客户端在转换与约束生效之间创建实体型维度。
LOCK TABLE "dimensions" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE "dimensions"
SET "type" = 'tree', "updated_at" = now()
WHERE "type" = 'entity';
--> statement-breakpoint
ALTER TABLE "dimensions" ADD CONSTRAINT "dimensions_type_check" CHECK ("dimensions"."type" IN ('single', 'tree'));
