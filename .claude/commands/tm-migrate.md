Delegate to @tm-db-guardian to write and apply this migration.

The guardian will:
1. Read SYSTEM_MAP.md for the next migration number
2. Write SQL with header, pre-check comments, and rollback
3. Show full SQL for review before applying
4. Apply to PREVIEW (`rgifivtzmjvanzqwgadq`) first
5. Wait before applying to PROD
6. Update migration number in SYSTEM_MAP.md

Do not apply to PROD until Irfan confirms the preview result.
