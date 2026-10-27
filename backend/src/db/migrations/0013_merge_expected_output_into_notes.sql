-- 合并历史预期产出后清空旧字段；保留物理列以便旧部署在切换期间读取。
-- 包含已删除任务；再次运行不会重复追加。必须在同一事务中执行。
UPDATE "tasks"
SET "description" = CASE
  WHEN "expected_output" = '' THEN "description"
  WHEN "description" IS NULL OR "description" = '' THEN '预期产出：' || "expected_output"
  ELSE "description" || E'\n\n' || '预期产出：' || "expected_output"
END,
"expected_output" = NULL
WHERE "expected_output" IS NOT NULL;
