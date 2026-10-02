export const maximumBackupBytes = 5 * 1024 * 1024;
const format = 'story-post-authoring';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function checkedTables(tables, headers) {
  if (!sameKeys(tables, Object.keys(headers))) throw new Error('백업의 제작 테이블 목록이 맞지 않습니다.');
  const result = {};
  for (const [table, columns] of Object.entries(headers)) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error(`${table}의 행 수를 확인하세요.`);
    result[table] = rows.map((row, index) => {
      if (!sameKeys(row, columns)) throw new Error(`${table} ${index + 1}행의 열 구성이 맞지 않습니다.`);
      return Object.fromEntries(columns.map(column => {
        const value = row[column];
        if (typeof value !== 'string' || value.length > 50000) throw new Error(`${table}.${column}의 값을 확인하세요.`);
        return [column, value];
      }));
    });
  }
  if (result.story_work.length !== 1) throw new Error('백업에는 한 작품 버전만 있어야 합니다.');
  return result;
}

function identity(tables) {
  const work = tables.story_work[0];
  return { storyId: work.story_id, version: work.working_version, locale: work.locale };
}

export function createBackup(tables, headers, now = new Date()) {
  const checked = checkedTables(tables, headers);
  const text = JSON.stringify({ format, version: 1, exportedAt: now.toISOString(), work: identity(checked), tables: checked }, null, 2);
  if (new TextEncoder().encode(text).length > maximumBackupBytes) throw new Error('백업은 5MB 이하로 보관해야 합니다.');
  return `${text}\n`;
}

export function readBackup(text, target, headers) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > maximumBackupBytes) throw new Error('5MB 이하의 제작실 백업 파일을 선택하세요.');
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('JSON 백업 파일을 읽을 수 없습니다.'); }
  if (!sameKeys(backup, ['format', 'version', 'exportedAt', 'work', 'tables']) || backup.format !== format || backup.version !== 1) throw new Error('지원하지 않는 제작실 백업 형식입니다.');
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('백업 작성 시각이 올바르지 않습니다.');
  const tables = checkedTables(backup.tables, headers);
  const source = identity(tables);
  const destination = identity(target);
  if (!sameKeys(backup.work, ['storyId', 'version', 'locale']) || Object.keys(source).some(key => backup.work[key] !== source[key] || source[key] !== destination[key])) throw new Error('현재 작품·버전·언어와 같은 백업만 복원할 수 있습니다.');
  if (target.story_work[0].status === 'released' || tables.story_work[0].status === 'released') throw new Error('배포본은 복원으로 덮어쓸 수 없습니다. 새 작업 버전을 만드세요.');
  return tables;
}
