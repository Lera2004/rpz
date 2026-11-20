export async function ensurePlanSourceDataColumn(database) {
  const columnsToAdd = [
    ['source_data', 'JSON NULL'],
    ['credits', 'VARCHAR(50) NULL'],
    ['differential_credit', 'VARCHAR(50) NULL']
  ]

  for (const [columnName, columnType] of columnsToAdd) {
    const [columns] = await database.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'plan_disciplines'
         AND COLUMN_NAME = ?`,
      [columnName]
    )

    if (!Number(columns[0].count)) {
      await database.query(
        `ALTER TABLE plan_disciplines ADD COLUMN \`${columnName}\` ${columnType}`
      )
    }
  }
}
